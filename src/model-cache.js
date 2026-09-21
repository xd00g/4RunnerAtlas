// Persistent cache for self-contained, content-hashed GLBs only.
// Bound decoded storage to 128 MiB / 8 models; network loading remains the fallback.
const NAME='4runner-atlas-models-v1',LIMIT=128*1024*1024,COUNT=8;
async function store(cache,url,bytes){
 if(bytes.byteLength>LIMIT)return;
 const base=new URL(url).pathname.replace(/\.[a-f0-9]{16}\.glb$/,'.glb');
 for(const request of await cache.keys())if(request.url!==url&&new URL(request.url).pathname.replace(/\.[a-f0-9]{16}\.glb$/,'.glb')===base)await cache.delete(request);
 await cache.put(url,new Response(bytes,{headers:{'Content-Type':'model/gltf-binary','X-Atlas-Bytes':String(bytes.byteLength)}}));
 const entries=[];for(const request of await cache.keys()){const response=await cache.match(request);entries.push({request,size:Number(response.headers.get('X-Atlas-Bytes'))||LIMIT});}
 let total=entries.reduce((n,e)=>n+e.size,0);while(entries.length>COUNT||total>LIMIT){const e=entries.shift();await cache.delete(e.request);total-=e.size;}
}
export async function loadModel(model,Loader){
 const url=new URL(model,location.href).href,eligible=new URL(url).origin===location.origin&&/\.[a-f0-9]{16}\.glb$/.test(new URL(url).pathname);let cache=null;
 if(eligible)try{if(globalThis.caches)cache=await caches.open(NAME);}catch{/* Private browsing or storage policy: use HTTP. */}
 if(cache)try{const response=await cache.match(url);if(response){const bytes=await response.arrayBuffer();try{return await new Loader().parseAsync(bytes,new URL('.',url).href);}catch{await cache.delete(url);}}}catch{/* A damaged/unavailable cache must not block the viewer. */}
 const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw new Error('Model unavailable: '+response.status);const bytes=await response.arrayBuffer(),gltf=await new Loader().parseAsync(bytes,new URL('.',url).href);
 if(cache)try{await store(cache,url,bytes);}catch{/* Quota pressure leaves the successfully loaded model usable. */}
 return gltf;
}
