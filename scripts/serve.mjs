import http from 'node:http';
import path from 'node:path';
import {readdir,readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const root=process.cwd(),allowed=new Map(),lock=JSON.parse(await readFile('assets-lock.json','utf8'));
async function addSource(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await addSource(file);else if(entry.isFile())allowed.set(path.relative(path.join(root,'src'),file).split(path.sep).join('/'),file);}}
await addSource(path.join(root,'src'));
for(const name of Object.keys(lock.files))allowed.set(name,path.join(root,'data',name));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html',file=allowed.get(name);if(!file)throw Error('Not allowed');const info=await stat(file);if(!info.isFile())throw Error('Not a file');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Content-Length':info.size,'Cache-Control':'no-cache'});if(req.method==='HEAD')res.end();else await pipeline(createReadStream(file),res);}
  catch{if(!res.headersSent){res.writeHead(404);res.end('Not found. Run npm run assets if viewer data is missing.');}else res.destroy();}
});
const port=Number(process.env.PORT||8795);server.listen(port,'127.0.0.1',()=>console.log(`4Runner Atlas: http://127.0.0.1:${port}/`));
