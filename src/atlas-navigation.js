import {matchesPart, normalize, scopeTrail} from './catalog.js';

export const ATLAS_FAMILIES = [
  {id:'body', label:'Body & cabin'},
  {id:'engine', label:'Engine'},
  {id:'drivetrain', label:'Drivetrain'},
  {id:'chassis', label:'Chassis'},
  {id:'brakes', label:'Brakes'},
  {id:'electrical', label:'Electrical'}
];

export function displayScopeDescription(value) {
  return String(value||'').replace(/\s*[·•|,–-]\s*\d+\s+(?:component groups|assemblies|parts|meshes)\s*$/i,'').trim();
}

const rootFamilies = {
  body: new Set(['vehicle','engine-skid','air-conditioning-front','cabin-climate','cabin-interior','door-left-front-components','door-left-rear-components','door-right-front-components','door-right-rear-components','tailgate-components','wiper-mechanisms','hood-latch-supports']),
  engine: new Set(['engine','volant-18747-intake','cooling-system','fuel-system','exhaust-system','engine-bay-services','power-steering-pump','evap-system']),
  drivetrain: new Set(['powertrain-layout','front-driveline','rear-propeller-shaft','transfer-case-system','transmission-system','rear-axle']),
  chassis: new Set(['front-left','front-right','rear-suspension','steering-system','wheel-left-front','wheel-right-front','wheel-left-rear','wheel-right-rear']),
  brakes: new Set(['brake-hydraulics-abs','parking-brake-actuation','front-left-brake','front-right-brake','rear-brake-left','rear-brake-right','front-brake-calipers','rear-brake-calipers','rear-parking-brake-shoes','brake-pedal-support']),
  electrical: new Set(['lighting','factory-lamp-assemblies','electrical-distribution','ignition-coils-plugs','secondary-air-injection','alternator-internals','starter-internals'])
};

export function familyForScope(id, definitions) {
  const seen=new Set();
  while(id&&definitions.has(id)){
    if(seen.has(id))throw new Error('Cyclic atlas family navigation');
    seen.add(id);
    for(const family of ATLAS_FAMILIES)if(rootFamilies[family.id].has(id))return family.id;
    id=definitions.get(id).parentScopeId;
  }
  return 'body';
}

export function createAtlasNavigation({scopes, onScope, onPart, onAssembly, onChildren, onIsolateAssembly, onOpenParts, onPanelChange, onOpenDrawer, onCloseDesktop, onRefresh, isReady}) {
  const $=id=>document.getElementById(id);
  const definitions=new Map(scopes.map(entry=>[entry.id,entry]));
  const aside=$('assembly-sidebar'), body=$('atlas-drawer-body'), title=$('atlas-drawer-title');
  const families=$('atlas-families'), search=$('atlas-search'), results=$('atlas-search-results');
  const calloutRoot=$('atlas-callouts');
  let currentScope='vehicle', manifest=null, selected=null, previousSelection=null, catalog=[], numberSources={};
  let activeFamily='engine', panel='overview', resultItems=[], searchOpen=false, firstSync=true;
  let callouts=[];
  const panelBack=button('System overview',()=>{
    if(panel==='selection'){onAssembly(null);setPanel('parts',{focus:true});}
    else {renderOverview();setPanel('overview',{focus:true});}
  },'atlas-panel-back');
  panelBack.id='atlas-panel-back';panelBack.hidden=true;title.parentElement.append(panelBack);

  function button(label, action, className='') {
    const element=document.createElement('button');element.type='button';element.textContent=label;
    if(className)element.className=className;
    element.addEventListener('click',action);return element;
  }
  function paragraph(text, className='') {
    const element=document.createElement('p');element.textContent=text;if(className)element.className=className;return element;
  }
  function setPanel(next,{focus=false,open=false}={}) {
    panel=next;aside.dataset.atlasPanel=next;
    panelBack.hidden=next==='overview';
    panelBack.textContent=next==='selection'?'Back to components':'System overview';
    if(open||focus){onOpenDrawer?.();aside.classList.add('atlas-open');}
    $('atlas-drawer-toggle').setAttribute('aria-expanded',String(aside.classList.contains('atlas-open')));
    onPanelChange?.(next);
    if(focus)title.focus({preventScroll:true});
  }
  function setCurrentFamily(next) {
    activeFamily=next;
    for(const child of families.querySelectorAll('[data-family]')){
      const active=child.dataset.family===next;
      child.setAttribute('aria-pressed',String(active));
      if(active)child.scrollIntoView?.({block:'nearest',inline:'nearest'});
    }
  }
  function renderFamilies() {
    families.replaceChildren();
    families.setAttribute('aria-label','Browse vehicle systems');
    for(const family of ATLAS_FAMILIES){
      const tab=button(family.label,async()=>{
        if(!isReady())return;
        if(currentScope!=='vehicle')await onScope('vehicle');
        if(currentScope!=='vehicle')return;
        onAssembly(null);
        setCurrentFamily(family.id);selected=null;renderCallouts();renderOverview();setPanel('overview',{focus:true});
      },'atlas-family');
      tab.dataset.family=family.id;families.append(tab);
    }
    setCurrentFamily(activeFamily);
  }
  function scopeButton(entry, label=entry.label) {
    const row=button(label,()=>{onScope(entry.id);setPanel('overview');},'atlas-scope-row');
    const parent=scopeTrail(entry.id,definitions).slice(0,-1).map(item=>item.label).join(' / ');
    row.dataset.scope=entry.id;
    row.dataset.atlasScope=entry.id;
    if(parent&&parent!=='Whole vehicle'){
      const small=document.createElement('small');small.textContent=parent;row.append(small);
    }
    return row;
  }
  function matchingScopes(family) {
    return scopes.filter(entry=>entry.id!=='vehicle'&&familyForScope(entry.id,definitions)===family);
  }
  function appendScopeList(entries, limit=Infinity) {
    const list=document.createElement('div');list.className='atlas-scope-list';
    for(const entry of entries.slice(0,limit))list.append(scopeButton(entry));
    body.append(list);
  }
  function setCalloutItems(items) {
    callouts=items.slice(0,5);
    if(!calloutRoot)return;
    calloutRoot.replaceChildren();
    for(const item of callouts){
      const target=button(item.label,()=>item.scope?onScope(item.scope):onAssembly(item.id),'atlas-callout');
      target.dataset.assembly=item.id;target.setAttribute('aria-label',`Inspect ${item.label}`);
      calloutRoot.append(target);
    }
    onRefresh?.();
  }
  function currentRecords(){return manifest?.assemblies||[];}
  function previewPart(record, targetScope=currentScope) {
    const card=catalog.find(entry=>entry.record.id===record.id)?.card||{};
    const row=button(record.name,()=>{
      if(targetScope===currentScope)onAssembly(record.id);
      else onPart({scope:targetScope,scopeLabel:definitions.get(targetScope)?.label||targetScope,record,card});
    },'atlas-preview-part');
    row.dataset.atlasPart=record.id;
    const plain=(card.function||record.description||'Inspect component group').split(/(?<=[.!?])\s/)[0];
    const small=document.createElement('small');small.textContent=plain.length>125?`${plain.slice(0,122).trimEnd()}…`:plain;row.append(small);
    return row;
  }
  function renderOverview() {
    body.replaceChildren();
    const entry=definitions.get(currentScope);
    const family=ATLAS_FAMILIES.find(item=>item.id===activeFamily);
    if(currentScope==='vehicle'){
      title.textContent=selected?selected.name:family.label;
      const child=selected?onChildren?.(selected.id)?.[0]||null:null;
      if(child){
        body.append(paragraph(displayScopeDescription(child.description)||selected.description||'', 'atlas-summary'));
        body.append(button(`Open ${child.label.toLowerCase()} ${child.label.toLowerCase().includes('system')?'':'system'} →`,()=>onScope(child.id),'atlas-primary'));
        body.append(button('Read assembly details →',()=>setPanel('selection',{focus:true}),'atlas-more'));
        body.append(button('Isolate in vehicle',()=>onIsolateAssembly?.(selected.id),'atlas-more'));
        const targetRecords=catalog.filter(item=>item.scope===child.id).map(item=>item.record);
        if(targetRecords.length){
          const heading=document.createElement('h3');heading.textContent=`${targetRecords.length} component groups`;body.append(heading);
          const preview=child.id==='cooling-system'?
            ['cooling.radiator','cooling.fan','cooling.fan-shroud'].map(id=>targetRecords.find(record=>record.id===id)).filter(Boolean):targetRecords.slice(0,3);
          for(const record of preview)body.append(previewPart(record,child.id));
        }
        if(child.id==='cooling-system'){
          const related=definitions.get('engine-coolant-circulation');
          if(related){const heading=document.createElement('h3');heading.textContent='Related study';body.append(heading,scopeButton(related,'Water pump and thermostat · Engine'));}
          body.append(paragraph('Cooling geometry is illustrative. Pump and thermostat are separate Engine studies; installed fitment remains unverified.','atlas-qualification'));
        }
        if(child.coverageNote&&child.id!=='cooling-system')body.append(paragraph(child.coverageNote,'atlas-qualification'));
      }else if(selected){
        body.append(paragraph(selected.description||'Select the assembly to inspect its known details and sources.'));
        body.append(button('Read assembly details →',()=>setPanel('selection',{focus:true}),'atlas-primary'));
      }else{
        body.append(paragraph(`Browse ${family.label.toLowerCase()} systems or select a callout on the vehicle. Every study stays available in the catalog.`, 'atlas-summary'));
        const heading=document.createElement('h3');heading.textContent='Explore on the model';body.append(heading);
        const featured=callouts;
        for(const item of featured)body.append(button(item.label,()=>item.scope?onScope(item.scope):onAssembly(item.id),'atlas-preview-part'));
      }
      if(!selected){
        const familyEntries=matchingScopes(activeFamily);
        const all=button('Browse vehicle assemblies →',()=>{onOpenParts?.();setPanel('parts',{focus:true});},'atlas-more');
        all.id='atlas-show-parts';body.append(all);
        const heading=document.createElement('h3');heading.textContent=`${family.label} · ${familyEntries.length} views`;body.append(heading);
        appendScopeList(familyEntries);
      }else{
        const destination=child?familyForScope(child.id,definitions):activeFamily;
        const familyName=ATLAS_FAMILIES.find(item=>item.id===destination)?.label||'vehicle';
        body.append(button(`Browse ${familyName} systems →`,()=>{
          onAssembly(null);setCurrentFamily(destination);renderCallouts();renderOverview();setPanel('overview',{focus:true});
        },'atlas-more'));
      }
    }else{
      title.textContent=entry?.title||'Components';
      body.append(paragraph(displayScopeDescription(entry?.description)||'Inspect the modeled component groups.','atlas-summary'));
      const open=button('Open components →',()=>{onOpenParts?.();setPanel('parts',{focus:true});},'atlas-primary');
      open.id='atlas-show-parts';body.append(open);
      const records=currentRecords();
      const heading=document.createElement('h3');heading.textContent=`${records.length} component groups`;body.append(heading);
      for(const record of records.slice(0,5))body.append(previewPart(record));
      if(records.length>5)body.append(button(`View all ${records.length} components →`,()=>{onOpenParts?.();setPanel('parts',{focus:true});},'atlas-more'));
      const children=scopes.filter(item=>item.parentScopeId===currentScope);
      if(children.length){const subheading=document.createElement('h3');subheading.textContent='Deeper studies';body.append(subheading);appendScopeList(children);}
      if(entry?.coverageNote)body.append(paragraph(entry.coverageNote,'atlas-qualification'));
    }
  }
  function refreshOverviewPreservingFocus() {
    const active=document.activeElement;
    const focused=body.contains(active)?{
      id:active.id,scope:active.dataset?.atlasScope,part:active.dataset?.atlasPart,
      text:active.textContent?.trim()
    }:null;
    renderOverview();
    if(!focused)return;
    const choices=[...body.querySelectorAll('button')];
    const replacement=choices.find(item=>focused.id&&item.id===focused.id)||
      choices.find(item=>focused.scope&&item.dataset.atlasScope===focused.scope)||
      choices.find(item=>focused.part&&item.dataset.atlasPart===focused.part)||
      choices.find(item=>item.textContent.trim()===focused.text);
    (replacement||title).focus({preventScroll:true});
  }
  function renderCallouts() {
    const records=currentRecords();
    const byFamily={
      body:[{id:'cabin',label:'Cabin'},{id:'body-shell',label:'Body'},{id:'hood',label:'Hood'}],
      engine:[{id:'cooling',label:'Cooling'},{id:'engine',label:'Engine'},{id:'cabin',label:'Cabin'}],
      drivetrain:[{id:'transmission',label:'Transmission'},{id:'transfer-case',label:'Transfer case'},{id:'drive-front',label:'Front driveline'}],
      chassis:[{id:'suspension-front-left',label:'Front suspension'},{id:'steering',label:'Steering'},{id:'suspension-rear',label:'Rear suspension'}],
      brakes:[{id:'suspension-front-left',label:'Front brake',scope:'front-left-brake'},{id:'rear-axle',label:'Rear brake',scope:'rear-brake-left'},{id:'parking-brake-system',label:'Parking brake',scope:'parking-brake-actuation'}],
      electrical:[{id:'engine-alternator',label:'Alternator',scope:'alternator-internals'},{id:'engine-starter',label:'Starter',scope:'starter-internals'},{id:'body-shell',label:'Lighting',scope:'lighting'}]
    };
    const desired=currentScope==='vehicle'?byFamily[activeFamily]:[];
    setCalloutItems(desired.filter(item=>records.some(record=>record.id===item.id)));
  }
  function renderBreadcrumb() {
    const trail=scopeTrail(currentScope,definitions);
    const nav=$('scope-trail');nav.replaceChildren();
    for(const item of trail){
      const crumb=button(item.label,()=>onScope(item.id));crumb.dataset.breadcrumbScope=item.id;
      if(item.id===currentScope){crumb.setAttribute('aria-current','page');crumb.disabled=true;}
      nav.append(crumb);
    }
    $('component-breadcrumb').hidden=false;
    $('scope-parent').hidden=currentScope==='vehicle';
    $('scope-parent').textContent=`↑ ${trail.at(-2)?.label||'Whole vehicle'}`;
    $('atlas-home').hidden=currentScope==='vehicle';
  }
  function addResult(kind,label,detail,action,qualification='',identity='') {
    const row=button('',()=>{hideSearch();action();},'atlas-search-result');
    row.setAttribute('role','option');
    row.dataset.atlasResultType=kind.toLowerCase();
    row.dataset.atlasResultKey=identity||`${kind}:${label}:${detail}`;
    const type=document.createElement('strong');type.textContent=kind;
    const name=document.createElement('span');name.textContent=label;
    const context=document.createElement('small');context.textContent=detail;
    row.append(type,name,context);
    if(qualification){const note=document.createElement('small');note.className='atlas-qualification';note.textContent=qualification;row.append(note);}
    results.append(row);resultItems.push(row);
  }
  function searchResults() {
    const focusedKey=document.activeElement?.dataset?.atlasResultKey;
    const query=normalize(search.value),words=query.split(' ').filter(Boolean);
    results.replaceChildren();resultItems=[];
    if(!words.length){results.hidden=true;searchOpen=false;return;}
    const matches=text=>words.every(word=>normalize(text).includes(word));
    const systems=scopes.filter(item=>matches([item.label,item.title,item.description||'',scopeTrail(item.id,definitions).map(node=>node.label).join(' ')].join(' ')));
    const partRank=item=>{
      const id=normalize(item.record.id),name=normalize(item.record.name);
      const numbers=[item.card.partNumber?.value,item.record.oemPartNumber,item.record.supplierPartNumber].map(normalize);
      if(id===query)return 0;
      if(name===query)return 1;
      if(numbers.includes(query))return 2;
      if(id.startsWith(query)||name.startsWith(query))return 3;
      return 4;
    };
    const parts=catalog.filter(item=>matchesPart(item.record,query,item.card)).sort((a,b)=>partRank(a)-partRank(b));
    const appendPart=item=>addResult('Part',item.record.name,item.scopeLabel,()=>onPart(item),item.card.partNumber?.value?`Installed / supplier: ${item.card.partNumber.value} · ${item.card.partNumber.status||'status unverified'}`:'',`part:${item.scope}:${item.record.id}`);
    const exactParts=parts.filter(item=>partRank(item)<=2).slice(0,35);
    for(const item of exactParts)appendPart(item);
    for(const item of systems.slice(0,25))addResult('System',item.label,scopeTrail(item.id,definitions).map(node=>node.label).join(' / '),()=>onScope(item.id),'',`system:${item.id}`);
    for(const item of parts.filter(item=>partRank(item)>2).slice(0,35-exactParts.length))appendPart(item);
    if(/\d/.test(query)){
      let count=0;
      for(const item of catalog){
        const ids=[...new Set([...(item.card.numberReferenceIds||[]),...(item.card.oemReferenceIds||[])])];
        for(const id of ids){
          const source=numberSources[id];if(!source)continue;
          let heading='';
          for(const [rowIndex,row] of (source.rows||[]).entries()){
            if(row.heading){heading=row.heading;continue;}
            if(!row.number||!matches(`${row.number} ${row.label||''}`))continue;
            const qualification=item.card.oemContext||'Historical factory reference; variant and replacement fitment unverified';
            const context=[source.source,source.status,heading,row.note,qualification].filter(Boolean).join(' · ');
            addResult('OEM',row.number,`${row.label||source.title} · ${item.record.name}`,()=>onPart(item),context,`oem:${item.scope}:${item.record.id}:${id}:${rowIndex}`);
            if(++count>=25)break;
          }
          if(count>=25)break;
        }
        if(count>=25)break;
      }
    }
    if(!resultItems.length)results.append(paragraph('No matching system, modeled part, or supported OEM reference.'));
    results.hidden=false;searchOpen=true;search.setAttribute('aria-expanded','true');
    if(focusedKey)(resultItems.find(item=>item.dataset.atlasResultKey===focusedKey)||search).focus({preventScroll:true});
  }
  function hideSearch(){results.hidden=true;searchOpen=false;search.setAttribute('aria-expanded','false');}
  search.addEventListener('input',searchResults);
  search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideSearch();search.focus();event.stopPropagation();}
    if(event.key==='Enter'&&resultItems.length){event.preventDefault();resultItems[0].click();}
    if(event.key==='ArrowDown'&&resultItems.length){event.preventDefault();resultItems[0].focus();}
  });
  results.addEventListener('keydown',event=>{
    const index=resultItems.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideSearch();search.focus();}
    if(event.key==='ArrowDown'&&index>=0){event.preventDefault();resultItems[Math.min(index+1,resultItems.length-1)].focus();}
    if(event.key==='ArrowUp'&&index>=0){event.preventDefault();(resultItems[index-1]||search).focus();}
  });
  document.addEventListener('pointerdown',event=>{if(searchOpen&&!results.contains(event.target)&&event.target!==search)hideSearch();});
  $('atlas-home').addEventListener('click',()=>onScope('vehicle'));
  $('atlas-drawer-toggle').addEventListener('click',()=>{
    onOpenDrawer?.();
    aside.classList.toggle('atlas-open');
    const open=aside.classList.contains('atlas-open');
    $('atlas-drawer-toggle').setAttribute('aria-expanded',String(open));
    $('atlas-drawer-toggle').textContent=open?'Collapse details':'Expand details';
    if(open)title.focus({preventScroll:true});
  });
  $('atlas-drawer-close').addEventListener('click',()=>{
    if(matchMedia('(max-width: 760px)').matches){
      aside.classList.remove('atlas-open');$('atlas-drawer-toggle').setAttribute('aria-expanded','false');
      $('atlas-drawer-toggle').textContent='Expand details';
      $('atlas-drawer-toggle').focus({preventScroll:true});
    }else{
      onCloseDesktop?.();$('toggle-sidebar').focus({preventScroll:true});
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')&&matchMedia('(max-width: 760px)').matches&&aside.classList.contains('atlas-open')&&!searchOpen){
      event.preventDefault();event.stopImmediatePropagation();
      aside.classList.remove('atlas-open');$('atlas-drawer-toggle').setAttribute('aria-expanded','false');
      $('atlas-drawer-toggle').textContent='Expand details';$('atlas-drawer-toggle').focus({preventScroll:true});
    }
  });
  matchMedia('(max-width: 760px)').addEventListener('change',event=>{
    if(event.matches&&aside.hidden){onOpenDrawer?.();aside.classList.remove('atlas-open');}
  });
  renderFamilies();
  return {
    setCatalog(nextCatalog,nextNumberSources){catalog=nextCatalog;numberSources=nextNumberSources;refreshOverviewPreservingFocus();if(search.value)searchResults();},
    sync({scope,scopeManifest,selection,scopeChanged=false}){
      if(!scopeChanged&&scope===currentScope&&scopeManifest===manifest&&selection===previousSelection)return;
      const initial=firstSync;firstSync=false;
      currentScope=scope;manifest=scopeManifest;selected=selection?scopeManifest?.assemblies.find(item=>item.id===selection)||null:null;
      if(scopeChanged){if(scope!=='vehicle')setCurrentFamily(familyForScope(scope,definitions));panel='overview';}
      renderCallouts();renderBreadcrumb();renderOverview();
      const hasChild=selected&&scope==='vehicle'&&Boolean(onChildren?.(selected.id)?.length);
      if(selected&&!hasChild)setPanel('selection',{open:scopeChanged||previousSelection!==selection});
      else if(hasChild)setPanel('overview',{open:scopeChanged||previousSelection!==selection});
      else setPanel(panel==='selection'?'overview':panel,{open:scopeChanged&&(!initial||scope!=='vehicle')});
      previousSelection=selection;
    },
    showOverview(){renderOverview();setPanel('overview',{focus:true});},
    showParts(){setPanel('parts',{focus:true});},
    updateCalloutPositions(project){
      if(!calloutRoot||!isReady())return;
      const placed=[],bounds=calloutRoot.getBoundingClientRect();
      for(const button of calloutRoot.querySelectorAll('[data-assembly]')){
        const point=project(button.dataset.assembly);
        if(!point?.visible){button.hidden=true;continue;}
        button.hidden=false;
        const width=button.offsetWidth||100,height=button.offsetHeight||40;
        const preferred=button.dataset.assembly==='cooling'?[[-width-24,-50],[-width-20,12],[24,-58]]:
          button.dataset.assembly==='engine'?[[28,-105],[25,-55],[-width-24,-110]]:
          button.dataset.assembly==='cabin'?[[30,-80],[-width-22,-82],[30,10]]:
          [[22,-65],[-width-22,-65],[22,10]];
        let position=null;
        for(const [dx,dy] of preferred){
          const x=Math.max(8,Math.min(bounds.width-width-8,point.x+dx));
          const y=Math.max(8,Math.min(bounds.height-height-8,point.y+dy));
          const rect={left:x,top:y,right:x+width,bottom:y+height};
          if(placed.every(other=>rect.right+8<other.left||rect.left>other.right+8||rect.bottom+8<other.top||rect.top>other.bottom+8)){position=rect;break;}
        }
        if(!position){button.hidden=true;continue;}
        placed.push(position);button.style.left=`${position.left}px`;button.style.top=`${position.top}px`;
      }
    }
  };
}
