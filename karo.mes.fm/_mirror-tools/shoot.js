const puppeteer = require('puppeteer-core'); const fs=require('fs');
const [,, base, outdir, mode, ...paths] = process.argv; fs.mkdirSync(outdir,{recursive:true});
(async () => {
  const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
  for (const p of paths) {
    const page = await b.newPage(); const mobile = mode==='m';
    const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); page.on('pageerror',e=>errs.push(String(e)));
    page.on('requestfailed',r=>errs.push('FAIL '+r.url())); page.on('response',r=>{if(r.status()>=400)errs.push(r.status()+' '+r.url())});
    await page.setViewport({width: mobile?390:+(process.env.W||1440), height: mobile?844:900, isMobile:mobile, hasTouch:mobile});
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await page.goto(base + p, {waitUntil:'networkidle2', timeout:90000});
    let h = await page.evaluate(()=>document.body.scrollHeight);
    for (let y=0; y<h+900; y+=500) { await page.evaluate(y=>window.scrollTo(0,y), y); await new Promise(r=>setTimeout(r,120)); }
    await page.evaluate(()=>window.scrollTo(0,0)); await new Promise(r=>setTimeout(r,1500));
    const name = p.replace(/\//g,'_') || 'home';
    await page.screenshot({path:`${outdir}/${name}.png`, fullPage:true});
    console.log(name, await page.evaluate(()=>document.body.scrollHeight), errs.slice(0,5).join(' | '));
    await page.close();
  }
  await b.close();
})();
