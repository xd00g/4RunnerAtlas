import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {versionClientAssets} from './version-client-assets.mjs';
const lock=JSON.parse(await readFile('assets-lock.json','utf8'));
for(const [name,record] of Object.entries(lock.files)){
 const bytes=await readFile(path.join('data',name)).catch(()=>{throw Error('Missing viewer assets. Run npm run assets first.');});
 if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Asset version mismatch: '+name);
}
async function collect(dir,files=new Map()){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())await collect(file,files);
  else if(entry.isFile())files.set(path.relative('src',file).split(path.sep).join('/'),await readFile(file));
 }
 return files;
}
const versioned=versionClientAssets(await collect('src'));
await mkdir('dist',{recursive:true});
for(const [name,bytes] of versioned.files){
 await mkdir(path.dirname(path.join('dist',name)),{recursive:true});
 await writeFile(path.join('dist',name),bytes);
}
for(const name of Object.keys(lock.files)){await mkdir(path.dirname(path.join('dist',name)),{recursive:true});await cp(path.join('data',name),path.join('dist',name));}
console.log('Static viewer written to dist/. Client asset version: '+versioned.version+'. Serve it through HTTP.');
