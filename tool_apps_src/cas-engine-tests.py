#!/usr/bin/env python3
"""Native tests for mes.fm/main_js/cas/engine.py (the SymPy engine behind the CAS, derivative and integral calculators).

    python3 tool_apps_src/cas-engine-tests.py          (needs: pip install sympy==1.13.3 mpmath, the versions Pyodide 0.27.7 ships)

No browser, no node: the same engine.py the Web Worker loads is imported directly and driven through engine.call(),
which goes through the same JSON boundary (handle()) as the worker. Exit status 1 when anything fails.
"""
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "mes.fm" / "main_js" / "cas"))
import engine as E  # noqa: E402
import sympy as sp  # noqa: E402

FAILS, COUNT = [], 0
x, y = sp.symbols("x y", real=True)


def case(name):
    def deco(fn):
        global COUNT
        COUNT += 1
        t = time.time()
        try:
            fn()
            print("  ok   %-58s %.2fs" % (name, time.time() - t))
        except Exception as err:   # noqa: BLE001
            FAILS.append(name)
            print("  FAIL %-58s %s: %s" % (name, type(err).__name__, err))
        return fn
    return deco


def ok(r):
    assert r.get("ok"), r.get("error")
    return r


def num_close(a, b, tol=1e-8):
    assert abs(float(a) - float(b)) <= tol * (1 + abs(float(b))), "%s != %s" % (a, b)


def latex_val(t, subs=None):
    """Evaluate a LaTeX result numerically by re-parsing its plain form."""
    return float(sp.N(sp.sympify(t, locals={"e": sp.E}).subs(subs or {})))


def plain_expr(p):
    return sp.sympify(p.replace("^", "**").replace("ln(", "log(").replace("abs(", "Abs("), locals={"x": x, "y": y, "e": sp.E})


def same_fn(p, expected, pts=(0.3, 0.7, 1.3, 2.1)):
    f = plain_expr(p)
    for v in pts:
        a, b = complex(sp.N(f.subs(x, v))), complex(sp.N(expected.subs(x, v)))
        assert abs(a - b) < 1e-9 * (1 + abs(b)), "%s vs %s at %s" % (f, expected, v)


def titles(steps):
    out = []
    for s in steps or []:
        out.append(s["title"])
        out += titles(s.get("children"))
    return out


def sol_values(r):
    return sorted(float(d["decimal"] if "decimal" in d else sp.N(plain_expr(d["plain"]))) for d in r["solutions"])


print("Parsing / input normalisation")


@case("x^2*sin(x), 2x, sin x, sqrt x, ln, e^x, |x|")
def _():
    for text, want in (("x^2*sin(x)", r"x^{2} \sin{\left(x \right)}"), ("2x", "2 x"), ("sin x", r"\sin{\left(x \right)}"),
                       ("sqrt x", r"\sqrt{x}"), ("ln x", r"\ln{\left(x \right)}"), ("e^x", "e^{x}"), ("|x|", r"\left|{x}\right|")):
        assert ok(E.call("parse", expr=text))["latex"] == want, text


@case("unicode × ÷ − √ · π and superscripts")
def _():
    assert ok(E.call("parse", expr="3×4÷2−1"))["latex"] == "5"
    assert ok(E.call("parse", expr="√x · π"))["latex"] == r"\pi \sqrt{x}"
    assert ok(E.call("parse", expr="x²+y³"))["latex"] == "x^{2} + y^{3}"


@case("Greek letters as variables (α, θ, γ, λ)")
def _():
    r = ok(E.call("parse", expr="α + θ^2 + γ + λ"))
    for g in (r"\alpha", r"\theta", r"\gamma", r"\lambda"):
        assert g in r["latex"], r["latex"]


@case("sin^2 x, sin^-1 x, sinx, log_2(8), implicit multiplication")
def _():
    assert ok(E.call("parse", expr="sin^2 x"))["latex"] == r"\sin^{2}{\left(x \right)}"
    assert ok(E.call("parse", expr="sin^-1 x"))["latex"] == r"\arcsin{\left(x \right)}"
    assert ok(E.call("parse", expr="sinx cos x"))["latex"] == r"\sin{\left(x \right)} \cos{\left(x \right)}"
    assert ok(E.call("parse", expr="log_2(8)"))["latex"] == "3"
    assert ok(E.call("parse", expr="2x(x+1)"))["latex"] == r"2 x \left(x + 1\right)"


@case("friendly parse errors")
def _():
    assert "not closed" in E.call("parse", expr="sin(x")["error"]
    assert "ends with an operator" in E.call("parse", expr="x^2+")["error"]
    assert "not supported" in E.call("parse", expr="x # 2")["error"]
    assert "too long" in E.call("parse", expr="x" * 700)["error"]


@case("namespace is locked (dunders, attributes, quotes, lambda)")
def _():
    for bad in ('__import__("os")', "x.__class__", "().__class__", "lambda: 1", "open('f')", "x.real"):
        assert not E.call("parse", expr=bad)["ok"], bad


print("Derivatives")


@case("d/dx x^2 sin x  (product rule, verified)")
def _():
    r = ok(E.call("diff", expr="x^2*sin(x)"))
    same_fn(r["plain"], sp.diff(x ** 2 * sp.sin(x), x))
    assert "Product rule" in titles(r["sections"][0]["steps"]) and r["sections"][0]["verified"]


@case("chain rule names inner / outer function")
def _():
    r = ok(E.call("diff", expr="sin(x^2)"))
    st = r["sections"][0]["steps"][0]
    assert st["title"] == "Chain rule" and "inner function" in st["text"]
    same_fn(r["plain"], 2 * x * sp.cos(x ** 2))


@case("quotient rule (x^2+1)/(x-1)")
def _():
    r = ok(E.call("diff", expr="(x^2+1)/(x-1)"))
    assert "Quotient rule" in titles(r["sections"][0]["steps"])
    same_fn(r["plain"], sp.diff((x ** 2 + 1) / (x - 1), x))


@case("logarithmic differentiation x^x")
def _():
    r = ok(E.call("diff", expr="x^x"))
    assert "Logarithmic differentiation" in titles(r["sections"][0]["steps"])
    same_fn(r["plain"], sp.diff(x ** x, x))


@case("a^x and log base a: 2^x + log_3(x)")
def _():
    r = ok(E.call("diff", expr="2^x + log_3(x)"))
    same_fn(r["plain"], 2 ** x * sp.log(2) + 1 / (x * sp.log(3)))


@case("inverse trig + hyperbolic: atan(x) + sinh(2x) + acos x")
def _():
    r = ok(E.call("diff", expr="atan(x) + sinh(2x) + acos x"))
    same_fn(r["plain"], sp.diff(sp.atan(x) + sp.sinh(2 * x) + sp.acos(x), x), pts=(0.2, 0.5, -0.4))


@case("absolute value |x^2-4|")
def _():
    r = ok(E.call("diff", expr="|x^2-4|"))
    assert r["sections"][0]["verified"]
    same_fn(r["plain"], 2 * x * sp.sign(x ** 2 - 4), pts=(0.5, 3.0, -3.0))


@case("second derivative of ln(cos x) = -sec^2 x")
def _():
    r = ok(E.call("diff", expr="ln(cos x)", order=2))
    same_fn(r["plain"], -1 / sp.cos(x) ** 2, pts=(0.2, 0.5, 1.0))
    assert len(r["sections"]) == 2


@case("fifth derivative of x^6 = 720x")
def _():
    r = ok(E.call("diff", expr="x^6", order=5))
    same_fn(r["plain"], 720 * x)


@case("partial derivative ∂/∂y (x^2 y + y^3)")
def _():
    r = ok(E.call("diff", expr="x^2 y + y^3", var="y"))
    assert r["multi"] and r["plain"].replace(" ", "") in ("x^2+3*y^2", "3*y^2+x^2")


@case("mixed partial ∂²/∂x∂y of x^2 y^3 at (1, 2)")
def _():
    r = ok(E.call("diff", expr="x^2 y^3", var="x, y", at="x=1, y=2"))
    assert r["at"]["plain"] == "24"


@case("evaluate at a point + tangent line: e^(3x) sqrt x at 1")
def _():
    r = ok(E.call("diff", expr="e^(3x)*sqrt(x)", at="1"))
    num_close(r["at"]["decimal"], 3.5 * math.exp(3))
    assert "tangent" in r


@case("implicit differentiation x^2 + y^2 = 25")
def _():
    r = ok(E.call("diff", expr="x^2+y^2=25"))
    assert r["implicit"] and r["plain"].replace(" ", "") == "-x/y"


@case("derivative with θ as variable: sin θ cos θ")
def _():
    r = ok(E.call("diff", expr="sin θ cos θ"))
    assert r["var"] == "theta"


@case("plot samples + 2D graph link for f and f'")
def _():
    r = ok(E.call("diff", expr="x^3 - 3x"))
    assert len(r["plot"]["series"]) == 2 and r["graph"][0] == "x^3 - 3*x"


print("Integrals")


@case("∫ x e^x dx  (integration by parts)")
def _():
    r = ok(E.call("integrate", expr="x e^x"))
    assert "Integration by parts" in titles(r["steps"]) and r["verify"]["ok"] and r["result"].endswith("+ C")


@case("∫ sin^2 x cos x dx  (u-substitution)")
def _():
    r = ok(E.call("integrate", expr="sin(x)^2 cos x"))
    assert "u-substitution" in titles(r["steps"])
    same_fn(r["antiderivative_plain"], sp.sin(x) ** 3 / 3)


@case("∫ 1/(x^2-1) dx  (partial fractions, ln|..|)")
def _():
    r = ok(E.call("integrate", expr="1/(x^2-1)"))
    assert "Partial fractions" in titles(r["steps"]) and "abs(" in r["antiderivative_plain"]


@case("∫ 1/x dx = ln|x| + C")
def _():
    r = ok(E.call("integrate", expr="1/x dx"))
    assert r["plain"] == "ln(abs(x)) + C"


@case("∫ e^x sin x dx  (cyclic parts)")
def _():
    r = ok(E.call("integrate", expr="e^x sin x"))
    assert "Integration by parts (cyclic)" in titles(r["steps"]) and r["verify"]["ok"]


@case("∫ sqrt(1-x^2) dx")
def _():
    r = ok(E.call("integrate", expr="sqrt(1-x^2)"))
    assert r["verify"]["ok"]


@case("∫ tan x dx = -ln|cos x|")
def _():
    r = ok(E.call("integrate", expr="tan x"))
    assert "abs(cos(x))" in r["antiderivative_plain"]


@case("∫_0^3 x^2 dx = 9 with F(b) - F(a)")
def _():
    r = ok(E.call("integrate", expr="x^2", definite=True, lower="0", upper="3"))
    assert r["plain"] == "9" and "Fundamental theorem of calculus" in titles(r["steps"])


@case("∫_-oo^oo e^(-x^2) dx = sqrt(pi)")
def _():
    r = ok(E.call("integrate", expr="e^(-x^2)", definite=True, lower="-oo", upper="∞"))
    num_close(r["decimal"], math.sqrt(math.pi))


@case("∫_0^pi sin x dx = 2 (pi as a bound)")
def _():
    r = ok(E.call("integrate", expr="sin x", definite=True, lower="0", upper="pi"))
    assert r["plain"] == "2"


@case("∫_0^1 x^x dx: no closed form -> numeric (mpmath.quad)")
def _():
    r = ok(E.call("integrate", expr="x^x", definite=True, lower="0", upper="1"))
    assert r.get("numeric_only")
    num_close(r["decimal"], 0.783430510712134)


@case("∫_-1^1 1/x^2 dx diverges")
def _():
    r = ok(E.call("integrate", expr="1/x^2", definite=True, lower="-1", upper="1"))
    assert "diverges" in r.get("note", "")


@case("∫ |x| dx (real variable, piecewise)")
def _():
    r = ok(E.call("integrate", expr="|x|"))
    assert r["verify"]["ok"]


@case("∫ e^(x^2) dx: non-elementary (erfi) still verified")
def _():
    r = ok(E.call("integrate", expr="e^(x^2)"))
    assert r["verify"]["ok"]


@case("integration variable from 'dt': ∫ t^2 dt")
def _():
    r = ok(E.call("integrate", expr="t^2 dt"))
    assert r["var"] == "t" and r["plain"] == "t^3/3 + C"


print("Solve (equations, systems, inequalities)")
ALPHA_ROOTS = [0.985514737862, 2.15607791573, 4.12710739145, 5.29767056932]


@case("SCREENSHOT: 0 = 2 - sin(α)·ln((1+sin(α))/(1-sin(α)))")
def _():
    r = ok(E.call("solve", expr="0 = 2 - sin(α)·ln((1+sin(α))/(1-sin(α)))"))
    vals = [d["value"] for d in r["solutions"]]
    for want, got in zip(ALPHA_ROOTS, vals):
        num_close(got, want, 1e-9)
    assert r["solutions"][0]["degrees"].startswith("56.4658")
    assert r["steps"][0]["title"] == "Substitution" and any("artanh" in t for t in r["steps"][0]["tex"])


@case("SCREENSHOT typed forms: sin α · ln((1+sin α)/(1−sin α)), ×, alpha")
def _():
    for text in ("0 = 2 - sin α · ln((1+sin α)/(1−sin α))", "0 = 2 − sin α × ln((1 + sin α)/(1 − sin α))",
                 "2 - sin(alpha)*ln((1+sin(alpha))/(1-sin(alpha))) = 0", "0=2-sin α ln((1+sin α)/(1-sin α))"):
        r = ok(E.call("solve", expr=text, stage="numeric"))
        num_close(r["solutions"][0]["value"], ALPHA_ROOTS[0], 1e-9)


@case("SCREENSHOT with interval [-pi, pi] gives the negative roots too")
def _():
    r = ok(E.call("solve", expr="0 = 2 - sin(α)·ln((1+sin(α))/(1-sin(α)))", lo="-pi", hi="pi", stage="numeric"))
    vals = [d["value"] for d in r["solutions"]]
    assert len(vals) == 4 and abs(vals[1] + ALPHA_ROOTS[0]) < 1e-9


@case("x^2 - 5x + 6 = 0 -> 2, 3 (factoring)")
def _():
    r = ok(E.call("solve", expr="x^2-5x+6=0"))
    assert [d["plain"] for d in r["solutions"]] == ["2", "3"] and "Factor" in titles(r["steps"])


@case("x^2 + 1 = 0 -> complex ±i only")
def _():
    r = ok(E.call("solve", expr="x^2+1=0"))
    assert not r["solutions"] and len(r["complex"]) == 2


@case("2x + 3 = 11 (linear isolate)")
def _():
    r = ok(E.call("solve", expr="2x+3=11"))
    assert r["solutions"][0]["plain"] == "4"


@case("sin(x) = 1/2 -> pi/6, 5pi/6 + general solution")
def _():
    r = ok(E.call("solve", expr="sin(x)=1/2"))
    assert [d["plain"] for d in r["solutions"]] == ["pi/6", "5*pi/6"] and r.get("general_exact")


@case("e^x = 3x -> 0.6190612867, 1.512134552 (Lambert W)")
def _():
    r = ok(E.call("solve", expr="e^x = 3x"))
    v = sol_values(r)
    num_close(v[0], 0.619061286736)
    num_close(v[1], 1.51213455166)


@case("x^3 - 2x - 5 = 0 -> 2.0945514815 (Wallis' cubic)")
def _():
    r = ok(E.call("solve", expr="x^3-2x-5=0"))
    num_close(sol_values(r)[0], 2.09455148154233)
    assert len(r["complex"]) == 2


@case("x^3 - 6x^2 + 11x - 6 = 0 (rational root theorem)")
def _():
    r = ok(E.call("solve", expr="x^3-6x^2+11x-6=0"))
    assert [d["plain"] for d in r["solutions"]] == ["1", "2", "3"] and "Rational root theorem" in titles(r["steps"])


@case("(x+1)/(x-2) = 3 (clear denominators)")
def _():
    r = ok(E.call("solve", expr="(x+1)/(x-2)=3"))
    assert r["solutions"][0]["plain"] == "7/2"


@case("system x^2+y^2=25, x-y=1 (substitution)")
def _():
    r = ok(E.call("solve", expr="x^2+y^2=25, x-y=1"))
    assert sorted(d["plain"] for d in r["solutions"]) == ["x = -3, y = -4", "x = 4, y = 3"]


@case("linear system 2x+y=5; x-y=1")
def _():
    r = ok(E.call("solve", expr="2x+y=5; x-y=1"))
    assert r["solutions"][0]["plain"] == "x = 2, y = 1"


@case("3x3 linear system (Gauss-Jordan)")
def _():
    r = ok(E.call("solve", expr="x+y+z=6\nx-y=0\nx+z=4"))
    assert r["solutions"][0]["plain"] == "x = 2, y = 2, z = 2" and "Augmented matrix" in titles(r["steps"])


@case("abs(x-2) < 3 -> (-1, 5)")
def _():
    r = ok(E.call("solve", expr="abs(x-2)<3"))
    assert r["plain"] == "Interval.open(-1, 5)"


@case("x^2 - 4 >= 0 -> (-oo, -2] U [2, oo)")
def _():
    r = ok(E.call("solve", expr="x^2-4 >= 0"))
    assert "Union" in r["plain"]


@case("touching root (x-1)^2 * e^x = 0 found numerically")
def _():
    r = ok(E.call("solve", expr="(x-1)^2 e^x = 0"))
    assert any(abs(v - 1) < 1e-9 for v in sol_values(r))


@case("cos x = x (no closed form) -> 0.7390851332")
def _():
    r = ok(E.call("solve", expr="cos x = x", stage="numeric"))
    num_close(sol_values(r)[0], 0.739085133215)


print("Other CAS modes")


@case("simplify / factor / expand / partial fractions / together")
def _():
    assert ok(E.call("cas", mode="simplify", expr="(x^2-1)/(x-1)"))["plain"] == "x + 1"
    assert ok(E.call("cas", mode="factor", expr="x^3-x"))["plain"] == "x*(x - 1)*(x + 1)"
    assert ok(E.call("cas", mode="expand", expr="(x+1)^3"))["plain"] == "x^3 + 3*x^2 + 3*x + 1"
    assert ok(E.call("cas", mode="apart", expr="1/(x^2-1)"))["plain"] == "-1/(2*(x + 1)) + 1/(2*(x - 1))"
    assert ok(E.call("cas", mode="together", expr="1/x+1/y"))["plain"] == "(x + y)/(x*y)"


@case("limits: sin x/x -> 1, (1+1/n)^n -> e, 1/x at 0 does not exist")
def _():
    assert ok(E.call("cas", mode="limit", expr="sin(x)/x", at="0"))["plain"] == "1"
    assert ok(E.call("cas", mode="limit", expr="(1+1/n)^n", at="oo"))["plain"] == "E"
    assert ok(E.call("cas", mode="limit", expr="1/x", at="0"))["plain"] == "does not exist"
    assert ok(E.call("cas", mode="limit", expr="1/x", at="0", dir="-"))["plain"] == "-oo"


@case("series: e^x to order 5, cos x at pi")
def _():
    r = ok(E.call("cas", mode="series", expr="e^x", order=5))
    assert r["plain"] == "x^4/24 + x^3/6 + x^2/2 + x + 1"
    assert "pi" in ok(E.call("cas", mode="series", expr="cos x", at="pi", order=4))["plain"]


@case("sum 1/k^2 = pi^2/6, sum k = n(n+1)/2, product k = 120")
def _():
    assert ok(E.call("cas", mode="sum", expr="1/k^2", lo="1", hi="oo"))["plain"] == "pi^2/6"
    assert ok(E.call("cas", mode="sum", expr="k", lo="1", hi="n"))["plain"] == "n*(n + 1)/2"
    assert ok(E.call("cas", mode="product", expr="k", lo="1", hi="5"))["plain"] == "120"


@case("evaluate sqrt(2)·pi to 30 digits, 30° = pi/6")
def _():
    assert ok(E.call("cas", mode="evaluate", expr="sqrt(2)*pi", digits=30))["decimal"].startswith("4.44288293815836610178848786")
    assert ok(E.call("cas", mode="evaluate", expr="30°"))["plain"] == "pi/6"


@case("matrix [[1,2],[3,4]]: det -2, inverse, eigenvalues; '2 1; 1 2' rows")
def _():
    r = ok(E.call("cas", mode="matrix", expr="[[1,2],[3,4]]"))
    items = {i["label"]: i for i in r["items"]}
    assert items["Determinant"]["plain"] == "-2" and "Inverse" in items and "Eigenvalues" in items
    r = ok(E.call("cas", mode="matrix", expr="2 1; 1 2"))
    assert {i["label"]: i for i in r["items"]}["Eigenvalues"]["tex"] in ("3, 1", "1, 3")


print()
print("%d / %d passed" % (COUNT - len(FAILS), COUNT))
if FAILS:
    print("FAILED:", ", ".join(FAILS))
    sys.exit(1)
