# Drop the flat backing sheet TRELLIS sometimes builds behind a figure (thin pieces in one plane, spanning the
# picture's frame), plus the thin frame scraps left of it.  usage: clean_sheets.py in.glb [out.glb]
# If the sheet itself was already cut away, pass its plane:  in.glb out.glb zmin zmax
# Keeps one textured mesh, so view3d.js's small GLB parser still reads it.
import sys, numpy as np, trimesh
from trimesh.graph import connected_component_labels
src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else src
m = list(trimesh.load(src, force="scene").geometry.values())[0]
lab = connected_component_labels(m.face_adjacency, node_count=len(m.faces))
comps = []
for L in np.unique(lab):
    sel = lab == L; v = m.vertices[m.faces[sel].ravel()]
    comps.append((sel, v.min(0), v.max(0)))
W = m.bounds[1] - m.bounds[0]
thin = lambda c: (c[2] - c[1])[2] < 0.04
sheets = [c for c in comps if thin(c) and (c[2] - c[1])[0] > 0.85 * W[0] and (c[2] - c[1])[1] > 0.85 * W[1]]
if sheets:
    z0 = min(c[1][2] for c in sheets) - 0.03; z1 = max(c[2][2] for c in sheets) + 0.03
elif len(sys.argv) > 4:          # sheet already removed: give its plane by hand, e.g.  in.glb out.glb -0.06 0.06
    z0, z1 = float(sys.argv[3]), float(sys.argv[4])
else:
    print(src, "no backing sheet, unchanged"); sys.exit()
core = [c for c in comps if not thin(c) and c[0].sum() >= 30]
lo = np.min([c[1] for c in core], 0) - 0.02; hi = np.max([c[2] for c in core], 0) + 0.02
keep = np.ones(len(m.faces), bool); n = 0
for c in comps:
    if (thin(c) or any(c is t for t in sheets)) and c[1][2] >= z0 and c[2][2] <= z1 and (np.any(c[1] < lo) or np.any(c[2] > hi)):
        keep[c[0]] = False; n += int(c[0].sum())
m.update_faces(keep); m.remove_unreferenced_vertices()
print(out, "dropped", n, "faces ->", (m.bounds[1] - m.bounds[0]).round(3), len(m.faces), "faces")
if out != "-": m.export(out)
