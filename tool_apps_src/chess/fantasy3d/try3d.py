import sys, shutil, time, os, trimesh
from gradio_client import Client, handle_file
tok = open(os.path.expanduser("~/.cache/huggingface/token")).read().strip()
src, out, res = sys.argv[1], sys.argv[2], sys.argv[3]
c = Client('microsoft/TRELLIS.2', token=tok, verbose=False)
c.predict(api_name="/start_session")
img = c.predict(handle_file(src), api_name="/preprocess_image")
shutil.copy(img, out + ".pre.png")
html = c.predict(handle_file(img), 1, res, api_name="/image_to_3d")
open(out + ".html", "w").write(str(html))
r = c.predict(150000, 1024, api_name="/extract_glb")
shutil.copy(r[0], out)
b = trimesh.load(out, force="scene").bounds; print(out, (b[1] - b[0]).round(3))
