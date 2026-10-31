const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.env.ROOT||path.join(__dirname,'..');
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp4':'video/mp4','.txt':'text/plain','.json':'application/json','.gif':'image/gif'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0].split('#')[0]);
 // like vercel.json: phones are redirected to /m/... unless they chose the desktop layout (cookie)
 const mob=/iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|iemobile/i.test(q.headers['user-agent']||'')&&!/(^|;\s*)(karo_layout=desktop|karo_wide=1)/.test(q.headers.cookie||'')&&!/^\/m(\/|$)/.test(p)&&!/\.\w+$/.test(p)&&!/^\/(media|fonts|video|assets)\//.test(p);
 if(mob){r.writeHead(307,{Location:'/m'+(p==='/'?'':p)+(q.url.includes('?')?q.url.slice(q.url.indexOf('?')):'')});return r.end();}
 if(p==='/m') p='/m/';
 let f=path.join(ROOT,p); if(p.endsWith('/')) f=path.join(f,'index.html'); else if(!path.extname(f)) f+='.html';
 fs.stat(f,(e,s)=>{ if(e){r.writeHead(404);return r.end('404');}
  const range=q.headers.range; const type=T[path.extname(f)]||'application/octet-stream';
  if(range){const [a,b]=range.replace('bytes=','').split('-');const st=+a,en=b?+b:s.size-1;r.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${st}-${en}/${s.size}`,'Accept-Ranges':'bytes','Content-Length':en-st+1});fs.createReadStream(f,{start:st,end:en}).pipe(r);}
  else {r.writeHead(200,{'Content-Type':type,'Content-Length':s.size,'Accept-Ranges':'bytes'});fs.createReadStream(f).pipe(r);} });
}).listen(+process.env.PORT||8441,'127.0.0.1');
