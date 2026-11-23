# Fantasy armies 3D (work in progress, 2026-11-16)

Goal: a real-3D version of the chess "Fantasy armies" set (today's set uses flat AI pictures that turn to face the camera).

- `src/` = the 12 cut-out figure pictures (w/b + K Q R B N P, 512x640) and the two Gemini sheets they came from (`slice.py sheet.png outdir w|b`).
- 3D models come from Microsoft TRELLIS on Hugging Face (MIT licence), one or two a day on the free account `matheasysolutions`
  (token in ~/.cache/huggingface/token; the free ZeroGPU quota is ~2 min a day and each run reserves 120 s).
  `gen3d.py in.png out.glb ...` (TRELLIS.2) / `try3d.py in.png out.glb 512` (one test, prints the bounding box). Needs a Python 3.14 venv with gradio_client, trimesh.
- **Day 2 (2026-11-17): TRELLIS v1 works** with the existing pictures: `trellis1.py in.png out.glb` (gradio_client + trimesh venv). White knight = real 3D (0.53 x 0.69 x 0.35), 27 s, saved in `models/` with a preview strip. The free quota still allows only about 1-2 runs a day ("try again in N min" when used up).
- Finished pieces: all 12 (wK wQ wR wB wN wP, bK bQ bR bB bN bP), done 2026-11-20. Redo any that looks poor with trellis1.py + clean_sheets.py.
- **Day 4 (2026-11-20):** bK, bQ, bB in one go (three runs fitted the free quota). bQ and bB came with a flat backing sheet
  (TRELLIS sees the dark picture background as a card): `clean_sheets.py in.glb [out.glb] [zmin zmax]` cuts the sheet and its
  thin scraps, keeping one textured mesh. bQ's hand flames were painted on that sheet, so the 3D queen has bare hands.
  Same day: bN, bR, wP, bP too (seven runs in one day, so the quota is more generous than first thought). Both pawns had sheets.
  Check every new model's silhouette for a sheet (bounding box as wide as the picture = suspicious).
- Problem found on day 1: TRELLIS.2 turned the illustration-style pictures into flat cards (depth 0.002). Next try: TRELLIS v1
  (`trellis-community/TRELLIS`, endpoint `/generate_and_extract_glb`) and photo-style inputs (Gemini: "studio photo of a painted resin miniature, three-quarter view").
- Not used, and why: Tripo free = non-commercial; Meshy free = no downloads (Pro needed).
- When models exist: shrink with gltf-transform (weld, simplify to ~12k triangles, 512 px texture), add set `fantasy3d` to view3d.js
  (keep the picture set), credit line not needed for MIT.

## Splinterlands 3D (2026-11-21)

Splinterlands gave permission (@clayboyn) to use their characters. The picture set (`mes.fm/chess/img/splinterlands/`) is the official
card art (`https://d36mxiodymuqjm.cloudfront.net/card_art/<Card Name>.png`, transparent cut-outs) trimmed and fitted to 512 px squares.
The "Splinterlands 3D" set loads `mes.fm/chess/img/splinterlands3d/<key>.glb`, made the same way: `trellis1.py <card art png> <key>.glb`
(a fresh venv with gradio_client + trimesh is enough). Any piece without a model shows its picture figure.
- Done 2026-11-21: the whole Life army wK wQ wR wB wN wP (Tyrus Paladium, Angel of Light, Clay Golem, Divine Healer, Sacred Unicorn,
  Silver Shield Warrior). The free ZeroGPU quota ran out after six runs.
- Done 2026-11-22: the whole Death army bK bQ bR bB bN bP (Zintar Mortalis, Dark Enchantress, Bone Golem, Undead Priest,
  Corrupted Pegasus, Skeletal Warrior). All six are real 3D (depth 0.34-0.99) and clean_sheets.py found no backing sheet, so
  both armies are complete. clean_sheets.py needs scipy + networkx in the venv as well.
