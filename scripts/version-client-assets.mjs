import {createHash} from 'node:crypto';

function rewriteModuleURLs(text,rewrite){
  let output='',start=0;
  for(let i=0;i<text.length;i++){
    if(text.startsWith('//',i)){const end=text.indexOf('\n',i+2);i=end<0?text.length:end;continue;}
    if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+1;continue;}
    const quote=text[i];if(!['"',"'",'`'].includes(quote))continue;
    let end=i+1;while(end<text.length){if(text[end]==='\\'){end+=2;continue;}if(text[end]===quote)break;end++;}
    if(quote!=='`'&&/\b(?:from\s*|import\s*(?:\(\s*)?)$/.test(text.slice(Math.max(0,i-100),i))){
      output+=text.slice(start,i+1)+rewrite(text.slice(i+1,end))+quote;start=end+1;
    }
    i=end;
  }
  return output+text.slice(start);
}

// A graph-wide token keeps shared modules at one URL across all import paths.
// Inputs are original client files, before generated URL rewriting/compression.
export function versionClientAssets(files){
  const names=[...files.keys()].filter(name=>!name.endsWith('.html')).sort();
  const hash=createHash('sha256').update('atlas-client-urls-v1\0');
  for(const name of names){const bytes=Buffer.from(files.get(name));hash.update(name+'\0'+bytes.length+'\0');hash.update(bytes);}
  const version=hash.digest('hex').slice(0,20),assets=new Set(names),output=new Map(files);
  function versionURL(url,owner,{required=false}={}){
    if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url))return url;
    const parsed=new URL(url,'https://atlas.invalid/'+owner);
    const target=decodeURIComponent(parsed.pathname.slice(1));
    if(!assets.has(target)){
      if(required&&/\.js$/.test(parsed.pathname))throw Error('Missing local client module '+url+' in '+owner);
      return url;
    }
    parsed.searchParams.set('v',version);
    return url.split(/[?#]/,1)[0]+parsed.search+parsed.hash;
  }
  for(const [name,bytes] of files){
    if(!/\.(html|js|css)$/.test(name))continue;
    let text=Buffer.from(bytes).toString('utf8');
    if(name.endsWith('.html')){
      text=text.split(/(<!--[\s\S]*?-->)/).map(piece=>piece.startsWith('<!--')?piece:piece.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,(match,attr,quote,url)=>/\.(js|css)(?:[?#]|$)/.test(url)?`${attr}=${quote}${versionURL(url,name)}${quote}`:match)).join('');
    }else if(name.endsWith('.js')){
      text=rewriteModuleURLs(text,url=>{
        if(!url.startsWith('.')&&!url.startsWith('/'))return url;
        return versionURL(url,name,{required:true});
      });
    }else{
      text=text.split(/(\/\*[\s\S]*?\*\/)/).map(piece=>{
        if(piece.startsWith('/*'))return piece;
        return piece.replace(/url\(\s*(["']?)([^\s)'"\n]+)\1\s*\)/gi,(match,quote,url)=>`url(${quote}${versionURL(url,name)}${quote})`).replace(/(@import\s*)(["'])([^"']+)\2/gi,(match,prefix,quote,url)=>prefix+quote+versionURL(url,name)+quote);
      }).join('');
    }
    output.set(name,Buffer.from(text));
  }
  return {version,files:output};
}
