import {launch,open,sleep,demoTab,popup,fit} from './lib2.mjs';
const S=process.env.S; const proc=await launch(); const URL='http://skynotes.localhost:8471/';
const d=await open(URL); await d.size(1280,760); await sleep(1500); const t=await demoTab(URL); const p=await popup('text-size',t);
await p.ev(`(()=>{const s=document.getElementById('applyto');s.value='all';s.dispatchEvent(new Event('change'))})()`); await sleep(400);
for(let i=0;i<2;i++){await p.ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='A+').click()`); await sleep(500)}
await sleep(1500); console.log(await d.ev(`getComputedStyle(document.querySelector('p')).fontSize`));
await fit(p,`${S}/raw/text-size-popup2.png`); await d.shot(`${S}/raw/text-size-page.png`);
proc.kill(); process.exit(0);
