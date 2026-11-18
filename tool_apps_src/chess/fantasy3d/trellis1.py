import sys, shutil, os, time, trimesh
from gradio_client import Client, handle_file
tok=open(os.path.expanduser('~/.cache/huggingface/token')).read().strip()
src,out=sys.argv[1],sys.argv[2]; t=time.time()
c=Client('trellis-community/TRELLIS',token=tok,verbose=False)
c.predict(api_name="/start_session")
img=c.predict(handle_file(src),api_name="/preprocess_image")
shutil.copy(img,out+".pre.png")
r=c.predict(handle_file(img),[],1,7.5,12,3.0,12,"stochastic",0.95,1024,api_name="/generate_and_extract_glb")
shutil.copy(r[2] or r[1],out)
try: shutil.copy(r[0]["video"],out+".mp4")
except Exception as e: print("novideo",e)
b=trimesh.load(out,force="scene").bounds; print(out,(b[1]-b[0]).round(3),os.path.getsize(out)//1024,"KB",round(time.time()-t),"s")
