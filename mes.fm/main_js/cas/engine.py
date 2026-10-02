"""MES CAS engine -- the maths behind mes.fm/cas-calculator, /derivative-calculator and /integral-calculator.

Runs inside Pyodide (a Web Worker, see cas-worker.js) and natively (python3 + sympy/mpmath) for the tests in
tool_apps_src/cas-engine-tests.py. One entry point: handle(json_request) -> json_response.

Requests: {"op": "parse" | "diff" | "integrate" | "solve" | "cas" | "plot", ...}. Responses: {"ok": true, ...} or
{"ok": false, "error": "friendly message"}. While a long request runs, emit() may push partial results (e.g. the
numeric roots of an equation before the slower search for exact forms) through the emitter the worker installs.

Input is plain text the way students type it (x^2 sin x, 2x, e^x, |x|, sqrt x, sin^2 x, α, ×, ÷, −, √, ...). It is
normalised here, then parsed with SymPy's parse_expr in a whitelisted namespace (no builtins, no dunders, no
attribute access). Steps are our own: a rule-based differentiator, a renderer for SymPy's manualintegrate rule tree,
and equation-solving narratives (linear, quadratic, rational roots, substitution, systems, numeric root scans).
"""
import json
import math
import random
import re

import mpmath
import sympy as sp
from sympy import (Abs, Add, Dummy, E, Eq, Integer, Mul, Poly, Pow, Rational, S, Symbol, exp, I, log, nan, oo, pi, sqrt, zoo)
from sympy.parsing.sympy_parser import (_token_splittable, convert_xor, function_exponentiation, implicit_application,
                                        implicit_multiplication, parse_expr, split_symbols_custom, standard_transformations)
from sympy.integrals import manualintegrate as MI
from sympy.functions.elementary.trigonometric import TrigonometricFunction
from sympy.functions.elementary.hyperbolic import HyperbolicFunction

VERSION = "1"
MAX_LEN = 600
EMIT = None


def set_emitter(fn):
    global EMIT
    EMIT = fn


def emit(obj):
    if EMIT is not None:
        try:
            EMIT(json.dumps(obj))
        except Exception:
            pass


class CasError(Exception):
    """An error with a message meant for the person typing."""


# ---------------------------------------------------------------- namespace ----------------------------------------
_FUNCS = ["sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan", "acot", "asec", "acsc", "atan2",
          "sinh", "cosh", "tanh", "coth", "sech", "csch", "asinh", "acosh", "atanh", "acoth", "asech", "acsch",
          "exp", "log", "sqrt", "cbrt", "root", "Abs", "sign", "floor", "ceiling", "factorial", "binomial", "gamma",
          "erf", "erfc", "re", "im", "arg", "conjugate", "Min", "Max", "gcd", "lcm", "LambertW", "zeta", "Heaviside",
          "DiracDelta", "Matrix", "Integer", "Float", "Rational", "Symbol", "Function"]
GLOBALS = {n: getattr(sp, n) for n in _FUNCS}
GLOBALS.update({"pi": pi, "E": E, "e": E, "I": I, "oo": oo, "ln": log, "abs": Abs, "ceil": sp.ceiling, "sgn": sp.sign,
                "nCr": sp.binomial, "arcsin": sp.asin, "arccos": sp.acos, "arctan": sp.atan, "arccot": sp.acot,
                "arcsec": sp.asec, "arccsc": sp.acsc, "arcsinh": sp.asinh, "arccosh": sp.acosh, "arctanh": sp.atanh,
                "log10": lambda u: log(u, 10), "log2": lambda u: log(u, 2), "lg": lambda u: log(u, 10)})
GLOBALS["__builtins__"] = {}
# words treated as functions by the normaliser (sin x -> sin(x))
FUNC_WORDS = sorted({"sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan", "acot", "asec", "acsc", "sinh", "cosh", "tanh",
                     "coth", "sech", "csch", "asinh", "acosh", "atanh", "acoth", "exp", "log", "ln", "sqrt", "cbrt", "abs", "Abs", "log10",
                     "log2", "lg", "floor", "ceiling", "ceil", "sign", "sgn", "erf", "gamma", "arcsin", "arccos", "arctan", "arcsinh",
                     "arccosh", "arctanh", "arccot", "arcsec", "arccsc", "factorial", "LambertW"}, key=len, reverse=True)
CALLABLE = set(FUNC_WORDS) | {"root", "atan2", "binomial", "nCr", "gcd", "lcm", "Min", "Max", "re", "im", "arg", "conjugate", "zeta",
                              "Heaviside", "DiracDelta", "Matrix", "f", "g", "h", "F", "G", "H"}
TRIG_INV = {"sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh"}

GREEK = {"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta", "θ": "theta",
         "ϑ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ρ": "rho", "σ": "sigma",
         "τ": "tau", "υ": "upsilon", "φ": "phi", "ϕ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega", "Δ": "Delta",
         "Θ": "Theta", "Φ": "Phi", "Ω": "Omega", "Λ": "Lambda", "Σ": "Sigma", "Ψ": "Psi"}
# greek names that are also SymPy functions / keywords: typed as letters they are variables
CLASH = {"beta": "beta", "gamma": "gamma", "zeta": "zeta", "lambda": "lamda", "Lambda": "Lamda"}
LOCALS_BASE = {"Gk_" + k: Symbol(v) for k, v in CLASH.items()}
SUPERS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺", "0123456789-+")
GREEK_WORDS = set(GREEK.values()) | {"lamda"}

TRANSFORMS = None


def _transforms(protect):
    def pred(name):
        if name in protect or name in GREEK_WORDS or name.startswith("Gk_"):
            return False
        return _token_splittable(name)
    return standard_transformations + (convert_xor, split_symbols_custom(pred), implicit_multiplication,
                                       implicit_application, function_exponentiation)


# ---------------------------------------------------------------- normaliser ---------------------------------------
def _match_paren(s, i):
    """s[i] == '(' -> index of its matching ')' (or -1)."""
    depth = 0
    for j in range(i, len(s)):
        if s[j] in "([":
            depth += 1
        elif s[j] in ")]":
            depth -= 1
            if depth == 0:
                return j
    return -1


def _abs_bars(s):
    """|x - 2| -> Abs(x - 2). A bar opens when it follows an operator / bracket / start, else it closes."""
    if "|" not in s:
        return s
    out, opened = [], 0
    prev = ""
    for ch in s:
        if ch == "|":
            if opened and prev not in "+-*/^(,=<>|" and prev != "":
                out.append(")")
                opened -= 1
            else:
                out.append("Abs(")
                opened += 1
            prev = "|" if out[-1] == "Abs(" else ")"
            continue
        out.append(ch)
        if not ch.isspace():
            prev = ch
    if opened:
        raise CasError("An absolute-value bar | is not closed.")
    return "".join(out)


_ATOM = re.compile(r"\s*(?:[0-9]*\.?[0-9]+\s*)?(?:[A-Za-z_][A-Za-z_0-9]*)?(?:\s*\^\s*(?:-?[0-9.]+|[A-Za-z_][A-Za-z_0-9]*))?")


def _wrap_funcs(s):
    """sin x -> sin(x), sin 2x -> sin(2x), sin^2 x -> (sin(x))^(2), sin^-1 x -> asin(x), lnx -> ln(x)."""
    fre = re.compile(r"(?<![A-Za-z_0-9])(" + "|".join(FUNC_WORDS) + r")(?![A-Za-z_0-9])")
    out, i, n = [], 0, len(s)
    while i < n:
        m = fre.match(s, i)
        if not m:
            out.append(s[i])
            i += 1
            continue
        name, k = m.group(1), m.end()
        power = None
        j = k
        while j < n and s[j] == " ":
            j += 1
        if j < n and (s[j] == "^" or s.startswith("**", j)):
            j += 2 if s.startswith("**", j) else 1
            while j < n and s[j] == " ":
                j += 1
            if j < n and s[j] == "(":
                e = _match_paren(s, j)
                if e < 0:
                    raise CasError("A bracket ( is not closed.")
                power, j = s[j + 1:e], e + 1
            else:
                pm = re.match(r"-?[0-9.]+|[A-Za-z_][A-Za-z_0-9]*", s[j:])
                if not pm:
                    out.append(s[i:k])
                    i = k
                    continue
                power, j = pm.group(0), j + pm.end()
            while j < n and s[j] == " ":
                j += 1
        if j < n and s[j] == "(":
            e = _match_paren(s, j)
            if e < 0:
                raise CasError("A bracket ( is not closed.")
            arg, rest = _wrap_funcs(s[j + 1:e]), e + 1
        else:
            am = _ATOM.match(s, j)
            atom = am.group(0).strip() if am else ""
            word = re.search(r"[A-Za-z_][A-Za-z_0-9]*", atom)
            if not atom or (word and word.group(0) in CALLABLE):
                if power is None:
                    out.append(name)
                    i = k
                    continue
                # sin^2 cos x etc. -- leave the power where it is
                out.append(name)
                i = k
                continue
            arg, rest = atom, am.end()
        if power is not None and power.strip() in ("-1", "(-1)") and name in TRIG_INV:
            out.append("a%s(%s)" % (name, arg))
        elif power is not None:
            out.append("(%s(%s))^(%s)" % (name, arg, power))
        else:
            out.append("%s(%s)" % (name, arg))
        i = rest
    return "".join(out)


def _log_base(s):
    """log_2(x) / log_2 x / log_(b) x -> log((x), (2))."""
    while True:
        m = re.search(r"(?<![A-Za-z_0-9])log_\s*(\([^()]*\)|[0-9.]+|[A-Za-z])\s*", s)
        if not m:
            return s
        base, j = m.group(1), m.end()
        if j < len(s) and s[j] == "(":
            e = _match_paren(s, j)
            if e < 0:
                raise CasError("A bracket ( is not closed.")
            arg, rest = s[j + 1:e], e + 1
        else:
            am = _ATOM.match(s, j)
            arg, rest = am.group(0).strip(), am.end()
            if not arg:
                raise CasError("log_%s needs something to take the logarithm of." % base)
        s = s[:m.start()] + "log((%s),(%s))" % (arg, base) + s[rest:]


def normalize(text):
    s = str(text)
    if len(s) > MAX_LEN:
        raise CasError("That input is too long (max %d characters)." % MAX_LEN)
    # superscripts: x² -> x^(2), e⁻ˣ is out of scope
    s = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+", lambda m: "^(" + m.group(0).translate(SUPERS) + ")", s)
    for a, b in (("×", "*"), ("·", "*"), ("⋅", "*"), ("∙", "*"), ("✕", "*"), ("÷", "/"), ("∕", "/"), ("−", "-"), ("–", "-"),
                 ("—", "-"), ("≤", "<="), ("≥", ">="), ("≠", "!="), ("π", " pi "), ("∞", " oo "), ("ℯ", " e "), ("√", " sqrt "),
                 ("∛", " cbrt "), ("（", "("), ("）", ")"), ("［", "["), ("］", "]"), ("：", ":"), (" ", " "),
                 ("⁄", "/"), ("∣", "|"), ("｜", "|")):
        s = s.replace(a, b)
    s = re.sub(r"([0-9.]+)\s*°", r"(\1*pi/180)", s)
    s = s.replace("°", "*pi/180")
    for g, name in GREEK.items():
        if g in s:
            s = s.replace(g, " %s " % (("Gk_" + name) if name in CLASH else name))
    s = re.sub(r"\blambda\b", "lamda", s)
    s = re.sub(r"\b(?:infinity|Infinity|inf|infty)\b", "oo", s)
    s = re.sub(r"\barc(sin|cos|tan|sec|csc|cot)(h?)\b", r"a\1\2", s)
    if "__" in s:
        raise CasError("Double underscores are not allowed.")
    if re.search(r"\.\s*[A-Za-z_]", s):
        raise CasError("A dot can only be a decimal point, like 2.5.")
    if re.search(r"['\"`\\:{}#$@&?~]", s):
        bad = re.search(r"['\"`\\:{}#$@&?~]", s).group(0)
        raise CasError("The character “%s” is not supported here." % bad)
    bad = re.search(r"[^A-Za-z0-9_\s+\-*/^().,;=<>!|\[\]]", s)
    if bad:
        raise CasError("The character “%s” is not supported here." % bad.group(0))

    # sinx -> sin x, sin2x -> sin 2x (a function name glued to a one-letter variable or a number)
    def split_glued(m):
        w = m.group(0)
        if w in CALLABLE or w in GREEK_WORDS or w.startswith("Gk_") or w in GLOBALS:
            return w
        for f in FUNC_WORDS:
            if w.startswith(f) and re.fullmatch(r"[0-9]*[A-Za-z]?|[0-9]+", w[len(f):]) and len(w) > len(f):
                return f + " " + w[len(f):]
        return w
    s = re.sub(r"[A-Za-z_][A-Za-z_0-9]*", split_glued, s)
    s = _abs_bars(s)
    s = _log_base(s)
    s = _wrap_funcs(s)

    # x(x+1) means x*(x+1): a variable (not f, g, h or a function name) directly before "("
    def var_paren(m):
        w = m.group(1)
        if w in CALLABLE or w in GLOBALS and callable(GLOBALS.get(w)):
            return m.group(0)
        return w + "*("
    s = re.sub(r"(?<![A-Za-z_0-9])([A-Za-z_][A-Za-z_0-9]*)\s*\(", var_paren, s)
    s = re.sub(r"\)\s*\(", ")*(", s)
    return s.strip()


_REL = re.compile(r"<=|>=|!=|==|=|<|>")


def split_relation(s):
    """Top-level relational split: 'a = b' -> (['a', 'b'], ['=']). Brackets are respected."""
    parts, ops, depth, last, i = [], [], 0, 0, 0
    while i < len(s):
        c = s[i]
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif depth == 0:
            m = _REL.match(s, i)
            if m:
                parts.append(s[last:i])
                ops.append(m.group(0))
                i = m.end()
                last = i
                continue
        i += 1
    parts.append(s[last:])
    return parts, ops


def split_top(s, seps=",;\n"):
    parts, depth, last = [], 0, 0
    for i, c in enumerate(s):
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif depth == 0 and c in seps:
            parts.append(s[last:i])
            last = i + 1
    parts.append(s[last:])
    return [p for p in (q.strip() for q in parts) if p]


def _friendly(err, s):
    msg = str(err)
    if s.count("(") > s.count(")"):
        return "A bracket ( is not closed."
    if s.count(")") > s.count("("):
        return "There is an extra closing bracket )."
    if re.search(r"[-+*/^]\s*$", s):
        return "The expression ends with an operator: finish it."
    if re.match(r"^\s*[*/^]", s):
        return "The expression starts with an operator."
    if "not callable" in msg:
        return "Something is used like a function but isn't one -- add a * for multiplication, e.g. 2*(x+1)."
    if "invalid syntax" in msg or "unexpected EOF" in msg or "TokenError" in type(err).__name__ or isinstance(err, SyntaxError):
        return "I couldn't read that. Check the brackets and operators (use * or a space between factors)."
    return "I couldn't read that: " + msg[:160]


def parse_one(text, protect=()):
    """One expression (no relation). Returns a SymPy object."""
    s = text if isinstance(text, str) else str(text)
    if not s.strip():
        raise CasError("Type an expression first.")
    local = dict(LOCALS_BASE)
    for name in protect:
        if re.fullmatch(r"[A-Za-z][A-Za-z_0-9]*", name) and name not in GLOBALS:
            local[name] = Symbol(name)
    try:
        e = parse_expr(s, local_dict=local, global_dict=GLOBALS, transformations=_transforms(set(protect)), evaluate=True)
    except CasError:
        raise
    except Exception as err:
        raise CasError(_friendly(err, s))
    if isinstance(e, (list, tuple)):
        if all(isinstance(r, (list, tuple)) for r in e) and e:
            try:
                return sp.Matrix(e)
            except Exception:
                raise CasError("A matrix needs rows of equal length, like [[1, 2], [3, 4]].")
        raise CasError("Use one expression here (a comma separates equations only in Solve).")
    if isinstance(e, bool) or e is None:
        raise CasError("That is not a mathematical expression.")
    if not isinstance(e, (sp.Basic, sp.MatrixBase)):
        raise CasError("That is not a mathematical expression.")
    if isinstance(e, sp.Basic) and (e.has(zoo) or e.has(nan)) and not e.is_number:
        pass
    return e


def parse_rel(text, protect=()):
    """Expression or relation (=, <, <=, ...). Returns (kind, obj): kind in expr / eq / rel."""
    s = normalize(text)
    parts, ops = split_relation(s)
    if not ops:
        return "expr", parse_one(s, protect)
    if any(not p.strip() for p in parts):
        raise CasError("Something is missing on one side of “%s”." % ops[0])
    vals = [parse_one(p, protect) for p in parts]
    if ops == ["="] or ops == ["=="]:
        return "eq", Eq(vals[0], vals[1], evaluate=False)
    rels = []
    for a, op, b in zip(vals, ops, vals[1:]):
        if op in ("=", "=="):
            rels.append(Eq(a, b, evaluate=False))
        elif op == "!=":
            rels.append(sp.Ne(a, b, evaluate=False))
        else:
            rels.append({"<": sp.Lt, ">": sp.Gt, "<=": sp.Le, ">=": sp.Ge}[op](a, b, evaluate=False))
    if len(rels) == 1:
        return "rel", rels[0]
    return "rel", sp.And(*rels, evaluate=False)


def parse_expr_text(text, protect=()):
    kind, obj = parse_rel(text, protect)
    if kind != "expr":
        raise CasError("Type an expression here, not an equation.")
    return obj


# ---------------------------------------------------------------- printing -----------------------------------------
DISPLAY_SUBS = {}


def tex(e):
    try:
        if DISPLAY_SUBS and isinstance(e, sp.Basic):
            e = e.subs(DISPLAY_SUBS)
        return sp.latex(e, ln_notation=True, inv_trig_style="full")
    except Exception:
        return sp.latex(e)


def ptex(e):
    """tex with brackets when e is a sum / negative, for use as a factor."""
    t = tex(e)
    if isinstance(e, sp.Basic) and (e.is_Add or (e.could_extract_minus_sign() and not e.is_Number)):
        return r"\left(" + t + r"\right)"
    if isinstance(e, sp.Basic) and e.is_Number and e < 0:
        return r"\left(" + t + r"\right)"
    return t


def plain(e):
    """Plain-text answer (for 'Copy answer')."""
    s = sp.sstr(e)
    s = s.replace("**", "^")
    s = re.sub(r"\blog\(", "ln(", s)
    s = s.replace("Abs(", "abs(")
    return s


def graph_text(e):
    """A form the 2D graphing calculator understands, or None."""
    s = sp.sstr(e).replace("**", "^")
    s = re.sub(r"\blog\(", "ln(", s).replace("Abs(", "abs(").replace("E", "e")
    for name in ("asec", "acsc", "acot", "asinh", "acosh", "atanh", "LambertW", "erf", "gamma", "Piecewise", "Heaviside", "sign",
                 "floor", "ceiling", "re(", "im(", "Integral", "Derivative", "Subs", "I", "zeta", "polylog", "Ei", "Si", "Ci", "li"):
        if name in s:
            return None
    return s


def num_str(v, digits=10):
    try:
        t = mpmath.nstr(v, digits, min_fixed=-6, max_fixed=12, strip_zeros=True)
    except Exception:
        t = str(v)
    return t[:-2] if t.endswith(".0") else t


def evalf_str(e, digits=12):
    try:
        v = sp.N(e, digits + 3)
        if v.is_real or (v.is_number and abs(sp.im(v)) < 1e-14):
            return num_str(mpmath.mpf(str(sp.re(v))), digits)
        if v.is_number:
            re_, im_ = sp.re(v), sp.im(v)
            sign = "+" if im_ >= 0 else "-"
            return "%s %s %si" % (num_str(mpmath.mpf(str(re_)), digits), sign, num_str(abs(mpmath.mpf(str(im_))), digits))
    except Exception:
        pass
    return None


def step(title, text="", tex_lines=None, children=None):
    d = {"title": title}
    if text:
        d["text"] = text
    if tex_lines:
        d["tex"] = [t for t in tex_lines if t]
    if children:
        d["children"] = [c for c in children if c]
    return d


def aligned(first, *rest):
    """\\begin{aligned} first &= r1 \\\\ &= r2 ... with duplicates dropped."""
    seen, lines = [], []
    for r in rest:
        if r and r not in seen:
            seen.append(r)
    if not seen:
        return first
    lines.append(first + " &= " + seen[0])
    for r in seen[1:]:
        lines.append("&= " + r)
    return r"\begin{aligned}" + r" \\ ".join(lines) + r"\end{aligned}"


def _complexity(e):
    try:
        return sp.count_ops(e, visual=False) + len(str(e)) / 40.0
    except Exception:
        return len(str(e))


def nice(e, budget=300):
    """Shortest of a few simplifications (simplify is skipped for huge expressions)."""
    cands = [e]
    big = sp.count_ops(e) > budget
    for fn in ((lambda z: sp.simplify(z)) if not big else None, sp.cancel, sp.factor, sp.together, lambda z: sp.expand(z)):
        if fn is None:
            continue
        try:
            c = fn(e)
            if c.has(sp.Integral):
                continue
            cands.append(c)
        except Exception:
            pass
    best = min(cands, key=_complexity)
    return best


def same(a, b, syms, tries=4):
    """True when a == b (symbolically, or numerically at random points)."""
    try:
        d = sp.simplify(a - b)
        if d == 0:
            return True
    except Exception:
        pass
    syms = list(syms)
    ok = 0
    rnd = random.Random(7)
    for _ in range(tries * 3):
        pt = {s: Rational(rnd.randint(11, 190), 97) * (1 if rnd.random() < 0.7 else -1) for s in syms}
        try:
            va, vb = complex(sp.N(a.subs(pt), 20)), complex(sp.N(b.subs(pt), 20))
        except Exception:
            continue
        if any(math.isnan(z.real) or math.isinf(z.real) for z in (va, vb)):
            continue
        if abs(va - vb) > 1e-8 * (1 + abs(va)):
            return False
        ok += 1
        if ok >= tries:
            return True
    return ok > 0


# ---------------------------------------------------------------- samples / plotting ----------------------------------
def _real(v):
    try:
        if isinstance(v, mpmath.mpc) or isinstance(v, complex):
            if abs(v.imag) > 1e-9 * (1 + abs(v.real)):
                return None
            v = v.real
        v = float(v)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except Exception:
        return None


def make_num(f, x):
    f = f.subs({s: Dummy() for s in []})
    try:
        F = sp.lambdify(x, f, modules=["mpmath"])
    except Exception:
        F = None

    def g(t):
        try:
            if F is not None:
                return F(mpmath.mpf(t))
            return mpmath.mpmathify(complex(sp.N(f.subs(x, t))))
        except (ZeroDivisionError, ValueError, OverflowError, TypeError):
            return None
        except Exception:
            return None
    return g


def samples(f, x, a, b, n=360):
    g = make_num(f, x)
    out = []
    for i in range(n + 1):
        t = a + (b - a) * i / n
        out.append([round(t, 10), _round(_real(g(t)))])
    return out


def _round(v):
    if v is None:
        return None
    if abs(v) > 1e12:
        return None
    return float("%.9g" % v)


def plot_range(f, x, around=None):
    if around is not None:
        c = float(around)
        return c - 5, c + 5
    if any(isinstance(fn, TrigonometricFunction) for fn in f.atoms(sp.Function)):
        return -2 * math.pi, 2 * math.pi
    return -10.0, 10.0


# ---------------------------------------------------------------- variables ----------------------------------------
def realize(e):
    """Real-valued symbols (calculus on the real line: |x|' = sign x, sqrt(x^2) = |x|)."""
    if isinstance(e, sp.MatrixBase) or not isinstance(e, sp.Basic):
        return e
    return e.xreplace({s: Symbol(s.name, real=True) for s in e.free_symbols if not s.is_real})


def free_vars(e):
    if isinstance(e, sp.MatrixBase):
        syms = set().union(*[x.free_symbols for x in e]) if e else set()
    else:
        syms = e.free_symbols
    return sorted(syms, key=lambda s: (s.name not in ("x", "t", "theta", "alpha"), s.name))


def pick_var(e, wanted=None):
    if wanted:
        w = str(wanted).strip()
        if w:
            w = normalize(w).strip()
            w = CLASH.get(w[3:], w[3:]) if w.startswith("Gk_") else w
            if not re.fullmatch(r"[A-Za-z][A-Za-z_0-9]*", w):
                raise CasError("The variable should be a letter or name, like x, t or theta.")
            for s in free_vars(e):
                if s.name == w:
                    return s
            return Symbol(w)
    vs = free_vars(e)
    if not vs:
        return Symbol("x")
    return vs[0]


def var_names(text):
    if not text:
        return []
    out = []
    for p in re.split(r"[,\s;]+", normalize(text)):
        if p:
            p = CLASH.get(p[3:], p[3:]) if p.startswith("Gk_") else p
            if not re.fullmatch(r"[A-Za-z][A-Za-z_0-9]*", p):
                raise CasError("“%s” is not a variable name." % p)
            out.append(p)
    return out


# ================================================================ DERIVATIVES ====================================
FN_NAMES = {sp.sin: "sine", sp.cos: "cosine", sp.tan: "tangent", sp.cot: "cotangent", sp.sec: "secant", sp.csc: "cosecant",
            sp.asin: "arcsine", sp.acos: "arccosine", sp.atan: "arctangent", sp.acot: "arccotangent", sp.asec: "arcsecant",
            sp.acsc: "arccosecant", sp.sinh: "hyperbolic sine", sp.cosh: "hyperbolic cosine", sp.tanh: "hyperbolic tangent",
            sp.coth: "hyperbolic cotangent", sp.sech: "hyperbolic secant", sp.csch: "hyperbolic cosecant",
            sp.asinh: "inverse hyperbolic sine", sp.acosh: "inverse hyperbolic cosine", sp.atanh: "inverse hyperbolic tangent",
            sp.acoth: "inverse hyperbolic cotangent", sp.exp: "exponential", sp.log: "natural logarithm", sp.Abs: "absolute value",
            sp.erf: "error function"}


class Differ:
    def __init__(self, x, partial=False):
        self.x = x
        self.partial = partial
        self.nodes = 0
        self.dop = (r"\frac{\partial}{\partial %s}" if partial else r"\frac{d}{d%s}") % tex(x)

    def D(self, e):
        return self.dop + r"\left[" + tex(e) + r"\right]"

    def outer(self, F, u):
        z = Dummy("z")
        if F is sp.Abs:
            return u / Abs(u)
        return sp.diff(F(z), z).subs(z, u)

    def go(self, e):
        """-> (derivative, step-or-None). None = trivial (shown inline by the parent)."""
        self.nodes += 1
        x = self.x
        if self.nodes > 400:
            r = sp.diff(e, x)
            return r, step("Differentiate", "", [aligned(self.D(e), tex(r))])
        if not e.has(x):
            return S.Zero, None
        if e == x:
            return S.One, None
        if e.is_Add:
            terms = list(e.as_ordered_terms())
            res, kids = [], []
            for t in terms:
                r, k = self.go(t)
                res.append(r)
                kids.append(k)
            total = Add(*res)
            sign = any(t.could_extract_minus_sign() for t in terms[1:])
            title = "Sum and difference rule" if sign else "Sum rule"
            first = self.D(terms[0])
            for t in terms[1:]:
                first += (" - " + self.D(-t)) if t.could_extract_minus_sign() else (" + " + self.D(t))
            line = aligned(self.D(e), first, tex(total))
            return total, step(title, "Differentiate each term separately.",
                               [self.rule(r"\left[f \pm g\right] = f' \pm g'"), line], kids)
        if e.is_Mul:
            c, rest = e.as_independent(x, as_Add=False)
            if c != 1:
                r, k = self.go(rest)
                total = c * r
                line = aligned(self.D(e), ptex(c) + r" \cdot " + self.D(rest), ptex(c) + r" \cdot " + ptex(r), tex(total))
                return total, step("Constant multiple rule", r"The constant \(%s\) stays in front." % tex(c),
                                   [self.rule(r"\left[c\,f\right] = c\,f'"), line], [k])
            factors = list(Mul.make_args(rest))
            den = [f.base ** (-f.exp) for f in factors if f.is_Pow and f.exp.is_Number and f.exp < 0]
            num = [f for f in factors if not (f.is_Pow and f.exp.is_Number and f.exp < 0)]
            N_, D_ = Mul(*num), Mul(*den)
            if den and N_.has(x) and D_.has(x):
                rn, kn = self.go(N_)
                rd, kd = self.go(D_)
                total = (rn * D_ - N_ * rd) / D_ ** 2
                sub = r"\frac{%s \cdot %s - %s \cdot %s}{%s}" % (ptex(rn), ptex(D_), ptex(N_), ptex(rd), tex(D_ ** 2))
                line = aligned(self.D(e), sub, tex(total))
                return total, step("Quotient rule", r"Numerator \(f = %s\), denominator \(g = %s\)." % (tex(N_), tex(D_)),
                                   [self.rule(r"\left[\frac{f}{g}\right] = \frac{f'\,g - f\,g'}{g^{2}}"), line], [kn, kd])
            f, g = factors[0], Mul(*factors[1:])
            rf, kf = self.go(f)
            rg, kg = self.go(g)
            total = rf * g + f * rg
            sub = r"%s \cdot %s + %s \cdot %s" % (ptex(rf), ptex(g), ptex(f), ptex(rg))
            line = aligned(self.D(e), sub, tex(total))
            return total, step("Product rule", r"\(f = %s\) and \(g = %s\)." % (tex(f), tex(g)),
                               [self.rule(r"\left[f\,g\right] = f'\,g + f\,g'"), line], [kf, kg])
        if e.is_Pow:
            b, p = e.base, e.exp
            if not p.has(x):
                outer = p * b ** (p - 1)
                name = "Square root rule" if p == S.Half else ("Reciprocal rule" if p == -1 else "Power rule")
                if b == x:
                    r = p * x ** (p - 1)
                    return r, step(name, "", [self.rule(r"\left[%s^{n}\right] = n\,%s^{n-1}" % (tex(x), tex(x))) if name == "Power rule"
                                              else self.rule_for(lambda u: u ** p),
                                              aligned(self.D(e), tex(r))])
                ri, ki = self.go(b)
                total = outer * ri
                u = Symbol("u")
                return total, self.chain_node(e, tex(u ** p), tex(p * u ** (p - 1)), b, outer, ri, ki, total)
            if not b.has(x):
                # a^u
                ri, ki = self.go(p)
                total = e * log(b) * ri
                if p == x:
                    return total, step("Exponential rule (base %s)" % tex(b), "", [self.rule(r"\left[a^{%s}\right] = a^{%s}\ln a" % (tex(x), tex(x))),
                                                                                  aligned(self.D(e), tex(total))])
                u = Symbol("u")
                return total, self.chain_node(e, tex(b ** u), tex(b ** u * log(b)), p, e * log(b), ri, ki, total)
            # f^g: logarithmic differentiation
            prod = p * log(b)
            rp, kp = self.go(prod)
            total = e * rp
            y = Symbol("y")
            lines = [r"y = %s" % tex(e), r"\ln y = %s" % tex(prod),
                     r"\frac{1}{y}\,\frac{dy}{d%s} = %s" % (tex(x), tex(rp)),
                     aligned(r"\frac{dy}{d%s}" % tex(x), r"y \cdot " + ptex(rp), tex(total))]
            return total, step("Logarithmic differentiation",
                               "Both the base and the exponent depend on \\(%s\\): take ln of both sides, differentiate, then multiply by \\(y\\)." % tex(x),
                               lines, [kp])
        if isinstance(e, sp.Function) and len(e.args) == 1 and type(e) in FN_NAMES:
            F = type(e)
            u = e.args[0]
            outer = self.outer(F, u)
            if u == x:
                return outer, step("Derivative of the %s" % FN_NAMES[F], "", [self.rule_for(F)])
            ri, ki = self.go(u)
            total = outer * ri
            v = Symbol("u")
            return total, self.chain_node(e, tex(F(v)), tex(self.outer(F, v)), u, outer, ri, ki, total)
        if isinstance(e, sp.log) and len(e.args) == 2:
            return self.go(log(e.args[0]) / log(e.args[1]))
        if isinstance(e, sp.Function) and e.args == (x,) and isinstance(type(e), sp.core.function.UndefinedFunction):
            r = sp.Derivative(e, x)
            return r, None
        r = sp.diff(e, x)
        return r, step("Differentiate", "SymPy's built-in rules for this function.", [aligned(self.D(e), tex(r))])

    def rule(self, body):
        return self.dop + body

    def rule_for(self, F):
        v = self.x
        lhs = F(v)
        if F is sp.Abs:
            rhs = v / Abs(v)
        elif callable(F) and not isinstance(F, type):
            rhs = sp.diff(lhs, v)
        else:
            rhs = self.outer(F, v)
        return self.D(lhs) + " = " + tex(rhs)

    def chain_node(self, e, outer_tex, outer_d_tex, u, outer_at_u, ri, ki, total):
        x = self.x
        text = (r"Outer function \(f(u) = %s\) with inner function \(u = %s\), so \(f'(u) = %s\)."
                % (outer_tex, tex(u), outer_d_tex))
        line = aligned(self.D(e), ptex(outer_at_u) + r" \cdot " + self.D(u), ptex(outer_at_u) + r" \cdot " + ptex(ri), tex(total))
        return step("Chain rule", text, [self.dop + r"\left[f(u)\right] = f'(u)\,\frac{du}{d%s}" % tex(x), line], [ki])


def derivative_steps(e, x, partial=False):
    d = Differ(x, partial)
    r, node = d.go(e)
    if node is None:
        node = step("Basic rule", "", [aligned(d.D(e), tex(r))])
    return r, node, d


def parse_point(text, vars_, pool=()):
    """'2' or 'x=2, y=1' -> {Symbol: value}."""
    if not text or not str(text).strip():
        return {}
    out = {}
    parts = split_top(normalize(text), ",;")
    for i, p in enumerate(parts):
        segs, ops = split_relation(p)
        if ops:
            name = segs[0].strip()
            name = CLASH.get(name[3:], name[3:]) if name.startswith("Gk_") else name
            out[next((v for v in list(vars_) + list(pool) if v.name == name), Symbol(name, real=True))] = parse_one(segs[1])
        else:
            if i >= len(vars_):
                raise CasError("Give the point like x = 2 (or x = 1, y = 2 for several variables).")
            out[vars_[i]] = parse_one(p)
    for v in out.values():
        if not isinstance(v, sp.Basic) or v.free_symbols:
            raise CasError("The point must be a number (pi, e and sqrt(2) are fine).")
    return out


def op_diff(req):
    text = str(req.get("expr", "")).strip()
    text = re.sub(r"^\s*(?:d/d[a-z]+|derivative of)\s*", "", text, flags=re.I)
    order = int(req.get("order") or 1)
    if not 1 <= order <= 5:
        raise CasError("The order must be between 1 and 5.")
    kind, obj = parse_rel(text, var_names(req.get("var", "")))
    if kind == "rel":
        raise CasError("Inequalities can't be differentiated -- try the CAS calculator's Solve.")
    if kind == "eq":
        lhs, rhs = obj.lhs, obj.rhs
        # y = f(x) or f(x) = ... -> differentiate the right-hand side
        if (lhs.is_Symbol and not rhs.has(lhs)) or (isinstance(lhs, sp.Function) and isinstance(type(lhs), sp.core.function.UndefinedFunction)):
            obj = rhs
        else:
            return implicit_diff(realize(obj), req)
    e = realize(obj)
    if isinstance(e, sp.MatrixBase):
        raise CasError("Matrices are not supported here.")
    vs = var_names(req.get("var", ""))
    if not vs:
        vs = [pick_var(e).name]
    syms = [next((s for s in e.free_symbols if s.name == n), Symbol(n, real=True)) for n in vs]
    partial = len(e.free_symbols) > 1 or len(syms) > 1
    seq = syms if len(syms) > 1 else syms * order
    if len(seq) > 6:
        raise CasError("At most 6 differentiations at once.")
    sections, cur, total_nodes = [], e, 0
    raw_first = None
    for k, s in enumerate(seq):
        DISPLAY_SUBS.clear()
        r, node, d = derivative_steps(cur, s, partial)
        total_nodes += d.nodes
        simp = nice(r)
        check = sp.diff(cur, s)
        verified = same(simp, check, simp.free_symbols | check.free_symbols)
        if not verified:
            simp = nice(check)
        kids = [node]
        if tex(simp) != tex(r):
            kids.append(step("Simplify", "", [tex(r) + " = " + tex(simp)]))
        label = ("%s derivative" % ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"][k]) if len(syms) == 1 else \
            ("Differentiate with respect to \\(%s\\)" % tex(s))
        sections.append({"title": label, "expr": tex(cur), "var": tex(s), "steps": kids if total_nodes < 900 else kids[-1:],
                         "result": tex(simp), "verified": bool(verified)})
        if raw_first is None:
            raw_first = r
        cur = simp
    x0 = syms[0]
    if len(syms) == 1:
        dname = r"\frac{d%s}{d%s^{%d}}" % ("^{%d}" % order if order > 1 else "", tex(x0), order) if order > 1 else r"\frac{d}{d%s}" % tex(x0)
        if partial:
            dname = dname.replace("d", r"\partial ").replace(r"\frac{\partial }{\partial ", r"\frac{\partial}{\partial ")
    else:
        dname = r"\frac{\partial^{%d}}{%s}" % (len(syms), " ".join(r"\partial %s" % tex(s) for s in reversed(syms)))
    out = {"ok": True, "input": tex(e), "op": dname, "result": tex(cur), "plain": plain(cur), "sections": sections,
           "var": x0.name, "var_tex": tex(x0), "multi": partial}
    if len(seq) == 1 and raw_first is not None and tex(raw_first) != tex(cur) and _complexity(raw_first) < 3 * _complexity(cur) + 30:
        out["unsimplified"] = tex(raw_first)
    alt = []
    for fn in (sp.factor, sp.expand, sp.trigsimp):
        try:
            a = fn(cur)
            if tex(a) not in (tex(cur), out.get("unsimplified")) and tex(a) not in alt and len(tex(a)) < 400:
                alt.append(tex(a))
        except Exception:
            pass
    out["alt"] = alt[:2]
    pt = parse_point(req.get("at", ""), syms, e.free_symbols)
    if pt:
        try:
            v = cur.subs(pt)
            v = sp.nsimplify(v) if v.is_Float else sp.simplify(v)
            out["at"] = {"point": ", ".join("%s = %s" % (tex(k), tex(val)) for k, val in pt.items()), "exact": tex(v),
                         "decimal": evalf_str(v), "plain": plain(v)}
            fv = e.subs(pt)
            if len(syms) == 1 and order == 1 and not (cur.free_symbols - set(pt)) and not (e.free_symbols - set(pt)):
                fv = sp.simplify(fv)
                if fv.is_real and v.is_real:
                    xv = list(pt.values())[0]
                    tl = sp.collect(sp.expand(v * (x0 - xv) + fv), x0)
                    out["tangent"] = {"tex": "y = " + tex(tl), "plain": plain(tl)}
        except Exception:
            out["at"] = {"point": "", "exact": "", "decimal": "undefined there"}
    if len(e.free_symbols) <= 1 and len(syms) == 1:
        try:
            around = None
            if pt:
                around = float(sp.N(list(pt.values())[0]))
            a, b = plot_range(e, x0, around)
            out["plot"] = {"var": x0.name, "a": a, "b": b, "series": [
                {"label": "f", "data": samples(e, x0, a, b)},
                {"label": "f'" if order == 1 else "f^(%d)" % order, "data": samples(cur, x0, a, b)}]}
            g1, g2 = graph_text(e), graph_text(cur)
            if g1 and g2 and x0.name == "x":
                out["graph"] = [g1, g2]
        except Exception:
            pass
    return out


def implicit_diff(eq, req):
    lhs, rhs = eq.lhs, eq.rhs
    names = var_names(req.get("var", ""))
    syms = sorted((lhs - rhs).free_symbols, key=lambda s: s.name)
    xs = next((s for s in syms if s.name == (names[0] if names else "x")), None)
    ys = next((s for s in syms if s.name == (names[1] if len(names) > 1 else "y")), None)
    if xs is None or ys is None:
        raise CasError("For implicit differentiation type an equation in x and y, like x^2 + y^2 = 25.")
    yf = sp.Function("y")(xs)
    yp = Symbol("y'")
    DISPLAY_SUBS.clear()
    DISPLAY_SUBS[sp.Derivative(yf, xs)] = Symbol(r"\frac{dy}{d%s}" % tex(xs))
    DISPLAY_SUBS[yf] = ys
    L, R = lhs.subs(ys, yf), rhs.subs(ys, yf)
    rl, nl, _ = derivative_steps(L, xs)
    rr, nr, _ = derivative_steps(R, xs)
    dsym = sp.Derivative(yf, xs)
    sol = sp.solve(sp.Eq(rl, rr), dsym)
    if not sol:
        raise CasError("Couldn't solve for dy/dx.")
    res = sp.simplify(sol[0].subs(yf, ys))
    alt = sp.simplify(-sp.diff(lhs - rhs, xs) / sp.diff(lhs - rhs, ys))
    if not same(res, alt, {xs, ys}):
        res = alt
    dy = r"\frac{dy}{d%s}" % tex(xs)
    steps_ = [
        step("Differentiate both sides", r"Treat \(y\) as a function of \(%s\): every time \(y\) is differentiated, the chain rule adds a factor \(%s\)." % (tex(xs), dy),
             [r"\frac{d}{d%s}\left[%s\right] = \frac{d}{d%s}\left[%s\right]" % (tex(xs), tex(L), tex(xs), tex(R))], [nl, nr]),
        step("Collect", "", [tex(rl) + " = " + tex(rr)]),
        step(r"Solve for \(%s\)" % dy, "", [aligned(dy, tex(sol[0]), tex(res))]),
    ]
    DISPLAY_SUBS.clear()
    out = {"ok": True, "implicit": True, "input": tex(lhs) + " = " + tex(rhs), "op": dy, "result": tex(res), "plain": plain(res),
           "sections": [{"title": "Implicit differentiation", "expr": tex(lhs) + " = " + tex(rhs), "var": tex(xs), "steps": steps_,
                         "result": tex(res), "verified": True}], "var": xs.name, "var_tex": tex(xs), "alt": []}
    pt = parse_point(req.get("at", ""), [xs, ys])
    if pt:
        v = sp.simplify(res.subs(pt))
        out["at"] = {"point": ", ".join("%s = %s" % (tex(k), tex(val)) for k, val in pt.items()), "exact": tex(v), "decimal": evalf_str(v), "plain": plain(v)}
    return out


# ================================================================ INTEGRALS ======================================
RULE_TITLES = {
    "ConstantRule": "Constant rule", "ConstantTimesRule": "Constant multiple rule", "PowerRule": "Power rule",
    "NestedPowRule": "Power rule", "AddRule": "Sum rule", "URule": "u-substitution", "PartsRule": "Integration by parts",
    "CyclicPartsRule": "Integration by parts (cyclic)", "SinRule": "Integral of sine", "CosRule": "Integral of cosine",
    "SecTanRule": "Integral of sec·tan", "CscCotRule": "Integral of csc·cot", "Sec2Rule": "Integral of sec²",
    "Csc2Rule": "Integral of csc²", "SinhRule": "Integral of sinh", "CoshRule": "Integral of cosh", "ExpRule": "Exponential rule",
    "ReciprocalRule": "Reciprocal rule (logarithm)", "ArcsinRule": "Arcsine rule", "ArcsinhRule": "Inverse hyperbolic sine rule",
    "ReciprocalSqrtQuadraticRule": "Square root of a quadratic", "SqrtQuadraticDenomRule": "Square root of a quadratic",
    "SqrtQuadraticRule": "Square root of a quadratic", "RewriteRule": "Rewrite the integrand", "CompleteSquareRule": "Complete the square",
    "PiecewiseRule": "Piecewise integrand", "HeavisideRule": "Heaviside step", "DiracDeltaRule": "Dirac delta",
    "TrigSubstitutionRule": "Trigonometric substitution", "ArctanRule": "Arctangent rule", "DerivativeRule": "Integral of a derivative",
    "ErfRule": "Error function", "FresnelCRule": "Fresnel integral", "FresnelSRule": "Fresnel integral", "CiRule": "Cosine integral",
    "SiRule": "Sine integral", "EiRule": "Exponential integral", "LiRule": "Logarithmic integral", "ChiRule": "Hyperbolic cosine integral",
    "ShiRule": "Hyperbolic sine integral", "PolylogRule": "Polylogarithm", "UpperGammaRule": "Incomplete gamma function",
    "EllipticFRule": "Elliptic integral", "EllipticERule": "Elliptic integral", "DontKnowRule": "No rule found",
}


class IntRender:
    def __init__(self):
        self.unknown = False
        self.recip = []
        self.n = 0

    def I(self, f, x):
        return r"\int %s\,d%s" % (r"\left(" + tex(f) + r"\right)" if f.is_Add else tex(f), tex(x))

    def ev(self, rule):
        try:
            return rule.eval()
        except Exception:
            return None

    def go(self, r):
        self.n += 1
        name = type(r).__name__
        f, x = r.integrand, r.variable
        if self.n > 250:
            return step("…", "(remaining steps omitted)")
        if name == "AlternativeRule":
            return self.go(r.alternatives[0])
        if name == "DontKnowRule":
            self.unknown = True
            return step("No elementary rule", r"No step-by-step rule applies to \(%s\)." % self.I(f, x))
        F = self.ev(r)
        main = self.I(f, x) + " = " + (tex(F) if F is not None else "?")
        title = RULE_TITLES.get(name, re.sub(r"(?<!^)(?=[A-Z])", " ", name.replace("Rule", "")).strip() + " rule")
        if name == "ConstantRule":
            return step(title, r"The integral of a constant \(c\) is \(c\,%s\)." % tex(x), [main])
        if name == "ConstantTimesRule":
            line = aligned(self.I(f, x), ptex(r.constant) + r" \int " + tex(r.other) + r"\,d" + tex(x), tex(F))
            return step(title, r"Take the constant \(%s\) out of the integral." % tex(r.constant),
                        [r"\int c\,f(%s)\,d%s = c\int f(%s)\,d%s" % ((tex(x),) * 4), line], [self.go(r.substep)])
        if name in ("PowerRule", "NestedPowRule"):
            return step(title, r"\(n = %s\)." % tex(r.exp) if name == "PowerRule" else "",
                        [r"\int %s^{n}\,d%s = \frac{%s^{n+1}}{n+1} \quad (n \ne -1)" % (tex(x), tex(x), tex(x)), main])
        if name == "AddRule":
            line = aligned(self.I(f, x), " + ".join(self.I(s.integrand, x) for s in r.substeps).replace("+ -", "- "), tex(F))
            return step(title, "Integrate term by term.", [line], [self.go(s) for s in r.substeps])
        if name == "URule":
            u, uf = r.u_var, r.u_func
            du = sp.diff(uf, x)
            sub = r.substep
            line = aligned(self.I(f, x), self.I(sub.integrand, u))
            G = self.ev(sub)
            kid = self.go(sub)
            self.recip += [b.subs(u, uf) for b in self.recip if b.has(u)]
            back = []
            if G is not None:
                back = [step("Substitute back", r"Replace \(%s\) with \(%s\)." % (tex(u), tex(uf)),
                             [aligned(tex(G), tex(G.subs(u, uf)))])]
            return step(title, r"Let \(%s = %s\), so \(d%s = %s\,d%s\)." % (tex(u), tex(uf), tex(u), tex(du), tex(x)),
                        [line], [kid] + back)
        if name == "PartsRule":
            v = self.ev(r.v_step)
            du = sp.diff(r.u, x)
            lines = [r"\int u\,dv = u\,v - \int v\,du",
                     r"u = %s,\quad dv = %s\,d%s,\quad du = %s\,d%s,\quad v = %s" % (tex(r.u), tex(r.dv), tex(x), tex(du), tex(x), tex(v) if v is not None else "?")]
            kids = [self.go(r.v_step)]
            if r.second_step is not None and v is not None:
                lines.append(aligned(self.I(f, x), ptex(r.u) + r" \cdot " + ptex(v) + r" - \int " + ptex(v * du) + r"\,d" + tex(x), tex(F)))
                kids.append(self.go(r.second_step))
            else:
                lines.append(main)
            return step(title, "", lines, kids)
        if name == "CyclicPartsRule":
            kids = []
            for pr in r.parts_rules:
                v = self.ev(pr.v_step)
                kids.append(step("By parts", "", [r"u = %s,\quad dv = %s\,d%s,\quad v = %s" % (tex(pr.u), tex(pr.dv), tex(x), tex(v) if v is not None else "?")]))
            c = r.coefficient
            rest = sp.expand(F * (1 - c)) if F is not None else None
            cj = ("+" if c > 0 else "-") + ("" if abs(c) == 1 else " " + tex(abs(c))) + " J"
            lines = [r"J = " + self.I(f, x)]
            if rest is not None:
                lines += [r"J = %s %s" % (tex(rest), cj), r"%s\,J = %s" % (tex(1 - c), tex(rest)), "J = " + tex(F)]
            return step(title, "Integrating by parts twice brings back the original integral \\(J\\): move it to the left side and solve for it.",
                        lines, kids)
        if name == "ReciprocalRule":
            b = r.base
            self.recip.append(b)
            return step(title, r"\(\int \frac{1}{u}\,du = \ln|u|\).", [self.I(f, x) + " = " + tex(log(Abs(b)))])
        if name in ("RewriteRule", "CompleteSquareRule"):
            why, shown = "", r.rewritten
            try:
                fr = sp.together(f)
                if fr.is_rational_function(x) and name == "RewriteRule":
                    ap = sp.apart(fr, x)
                    if len(sp.Add.make_args(ap)) > 1 and sp.simplify(ap - r.rewritten) == 0:
                        title, why, shown = "Partial fractions", "Split the rational function into partial fractions.", ap
            except Exception:
                pass
            return step(title, why, [tex(f) + " = " + tex(shown)], [self.go(r.substep)])
        if name == "TrigSubstitutionRule":
            return step(title, r"Substitute \(%s = %s\) (\(%s\) as the new variable)." % (tex(x), tex(r.func), tex(r.theta)),
                        [r"\int %s\,d%s" % (tex(r.rewritten), tex(r.theta)), main], [self.go(r.substep)])
        if name == "PiecewiseRule":
            return step(title, "The answer depends on the parameter values.", [main])
        sub = getattr(r, "substep", None)
        return step(title, "", [main], [self.go(sub)] if sub is not None else None)


def _int_steps(f, x):
    try:
        rule = MI.integral_steps(f, x)
    except Exception:
        return None, None, None
    R = IntRender()
    node = R.go(rule)
    if R.unknown:
        return None, None, R
    try:
        F = rule.eval()
    except Exception:
        return None, None, R
    return node, F, R


def parse_bound(text):
    s = str(text).strip()
    if not s:
        raise CasError("Enter both bounds for a definite integral.")
    v = parse_expr_text(s)
    if v.free_symbols:
        pass
    return v


def numeric_integral(f, x, a, b):
    g = sp.lambdify(x, f, modules=["mpmath"])
    mpmath.mp.dps = 20
    try:
        aa = mpmath.inf if a == oo else (-mpmath.inf if a == -oo else mpmath.mpf(str(sp.N(a, 25))))
        bb = mpmath.inf if b == oo else (-mpmath.inf if b == -oo else mpmath.mpf(str(sp.N(b, 25))))
        v, err = mpmath.quad(lambda t: g(t), [aa, bb], error=True, maxdegree=8)
        if isinstance(v, mpmath.mpc):
            if abs(v.imag) > 1e-12 * (1 + abs(v.real)):
                return None, None
            v = v.real
        return v, err
    except Exception:
        return None, None
    finally:
        mpmath.mp.dps = 15


def op_integrate(req):
    text = str(req.get("expr", "")).strip()
    text = re.sub(r"^\s*(?:∫|integral of|integrate)\s*", "", text, flags=re.I)
    m = re.search(r"(?:\s+|(?<=[)\]0-9]))d\s*([A-Za-z]|[α-ω]|alpha|beta|theta|phi)\s*$", text)
    var_hint = req.get("var") or ""
    if m and m.start() > 0:
        if not var_hint:
            var_hint = GREEK.get(m.group(1), m.group(1))
        text = text[:m.start()]
    e = realize(parse_expr_text(text, var_names(var_hint)))
    if isinstance(e, sp.MatrixBase):
        raise CasError("Matrices are not supported here.")
    x = pick_var(e, var_hint)
    if not x.is_real:
        x = Symbol(x.name, real=True)
    definite = bool(req.get("definite"))
    DISPLAY_SUBS.clear()
    out = {"ok": True, "input": tex(e), "var": x.name, "var_tex": tex(x), "definite": definite}
    node, F, R = _int_steps(e, x)
    method = "steps"
    if node is not None and F is not None and not F.has(sp.Integral) and same(sp.diff(F, x), e, {x} | e.free_symbols):
        pass
    else:
        method = "general"
        node = None
        F = sp.integrate(e, x)
    no_closed = F.has(sp.Integral)
    Fn = F
    if not no_closed:
        Fn = nice(F)
        if not same(sp.diff(Fn, x), e, {x} | e.free_symbols):
            Fn = F
    disp = Fn
    if R is not None and R.recip and method == "steps":
        for b in R.recip:
            disp = disp.subs(log(b), log(Abs(b)))
            disp = disp.subs(log(-b), log(Abs(b)))
    out["method"] = method
    out["antiderivative"] = tex(disp)
    out["antiderivative_plain"] = plain(disp)
    out["no_closed_form"] = bool(no_closed)
    steps_ = []
    if node is not None:
        steps_.append(node)
        if tex(Fn) != tex(F):
            steps_.append(step("Simplify", "", [tex(F) + " = " + tex(Fn)]))
        if disp != Fn:
            steps_.append(step("Absolute value in the logarithm", r"\(\ln|u|\) is the antiderivative of \(\frac1u\) on both sides of 0.", [tex(Fn) + r" \;\to\; " + tex(disp)]))
    out["steps"] = steps_
    if not no_closed:
        dF = sp.diff(Fn, x)
        ok = same(dF, e, {x} | e.free_symbols)
        out["verify"] = {"tex": r"\frac{d}{d%s}\left[%s\right] = %s" % (tex(x), tex(disp), tex(nice(dF))), "ok": bool(ok)}
    if not definite:
        out["result"] = tex(disp) + " + C" if not no_closed else tex(F) + " + C"
        out["plain"] = plain(disp) + " + C"
        out["op"] = r"\int %s\,d%s" % (tex(e), tex(x))
        try:
            if len(e.free_symbols) <= 1:
                a, b = plot_range(e, x)
                out["plot"] = {"var": x.name, "a": a, "b": b, "series": [{"label": "f", "data": samples(e, x, a, b)}] +
                               ([{"label": "F", "data": samples(disp, x, a, b)}] if not no_closed else [])}
                g1 = graph_text(e)
                g2 = graph_text(disp) if not no_closed else None
                if g1 and x.name == "x":
                    out["graph"] = [g1] + ([g2] if g2 else [])
        except Exception:
            pass
        return out
    a = parse_bound(req.get("lower", ""))
    b = parse_bound(req.get("upper", ""))
    if a.has(x) or b.has(x):
        raise CasError("A bound can't contain the integration variable.")
    out["op"] = r"\int_{%s}^{%s} %s\,d%s" % (tex(a), tex(b), tex(e), tex(x))
    out["lower"], out["upper"] = tex(a), tex(b)
    emit({"stage": "numeric"})
    num, err = (None, None)
    if not (e.free_symbols - {x}) and not (a.free_symbols or b.free_symbols):
        num, err = numeric_integral(e, x, a, b)
        if num is not None:
            emit({"numeric": num_str(num, 15)})
    exact = None
    try:
        exact = sp.integrate(e, (x, a, b))
    except Exception:
        exact = None
    if exact is not None and (exact.has(sp.Integral) or exact.has(nan)):
        exact = None
    ftc = None
    if not no_closed:
        try:
            Fb = sp.limit(Fn, x, b, "-") if b.is_infinite else sp.simplify(Fn.subs(x, b))
            Fa = sp.limit(Fn, x, a, "+") if a.is_infinite else sp.simplify(Fn.subs(x, a))
            if Fb.has(nan) or Fa.has(nan) or Fb.has(zoo) or Fa.has(zoo):
                raise ValueError
            diff_ = sp.simplify(Fb - Fa)
            consistent = exact is None or same(diff_, exact, diff_.free_symbols | exact.free_symbols)
            if consistent and num is not None and diff_.is_number and not diff_.is_infinite:
                consistent = abs(complex(sp.N(diff_)) - complex(num)) < 1e-6 * (1 + abs(complex(num)))
            if consistent:
                ftc = step("Fundamental theorem of calculus", r"Evaluate the antiderivative at the bounds: \(F(b) - F(a)\).",
                           [r"\left[%s\right]_{%s}^{%s}" % (tex(disp), tex(a), tex(b)) + " = " +
                            r"\left(%s\right) - \left(%s\right)" % (tex(Fb), tex(Fa)) + " = " + tex(diff_)])
                if exact is None:
                    exact = diff_
        except Exception:
            ftc = None
    if ftc is not None:
        out["steps"] = steps_ + [ftc]
    elif steps_ and exact is not None:
        out["steps"] = steps_ + [step("Evaluate the bounds", "The antiderivative is not continuous on the whole interval (or the integral is improper), so the value comes from SymPy's limits.", [out["op"] + " = " + tex(exact)])]
    if exact is not None and exact.is_number and num is not None and not exact.is_infinite:
        try:
            if abs(complex(sp.N(exact)) - complex(num)) > 1e-6 * (1 + abs(complex(num))):
                out["warning"] = "The exact and numeric values disagree -- treat the exact form with care (the integrand may have a singularity)."
        except Exception:
            pass
    if exact is not None and exact.is_infinite:
        out["note"] = "The integral diverges."
    if exact is not None:
        exact = sp.simplify(exact) if sp.count_ops(exact) < 200 else exact
        out["result"] = tex(exact)
        out["plain"] = plain(exact)
        out["decimal"] = evalf_str(exact, 15)
    elif num is not None:
        out["result"] = r"\approx " + num_str(num, 15)
        out["plain"] = num_str(num, 15)
        out["decimal"] = num_str(num, 15)
        out["numeric_only"] = True
        out["note"] = "No closed form found; the value was computed numerically with mpmath.quad (error estimate %s)." % num_str(err or 0, 3)
    else:
        raise CasError("SymPy could not evaluate this integral.")
    try:
        if len(e.free_symbols) <= 1 and a.is_number and b.is_number:
            fa = float(sp.N(a)) if not a.is_infinite else None
            fb = float(sp.N(b)) if not b.is_infinite else None
            lo = fa if fa is not None else (fb - 10 if fb is not None else -10)
            hi = fb if fb is not None else (fa + 10 if fa is not None else 10)
            lo2, hi2 = min(lo, hi), max(lo, hi)
            pad = max(1.0, (hi2 - lo2) * 0.25)
            out["plot"] = {"var": x.name, "a": lo2 - pad, "b": hi2 + pad, "shade": [lo2, hi2],
                           "series": [{"label": "f", "data": samples(e, x, lo2 - pad, hi2 + pad)}]}
            g1 = graph_text(e)
            if g1 and x.name == "x":
                out["graph"] = [g1]
    except Exception:
        pass
    return out


# ================================================================ SOLVING ========================================
def _is_trig(f, x):
    return any(isinstance(a, (TrigonometricFunction, HyperbolicFunction)) and a.has(x) and
               isinstance(a, TrigonometricFunction) for a in f.atoms(sp.Function))


def default_interval(f, x):
    if _is_trig(f, x):
        return S.Zero, 2 * pi
    return Integer(-10), Integer(10)


def _rfloat(e):
    return float(sp.N(e))


def numeric_roots(f, x, a, b, n=1500):
    """All real roots of f in [a, b]: sign changes (bracketed + Illinois refinement at 30 digits) plus touching roots."""
    a, b = float(a), float(b)
    if not a < b:
        raise CasError("The search interval must have its left end smaller than its right end.")
    old = mpmath.mp.dps
    mpmath.mp.dps = 30
    try:
        g = make_num(f, x)

        def val(t):
            return _real(g(t)) if not isinstance(t, mpmath.mpf) else g(t)
        xs = [a + (b - a) * i / n for i in range(n + 1)]
        vs = [_real(g(t)) for t in xs]
        finite = [abs(v) for v in vs if v is not None]
        scale = sorted(finite)[len(finite) // 2] if finite else 1.0
        roots = []

        def ok_root(r):
            v = g(r)
            if v is None:
                return False
            try:
                av = abs(v)
            except Exception:
                return False
            return av < mpmath.mpf(10) ** -12 * (1 + scale)

        def illinois(lo, hi, flo, fhi):
            lo, hi = mpmath.mpf(lo), mpmath.mpf(hi)
            flo, fhi = mpmath.mpf(flo), mpmath.mpf(fhi)
            side = 0
            for _ in range(200):
                if fhi == flo:
                    break
                c = (lo * fhi - hi * flo) / (fhi - flo)
                if not (min(lo, hi) <= c <= max(lo, hi)):
                    c = (lo + hi) / 2
                fc = g(c)
                if fc is None:
                    c = (lo + hi) / 2
                    fc = g(c)
                    if fc is None:
                        return None
                if isinstance(fc, mpmath.mpc):
                    fc = fc.real
                if fc == 0:
                    return c
                if (fc > 0) == (fhi > 0):
                    hi, fhi = c, fc
                    if side == 1:
                        flo /= 2
                    side = 1
                else:
                    lo, flo = c, fc
                    if side == -1:
                        fhi /= 2
                    side = -1
                if abs(hi - lo) < mpmath.mpf(10) ** -26 * (1 + abs(c)):
                    break
            return (lo + hi) / 2 if abs(fhi) > abs(flo) else hi if abs(fhi) < abs(flo) else (lo + hi) / 2

        for i in range(n + 1):
            v = vs[i]
            if v == 0:
                roots.append(mpmath.mpf(xs[i]))
                continue
            if i < n and v is not None and vs[i + 1] is not None and vs[i + 1] != 0 and (v > 0) != (vs[i + 1] > 0):
                r = illinois(xs[i], xs[i + 1], v, vs[i + 1])
                if r is not None and ok_root(r):
                    roots.append(r)
            if 0 < i < n and v is not None and vs[i - 1] is not None and vs[i + 1] is not None:
                if abs(v) <= abs(vs[i - 1]) and abs(v) <= abs(vs[i + 1]) and (v > 0) == (vs[i - 1] > 0) == (vs[i + 1] > 0) \
                        and abs(v) < 0.05 * (1 + scale):
                    try:
                        r = mpmath.findroot(lambda t: g(t), (mpmath.mpf(xs[i - 1]), mpmath.mpf(xs[i + 1])), solver="secant",
                                            tol=mpmath.mpf(10) ** -40, maxsteps=300, verify=False)
                        if isinstance(r, mpmath.mpc):
                            r = r.real
                        if xs[i - 1] - (b - a) / n <= r <= xs[i + 1] + (b - a) / n and abs(g(r)) < mpmath.mpf(10) ** -14 * (1 + scale):
                            roots.append(r)
                    except Exception:
                        pass
        roots.sort()
        uniq = []
        for r in roots:
            if a - 1e-12 <= r <= b + 1e-12 and (not uniq or abs(r - uniq[-1]) > 1e-7 * (1 + abs(r))):
                uniq.append(r)
        return uniq
    finally:
        mpmath.mp.dps = old


def _poly_info(f, x):
    num, den = sp.fraction(sp.together(f))
    try:
        P = Poly(sp.expand(num), x)
    except Exception:
        return None
    if any(c.has(x) for c in P.all_coeffs()):
        return None
    return P, num, den


def _sol_entry(val, x, trig):
    d = {"tex": tex(val), "plain": plain(val)}
    dec = evalf_str(val, 12)
    if dec is not None and tex(val) != dec:
        d["decimal"] = dec
    try:
        if trig and val.is_real:
            d["degrees"] = num_str(mpmath.mpf(str(sp.N(val * 180 / pi, 20))), 10)
    except Exception:
        pass
    return d


def linear_steps(f, x, lhs, rhs):
    P = Poly(f, x)
    a, b = P.all_coeffs()
    sol = sp.simplify(-b / a)
    st = []
    if not (rhs == 0 and lhs == f):
        st.append(step("Move everything to one side", "", [tex(lhs) + " - " + ptex(rhs) + " = 0", tex(a * x + b) + " = 0"]))
    if b != 0:
        how = (r"Subtract \(%s\) from both sides." % tex(b)) if not b.could_extract_minus_sign() else (r"Add \(%s\) to both sides." % tex(-b))
        st.append(step("Isolate the %s-term" % tex(x), how, [tex(a * x) + " = " + tex(-b)]))
    if a != 1:
        st.append(step("Divide by the coefficient", r"Divide both sides by \(%s\)." % tex(a), [tex(x) + " = " + tex(sol)]))
    return [sol], st


def quadratic_steps(f, x):
    P = Poly(f, x)
    a, b, c = P.all_coeffs()
    disc = sp.simplify(b ** 2 - 4 * a * c)
    st = [step("Standard form", r"\(a = %s\), \(b = %s\), \(c = %s\)." % (tex(a), tex(b), tex(c)), [tex(P.as_expr()) + " = 0"])]
    st.append(step("Discriminant", "", [aligned(r"\Delta = b^2 - 4ac", ptex(b) + "^2 - 4" + r" \cdot " + ptex(a) + r" \cdot " + ptex(c), tex(disc))]))
    roots = sp.roots(P)
    rational = all(r.is_rational for r in roots) and roots and a.is_number and b.is_number and c.is_number
    if rational and len(roots) >= 1:
        fac = sp.factor(P.as_expr())
        st.append(step("Factor", "The discriminant is a perfect square, so the quadratic factors over the rationals.",
                       [tex(fac) + " = 0"]))
        st.append(step("Zero product property", "A product is 0 when one of its factors is 0.",
                       [", ".join(r"%s = %s" % (tex(x), tex(r)) for r in roots)]))
        sols = sorted(roots, key=lambda r: float(r))
    else:
        r1 = sp.simplify((-b + sqrt(disc)) / (2 * a))
        r2 = sp.simplify((-b - sqrt(disc)) / (2 * a))
        form = r"%s = \frac{-b \pm \sqrt{\Delta}}{2a} = \frac{%s \pm \sqrt{%s}}{%s}" % (tex(x), tex(-b), tex(disc), tex(2 * a))
        txt = ""
        if disc.is_number and disc < 0:
            txt = r"\(\Delta < 0\): there are no real solutions, only two complex ones."
        elif disc == 0:
            txt = r"\(\Delta = 0\): one repeated root."
        st.append(step("Quadratic formula", txt, [form, ", ".join(r"%s = %s" % (tex(x), tex(r)) for r in ([r1] if disc == 0 else [r1, r2]))]))
        sols = [r1] if disc == 0 else [r2, r1]
    return sols, st


def poly_steps(P, x):
    """Degree >= 3: rational root theorem, factor, then the leftover factors."""
    st, sols = [], []
    expr = P.as_expr()
    coeffs = P.all_coeffs()
    if all(c.is_rational for c in coeffs):
        PP = Poly(expr * sp.lcm([sp.fraction(c)[1] for c in coeffs]), x)
        lead, const = PP.LC(), PP.TC()
        if const != 0 and abs(lead) < 10 ** 6 and abs(const) < 10 ** 6:
            ps = sp.divisors(int(abs(const)))
            qs = sp.divisors(int(abs(lead)))
            cands = sorted({Rational(p, q) for p in ps for q in qs}, key=lambda r: (abs(r), r))
            found = [r for r in cands if PP.eval(r) == 0 or PP.eval(-r) == 0]
            roots_ = sorted({r for r in cands if PP.eval(r) == 0} | {-r for r in cands if PP.eval(-r) == 0})
            cand_txt = ", ".join(r"\pm %s" % tex(c) for c in cands[:14]) + (r", \ldots" if len(cands) > 14 else "")
            if roots_:
                st.append(step("Rational root theorem", r"Any rational root is \(\pm p/q\) with \(p\) dividing %s and \(q\) dividing %s. Candidates: \(%s\)." %
                               (tex(abs(const)), tex(abs(lead)), cand_txt),
                               [", ".join(r"P(%s) = 0" % tex(r) for r in roots_)]))
            else:
                st.append(step("Rational root theorem", r"Candidates \(%s\): none of them is a root, so there are no rational roots." % cand_txt))
    fac = sp.factor(expr)
    if fac != expr and Mul.make_args(fac) and len(sp.factor_list(expr)[1]) > 1:
        st.append(step("Factor", "", [tex(fac) + " = 0"]))
    for fct, mult in sp.factor_list(expr)[1]:
        fp = Poly(fct, x)
        if fp.degree() == 1:
            r = sp.solve(fct, x)[0]
            sols.append(r)
        elif fp.degree() == 2:
            rs, qs = quadratic_steps(fct, x)
            st.append(step(r"Solve \(%s = 0\)" % tex(fct), "", None, qs))
            sols.extend(rs)
        else:
            rs = sp.roots(fp, cubics=True, quartics=False)
            exact = [r for r in rs if _complexity(r) < 25]
            if exact and len(exact) == sum(rs.values()) and len(exact) == fp.degree():
                sols.extend(exact)
                st.append(step(r"Solve \(%s = 0\)" % tex(fct), "Cubic formula (Cardano).", [", ".join(tex(r) for r in exact)]))
            else:
                if fp.degree() == 3 and rs:
                    real_ex = [r for r in rs if r.is_real]
                    if real_ex and all(_complexity(r) < 120 for r in real_ex):
                        st.append(step("Cardano's formula", "The cubic has no rational roots; Cardano's formula gives the exact real root%s (long, so the decimals below are easier to use)." % ("s" if len(real_ex) > 1 else ""),
                                       [tex(x) + " = " + tex(r) for r in real_ex]))
                nr = Poly(fct, x).nroots(n=15)
                sols.extend(nr)
                st.append(step(r"Solve \(%s = 0\) numerically" % tex(fct), "No simple closed form, so the roots are found numerically.",
                               [", ".join(r"%s \approx %s" % (tex(x), evalf_str(r, 10)) for r in nr)]))
    return sols, st


def _subst_insight(f, x):
    """Find u = g(x) with f expressible in u alone (sin α appears only as sin α, etc.)."""
    cands = []
    for a in sorted(f.atoms(sp.Function), key=lambda z: len(str(z))):
        if a.has(x) and a != x:
            cands.append(a)
    for p in f.atoms(Pow):
        if p.base == x and p.exp.is_Number and p.exp not in (1, -1) and p.exp > 0:
            cands.append(p)
    for g in cands:
        s = Symbol("s")
        h = f.subs(g, s)
        if not h.has(x) and h.has(s) and h != s:
            # only interesting when g occurs more than once (or inside other functions)
            if str(f).count(str(g)) < 2:
                continue
            return g, s, h
    return None


def _artanh_note(h, s):
    for L in h.atoms(log):
        arg = L.args[0]
        if sp.simplify(sp.together(arg) - (1 + s) / (1 - s)) == 0:
            return L, 2 * sp.atanh(s)
    return None


def _image(g, x):
    """Range of the substituted function (search interval for s)."""
    if isinstance(g, (sp.sin, sp.cos)) and g.args[0] == x or isinstance(g, (sp.sin, sp.cos)):
        return -1.0, 1.0
    if isinstance(g, sp.exp):
        return 1e-9, 60.0
    if isinstance(g, sp.atan):
        return -math.pi / 2, math.pi / 2
    return -50.0, 50.0


def _back_sub(g, x, sval):
    """Solve g(x) = sval for x (closed forms, principal ones first)."""
    try:
        return sp.solve(sp.Eq(g, sval), x)
    except Exception:
        return []


def solve_single(rel, x, interval, stage, trig_hint=None):
    lhs, rhs = rel.lhs, rel.rhs
    f = sp.simplify(lhs - rhs) if sp.count_ops(lhs - rhs) < 80 else lhs - rhs
    f0 = lhs - rhs
    trig = _is_trig(f0, x)
    out = {"kind": "equation", "var": x.name, "var_tex": tex(x), "trig": trig, "steps": [], "solutions": []}
    out["equation"] = tex(lhs) + " = " + tex(rhs)
    if f == 0:
        out["identity"] = True
        out["summary"] = "The equation is true for every value of %s (it is an identity)." % x.name
        return out
    if not f.has(x):
        out["summary"] = "There is no solution: the equation simplifies to %s = 0, which is never true." % plain(f)
        out["none"] = True
        return out
    info = _poly_info(f0, x)
    if info is not None:
        P, num, den = info
        st = []
        if den.has(x):
            st.append(step("Clear the denominators", r"Multiply both sides by \(%s\) (which must not be 0)." % tex(den),
                           [tex(sp.expand(num)) + " = 0"]))
        deg = P.degree()
        if deg <= 0:
            out["none"] = True
            out["summary"] = "No solution."
            return out
        if deg == 1:
            sols, s2 = linear_steps(P.as_expr(), x, lhs if not den.has(x) else P.as_expr(), rhs if not den.has(x) else S.Zero)
        elif deg == 2:
            sols, s2 = quadratic_steps(P.as_expr(), x)
        else:
            sols, s2 = poly_steps(P, x)
        st += s2
        sols = [sp.nsimplify(s) if isinstance(s, sp.Float) and False else s for s in sols]
        if den.has(x):
            bad = [s for s in sols if sp.simplify(den.subs(x, s)) == 0]
            if bad:
                st.append(step("Check excluded values", r"\(%s\) makes a denominator zero, so it is not a solution." % ", ".join(tex(b) for b in bad)))
            sols = [s for s in sols if s not in bad]
        uniq = []
        for s_ in sols:
            if not any(sp.simplify(s_ - u) == 0 for u in uniq):
                uniq.append(s_)
        real = [s_ for s_ in uniq if s_.is_real is not False and not (s_.is_number and sp.im(sp.N(s_)) != 0 and abs(sp.im(sp.N(s_))) > 1e-12)]
        cplx = [s_ for s_ in uniq if s_ not in real]
        out["steps"] = st
        out["solutions"] = [_sol_entry(s_, x, False) for s_ in sorted(real, key=lambda z: float(sp.N(z)) if z.is_number else 0)]
        out["complex"] = [_sol_entry(s_, x, False) for s_ in cplx]
        out["method"] = "exact"
        out["verified"] = all(abs(complex(sp.N(f0.subs(x, s_), 20))) < 1e-9 for s_ in uniq if s_.is_number)
        _plot_solve(out, f0, x, [float(sp.N(s_)) for s_ in real if s_.is_number], None)
        return out
    # ---- transcendental: numeric scan first (always works), then exact forms
    a, b = interval if interval else default_interval(f0, x)
    out["interval"] = [tex(a), tex(b)]
    out["interval_plain"] = [plain(a), plain(b)]
    st = []
    ins = _subst_insight(f0, x)
    if ins:
        g, s, h = ins
        lines = [r"%s = %s" % (tex(s), tex(g)), tex(sp.Eq(h, 0, evaluate=False)) if False else tex(h) + " = 0"]
        txt = r"The variable only appears through \(%s\), so let \(%s = %s\)." % (tex(g), tex(s), tex(g))
        note = _artanh_note(h, s)
        if note:
            L, rep = note
            h2 = h.subs(L, rep)
            lines.append(r"%s = %s \quad (-1 < %s < 1)" % (tex(L), tex(rep), tex(s)))
            lines.append(tex(h2) + " = 0")
        lo, hi = _image(g, x)
        sr = numeric_roots(h, s, lo + (1e-12 if lo == -1 else 0), hi - (1e-12 if hi == 1 else 0))
        kids = []
        if sr:
            lines.append(", ".join(r"%s \approx %s" % (tex(s), num_str(r, 10)) for r in sr))
            for r in sr:
                try:
                    xs_ = _back_sub(g, x, sp.Float(str(r), 30))
                    if xs_:
                        kids.append(step(r"Back-substitute \(%s = %s\)" % (tex(g), num_str(r, 10)), "",
                                         [", ".join(r"%s \approx %s" % (tex(x), num_str(mpmath.mpf(str(sp.re(sp.N(v, 20)))), 10)) for v in xs_ if abs(sp.im(sp.N(v))) < 1e-12)
                                          + (r"\quad (\text{plus multiples of the period})" if trig else "")]))
                except Exception:
                    pass
        st.append(step("Substitution", txt, lines, kids))
    roots = numeric_roots(f0, x, _rfloat(a), _rfloat(b))
    per = None
    try:
        per = sp.periodicity(f0, x) if trig else None
    except Exception:
        per = None
    st.append(step("Find the roots numerically", r"Scan \(f(%s) = %s\) for sign changes on \([%s, %s]\) and refine each root to 30 digits (Illinois / secant method)." %
                   (tex(x), tex(f0), tex(a), tex(b)),
                   [", ".join(r"%s \approx %s" % (tex(x), num_str(r, 10)) for r in roots)] if roots else None))
    out["steps"] = st
    out["solutions"] = []
    for r in roots:
        d = {"tex": r"\approx " + num_str(r, 10), "plain": num_str(r, 12), "decimal": num_str(r, 12), "numeric": True, "value": float(r)}
        if trig:
            d["degrees"] = num_str(r * 180 / mpmath.pi, 10)
        out["solutions"].append(d)
    if per is not None and per != 0:
        out["period"] = tex(per)
        if roots:
            out["general"] = r"%s \approx " % tex(x) + r",\;\; ".join(r"%s + %s k" % (num_str(r, 8), tex(per)) for r in roots) + r"\qquad (k \in \mathbb{Z})"
    out["method"] = "numeric"
    out["verified"] = True
    if not roots:
        out["summary"] = "No real roots found in [%s, %s]. Try a wider search interval." % (plain(a), plain(b))
    _plot_solve(out, f0, x, [float(r) for r in roots], (_rfloat(a), _rfloat(b)))
    if stage == "numeric":
        return out
    emit({"partial": out})
    # ---- exact forms (may be slow; the client keeps the numeric answer if this is cut short)
    exact_in = []
    general = None
    try:
        ss = sp.solveset(f0, x, sp.Interval(a, b))
        if isinstance(ss, sp.FiniteSet):
            exact_in = [v for v in ss if _complexity(v) < 80]
        gs = sp.solveset(f0, x, S.Reals) if trig else None
        if gs is not None and not isinstance(gs, sp.ConditionSet) and isinstance(gs, (sp.Union, sp.ImageSet)):
            general = gs
    except Exception:
        pass
    if not exact_in:
        try:
            cand = sp.solve(f0, x)
            for v in cand:
                try:
                    vn = complex(sp.N(v, 20))
                except Exception:
                    continue
                if abs(vn.imag) < 1e-12 and _rfloat(a) - 1e-9 <= vn.real <= _rfloat(b) + 1e-9:
                    exact_in.append(v)
        except Exception:
            pass
        if True:
            # e^x = 3x style: the other Lambert-W branch
            try:
                for v in list(sp.solve(f0, x)):
                    if v.has(sp.LambertW):
                        w = v.replace(sp.LambertW, lambda z, k=0: sp.LambertW(z, -1))
                        vn = complex(sp.N(w, 20))
                        if abs(vn.imag) < 1e-12 and _rfloat(a) <= vn.real <= _rfloat(b):
                            exact_in.append(w)
            except Exception:
                pass
    matched = 0
    for d in out["solutions"]:
        for v in exact_in:
            try:
                if abs(float(sp.N(v, 20)) - d["value"]) < 1e-8 * (1 + abs(d["value"])):
                    d["tex"] = tex(v)
                    d["plain"] = plain(v)
                    d["numeric"] = False
                    matched += 1
                    break
            except Exception:
                pass
        if trig or True:
            pass
    # a LambertW branch that only one of the forms covered
    for v in exact_in:
        try:
            vf = float(sp.N(v, 20))
        except Exception:
            continue
        if not any(abs(vf - d["value"]) < 1e-8 * (1 + abs(vf)) for d in out["solutions"]):
            e2 = _sol_entry(v, x, trig)
            e2["value"] = vf
            out["solutions"].append(e2)
    out["solutions"].sort(key=lambda d: d.get("value", 0))
    exact_step = None
    if general is not None:
        out["general"] = tex(x) + r" \in " + tex(general)
        out["general_exact"] = True
        INV = {sp.sin: sp.asin, sp.cos: sp.acos, sp.tan: sp.atan}
        txt = "SymPy's solveset gives the general solution:"
        if type(lhs) in INV and lhs.args[0] == x and not rhs.has(x):
            txt = (r"Apply the inverse function: \(%s = %s\) gives \(%s = %s\); add every other angle with the same %s value "
                   r"(the function is periodic)." % (tex(lhs), tex(rhs), tex(x), tex(INV[type(lhs)](rhs)), type(lhs).__name__))
        exact_step = step("Exact solutions", txt, [out["general"]])
    elif matched:
        exact_step = step("Exact solutions", "SymPy finds closed forms for %s:" % ("these roots" if matched > 1 else "this root"),
                          [", ".join(tex(x) + " = " + d["tex"] for d in out["solutions"] if not d.get("numeric"))])
    if exact_step:
        for st_ in out["steps"]:
            if st_["title"] == "Find the roots numerically":
                st_["title"] = "Check numerically"
        out["steps"].insert(len(out["steps"]) - 1, exact_step)
    if matched:
        out["method"] = "exact" if matched == len(out["solutions"]) else "mixed"
    return out


def _plot_solve(out, f, x, roots, interval):
    if len(f.free_symbols) > 1:
        return
    if interval:
        a, b = interval
        pad = (b - a) * 0.05
        a, b = a - pad, b + pad
    elif roots:
        lo, hi = min(roots), max(roots)
        w = max(2.0, (hi - lo) * 0.3)
        a, b = lo - w, hi + w
    else:
        a, b = -10, 10
    out["plot"] = {"var": x.name, "a": a, "b": b, "roots": roots, "series": [{"label": "f", "data": samples(f, x, a, b)}],
                   "flabel": "f(%s) = %s" % (x.name, plain(f))}


def solve_inequality(rel, x):
    f = rel.lhs - rel.rhs
    try:
        sol = sp.solveset(rel, x, S.Reals)
    except Exception:
        sol = None
    if sol is None or isinstance(sol, sp.ConditionSet):
        try:
            sol = sp.reduce_inequalities(rel, [x]).as_set()
        except Exception:
            raise CasError("SymPy could not solve this inequality.")
    st = []
    # |u| < c  ->  -c < u < c
    if isinstance(rel.lhs, Abs) and rel.rhs.is_number and not rel.rhs.has(x):
        u, c = rel.lhs.args[0], rel.rhs
        if isinstance(rel, (sp.StrictLessThan, sp.LessThan)):
            sym = "<" if isinstance(rel, sp.StrictLessThan) else r"\le"
            st.append(step("Absolute value", r"\(|u| %s c\) means \(-c %s u %s c\)." % (sym, sym, sym),
                           [r"%s %s %s %s %s" % (tex(-c), sym, tex(u), sym, tex(c))]))
        else:
            sym = ">" if isinstance(rel, sp.StrictGreaterThan) else r"\ge"
            st.append(step("Absolute value", r"\(|u| %s c\) means \(u %s c\) or \(u %s -c\)." % (sym, sym, sym.replace(">", "<").replace(r"\ge", r"\le")),
                           [r"%s %s %s \quad\text{or}\quad %s %s %s" % (tex(u), sym, tex(c), tex(u), sym.replace(">", "<").replace(r"\ge", r"\le"), tex(-c))]))
    try:
        num, den = sp.fraction(sp.together(f))
        crit = set()
        for part in (num, den):
            if part.has(x):
                z = sp.solveset(part, x, S.Reals)
                if isinstance(z, sp.FiniteSet):
                    crit |= set(z)
                else:
                    crit = None
                    break
        if isinstance(rel.lhs, Abs) or any(isinstance(a, Abs) for a in f.atoms(Abs)):
            for A in f.atoms(Abs):
                z = sp.solveset(A.args[0], x, S.Reals)
                if crit is not None and isinstance(z, sp.FiniteSet):
                    crit |= set(z)
        if crit is not None and len(crit) <= 12 and all(c.is_real for c in crit):
            cs = sorted(crit, key=lambda c: float(sp.N(c)))
            pts = [-oo] + cs + [oo]
            rows = []
            for lo, hi in zip(pts, pts[1:]):
                if lo == -oo and hi == oo:
                    t = Integer(0)
                elif lo == -oo:
                    t = sp.floor(hi) - 1
                elif hi == oo:
                    t = sp.ceiling(lo) + 1
                else:
                    t = (lo + hi) / 2
                try:
                    holds = bool(rel.subs(x, t))
                except Exception:
                    holds = None
                rows.append(r"(%s, %s):\ %s = %s \Rightarrow %s" % (tex(lo), tex(hi), tex(x), tex(t), r"\text{true}" if holds else r"\text{false}"))
            if cs:
                st.append(step("Critical points", r"Where \(%s\) is zero or undefined: \(%s\). Test one value in each interval:" %
                               (tex(f), ", ".join(tex(c) for c in cs)), rows))
    except Exception:
        pass
    return {"kind": "inequality", "var": x.name, "var_tex": tex(x), "steps": st, "set": tex(sol),
            "plain": plain(sol), "inequality": tex(rel), "solutions": []}


def _linear_system(eqs, vars_):
    try:
        A, bvec = sp.linear_eq_to_matrix([e.lhs - e.rhs for e in eqs], vars_)
        return A, bvec
    except Exception:
        return None


def system_steps(eqs, vars_):
    st = []
    if len(eqs) == 2 and len(vars_) == 2:
        # substitution: pick the equation + variable that is easiest to isolate
        best = None
        for i, e in enumerate(eqs):
            f = e.lhs - e.rhs
            for v in vars_:
                try:
                    P = Poly(f, v)
                except Exception:
                    continue
                if P.degree() == 1:
                    c = P.coeffs()[0]
                    score = (0 if c in (1, -1) else 1, _complexity(f))
                    if best is None or score < best[0]:
                        best = (score, i, v)
        if best:
            _, i, v = best
            other = eqs[1 - i]
            w = [u for u in vars_ if u != v][0]
            iso = sp.solve(eqs[i], v)[0]
            st.append(step(r"Solve equation %d for \(%s\)" % (i + 1, tex(v)), "", [tex(eqs[i].lhs) + " = " + tex(eqs[i].rhs), tex(v) + " = " + tex(iso)]))
            sub = sp.expand(other.lhs.subs(v, iso) - other.rhs.subs(v, iso))
            st.append(step(r"Substitute into equation %d" % (2 - i), "",
                           [tex(other.lhs.subs(v, iso)) + " = " + tex(other.rhs.subs(v, iso)), tex(sub) + " = 0"]))
            one = solve_single(Eq(sub, 0), w, None, "numeric")
            if one.get("steps"):
                st.append(step(r"Solve for \(%s\)" % tex(w), "", None, one["steps"]))
            st.append(step("Back-substitute", r"Use \(%s = %s\) for each value of \(%s\)." % (tex(v), tex(iso), tex(w))))
            return st
    A = _linear_system(eqs, vars_)
    if A is not None and len(vars_) >= 2:
        M, bvec = A
        aug = M.row_join(bvec)
        R, piv = aug.rref()
        st.append(step("Augmented matrix", "Write the system as a matrix and row-reduce it (Gauss–Jordan elimination).",
                       [tex(aug) + r" \;\sim\; " + tex(R)]))
    return st


def solve_system(eqs, vars_):
    try:
        sols = sp.solve(eqs, vars_, dict=True)
    except Exception:
        sols = []
    st = system_steps(eqs, vars_)
    lin = _linear_system(eqs, vars_) is not None
    out = {"kind": "system", "vars": [v.name for v in vars_], "steps": st,
           "system": r"\begin{cases}" + r" \\ ".join(tex(e.lhs) + " = " + tex(e.rhs) for e in eqs) + r"\end{cases}"}
    rows, cplx = [], []
    for s in sols:
        vals = [s.get(v, v) for v in vars_]
        entry = {"tex": r",\quad ".join(r"%s = %s" % (tex(v), tex(val)) for v, val in zip(vars_, vals)),
                 "plain": ", ".join("%s = %s" % (v.name, plain(val)) for v, val in zip(vars_, vals))}
        decs = []
        for v, val in zip(vars_, vals):
            d = evalf_str(val, 10)
            if d is not None and d != tex(val):
                decs.append("%s ≈ %s" % (v.name, d))
        if decs:
            entry["decimal"] = ", ".join(decs)
        isc = any(val.is_number and abs(sp.im(sp.N(val))) > 1e-12 for val in vals)
        (cplx if isc else rows).append(entry)
    if not sols:
        free = any(e.has(*vars_) for e in eqs)
        if lin:
            out["summary"] = "The system has no solution (the equations are inconsistent)."
        else:
            # numeric attempt from several starting points
            found = []
            for start in ((1, 1), (-1, 1), (1, -1), (-1, -1), (3, 3), (-3, 3), (0.5, 2), (2, 0.5)):
                if len(vars_) != 2:
                    break
                try:
                    r = sp.nsolve([e.lhs - e.rhs for e in eqs], vars_, start, prec=20)
                    key = tuple(round(float(z), 8) for z in r)
                    if key not in [k for k, _ in found]:
                        found.append((key, r))
                except Exception:
                    pass
            for key, r in found:
                rows.append({"tex": r",\quad ".join(r"%s \approx %s" % (tex(v), num_str(mpmath.mpf(str(z)), 10)) for v, z in zip(vars_, r)),
                             "plain": ", ".join("%s = %s" % (v.name, num_str(mpmath.mpf(str(z)), 12)) for v, z in zip(vars_, r))})
            out["summary"] = "Found numerically (Newton's method from several starting points)." if found else "No solution found."
            del free
    out["solutions"] = rows
    out["complex"] = cplx
    if lin and sols and any(v in sols[0].get(v, S.Zero).free_symbols for v in vars_) is False:
        pass
    if sols and any(sp.sympify(val).free_symbols & set(vars_) for s in sols for val in s.values()):
        out["summary"] = "Infinitely many solutions (expressed in terms of the free variables)."
    return out


def op_solve(req):
    text = str(req.get("expr", "")).strip()
    stage = req.get("stage") or "full"
    if not text:
        raise CasError("Type an equation, like x^2 - 5x + 6 = 0.")
    protect = var_names(req.get("var", ""))
    raw_parts = split_top(normalize(text), ";\n")
    parts = []
    for p in raw_parts:
        sub = split_top(p, ",")
        if len(sub) > 1 and all(split_relation(q)[1] for q in sub):
            parts.extend(sub)
        else:
            parts.append(p)
    rels = []
    for p in parts:
        segs, ops = split_relation(p)
        if not ops:
            e = parse_one(p, protect)
            rels.append(("eq", Eq(e, 0, evaluate=False)))
        else:
            rels.append(parse_rel_normalized(p, protect))
    if len(rels) > 6:
        raise CasError("At most 6 equations at once.")
    allsyms = set()
    for _, r in rels:
        allsyms |= r.free_symbols
    if protect:
        vars_ = [next((s for s in allsyms if s.name == n), Symbol(n)) for n in protect]
    else:
        vars_ = sorted(allsyms, key=lambda s: (s.name not in ("x", "y", "z", "t", "theta", "alpha"), s.name))
        if len(rels) == 1:
            vars_ = vars_[:1]
        else:
            vars_ = vars_[:len(rels)]
    if not vars_:
        r = rels[0][1]
        val = bool(sp.simplify(r.lhs - r.rhs) == 0) if isinstance(r, Eq) else bool(r)
        return {"ok": True, "kind": "check", "summary": "The statement is %s." % ("true" if val else "false"), "steps": [], "solutions": []}
    interval = None
    if req.get("lo") not in (None, "") or req.get("hi") not in (None, ""):
        lo = parse_expr_text(str(req.get("lo") or "-10"))
        hi = parse_expr_text(str(req.get("hi") or "10"))
        if not (lo.is_number and hi.is_number) or lo.is_infinite or hi.is_infinite:
            raise CasError("The search interval needs two finite numbers (pi is fine).")
        interval = (lo, hi)
    if len(rels) == 1:
        kind, r = rels[0]
        x = vars_[0]
        if kind == "rel":
            if isinstance(r, sp.And):
                sol = sp.solveset(r, x, S.Reals) if False else sp.reduce_inequalities(list(r.args), [x]).as_set()
                res = {"kind": "inequality", "var": x.name, "steps": [], "set": tex(sol), "plain": plain(sol), "inequality": tex(r), "solutions": []}
            elif isinstance(r, sp.Ne):
                res = solve_single(Eq(r.lhs, r.rhs), x, interval, stage)
                res["summary"] = "All real numbers except the solutions of the equation below."
            else:
                res = solve_inequality(r, x)
        else:
            res = solve_single(r, x, interval, stage)
    else:
        eqs = [r for k, r in rels if k == "eq"]
        if len(eqs) != len(rels):
            raise CasError("Systems of inequalities are not supported yet: solve them one at a time.")
        res = solve_system(eqs, vars_)
    res["ok"] = True
    return res


def parse_rel_normalized(s, protect):
    parts, ops = split_relation(s)
    if any(not p.strip() for p in parts):
        raise CasError("Something is missing on one side of “%s”." % ops[0])
    vals = [parse_one(p, protect) for p in parts]
    if ops in (["="], ["=="]):
        return "eq", Eq(vals[0], vals[1], evaluate=False)
    rels = []
    for a, op, b in zip(vals, ops, vals[1:]):
        if op in ("=", "=="):
            rels.append(Eq(a, b, evaluate=False))
        elif op == "!=":
            rels.append(sp.Ne(a, b, evaluate=False))
        else:
            rels.append({"<": sp.Lt, ">": sp.Gt, "<=": sp.Le, ">=": sp.Ge}[op](a, b, evaluate=False))
    return "rel", rels[0] if len(rels) == 1 else sp.And(*rels, evaluate=False)


# ================================================================ OTHER CAS MODES =================================
def op_cas(req):
    mode = req.get("mode") or "simplify"
    text = str(req.get("expr", "")).strip()
    if mode == "solve":
        return op_solve(req)
    if mode == "matrix":
        return op_matrix(req)
    protect = var_names(req.get("var", ""))
    e = parse_expr_text(text, protect)
    if isinstance(e, sp.MatrixBase):
        return op_matrix(req)
    out = {"ok": True, "input": tex(e), "mode": mode, "steps": []}
    if mode in ("simplify", "expand", "factor", "apart", "together", "trigsimp", "cancel", "rationalize"):
        x = pick_var(e, req.get("var"))
        fn = {"simplify": sp.simplify, "expand": lambda z: sp.expand(z), "factor": sp.factor,
              "apart": lambda z: sp.apart(sp.together(z), x), "together": sp.together, "trigsimp": sp.trigsimp,
              "cancel": sp.cancel, "rationalize": sp.radsimp}[mode]
        if mode == "expand":
            r = sp.expand(e)
            if r == e:
                r = sp.expand_trig(sp.expand_log(e, force=True))
        else:
            r = fn(e)
        out["result"] = tex(r)
        out["plain"] = plain(r)
        out["same"] = tex(r) == tex(e)
        out["verified"] = bool(same(r, e, e.free_symbols | r.free_symbols)) if mode != "apart" or True else True
        dec = evalf_str(r, 15) if r.is_number else None
        if dec:
            out["decimal"] = dec
        out["op"] = {"simplify": "Simplify", "expand": "Expand", "factor": "Factor", "apart": "Partial fractions",
                     "together": "Combine into one fraction", "trigsimp": "Trigonometric simplification", "cancel": "Cancel common factors",
                     "rationalize": "Rationalize the denominator"}[mode]
        return out
    if mode == "evaluate":
        r = sp.simplify(e) if sp.count_ops(e) < 200 else e
        out["result"] = tex(r)
        out["plain"] = plain(r)
        digits = int(req.get("digits") or 15)
        digits = max(5, min(digits, 100))
        if r.free_symbols:
            out["note"] = "The expression still contains %s, so there is no single number." % ", ".join(sorted(s.name for s in r.free_symbols))
        else:
            out["decimal"] = evalf_str(r, digits)
        out["op"] = "Evaluate"
        return out
    if mode == "limit":
        x = pick_var(e, req.get("var"))
        pt = parse_expr_text(str(req.get("at") or "0"))
        d = req.get("dir") or "+-"
        if pt.is_infinite:
            d = "-" if pt == oo else "+"
        st = []
        try:
            direct = e.subs(x, pt) if not pt.is_infinite else None
            if direct is not None and direct.is_finite and not direct.has(nan, zoo):
                st.append(step("Direct substitution", "The function is defined there, so plug the value in.", [tex(e.subs(x, pt, evaluate=False)) if False else r"%s\big|_{%s = %s} = %s" % (tex(e), tex(x), tex(pt), tex(sp.simplify(direct)))]))
            else:
                num, den = sp.fraction(sp.together(e))
                n0 = sp.limit(num, x, pt, d if d != "+-" else "+")
                d0 = sp.limit(den, x, pt, d if d != "+-" else "+")
                form = None
                if n0 == 0 and d0 == 0:
                    form = r"\frac{0}{0}"
                elif n0.is_infinite and d0.is_infinite:
                    form = r"\frac{\infty}{\infty}"
                if form and den.has(x):
                    nd, dd = sp.diff(num, x), sp.diff(den, x)
                    st.append(step("Indeterminate form", r"Substituting gives \(%s\), so use L'Hôpital's rule." % form,
                                   [r"\lim \frac{f}{g} = \lim \frac{f'}{g'}", r"\lim_{%s \to %s} \frac{%s}{%s}" % (tex(x), tex(pt), tex(nd), tex(dd))]))
        except Exception:
            pass
        r = sp.limit(e, x, pt, d) if d != "+-" else sp.limit(e, x, pt, "+-") if not pt.is_infinite else sp.limit(e, x, pt)
        out["steps"] = st
        arrow = {"+": "^{+}", "-": "^{-}"}.get(d, "") if not pt.is_infinite else ""
        out["op"] = r"\lim_{%s \to %s%s} %s" % (tex(x), tex(pt), arrow, tex(e))
        out["result"] = tex(r)
        out["plain"] = plain(r)
        out["decimal"] = evalf_str(r) if r.is_number and r.is_finite else None
        if d == "+-" and not pt.is_infinite and (r == zoo or r.has(nan)):
            lft, rgt = sp.limit(e, x, pt, "-"), sp.limit(e, x, pt, "+")
            out["result"] = r"\text{does not exist}"
            out["plain"] = "does not exist"
            out["decimal"] = None
            out["note"] = "The two one-sided limits differ: from the left it is %s, from the right %s." % (plain(lft).replace("oo", "∞"), plain(rgt).replace("oo", "∞"))
            out["sides"] = [tex(lft), tex(rgt)]
        if isinstance(r, sp.AccumBounds):
            out["note"] = "The function keeps oscillating, so the limit does not exist (it stays within these bounds)."
        return out
    if mode == "series":
        x = pick_var(e, req.get("var"))
        pt = parse_expr_text(str(req.get("at") or "0"))
        n = int(req.get("order") or 6)
        n = max(1, min(n, 20))
        s = sp.series(e, x, pt, n)
        poly = s.removeO()
        name = "Maclaurin" if pt == 0 else "Taylor"
        st = []
        try:
            rows = []
            if n <= 10:
                for k in range(n):
                    dk = sp.diff(e, x, k).subs(x, pt)
                    dk = sp.simplify(dk)
                    if dk.has(nan, zoo) or not dk.is_finite:
                        rows = []
                        break
                    rows.append(r"f^{(%d)}(%s) = %s \;\Rightarrow\; \frac{%s}{%d!} = %s" % (k, tex(pt), tex(dk), tex(dk), k, tex(sp.simplify(dk / sp.factorial(k)))))
            if rows:
                st.append(step("%s series coefficients" % name, r"\(f(%s) = \sum_k \frac{f^{(k)}(%s)}{k!}(%s - %s)^k\)" % (tex(x), tex(pt), tex(x), tex(pt)), rows))
        except Exception:
            pass
        out["steps"] = st
        out["op"] = r"%s series of \(%s\) at \(%s = %s\)" % (name, tex(e), tex(x), tex(pt))
        out["op_text"] = True
        out["result"] = tex(s)
        out["polynomial"] = tex(poly)
        out["plain"] = plain(poly)
        return out
    if mode in ("sum", "product"):
        k = pick_var(e, req.get("var") or ("k" if any(s.name == "k" for s in e.free_symbols) else ("n" if any(s.name == "n" for s in e.free_symbols) else None)))
        lo = parse_expr_text(str(req.get("lo") or "1"))
        hi = parse_expr_text(str(req.get("hi") or "oo"))
        if mode == "sum":
            r = sp.summation(e, (k, lo, hi))
            out["op"] = r"\sum_{%s = %s}^{%s} %s" % (tex(k), tex(lo), tex(hi), tex(e))
        else:
            r = sp.product(e, (k, lo, hi))
            out["op"] = r"\prod_{%s = %s}^{%s} %s" % (tex(k), tex(lo), tex(hi), tex(e))
        r = sp.simplify(r) if sp.count_ops(r) < 200 else r
        out["result"] = tex(r)
        out["plain"] = plain(r)
        if r.is_number and r.is_finite:
            out["decimal"] = evalf_str(r)
        if r.has(sp.Sum) or r.has(sp.Product):
            out["note"] = "No closed form found."
            try:
                if r.is_number or not r.free_symbols:
                    out["decimal"] = evalf_str(r)
            except Exception:
                pass
        if r == oo or r == -oo:
            out["note"] = "The sum diverges."
        return out
    raise CasError("Unknown mode.")


def op_matrix(req):
    text = str(req.get("expr", "")).strip()
    s = normalize(text)
    if not s.startswith("["):
        # rows separated by ; or newlines, entries by commas / spaces
        rows = [r for r in re.split(r"[;\n]+", text) if r.strip()]
        s = "[" + ",".join("[" + ",".join(c for c in re.split(r"[,\s]+", r.strip()) if c) + "]" for r in rows) + "]"
        s = normalize(s)
    M = parse_one(s)
    if not isinstance(M, sp.MatrixBase):
        raise CasError("Type a matrix like [[1, 2], [3, 4]] or rows separated by semicolons: 1 2; 3 4.")
    if M.rows > 6 or M.cols > 6:
        raise CasError("Matrices up to 6×6 only.")
    what = req.get("what") or "all"
    out = {"ok": True, "mode": "matrix", "input": tex(M), "items": [], "steps": []}
    items = out["items"]
    square = M.rows == M.cols
    items.append({"label": "Size", "tex": r"%d \times %d" % (M.rows, M.cols)})
    items.append({"label": "Rank", "tex": tex(M.rank())})
    if square:
        det = sp.simplify(M.det())
        items.append({"label": "Determinant", "tex": tex(det), "plain": plain(det)})
        if M.rows == 2:
            a, b, c, d = M
            out["steps"].append(step("Determinant of a 2×2 matrix", "", [r"\det = ad - bc = %s \cdot %s - %s \cdot %s = %s" % (ptex(a), ptex(d), ptex(b), ptex(c), tex(det))]))
        if det != 0:
            inv = sp.simplify(M.inv())
            items.append({"label": "Inverse", "tex": tex(inv), "plain": plain(inv)})
        else:
            items.append({"label": "Inverse", "tex": r"\text{none (determinant is 0)}"})
        try:
            ev = M.eigenvals()
            items.append({"label": "Eigenvalues", "tex": ", ".join(tex(k) + (r"\ (\times %d)" % m if m > 1 else "") for k, m in ev.items())})
            lam = Symbol("lamda")
            items.append({"label": "Characteristic polynomial", "tex": tex(sp.factor(M.charpoly(lam).as_expr()))})
        except Exception:
            pass
        items.append({"label": "Trace", "tex": tex(M.trace())})
    items.append({"label": "Transpose", "tex": tex(M.T)})
    R, piv = M.rref()
    items.append({"label": "Reduced row echelon form", "tex": tex(R)})
    out["result"] = tex(M)
    out["plain"] = plain(M)
    return out


# ================================================================ PARSE / PLOT / DISPATCH =========================
def op_parse(req):
    text = str(req.get("expr", ""))
    mode = req.get("mode") or ""
    if not text.strip():
        return {"ok": True, "empty": True}
    protect = var_names(req.get("var", "")) if req.get("var") else []
    if mode == "solve":
        parts = split_top(normalize(text), ";\n,")
        texs = []
        for p in parts:
            k, o = parse_rel_normalized(p, protect) if split_relation(p)[1] else ("expr", parse_one(p, protect))
            texs.append(tex(o) + (" = 0" if k == "expr" else ""))
        return {"ok": True, "latex": r" \\ ".join(texs) if len(texs) > 1 else texs[0], "multi": len(texs) > 1,
                "vars": sorted({s.name for p in parts for s in free_parse(p, protect)})}
    if mode == "matrix":
        return {"ok": True, "latex": ""}
    k, o = parse_rel(text, protect)
    if k == "eq":
        t = tex(o.lhs) + " = " + tex(o.rhs)
    else:
        t = tex(o)
    vs = sorted(s.name for s in (o.free_symbols if isinstance(o, sp.Basic) else set()))
    return {"ok": True, "latex": t, "kind": k, "vars": vs}


def free_parse(p, protect):
    try:
        if split_relation(p)[1]:
            return parse_rel_normalized(p, protect)[1].free_symbols
        return parse_one(p, protect).free_symbols
    except Exception:
        return set()


def op_plot(req):
    e = parse_expr_text(req.get("expr", ""))
    x = pick_var(e, req.get("var"))
    a, b = float(req.get("a", -10)), float(req.get("b", 10))
    return {"ok": True, "data": samples(e, x, a, b)}


OPS = {"parse": op_parse, "diff": op_diff, "integrate": op_integrate, "solve": op_solve, "cas": op_cas, "plot": op_plot,
       "ping": lambda r: {"ok": True, "version": VERSION, "sympy": sp.__version__}}


def _clean(o):
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items() if v is not None}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (mpmath.mpf,)):
        return float(o)
    return o


def handle(req_json):
    try:
        req = json.loads(req_json) if isinstance(req_json, str) else dict(req_json)
        op = OPS.get(req.get("op"))
        if op is None:
            raise CasError("Unknown request.")
        DISPLAY_SUBS.clear()
        res = op(req)
        return json.dumps(_clean(res))
    except CasError as err:
        return json.dumps({"ok": False, "error": str(err)})
    except RecursionError:
        return json.dumps({"ok": False, "error": "That expression is nested too deeply."})
    except (ZeroDivisionError,) as err:
        return json.dumps({"ok": False, "error": "Division by zero."})
    except NotImplementedError as err:
        return json.dumps({"ok": False, "error": "SymPy can't do this one yet (%s)." % (str(err)[:140] or "not implemented")})
    except Exception as err:
        return json.dumps({"ok": False, "error": "Something went wrong: %s" % (str(err)[:200] or type(err).__name__)})
    finally:
        DISPLAY_SUBS.clear()


def call(op, **kw):
    """Native convenience: call('diff', expr='x^2') -> dict."""
    kw["op"] = op
    return json.loads(handle(json.dumps(kw)))
