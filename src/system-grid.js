// Floor grid in model coordinates. Slots remain stable when parts are hidden.
// Real bounds determine row/column spacing; geometry and orientation stay intact.
export function planSystemGrid(parts){
  if(!parts.length)return new Map();
  for(const p of parts)if(![p.width,p.depth,p.height].every(n=>Number.isFinite(n)&&n>=0))throw new Error(`Invalid grid bounds: ${p.id}`);
  const columns=Math.ceil(Math.sqrt(parts.length)),rows=Math.ceil(parts.length/columns);
  const largest=Math.max(...parts.flatMap(p=>[p.width,p.depth,p.height]));
  const gap=Math.max(largest*.16,.035),widths=Array(columns).fill(0),depths=Array(rows).fill(0);
  parts.forEach((p,i)=>{widths[i%columns]=Math.max(widths[i%columns],p.width);depths[Math.floor(i/columns)]=Math.max(depths[Math.floor(i/columns)],p.depth);});
  const centers=sizes=>{const total=sizes.reduce((a,b)=>a+b,0)+gap*(sizes.length-1);let cursor=-total/2;return sizes.map(n=>{const c=cursor+n/2;cursor+=n+gap;return c;});};
  const xs=centers(widths),zs=centers(depths);
  return new Map(parts.map((p,i)=>[p.id,[xs[i%columns],p.height/2,zs[Math.floor(i/columns)]]]));
}
