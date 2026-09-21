import {cp,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const lock=JSON.parse(await readFile('assets-lock.json','utf8'));
for(const [name,record] of Object.entries(lock.files)){
 const bytes=await readFile(path.join('data',name)).catch(()=>{throw Error('Missing viewer assets. Run npm run assets first.');});
 if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Asset version mismatch: '+name);
}
await mkdir('dist',{recursive:true});await cp('src','dist',{recursive:true});
for(const name of Object.keys(lock.files)){await mkdir(path.dirname(path.join('dist',name)),{recursive:true});await cp(path.join('data',name),path.join('dist',name));}
console.log('Static viewer written to dist/. Serve it through HTTP.');
