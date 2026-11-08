import {launch,open,IDS,sleep,demoTab,popup,fit} from './lib2.mjs';
const S=process.env.S; const proc=await launch(); const URL='http://skynotes.localhost:8471/';
async function fresh(){const d=await open(URL); await d.size(1280,760); await sleep(1500); const t=await demoTab(URL); return {d,t}}
const click=(p,txt)=>p.ev(`(()=>{const b=[...document.querySelectorAll('button,a,label,[role=button]')].find(e=>e.textContent.trim()===${JSON.stringify(txt)}); if(!b) return 'nf'; b.click(); return 'ok'})()`);
async function run(n,acts,after){
  const {d,t}=await fresh(); const p=await popup(n,t);
  for(const a of acts){console.log(n,a,await click(p,a)); await sleep(700)}
  if(after) await after(d,p);
  await sleep(1200); await fit(p,`${S}/raw/${n}-popup2.png`); await d.shot(`${S}/raw/${n}-page.png`); p.close(); d.close();
}
await run('dark-mode',['Make this tab dark']);
await run('text-size',['A+','A+']);
await run('videospeed',[],async(d,p)=>{await d.ev(`(async()=>{const v=document.querySelector('video');v.currentTime=6;await v.play().catch(e=>String(e));window.scrollTo(0,90)})()`); await sleep(500); for(let i=0;i<5;i++){await d.key('d','KeyD'); await sleep(150)} await d.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:300}); await sleep(800); console.log('rate',await d.ev('document.querySelector("video").playbackRate'))});
await run('volume-booster',['300%'],async(d)=>{await d.ev(`document.querySelector('video').play().catch(()=>0)`)});
await run('read-aloud',['Read this page'],async(d)=>{await sleep(2500); console.log('ra',await d.ev(`document.body.innerText.length+' '+[...document.querySelectorAll('*')].filter(e=>e.shadowRoot).length`))});
proc.kill(); process.exit(0);
