const puppeteer = require('puppeteer-core');
const fs = require('fs');
const [,, outdir, mode, ...paths] = process.argv;
fs.mkdirSync(outdir, {recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
  for (const p of paths) {
    const page = await b.newPage();
    const mobile = mode==='m';
    await page.setViewport({width: mobile?390:1440, height: mobile?844:900, isMobile:mobile, hasTouch:mobile});
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await page.goto('https://www.alpinewestcreative.com/' + p, {waitUntil:'networkidle2', timeout:90000});
    let h = await page.evaluate(()=>document.body.scrollHeight);
    for (let y=0; y<h+1500; y+=300) { await page.evaluate(y=>window.scrollTo(0,y), y); await sleep(200); h = await page.evaluate(()=>document.body.scrollHeight); }
    await sleep(1500);
    // slideshows: autoplay probe + capture every slide
    const shows = await page.$$eval('.wixui-slideshow', els => els.map(e=>e.id));
    const slides = {};
    for (const id of shows) {
      await page.evaluate(id=>document.getElementById(id).scrollIntoView({block:'center'}), id);
      const seq=[]; for (let t=0;t<8;t++){ seq.push(await page.evaluate(id=>document.querySelector('#'+id+' [data-testid=slidesWrapper]').firstElementChild.id, id)); await sleep(1000);} 
      console.log('autoplay probe', id, seq.join(' '));
      const n = await page.$$eval('#'+id+' nav a', a=>a.length);
      slides[id]=[];
      for (let i=0;i<n;i++) {
        await page.evaluate((id,i)=>document.querySelectorAll('#'+id+' nav a')[i].click(), id, i);
        await sleep(2500);
        slides[id].push(await page.evaluate(id=>{const w=document.querySelector('#'+id+' [data-testid=slidesWrapper]'); return [...w.children].map(c=>c.outerHTML).pop();}, id));
      }
      await page.evaluate(id=>document.querySelectorAll('#'+id+' nav a')[0].click(), id); await sleep(2500);
    }
    await page.evaluate(()=>window.scrollTo(0,0)); await sleep(1500);
    const name = p.replace(/\//g,'_') || 'home';
    fs.writeFileSync(`${outdir}/${name}.html`, await page.evaluate(()=>'<!DOCTYPE html>\n'+document.documentElement.outerHTML));
    fs.writeFileSync(`${outdir}/${name}.slides.json`, JSON.stringify(slides));
    console.log(name, h, Object.keys(slides).map(k=>k+':'+slides[k].length).join(','));
    await page.close();
  }
  await b.close();
})();
