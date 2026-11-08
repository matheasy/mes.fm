import {spawn} from 'node:child_process'; import fs from 'node:fs';
const S=process.env.S, PORT=9339;
export const IDS=Object.fromEntries(fs.readFileSync(S+'/ids.txt','utf8').trim().split('\n').map(l=>l.split(' ')));
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function launch(){
  const exts=Object.keys(IDS).map(d=>S+'/ext/'+d).join(',');
  const p=spawn('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${S}/prof`,`--load-extension=${exts}`,`--disable-extensions-except=${exts}`,'--disable-features=DisableLoadExtensionCommandLineSwitch','--enable-unsafe-extension-debugging','--window-size=1280,800','--no-first-run','--hide-scrollbars','--autoplay-policy=no-user-gesture-required'],{stdio:'ignore'});
  for(let i=0;i<50;i++){try{await fetch(`http://127.0.0.1:${PORT}/json/version`);break}catch{await sleep(200)}}
  await sleep(1500); return p;
}
export async function targets(){return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()}
export async function open(url){const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?${url}`,{method:'PUT'})).json(); return attach(t)}
export async function attach(t){
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend={};
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id]}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,userGesture:true}); if(r.result?.exceptionDetails) return {err:r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text}; return r.result?.result?.value};
  const size=(w,h)=>send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:false});
  const shot=async(file,clip)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!clip,...(clip?{clip:{...clip,scale:1}}:{})}); fs.writeFileSync(file,Buffer.from(r.result.data,'base64'))};
  const key=async(k,code)=>{for(const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key:k,code,text:type==='keyDown'?k:undefined,windowsVirtualKeyCode:k.toUpperCase().charCodeAt(0)})};
  return {t,ws,send,ev,size,shot,key,close:()=>ws.close()};
}
