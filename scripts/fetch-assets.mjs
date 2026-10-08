import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {verifiedCache,downloadAsset} from './asset-download.mjs';
const lock=JSON.parse(await readFile('assets-lock.json','utf8'));
for(const [name,record] of Object.entries(lock.files)){
  const destination=path.resolve('data',name);
  if(!destination.startsWith(path.resolve('data')+path.sep))throw Error('Invalid asset path');
  if(await verifiedCache(destination,record))continue;
  try{await downloadAsset(new URL(name,lock.baseURL),destination,record);}
  catch(error){throw Error(`Asset download failed: ${name}. ${error.message}`,{cause:error});}
  console.log('Downloaded',name);
}
console.log('Public viewer assets verified. Run npm start.');
