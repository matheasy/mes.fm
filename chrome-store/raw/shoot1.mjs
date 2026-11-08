import {launch,open,IDS,sleep,demoTab,popup,fit} from './lib2.mjs';
const S=process.env.S; const proc=await launch();
const demo=await open('http://127.0.0.1:8471/'); await demo.size(1280,800); await sleep(1500);
const tab=await demoTab('http://127.0.0.1:8471/'); console.log('demo',tab);
for(const n of Object.keys(IDS)){
  const t = n==='site-traffic'||n==='archive' ? {...tab,url:'https://mes.fm/',title:'MES.fm'} : tab;
  const p=await popup(n,t); console.log(n,await fit(p,`${S}/raw/${n}-popup.png`)); p.close();
  const o=await popup(n,t,'options.html',1280,800); const txt=await o.ev('document.title'); if(txt&&!/not found|ERR/i.test(txt)) {await o.shot(`${S}/raw/${n}-options.png`); console.log(' options',txt)} o.close();
}
await demo.shot(`${S}/raw/demo.png`); proc.kill(); process.exit(0);
