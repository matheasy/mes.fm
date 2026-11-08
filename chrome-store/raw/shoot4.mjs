import {launch,open,sleep} from './lib2.mjs';
const S=process.env.S; const proc=await launch();
const d=await open('https://mes.fm/'); await d.size(1280,760); await sleep(5000); await d.shot(`${S}/raw/mesfm-page.png`);
proc.kill(); process.exit(0);
