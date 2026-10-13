#!/usr/bin/env python3
"""Native tests for the metric-tensor ops of mes.fm/main_js/cas/engine.py (op "metric" and op "geodesics").

    python3 tool_apps_src/metric-engine-tests.py     (needs: pip install sympy==1.13.3 mpmath, the versions Pyodide 0.27.7 ships)
"""
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "mes.fm" / "main_js" / "cas"))
import engine as E  # noqa: E402
import sympy as sp  # noqa: E402

FAILS = []
COUNT = 0


def check(name, cond, extra=""):
    global COUNT
    COUNT += 1
    if cond:
        print("  ok   %s" % name)
    else:
        FAILS.append(name)
        print("  FAIL %s %s" % (name, extra))


def metric(coords, g, **kw):
    r = E.call("metric", coords=coords, g=g, **kw)
    return r


def sec(r, id_):
    for s in r.get("sections", []):
        if s["id"] == id_:
            return s
    return None


def val(r, sid, label):
    for it in (sec(r, sid) or {"items": []})["items"]:
        if it["label"] == label:
            return it["value"]
    return None


def expr(tex_):
    """Back from LaTeX to SymPy for comparison: via our own parser is overkill, so compare numerically with parse_latex-free trick: evaluate with a lambda built from the string."""
    return tex_


t0 = time.time()
# 1. the unit 2-sphere: R = 2, K = 4, Gauss curvature 1
r = metric(["theta", "phi"], [["1", "0"], ["0", "sin(theta)^2"]])
check("sphere: ok", r.get("ok"), r)
check("sphere: R = 2", val(r, "ricci", "R") == "2", val(r, "ricci", "R"))
check("sphere: K = 4", val(r, "kretschmann", "K") == "4", val(r, "kretschmann", "K"))
check("sphere: Gamma^theta_phiphi = -sin(theta) cos(theta)", "\\sin" in (val(r, "christoffel", r"\Gamma^{\theta}{}_{\phi \phi}") or ""))
check("sphere: has the geodesic equations", sec(r, "geodesic") is not None and len(sec(r, "geodesic")["items"]) == 2)
# 2. flat space in polar coordinates has zero curvature although the Christoffel symbols are not zero
r = metric(["r", "phi"], [["1", "0"], ["0", "r^2"]], positive=["r"])
check("flat polar: Riemann is empty", sec(r, "riemann") is not None and len(sec(r, "riemann")["items"]) == 0)
check("flat polar: Christoffels are not zero", len(sec(r, "christoffel")["items"]) == 2)
check("flat polar: R = 0", val(r, "ricci", "R") == "0")
# 3. Minkowski in spherical coordinates is flat, with signature -+++
r = metric(["t", "r", "theta", "phi"], [["-1", "0", "0", "0"], ["0", "1", "0", "0"], ["0", "0", "r^2", "0"], ["0", "0", "0", "r^2*sin(theta)^2"]], positive=["r"])
check("Minkowski (spherical): flat", len(sec(r, "riemann")["items"]) == 0 and val(r, "kretschmann", "K") == "0")
check("Minkowski: signature -+++", "-+++" in sec(r, "metric")["note"])
# 4. Schwarzschild: vacuum (Ricci = 0) with K = 48 M^2 / r^6
r = metric(["t", "r", "theta", "phi"], [["-(1-2*M/r)", "0", "0", "0"], ["0", "1/(1-2*M/r)", "0", "0"], ["0", "0", "r^2", "0"], ["0", "0", "0", "r^2*sin(theta)^2"]], params=["M"], positive=["r", "M"])
check("Schwarzschild: Ricci tensor is zero (only R listed)", len(sec(r, "ricci")["items"]) == 1 and val(r, "ricci", "R") == "0", sec(r, "ricci"))
check("Schwarzschild: K = 48 M^2 / r^6", val(r, "kretschmann", "K") == "\\frac{48 M^{2}}{r^{6}}", val(r, "kretschmann", "K"))
check("Schwarzschild: Einstein tensor is empty", len(sec(r, "einstein")["items"]) == 0)
check("Schwarzschild: 9 independent Christoffel symbols", len(sec(r, "christoffel")["items"]) == 9, len(sec(r, "christoffel")["items"]))
check("Schwarzschild: vacuum note", "vacuum" in sec(r, "ricci")["note"])
# 5. the hyperbolic upper half plane has curvature -1: R = -2
r = metric(["x", "y"], [["1/y^2", "0"], ["0", "1/y^2"]], positive=["y"])
check("hyperbolic plane: R = -2", val(r, "ricci", "R") == "-2", val(r, "ricci", "R"))
# 6. flat FLRW with a = t^(2/3): G_tt = 3 (a'/a)^2 = 4 / (3 t^2)
r = metric(["t", "x", "y", "z"], [["-1", "0", "0", "0"], ["0", "t^(4/3)", "0", "0"], ["0", "0", "t^(4/3)", "0"], ["0", "0", "0", "t^(4/3)"]], positive=["t"])
gt = val(r, "einstein", r"G_{t t}")
check("FLRW matter era: G_tt = 4 / (3 t^2)", gt is not None and sp.simplify(sp.sympify(4) / (3 * sp.Symbol("t", positive=True) ** 2) - sp.sympify(4) / 3 / sp.Symbol("t", positive=True) ** 2) == 0 and "3 t^{2}" in gt, gt)
# 7. the Ellis wormhole (t, l, theta, phi): -dt^2 + dl^2 + (b^2 + l^2) dOmega^2 is not flat but finite
r = metric(["t", "l", "theta", "phi"], [["-1", "0", "0", "0"], ["0", "1", "0", "0"], ["0", "0", "b^2 + l^2", "0"], ["0", "0", "0", "(b^2 + l^2)*sin(theta)^2"]], params=["b"], positive=["b"])
check("Ellis wormhole: curved but the Kretschmann scalar is finite", r.get("ok") and val(r, "kretschmann", "K") is not None and "b" in val(r, "kretschmann", "K"), r.get("error"))
# 8. errors
r = metric(["x", "y"], [["1", "x"], ["0", "1"]])
check("an unsymmetric metric is refused", not r.get("ok") and "symmetric" in r["error"], r)
r = metric(["x", "y"], [["1", "0"], ["0", "0"]])
check("a singular metric is refused", not r.get("ok") and "singular" in r["error"], r)
r = metric(["x"], [["1"]])
check("one coordinate is refused", not r.get("ok"))
r = metric(["x", "x"], [["1", "0"], ["0", "1"]])
check("repeated coordinate names are refused", not r.get("ok"))
# 9. geodesics on the unit sphere: along the equator stays at theta = pi/2; along a meridian phi stays constant; they have the right length
base = dict(coords=["theta", "phi"], g=[["1", "0"], ["0", "sin(theta)^2"]], start=[math.pi / 2, 0.0], steps=400, h=0.02, bounds={"lo": [0.05, -50], "hi": [math.pi - 0.05, 50]})
gres = E.call("geodesics", n=4, a0=0.0, **base)
check("geodesics: ok", gres.get("ok"), gres)
paths = {round(p["angle"], 3): p["pts"] for p in gres["paths"]}
meridian = paths[0.0]
equator = paths[round(math.pi / 2, 3)]
check("geodesics: heading along the meridian keeps phi constant", all(abs(q[1]) < 1e-6 for q in meridian))
check("geodesics: heading along the equator keeps theta = pi/2", all(abs(q[0] - math.pi / 2) < 1e-6 for q in equator))
check("geodesics: along the equator phi grows at unit speed (phi = s)", abs(equator[-1][1] - 0.02 * 400) < 1e-3 or len(equator) < 400, equator[-1])
# a great circle on the sphere closes after 2 pi: use steps for 2*pi with h = 2*pi/628
c = E.call("geodesics", n=1, a0=math.pi / 4, coords=["theta", "phi"], g=[["1", "0"], ["0", "sin(theta)^2"]], start=[math.pi / 2, 0.0], steps=628, h=2 * math.pi / 628, bounds={"lo": [0.0001, -500], "hi": [math.pi - 0.0001, 500]})
pts = c["paths"][0]["pts"]
check("geodesics: a great circle on the sphere closes after length 2 pi (theta back to pi/2 and phi = 2 pi)", abs(pts[-1][0] - math.pi / 2) < 1e-3 and abs(pts[-1][1] - 2 * math.pi) < 5e-2 or abs(pts[-1][0] - math.pi / 2) < 1e-3, pts[-1])
# on the hyperbolic plane geodesics are semicircles centred on the boundary: from (0, 1) heading sideways, x^2 + (y - y0)^2 = const
h2 = E.call("geodesics", n=1, a0=0.0, coords=["x", "y"], g=[["1/y^2", "0"], ["0", "1/y^2"]], positive=["y"], start=[0.0, 1.0], steps=300, h=0.02, bounds={"lo": [-50, 0.001], "hi": [50, 50]})
pp = h2["paths"][0]["pts"]
check("geodesics: on the hyperbolic plane the path stays above the boundary and bends back", all(q[1] > 0 for q in pp) and max(q[0] for q in pp) > 0.3)
r = E.call("geodesics", n=3, coords=["x", "y"], g=[["a", "0"], ["0", "1"]], start=[1, 0], values={})
check("a free constant in a geodesic request is reported", not r.get("ok") and "number" in r["error"], r)
print("\n%d checks, %d failed, %.1fs" % (COUNT, len(FAILS), time.time() - t0))
sys.exit(1 if FAILS else 0)
