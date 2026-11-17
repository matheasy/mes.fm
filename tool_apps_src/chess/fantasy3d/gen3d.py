import sys, shutil, time, os
from gradio_client import Client, handle_file
tok = open(os.path.expanduser("~/.cache/huggingface/token")).read().strip()
pairs = list(zip(sys.argv[1::2], sys.argv[2::2]))
for src, out in pairs:
    if os.path.exists(out): print("skip", out); continue
    t = time.time()
    try:
        c = Client('microsoft/TRELLIS.2', token=tok, verbose=False)
        c.predict(api_name="/start_session")
        img = c.predict(handle_file(src), api_name="/preprocess_image")
        c.predict(handle_file(img), 42, "1024", api_name="/image_to_3d")
        print("gen", out, round(time.time() - t), "s", flush=True)
        r = c.predict(150000, 1024, api_name="/extract_glb")
        shutil.copy(r[0], out); print("ok", out, os.path.getsize(out) // 1024, "KB", round(time.time() - t), "s", flush=True)
    except Exception as e:
        print("FAIL", out, type(e).__name__, str(e)[:300], flush=True)
