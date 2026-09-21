import {normalize, scopeTrail} from './catalog.js';

// Native disclosure, search input and buttons keep normal Tab/screen-reader behavior.
export function createViewPicker(root, scopes, onSelect) {
  const summary=root.querySelector('summary');
  const current=root.querySelector('#scope-current');
  const search=root.querySelector('#view-search');
  const clear=root.querySelector('#view-search-clear');
  const count=root.querySelector('#view-count');
  const empty=root.querySelector('#view-empty');
  const list=root.querySelector('#view-options');
  const definitions=new Map(scopes.map(entry=>[entry.id,entry]));
  const close=(restoreFocus=false)=>{
    root.open=false;
    if(restoreFocus)summary.focus({preventScroll:true});
  };
  const options=scopes.map(entry=>{
    const path=scopeTrail(entry.id,definitions).slice(0,-1).map(parent=>parent.label).join(' / ');
    const button=document.createElement('button');
    button.type='button';button.id=`scope-${entry.id}`;button.dataset.scope=entry.id;
    const label=document.createElement('span');label.textContent=entry.label;button.append(label);
    if(path){const context=document.createElement('small');context.textContent=path;button.append(context);}
    button.addEventListener('click',()=>{close(true);onSelect(entry.id);});
    list.append(button);
    return {button,text:normalize([entry.label,entry.title,path].join(' '))};
  });
  const visible=()=>options.map(option=>option.button).filter(button=>!button.hidden);
  function filter(){
    const words=normalize(search.value).split(' ');
    for(const option of options)option.button.hidden=!words.every(word=>option.text.includes(word));
    const total=visible().length;
    count.textContent=search.value.trim()?`${total} of ${scopes.length} views`:`${scopes.length} views`;
    clear.hidden=!search.value;empty.hidden=total!==0;list.scrollTop=0;
  }
  search.addEventListener('input',filter);
  clear.addEventListener('click',()=>{search.value='';filter();search.focus();});
  root.addEventListener('toggle',()=>{
    if(!root.open)return;
    search.value='';filter();search.focus({preventScroll:true});
    const active=list.querySelector('[aria-current="page"]');
    if(active)list.scrollTop=Math.max(0,active.offsetTop-list.offsetTop-list.clientHeight/3);
  });
  root.addEventListener('keydown',event=>{
    // Picker navigation must not also trigger the viewer's F/I/H/Escape shortcuts.
    event.stopPropagation();
    if(event.key==='Escape'&&root.open){event.preventDefault();close(true);return;}
    if(!root.open){if(event.key==='ArrowDown'){event.preventDefault();root.open=true;}return;}
    const buttons=visible(),index=buttons.indexOf(event.target);
    if(event.target===search&&event.key==='Enter'){event.preventDefault();buttons[0]?.click();return;}
    if(event.key==='ArrowDown'&&(event.target===search||index>=0)){
      event.preventDefault();buttons[Math.min(index+1,buttons.length-1)]?.focus();
    }else if(event.key==='ArrowUp'&&index>=0){
      event.preventDefault();(buttons[index-1]||search).focus();
    }else if(index>=0&&(event.key==='Home'||event.key==='End')){
      event.preventDefault();buttons[event.key==='Home'?0:buttons.length-1]?.focus();
    }
  });
  root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget))close();});
  document.addEventListener('pointerdown',event=>{if(root.open&&!root.contains(event.target))close(true);});
  filter();
  return {
    setCurrent(id){
      const entry=definitions.get(id);if(!entry)return;
      current.textContent=entry.label;
      for(const {button} of options){
        if(button.dataset.scope===id)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
    }
  };
}
