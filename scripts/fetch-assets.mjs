import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const lock=JSON.parse(await readFile('assets-lock.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [name,record] of Object.entries(lock.files)){
  const destination=path.resolve('data',name);
  if(!destination.startsWith(path.resolve('data')+path.sep))throw Error('Invalid asset path');
  try{if(hash(await readFile(destination))===record.sha256)continue;}catch{}
  const response=await fetch(new URL(name,lock.baseURL),{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Asset unavailable: ${name} (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error(`Asset version mismatch: ${name}. Update the asset lock with the matching viewer release.`);
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination+'.tmp',bytes);await rename(destination+'.tmp',destination);
  console.log('Downloaded',name);
}
console.log('Public viewer assets verified. Run npm start.');
