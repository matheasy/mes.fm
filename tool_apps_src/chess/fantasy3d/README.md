# Fantasy armies 3D (work in progress, 2026-11-16)

Goal: a real-3D version of the chess "Fantasy armies" set (today's set uses flat AI pictures that turn to face the camera).

- `src/` = the 12 cut-out figure pictures (w/b + K Q R B N P, 512x640) and the two Gemini sheets they came from (`slice.py sheet.png outdir w|b`).
- 3D models come from Microsoft TRELLIS on Hugging Face (MIT licence), one or two a day on the free account `matheasysolutions`
  (token in ~/.cache/huggingface/token; the free ZeroGPU quota is ~2 min a day and each run reserves 120 s).
  `gen3d.py in.png out.glb ...` (TRELLIS.2) / `try3d.py in.png out.glb 512` (one test, prints the bounding box). Needs a Python 3.14 venv with gradio_client, trimesh.
- **Day 2 (2026-11-17): TRELLIS v1 works** with the existing pictures: `trellis1.py in.png out.glb` (gradio_client + trimesh venv). White knight = real 3D (0.53 x 0.69 x 0.35), 27 s, saved in `models/` with a preview strip. The free quota still allows only about 1-2 runs a day ("try again in N min" when used up).
- Finished pieces: wN, wK, wQ, wB
- Problem found on day 1: TRELLIS.2 turned the illustration-style pictures into flat cards (depth 0.002). Next try: TRELLIS v1
  (`trellis-community/TRELLIS`, endpoint `/generate_and_extract_glb`) and photo-style inputs (Gemini: "studio photo of a painted resin miniature, three-quarter view").
- Not used, and why: Tripo free = non-commercial; Meshy free = no downloads (Pro needed).
- When models exist: shrink with gltf-transform (weld, simplify to ~12k triangles, 512 px texture), add set `fantasy3d` to view3d.js
  (keep the picture set), credit line not needed for MIT.
