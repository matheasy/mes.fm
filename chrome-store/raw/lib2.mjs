import {launch,targets,open,attach,IDS,sleep} from './cdp.mjs';
export {launch,targets,open,attach,IDS,sleep};
export async function sw(name){const t=(await targets()).find(t=>t.type==='service_worker'&&t.url.includes(IDS[name]));return t&&attach(t)}
export async function demoTab(url){const s=await sw('dark-mode'); const r=await s.ev(`chrome.tabs.query({}).then(t=>t.filter(x=>x.url&&x.url.startsWith(${JSON.stringify(url)})).map(x=>({id:x.id,windowId:x.windowId,url:x.url,title:x.title})))`); s.close(); return r[0]}
export async function popup(name, tab, file='popup.html', w=400, h=600){
  const p=await open('about:blank'); await p.send('Page.enable'); await p.size(w,h);
  await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`(function(){const DEMO=${JSON.stringify({...tab,active:true})};const q=chrome.tabs.query.bind(chrome.tabs);chrome.tabs.query=function(o,cb){if(o&&o.active){const r=[DEMO];if(cb){setTimeout(()=>cb(r));return}return Promise.resolve(r)}return q(o,cb)};})();`});
  await p.send('Page.navigate',{url:`chrome-extension://${IDS[name]}/${file}`}); await sleep(1800); return p;
}
export async function fit(p,file,maxH=1400){const d=await p.ev(`({w:Math.ceil(document.documentElement.scrollWidth),h:Math.ceil(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight))})`); await p.shot(file,{x:0,y:0,width:d.w,height:Math.min(d.h,maxH)}); return d}
