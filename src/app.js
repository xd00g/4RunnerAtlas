import {setSidebarVisible} from './reading-controls.js';
import {loadModel} from './model-cache.js';
import {Scene, Color, Vector3, Vector2, Box3, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, GLTFLoader, OrbitControls, Raycaster} from './vendor/three-bridge.js';
import {matchesPart, indexCatalog, scopeTrail} from './catalog.js';
import {createNightView} from './night-view.js';
import {planSystemGrid} from './system-grid.js';
import {createViewPicker} from './view-picker.js';
import {createEngineMotion} from './engine-motion.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let nightPreference=new URL(location.href).searchParams.get('night')==='1';
const defaults = () => ({selection:null, hidden:new Set(), isolate:false, xray:false, labels:false, explosion:0, amount:0, configuration:'4wd', search:'', searchArea:'truck', system:'all', view:'perspective', layout:'spatial', grid:0, gridAmount:0, night:nightPreference});
const state = {...defaults(), ready:false};
let assemblies = new Map();
let scope=null,requestedScope=null,loadVersion=0,routeVersion=0;
const datasets=new Map(),snapshots=new Map();
const siteConfig=await fetch('site-config.json').then(r=>r.json());
for(const link of document.querySelectorAll('.manual-link'))link.hidden=!siteConfig.manualAvailable;
const comparison=document.querySelector('a[href="source-model.html"]');if(comparison)comparison.hidden=!siteConfig.localReferences;
const registryResponse=await fetch('scopes.json');
if(!registryResponse.ok)throw new Error('Model scope registry unavailable');
const scopeRegistry=(await registryResponse.json()).scopes;
const scopeDefinitions=new Map(scopeRegistry.map(entry=>[entry.id,entry]));
const scopeFiles=Object.fromEntries(scopeRegistry.map(entry=>[entry.id,entry.manifest]));
const manifests=new Map();
let wholeCatalog=[],partCards={},numberSources={},catalogReady=false,catalogFailures=[];
function getManifest(id){
  if(!manifests.has(id))manifests.set(id,fetch(scopeFiles[id]).then(response=>{if(!response.ok)throw new Error('Catalog unavailable');return response.json();}).catch(error=>{manifests.delete(id);throw error;}));
  return manifests.get(id);
}
async function loadCatalog(){
  catalogReady=false;
  const results=await Promise.allSettled(scopeRegistry.map(async entry=>({scope:entry,manifest:await getManifest(entry.id)})));
  catalogFailures=results.flatMap((result,i)=>result.status==='rejected'?[scopeRegistry[i].label]:[]);
  try {const response=await fetch('part-cards.json');if(response.ok)partCards=(await response.json()).parts||{};} catch { /* Scope records remain usable without the photo supplement. */ }
  try{numberSources=(await fetch('number-sources.json').then(r=>r.json())).sources||{};}catch{}
  for(const card of Object.values(partCards))card.manualCandidateNumbers=[...new Set([...(card.numberReferenceIds||[]),...(card.oemReferenceIds||[])])].flatMap(id=>(numberSources[id]?.rows||[]).flatMap(row=>row.number?[row.number,row.number.replace(/[^a-z0-9]/gi,'')]:[]));
  wholeCatalog=indexCatalog(results.filter(result=>result.status==='fulfilled').map(result=>result.value),partCards);
  catalogReady=true;if(state.ready){updateList();updateSelection();}
}
const childScopes=id=>scopeRegistry.filter(entry=>manifest?.assemblies.find(p=>p.id===id)?.detailScopeIds?.includes(entry.id)||(entry.parentAssemblyId===id&&(entry.parentScopeId||'vehicle')===scope)||(scope==='vehicle'&&entry.id==='powertrain-layout'&&powertrainOwners.has(id)));
const isEngine=()=>scope==='engine';
const isDetail=()=>scope!=='vehicle';
const currentScope=()=>scopeDefinitions.get(scope);
const perspectiveDirection=()=>currentScope()?.cameraDirection||[6,3.5,7.5];
const noun=()=>isDetail()?'component':'assembly';
const plural=()=>isDetail()?'components':'assemblies';
const powertrainOwners=new Set(["engine", "transmission", "transfer-case", "drive-front", "drive-rear", "cooling", "exhaust", "rear-axle", "engine-starter", "engine-alternator", "engine-oil-pump"]);
const chassisOwners=new Set(['frame','rear-axle','suspension-front-left','suspension-front-right','suspension-rear','steering','drive-front','drive-rear','fuel','exhaust','transmission','transfer-case','parking-brake-system']);
const viewPicker=createViewPicker($('#view-picker'),scopeRegistry,id=>switchScope(id));
const viewport = $('#viewport');
const scene = new Scene();
const renderer = new WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x000000,0);
renderer.toneMapping = 4;
renderer.toneMappingExposure = 1.13;
viewport.appendChild(renderer.domElement);
const camera = new PerspectiveCamera(36,1,.05,100);
camera.position.set(6,3.7,7.5);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.10;
controls.minDistance=.55;
controls.maxDistance=30;
controls.target.set(0,.8,0);
controls.maxPolarAngle=Math.PI*.94;
const nightView=createNightView(scene);
let manifest,model,cameraMove=null,lastTime=0;
const raycaster=new Raycaster();
const pointer=new Vector2();
const labels=new Map();
const materialDefaults=new WeakMap();
let systems=[];
const emptySelection=$('#selection').innerHTML;
function announce(text){$('#announcement').textContent=text;}
const engineMotion=createEngineMotion($('#engine-motion'),{appearanceChanged:()=>{if(state.ready)updateAppearance();},announce});
function permitted(p){return p.configuration!=='4wd'||state.configuration!=='2wd';}
function visible(p){return permitted(p)&&!state.hidden.has(p.id)&&(!state.isolate||state.selection===p.id);}
function candidates(){return manifest.assemblies.filter(permitted);}
function matches(p){return matchesPart(p,state.search,partCards[p.id]);}
function updateList(){
  if(!state.ready)return;
  const list=$('#part-list');list.replaceChildren();
  const globalSearch=Boolean(state.search.trim())&&state.searchArea==='truck';
  $('#search-clear').hidden=!state.search;
  $('#system').disabled=globalSearch;
  const status=$('#catalog-status');status.replaceChildren();status.hidden=!globalSearch;
  if(globalSearch){
    const results=wholeCatalog.filter(entry=>matchesPart(entry.record,state.search,entry.card));
    $('#assembly-count').textContent=String(results.length);
    status.textContent=!catalogReady?'Loading the whole-truck catalog…':catalogFailures.length?`Some views are unavailable: ${catalogFailures.join(', ')}.`:`${results.length} matches across all modeled views`;
    if(catalogFailures.length){const retry=document.createElement('button');retry.textContent='Retry catalogs';retry.addEventListener('click',()=>{loadCatalog();updateList();});status.append(retry);}
    for(const entry of results){
      const row=document.createElement('div');row.className='part-row global-result'+(entry.scope===scope&&entry.record.id===state.selection?' selected':'');row.setAttribute('role','listitem');
      const button=document.createElement('button');button.dataset.resultPart=entry.record.id;button.dataset.resultScope=entry.scope;
      const name=document.createElement('span');name.className='part-name';name.textContent=entry.record.name;
      const location=document.createElement('small');location.textContent=entry.scopeLabel;
      button.append(name,location);button.addEventListener('click',()=>navigatePart(entry));row.append(button);list.append(row);
    }
    if(!results.length&&catalogReady){const message=document.createElement('p');message.className='list-message';message.textContent='No modeled part matches this search. Try a part name, brand, or system. The full vehicle catalog is still being built.';list.append(message);}
    $('#restore').disabled=state.hidden.size===0;return;
  }
  const all=candidates();
  const results=all.filter(p=>(state.system==='all'||p.system===state.system)&&matches(p));
  $('#assembly-count').textContent=state.search||state.system!=='all'?`${results.length} / ${all.length}`:String(all.length);
  for(const system of systems){
    const items=results.filter(p=>p.system===system);if(!items.length)continue;
    const title=document.createElement('div');title.className='system-heading';title.textContent=system;title.setAttribute('role','presentation');list.append(title);
    for(const p of items){
      const row=document.createElement('div');row.className='part-row'+(state.selection===p.id?' selected':'')+(state.hidden.has(p.id)?' is-hidden':'');row.dataset.system=system;row.setAttribute('role','listitem');
      const button=document.createElement('button');button.dataset.part=p.id;button.setAttribute('aria-pressed',String(state.selection===p.id));
      const dot=document.createElement('span');dot.className='part-symbol';dot.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='part-name';name.textContent=p.name;
      button.append(dot,name);
      if(childScopes(p.id).length){const indicator=document.createElement('span');indicator.className='detail-indicator';indicator.textContent='Parts →';button.append(indicator);}
      if(state.hidden.has(p.id)){const status=document.createElement('span');status.className='hidden-label';status.textContent='Hidden';button.append(status);}
      button.addEventListener('click',()=>selectPart(p.id));row.append(button);list.append(row);
    }
  }
  if(!results.length){const msg=document.createElement('p');msg.className='list-message';msg.textContent=`No ${plural()} match “${state.search || state.system}” in this view. Choose Whole truck above to search every modeled system.`;list.append(msg);}
  $('#restore').disabled=state.hidden.size===0;
}
function updateSelection(){
  const selectedPart=state.selection?assemblies.get(state.selection):null;
  $('#model-selection-actions').hidden=!selectedPart;
  $('#model-selected-name').textContent=selectedPart?.record.name||'';
  $('#model-isolate').textContent=state.isolate?'Show all':'Isolate';
  $('#model-isolate').setAttribute('aria-pressed',String(state.isolate));
  $('#model-isolate').title=state.isolate?'Restore the other parts (I)':'Show only this selection (I)';
  $('#expand-part').disabled=!state.selection;
  if(!state.selection&&$('#part-dialog').open)$('#part-dialog').close();
  const panel=$('#selection');
  if(!state.selection){panel.innerHTML=emptySelection;if(isDetail()){panel.querySelector('h2').textContent=currentScope().title;panel.querySelector('p').textContent='Explode this system, then select a component to see its role and references. Isolate it for a closer look.';}return;}
  const p=assemblies.get(state.selection).record;
  const card={...p,...partCards[p.id]};
  const numberReferenceIds=[...new Set([...(card.numberReferenceIds||[]),...(card.oemReferenceIds||[])])];
  panel.replaceChildren();
  const heading=document.createElement('div');heading.className='selection-heading';
  const title=document.createElement('h2');title.textContent=p.name;
  const close=document.createElement('button');close.textContent='Clear';close.setAttribute('aria-label',`Clear selected ${noun()}`);close.addEventListener('click',()=>selectPart(null));const expand=document.createElement('button');expand.className='inline-expand';expand.textContent='Expand ↗';expand.setAttribute('aria-label','Expand part information');expand.addEventListener('click',()=>$('#expand-part').click());heading.append(title,expand,close);
  const meta=document.createElement('span');meta.className='selection-id';
  meta.textContent=p.system+' · '+(p.geometryOrigin==='approved-source'?'Separated from approved model':p.geometryOrigin==='mixed'?'Approved model + component study':p.geometryOrigin==='study-placeholder'?'Approximate study placeholder':p.geometryOrigin==='reference-guided'?'Reference-guided study':'Approximate geometry');
  const description=document.createElement('p');description.textContent=p.description;
  const actions=document.createElement('div');actions.className='selection-actions';
  for(const [id,label,action] of [['focus','Focus',()=>focusSelection()],['isolate',state.isolate?'Show all':'Isolate',()=>toggleIsolation()],['hide',state.hidden.has(p.id)?'Show':'Hide',()=>toggleHidden()]]){
    const b=document.createElement('button');b.id=id;b.textContent=label;if(id==='isolate')b.setAttribute('aria-pressed',String(state.isolate));b.addEventListener('click',action);actions.append(b);
  }
  const refs=document.createElement('details');refs.className='references';
  const summary=document.createElement('summary');summary.textContent='References & coverage';refs.append(summary);
  for(const ref of p.references){if(ref.url&&(siteConfig.manualAvailable||!ref.url.startsWith('manual.html'))){const a=document.createElement('a');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=ref.label;refs.append(a);}else{const label=document.createElement('small');label.textContent=ref.label+' · Private project reference';refs.append(label);}}
  const note=document.createElement('small');note.textContent=`Stable ID: ${p.id}. ${p.geometryNote||p.notes|| (isDetail()?'This selection is a component study group; smaller features are not separately identified service parts.':p.detailScope?'Partial component coverage is available in its separate popout.':'Individual service parts are not modeled.')} Number references and fitment qualifications are listed separately.`;refs.append(note);
  panel.append(heading,meta,actions);
  if(card.referenceImage&&siteConfig.localReferences){
    const figure=document.createElement('figure');figure.className='part-reference';
    const image=document.createElement('img');image.src=card.referenceImage.src;image.alt=card.referenceImage.alt||`Reference for ${p.name}`;image.loading='lazy';
    const caption=document.createElement('figcaption');caption.textContent=card.referenceImage.caption||'Reference image';
    const link=document.createElement('a');link.href=card.referenceImage.src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label',`Open reference image for ${p.name}`);link.append(image);
    image.addEventListener('error',()=>{figure.hidden=true;});figure.append(link,caption);panel.append(figure);
  }
  const facts=document.createElement('dl');facts.className='part-facts';
  const factRows=[['Function',card.function||p.description],['Location',card.location||currentScope().title],['Installed',card.installedBrand||'Factory baseline; installed replacement unverified']];
  if(card.partNumber||card.oemContext)factRows.push(['Installed / supplier number',card.partNumber?.value?`${card.partNumber.value} · ${card.partNumber.status}`:'Not verified']);
  factRows.push(['OEM references',numberReferenceIds.length?'Factory numbers and variants below':card.oemContext?'See factory context below':'No supported number in reviewed references']);
  for(const [label,value] of factRows){
    const term=document.createElement('dt');term.textContent=label;const detail=document.createElement('dd');detail.textContent=value;facts.append(term,detail);
  }
  panel.append(facts);
  if(card.oemContext){const context=document.createElement('p');context.className='part-source-status oem-context';context.textContent=card.oemContext;panel.append(context);}
  if(card.ownerInterchangeNumbers?.length){
    const section=document.createElement('details');section.className='references number-references';const summary=document.createElement('summary');summary.textContent='Owner-confirmed CV interchange numbers';const note=document.createElement('p');note.textContent=card.ownerInterchangeStatus;const numbers=document.createElement('p');numbers.className='part-number-values';numbers.textContent=card.ownerInterchangeNumbers.join(' · ');section.append(summary,note,numbers);panel.append(section);
  }
  if(numberReferenceIds.length){
    const section=document.createElement('details');section.className='references number-references';const summary=document.createElement('summary');summary.textContent='OEM part numbers · factory references';section.open=Boolean(card.oemContext);section.append(summary);
    const caution=document.createElement('p');caution.textContent='These are historical reference numbers, not confirmed replacements. Tables may include other sides, production dates or equipment. Verify your vehicle and current supersessions before ordering.';section.append(caution);
    for(const id of numberReferenceIds){const source=numberSources[id];if(!source)continue;
      const title=document.createElement('h3');title.textContent=source.title;const origin=document.createElement('small');origin.textContent=source.source+' · '+id;section.append(title,origin);if(source.url){const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open OEM catalog source';section.append(link);}
      const list=document.createElement('ul');list.className='number-reference-list';
      for(const row of source.rows){const item=document.createElement('li');if(row.heading){item.className='number-heading';item.textContent=row.heading;}else{const code=document.createElement('strong');code.textContent=row.number;item.append(code,document.createTextNode(' — '+row.label+(row.note?' · '+row.note:'')));}list.append(item);}section.append(list);
    }panel.append(section);
  }

  if(card.sourceStatus){const source=document.createElement('p');source.className='part-source-status';source.textContent=card.sourceStatus;panel.append(source);}
  const geometry=document.createElement('details');geometry.className='references';const geometrySummary=document.createElement('summary');geometrySummary.textContent='About this geometry';geometry.append(geometrySummary,description);panel.append(geometry);
  for(const detail of childScopes(p.id)){
    const open=document.createElement('button');open.className='open-engine';open.textContent=`Open ${detail.id==='engine'?'engine components':detail.label.toLowerCase()+' components'} →`;
    open.addEventListener('click',async()=>{await switchScope(detail.id);$('#catalog-title').focus({preventScroll:true});});panel.append(open);
  }
  panel.append(refs);
}
function assembledExteriorView(){return scope==='vehicle'&&state.amount===0&&state.explosion===0&&state.layout==='spatial'&&!state.selection&&!state.xray&&!state.isolate&&state.hidden.size===0;}
function updateAppearance(){
  $('#mobile-configuration').textContent=isDetail()?'Component groups · Approximate geometry':state.configuration==='2wd'?'2WD comparison · Fitment unverified':'VIN-confirmed 4WD · Approximate geometry';
  const chassisActive=scope==='vehicle'&&!state.isolate&&manifest.assemblies.every(p=>visible(p)===(permitted(p)&&chassisOwners.has(p.id)));
  let count=0;
  for(const [id,a] of assemblies){
    a.object.visible=visible(a.record);if(a.object.visible)count++;
    const selected=id===state.selection;
    const ghost=(state.xray||Boolean(state.selection)||engineMotion.isGhost(id))&&!selected;
    for(const mesh of a.meshes){
      // The acquired exterior includes a flat black underbody backing under
      // frame. Hide that display surface only in the chassis inspection preset.
      const assembledExterior=assembledExteriorView();
      mesh.visible=!(assembledExterior&&mesh.userData.hideInAssembledExterior)&&!(chassisActive&&id==='frame'&&mesh.userData.geometryOrigin==='approved-source'&&mesh.userData.sourceObject==='Object_5');
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        const base=materialDefaults.get(material);
        material.transparent=ghost||base.transparent;material.opacity=ghost?Math.min(base.opacity,.13):base.opacity;material.depthWrite=ghost?false:base.depthWrite;
        if(material.emissive){if(selected)material.emissive.set(0x1c7a34);else material.emissive.copy(base.emissive);}
        material.emissiveIntensity=selected?Math.max(base.emissiveIntensity,.25):base.emissiveIntensity;
      }
      mesh.renderOrder=ghost?1:0;
    }
  }
  $('#visible-count').textContent=`${count} ${count===1?noun():plural()} visible`;
  $('#stage-mode').textContent=state.isolate?`Isolated ${noun()}`:state.amount>0?state.layout==='grid'?'System grid':'Exploded view':'Assembled';
  $('#night-view').setAttribute('aria-pressed',String(state.night));
  $('#night-view').textContent=state.night?'Day view':'Night view';
  $('#night-view').title=state.night?'Restore the daytime inspection lighting':'Switch to the night lighting environment';
  nightView.sync({enabled:state.night,scope,assemblies,camera,viewport,time:performance.now(),reducedMotion,selection:state.selection,xray:state.xray});
  $('#xray').setAttribute('aria-pressed',String(state.xray));
  $('#label-toggle').setAttribute('aria-pressed',String(state.labels));
  const powertrainActive=scope==='vehicle'&&!state.isolate&&manifest.assemblies.every(p=>visible(p)===(permitted(p)&&powertrainOwners.has(p.id)));
  $('#powertrain-view').setAttribute('aria-pressed',String(powertrainActive));
  $('#powertrain-view').textContent=powertrainActive?'Whole vehicle':'Powertrain';
  $('#chassis-view').setAttribute('aria-pressed',String(chassisActive));
  $('#chassis-view').textContent=chassisActive?'Show whole vehicle':'Chassis view';
  updateSelection();updateList();
}
function selectPart(id){
  if(id&&!assemblies.has(id))return;
  state.selection=id;
  if(id)state.hidden.delete(id);else state.isolate=false;
  updateAppearance();
  const url=new URL(location.href);if(id)url.searchParams.set('part',id);else url.searchParams.delete('part');history.replaceState(null,'',url);
  if(id){announce(`${assemblies.get(id).record.name} selected. Surrounding ${plural()} are transparent.`);}
  else announce('Selection cleared.');
}
async function navigatePart(entry){
  const query=state.search,route=++routeVersion;
  const loaded=await switchScope(entry.scope);
  if(route!==routeVersion||!loaded||scope!==entry.scope||!assemblies.has(entry.record.id))return;
  state.search=query;state.searchArea='truck';state.system='all';state.isolate=false;
  state.hidden.delete(entry.record.id);
  if(!permitted(assemblies.get(entry.record.id).record))state.configuration='4wd';
  state.amount=state.explosion=0;setPositions(0);syncScope();
  selectPart(entry.record.id);focusSelection();
  announce(`${entry.record.name} opened in ${entry.scopeLabel}.`);
}
function toggleIsolation(){if(!state.selection)return;state.isolate=!state.isolate;state.hidden.delete(state.selection);updateAppearance();fitVisible();announce(state.isolate?`Selected ${noun()} isolated.`:`All unhidden ${plural()} restored to view.`);}
function toggleHidden(){if(!state.selection)return;const id=state.selection;if(state.hidden.has(id)){state.hidden.delete(id);updateAppearance();}else {state.hidden.add(id);selectPart(null);}announce(`${assemblies.get(id).record.name} ${state.hidden.has(id)?'hidden':'shown'}.`);}
function setPositions(amount){
  for(const a of assemblies.values())a.object.position.copy(a.rest).addScaledVector(a.offset,amount*(1-state.grid)).addScaledVector(a.gridOffset,amount*state.grid);
  const conceal=assembledExteriorView();
  for(const a of assemblies.values())for(const mesh of a.meshes)if(mesh.userData.hideInAssembledExterior)mesh.visible=!conceal;
  model?.updateMatrixWorld(true);
}
function setupSystemGrid(entries){
  const boxes=[...entries.values()].map(a=>{const bounds=new Box3().setFromObject(a.object,true);return {id:a.record.id,bounds,center:bounds.getCenter(new Vector3()),size:bounds.getSize(new Vector3())};});
  const layout=planSystemGrid(boxes.map(b=>({id:b.id,width:b.size.x,depth:b.size.z,height:b.size.y})));
  for(const b of boxes){const a=entries.get(b.id),target=new Vector3(...layout.get(b.id));a.gridOffset=a.object.parent.worldToLocal(target).sub(a.object.parent.worldToLocal(b.center.clone()));}
}
function setLayout(layout){
  if(!state.ready||!['spatial','grid'].includes(layout))return;
  engineMotion.reset({clearReveal:true});engineMotion.setAvailable(false);cameraMove=null;state.layout=layout;state.gridAmount=layout==='grid'?1:0;
  if(reducedMotion)state.grid=state.gridAmount;
  if(layout==='grid'){state.labels=true;setExplosion(100);}else {setPositions(state.explosion);syncExplosion();}
  updateAppearance();
  announce(layout==='grid'?`Grid layout separates the ${plural()} in this view. Use Fit view to see the full grid.`:'Spatial explosion restored.');
}

function unionVisible(){const bounds=new Box3();for(const a of assemblies.values())if(a.object.visible)bounds.union(new Box3().setFromObject(a.object,true));return bounds;}
function frame(bounds, direction=null, boxes=[bounds]){
  if(bounds.isEmpty())return;
  const center=bounds.getCenter(new Vector3());
  const vertical=camera.fov*Math.PI/180;
  const dir=direction?new Vector3(...direction).normalize():(cameraMove?.to||camera.position).clone().sub(cameraMove?.target||controls.target).normalize();
  const right=new Vector3().crossVectors(new Vector3(0,1,0),dir).normalize();
  const up=new Vector3().crossVectors(dir,right).normalize();
  const tanV=Math.tan(vertical/2),tanH=tanV*camera.aspect;
  let distance=isDetail()?.18:.9;
  for(const box of boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const relative=new Vector3(x,y,z).sub(center),depth=relative.dot(dir);
    distance=Math.max(distance,Math.abs(relative.dot(right))/tanH*1.16+depth,Math.abs(relative.dot(up))/tanV*1.22+depth);
  }
  controls.maxDistance=Math.max(controls.maxDistance,30,distance*1.5);camera.far=Math.max(camera.far,100,distance*3);camera.updateProjectionMatrix();
  cameraMove={from:camera.position.clone(),fromTarget:controls.target.clone(),to:center.clone().addScaledVector(dir,distance),target:center,start:performance.now(),duration:reducedMotion?0:480};
}
function fitVisible(direction=null){if(!model)return;const drawnGrid=state.grid;state.grid=state.gridAmount;setPositions(state.amount);const boxes=[...assemblies.values()].filter(a=>a.object.visible).map(a=>new Box3().setFromObject(a.object,true));const bounds=unionVisible();state.grid=drawnGrid;setPositions(state.explosion);frame(bounds,direction,boxes);}
function focusSelection(){if(!state.selection)return;const a=assemblies.get(state.selection);if(state.hidden.has(state.selection)){state.hidden.delete(state.selection);updateAppearance();}frame(new Box3().setFromObject(a.object,true));}
function syncExplosion(){for(const button of $$('[data-layout]'))button.setAttribute('aria-pressed',String(button.dataset.layout===state.layout));$('#grid-hint').hidden=state.layout!=='grid';const value=Math.round(state.amount*100);$('#explode').value=String(value);$('#explode-value').value=value+'%';$('#explode-toggle span').textContent=`${value>0?'Assemble':'Explode'} ${currentScope().modelNoun}`;$('#explode-toggle').setAttribute('aria-pressed',String(value>0));$('#stage-mode').textContent=state.isolate?`Isolated ${noun()}`:value>0?state.layout==='grid'?'System grid':'Exploded view':'Assembled';}
function setExplosion(value){
  if(!state.ready)return;
  // Separating parts should preserve the owner's view. Fit view is explicit.
  cameraMove=null;
  engineMotion.reset({clearReveal:true});engineMotion.setAvailable(false);state.amount=Math.max(0,Math.min(100,Number(value)))/100;
  syncExplosion();
  if(reducedMotion){state.explosion=state.amount;setPositions(state.explosion);}
}
function reset(){engineMotion.reset({clearReveal:true});Object.assign(state,defaults());$('#search').value='';$('#search-area').value=state.searchArea;$('#system').value='all';$('#configuration').value=state.configuration;const url=new URL(location.href);url.searchParams.delete('part');history.replaceState(null,'',url);setPositions(0);syncExplosion();updateAppearance();fitVisible(perspectiveDirection());$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='perspective')));announce(`${currentScope().title} reassembled. Selection, filters and hidden ${plural()} cleared. ${state.night?'Night view remains on.':'Day view remains on.'}`);}
function setupLabels(){labels.clear();$('#labels').replaceChildren();for(const [id,a] of assemblies){const el=document.createElement('span');el.className='model-label';el.textContent=a.record.name;el.hidden=true;$('#labels').append(el);labels.set(id,el);}}
function drawLabels(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  const placed=[];
  for(const [id,a] of assemblies){
    const el=labels.get(id);
    if(!state.labels||!a.object.visible){el.hidden=true;continue;}
    const point=a.center.clone();a.object.localToWorld(point);point.project(camera);
    const x=(point.x*.5+.5)*w,y=(-point.y*.5+.5)*h;
    const selected=id===state.selection;
    const overlap=placed.some(p=>Math.abs(x-p.x)<125&&Math.abs(y-p.y)<28);
    el.hidden=point.z>1||point.z<-1||x<60||x>w-60||y<76||y>h-25||(overlap&&!selected);
    if(!el.hidden){el.style.left=x+'px';el.style.top=y+'px';el.classList.toggle('selected',selected);placed.push({x,y});}
  }
}
let down=null;
viewport.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};cameraMove=null;});
viewport.addEventListener('pointerup',e=>{
  if(!down||!state.ready||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
  down=null;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  const meshes=[...assemblies.values()].filter(a=>a.object.visible).flatMap(a=>a.meshes).filter(mesh=>mesh.visible);
  const hits=raycaster.intersectObjects(meshes,false);
  if(hits.length)selectPart(hits[0].object.userData.assemblyId);else selectPart(null);
});
viewport.addEventListener('wheel',()=>{cameraMove=null;},{passive:true});
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(state.ready)fitVisible();}).observe(viewport);
$('#search').addEventListener('input',e=>{state.search=e.target.value;updateList();});
$('#search').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('#part-list button');if(first){e.preventDefault();first.click();}}});
$('#search-area').addEventListener('change',e=>{state.searchArea=e.target.value;updateList();});
$('#search-clear').addEventListener('click',()=>{state.search='';$('#search').value='';updateList();$('#search').focus();});
$('#system').addEventListener('change',e=>{state.system=e.target.value;updateList();});
$$('[data-layout]').forEach(button=>button.addEventListener('click',()=>setLayout(button.dataset.layout)));
$('#explode').addEventListener('input',e=>setExplosion(e.target.value));
$('#explode-toggle').addEventListener('click',()=>setExplosion(state.amount>0?0:100));
$('#xray').addEventListener('click',()=>{state.xray=!state.xray;updateAppearance();});
$('#label-toggle').addEventListener('click',()=>{state.labels=!state.labels;updateAppearance();});
$('#night-view').addEventListener('click',()=>{
  nightPreference=!nightPreference;state.night=nightPreference;
  for(const snapshot of snapshots.values())snapshot.state.night=nightPreference;
  const url=new URL(location.href);if(nightPreference)url.searchParams.set('night','1');else url.searchParams.delete('night');history.replaceState(null,'',url);
  updateAppearance();announce(nightPreference?'Night view enabled. Green underglow tracks the lighting geometry.':'Day inspection view restored.');
});
$('#restore').addEventListener('click',()=>{state.hidden.clear();updateAppearance();fitVisible();announce(`Hidden ${plural()} restored.`);});
$('#reset').addEventListener('click',reset);
$('#fit').addEventListener('click',()=>fitVisible());
$('#engine-view').addEventListener('click',async()=>{
  if(!state.ready)return;
  if(await switchScope('engine'))$('#catalog-title').focus({preventScroll:true});
});
$('#chassis-view').addEventListener('click',()=>{
  if(scope!=='vehicle'||!state.ready)return;
  const restore=$('#chassis-view').getAttribute('aria-pressed')==='true';
  state.selection=null;state.isolate=false;state.xray=false;
  state.hidden=restore?new Set():new Set(manifest.assemblies.filter(p=>!chassisOwners.has(p.id)).map(p=>p.id));
  state.amount=state.explosion=0;setPositions(0);syncExplosion();selectPart(null);fitVisible(perspectiveDirection());
  announce(restore?'Whole vehicle restored.':'Aligned suspension and chassis shown. Open a front corner to explore its components.');
});
$('#powertrain-view').addEventListener('click',()=>{
  if(scope!=='vehicle'||!state.ready)return;
  const restore=$('#powertrain-view').getAttribute('aria-pressed')==='true';
  state.selection=null;state.isolate=false;state.xray=false;
  state.hidden=restore?new Set():new Set(manifest.assemblies.filter(p=>!powertrainOwners.has(p.id)).map(p=>p.id));
  state.amount=state.explosion=0;setPositions(0);syncExplosion();selectPart(null);fitVisible(perspectiveDirection());
  announce(restore?'Whole vehicle restored.':'Connected powertrain shown. Explode separates its major assemblies; select an assembly to open component detail.');
});
$('#configuration').addEventListener('change',e=>{state.configuration=e.target.value;if(state.selection&&!permitted(assemblies.get(state.selection).record))selectPart(null);state.isolate=false;updateAppearance();fitVisible();announce(state.configuration==='2wd'?'2WD comparison. Conditional 4WD assemblies removed.':'Your vehicle is 4WD. Component fitment remains unverified.');});
const directions={perspective:[6,3.5,7.5],front:[0,.12,1],side:[1,.1,0],top:[0,1,.001]};
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));fitVisible(button.dataset.view==='perspective'?perspectiveDirection():directions[button.dataset.view]);}));
$('#model-isolate').addEventListener('click',()=>toggleIsolation());
$('#model-focus').addEventListener('click',()=>focusSelection());
$('#model-clear').addEventListener('click',()=>{selectPart(null);$('#viewport').focus({preventScroll:true});});
$('#about').addEventListener('click',()=>$('#about-dialog').showModal());
$('#close-about').addEventListener('click',()=>$('#about-dialog').close());
$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('keydown',e=>{
  if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)||$('#about-dialog').open||$('#part-dialog').open)return;
  if(e.key==='/'){e.preventDefault();setSidebarVisible(true);$('#search').focus();}
  if(!state.ready)return;
  if(e.key==='Escape')selectPart(null);
  if(e.key.toLowerCase()==='i'&&state.selection){e.preventDefault();toggleIsolation();}
  if(e.key.toLowerCase()==='f')state.selection?focusSelection():fitVisible();

  if(e.key.toLowerCase()==='h')toggleHidden();
});

async function loadDataset(next){
  const data=await getManifest(next);
  const gltf=await loadModel(data.model,GLTFLoader);
  const root=gltf.scene;root.updateMatrixWorld(true);const entries=new Map();
  const registeredIds=new Set(data.assemblies.map(record=>record.id)),meshOwners=new Map(),interactionRoots=new Map();
  // GLTFLoader sanitizes punctuation in names. Stable IDs belong in metadata;
  // repeated child metadata inherits its outermost matching interaction root.
  root.traverse(object=>{
    const id=object.userData.assemblyId;if(!registeredIds.has(id))return;
    for(let parent=object.parent;parent;parent=parent.parent)if(parent.userData.assemblyId===id)return;
    if(interactionRoots.has(id))throw new Error(`Duplicate interaction root: ${id}`);
    interactionRoots.set(id,object);
  });
  for(const record of data.assemblies){
    if(entries.has(record.id)||!Array.isArray(record.explodeOffset)||record.explodeOffset.length!==3||!record.explodeOffset.every(Number.isFinite))throw new Error(`Invalid assembly: ${record.id}`);
    const object=interactionRoots.get(record.id);if(!object)throw new Error(`Missing assembly: ${record.id}`);
    const meshes=[];object.traverse(o=>{
      if(o!==object&&registeredIds.has(o.userData.assemblyId)&&o.userData.assemblyId!==record.id)throw new Error(`Nested selectable roots: ${record.id} / ${o.userData.assemblyId}`);
      if(o.isMesh){
      if(meshOwners.has(o))throw new Error(`Shared component geometry: ${record.id}`);meshOwners.set(o,record.id);
      o.userData.assemblyId=record.id;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
      for(const m of Array.isArray(o.material)?o.material:[o.material])materialDefaults.set(m,{transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,emissive:m.emissive?.clone(),emissiveIntensity:m.emissiveIntensity??0});
      meshes.push(o);
    }});
    if(!meshes.length)throw new Error(`Empty assembly: ${record.id}`);
    // Authored inspection spacing is separate from the installed GLB coordinates.
    const presentation=record.presentationOffset||[0,0,0];
    if(!Array.isArray(presentation)||presentation.length!==3||!presentation.every(Number.isFinite))throw new Error(`Invalid presentation offset: ${record.id}`);
    object.position.add(new Vector3(...presentation));object.updateMatrixWorld(true);
    const center=new Box3().setFromObject(object,true).getCenter(new Vector3());object.worldToLocal(center);
    entries.set(record.id,{record,object,meshes,center,rest:object.position.clone(),offset:new Vector3(...record.explodeOffset)});
  }
  if(!entries.size)throw new Error('Empty catalog');
  setupSystemGrid(entries);
  return {manifest:data,model:root,assemblies:entries};
}
function getDataset(next){
  if(!datasets.has(next)){const pending=loadDataset(next).catch(error=>{datasets.delete(next);throw error;});datasets.set(next,pending);}
  return datasets.get(next);
}
function captureScope(){
  if(!scope||!state.ready)return;
  snapshots.set(scope,{state:{...state,hidden:new Set(state.hidden),explosion:state.amount,grid:state.gridAmount},camera:(cameraMove?.to||camera.position).clone(),target:(cameraMove?.target||controls.target).clone(),aspect:camera.aspect});
}
function setBusy(busy){
  state.ready=!busy;controls.enabled=!busy;
  document.documentElement.dataset.viewerReady=String(!busy);
  $('.stage').setAttribute('aria-busy',String(busy));
  for(const id of ['search','search-area','search-clear','system','explode','explode-toggle','xray','label-toggle','night-view','reset','fit','chassis-view','powertrain-view','engine-view','configuration','restore'])$('#'+id).disabled=busy;
  $$('[data-view], [data-layout]').forEach(button=>button.disabled=busy);
}
function syncScope(){
  const engine=isEngine(),detail=isDetail(),config=currentScope();document.documentElement.dataset.viewerScope=scope;
  document.title=detail?`${config.title} · 4Runner (4th Gen) Atlas · by Nebulys`:'4Runner (4th Gen) Atlas · by Nebulys';
  viewPicker.setCurrent(scope);
  $('#scope-description').textContent=engine?`2005 · 4.7 L V8 · ${assemblies.size} component groups`:detail?config.description:'Approved exterior · Open a system to explore its components';
  $('#catalog-title').textContent=config.catalogTitle;
  $('.catalog').setAttribute('aria-label',detail?`${config.title} component catalog`:'Assembly catalog');
  $('.stage').setAttribute('aria-label',`Interactive 3D ${config.title}`);
  $('#viewport').setAttribute('aria-label',`3D ${config.title}. Drag to rotate, scroll to zoom. Select ${plural()} from the catalog for keyboard access.`);
  $('#fit').title=`Fit visible ${plural()} in view`;
  $('#chassis-view').hidden=detail;
  $('#powertrain-view').hidden=detail;
  $('#engine-view').hidden=detail;
  $('#search').placeholder='Find a part, brand, or system…';$('#search').setAttribute('aria-label','Search modeled parts');
  $('#search').value=state.search;
  $('#search-area').value=state.searchArea;
  $('#system-label').textContent=detail?'Component system':'Vehicle system';
  const select=$('#system');select.replaceChildren(new Option('All systems','all'),...systems.map(system=>new Option(system,system)));select.value=state.system;
  $('#configuration').value=state.configuration;
  $('#vehicle-configuration').hidden=detail;$('#engine-context').hidden=!detail;$('#engine-context').textContent=engine?'2005 2UZ-FE VVT-i · Component study':'Partial component coverage · Fitment unverified';
  $('#study-label').textContent=engine?'Engine component study':detail?'Reference-guided component study':'Approved base · Core assemblies';
  $('#mobile-identity').textContent=engine?'2005 2UZ-FE VVT-i · 4.7 L V8':'2005 4Runner Sport · 4.7 L V8';
  $('#mobile-scope').textContent=detail?`${config.title} · ${assemblies.size} component groups`:`${assemblies.size} core assemblies · Approved exterior`;
  $('#component-breadcrumb').hidden=!detail;
  $('#component-parent').textContent=config.parentLabel||'';
  const trail=scopeTrail(scope,scopeDefinitions),trailNav=$('#scope-trail');trailNav.replaceChildren();
  for(const entry of trail){
    if(entry.id==='vehicle')continue;
    const button=document.createElement('button');button.textContent=entry.label;button.dataset.breadcrumbScope=entry.id;
    if(entry.id===scope)button.setAttribute('aria-current','page');else button.addEventListener('click',()=>switchScope(entry.id));
    trailNav.append(button);
  }
  const parent=scopeDefinitions.get(config.parentScopeId||'vehicle');$('#scope-parent').textContent=`← ${parent.label}`;
  $('#component-current').textContent=detail?`${assemblies.size} component groups`:'';
  $('.component-notice').textContent=engine?'Component study · Dimensions approximate':'Reference-guided · Dimensions approximate';
  $('#download-model').href=manifest.model;$('#download-source').hidden=!siteConfig.authoringAvailable;$('#download-source').href=manifest.editableModel||'#';
  if(!detail&&manifest.appearanceStatus==='owner-approved-base'){
    const counts={source:0,mixed:0,study:0};
    for(const p of manifest.assemblies){if(p.geometryOrigin==='approved-source')counts.source++;else if(p.geometryOrigin==='mixed')counts.mixed++;else counts.study++;}
    $('#vehicle-coverage').textContent=`${counts.source} assemblies use the approved model, ${counts.mixed} combine it with study geometry, and ${counts.study} use approximate study geometry. Open a system to explore its component groups, or search across every modeled view. Deeper views reuse stable part identities. Exact dimensions, installed clearances, OEM fitment and full service-part coverage remain incomplete. The engine view includes a target-year VVT-i refinement; full service-part coverage remains incomplete.`;
  }
  const infoScope=engine?'engine':detail?'components':'vehicle';
  $$('[data-info-scope]').forEach(el=>el.hidden=el.dataset.infoScope!==infoScope);
  $$('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
  if(detail){
    $('#component-about').textContent=`${config.title}: ${assemblies.size} selectable component groups. ${config.description||''}`;
    $('#component-coverage').textContent=config.coverageNote||'';
    const refs=new Map();for(const p of manifest.assemblies)for(const ref of p.references)refs.set(ref.url||ref.label,ref);
    const list=$(engine?'#engine-source-links':'#component-source-links');list.replaceChildren();
    for(const ref of refs.values()){const item=document.createElement('li');if(ref.url){const link=document.createElement('a');link.href=ref.url;link.textContent=ref.label;link.target='_blank';link.rel='noopener noreferrer';item.append(link);}else{item.className='private-reference';item.textContent=ref.label+' · Private project reference';}list.append(item);}
  }
  syncExplosion();
}
async function switchScope(next,{historyMode='push'}={}){
  if(!scopeFiles[next])return false;
  if(next===scope&&state.ready)return true;
  engineMotion.leave();captureScope();requestedScope=next;const version=++loadVersion;cameraMove=null;setBusy(true);
  if(model)model.visible=false;$('#labels').replaceChildren();labels.clear();$('#selection').replaceChildren();
  $('#load-error').hidden=true;$('#loading').hidden=false;
  $('#load-title').textContent=`Opening ${scopeDefinitions.get(next).title}`;
  $('#load-detail').textContent='Loading local 3D geometry…';$('#part-list').textContent='Loading catalog…';
  try{
    const loaded=await getDataset(next);if(version!==loadVersion)return;
    if(model)scene.remove(model);
    ({manifest,model,assemblies}=loaded);scope=next;requestedScope=null;engineMotion.bind(next==='engine'?model:null);
    const saved=snapshots.get(scope);Object.assign(state,saved?.state||defaults());state.night=nightPreference;
    systems=[...new Set(manifest.assemblies.map(p=>p.system))];
    scene.add(model);model.visible=true;nightView.register(assemblies);setPositions(state.explosion);setupLabels();
    controls.minDistance=isDetail()?.1:.55;setBusy(false);syncScope();updateAppearance();
    if(saved){camera.position.copy(saved.camera);controls.target.copy(saved.target);controls.update();if(Math.abs(saved.aspect-camera.aspect)>.01)fitVisible();}else fitVisible(perspectiveDirection());
    $('#loading').hidden=true;
    if(historyMode==='push'){const url=new URL(location.href);if(isDetail())url.searchParams.set('view',scope);else url.searchParams.delete('view');if(state.selection)url.searchParams.set('part',state.selection);else url.searchParams.delete('part');history.pushState(null,'',url);}
    announce(`${configTitle(next)} loaded: ${assemblies.size} ${plural()}. ${isDetail()?'Use the explosion slider to separate the components.':''}`);
    return true;
  }catch(error){
    if(version!==loadVersion)return;requestedScope=null;$('#loading').hidden=true;$('#load-error').hidden=false;
    $('#error-detail').textContent=`The ${scopeDefinitions.get(next).title.toLowerCase()} model or catalog could not load. Try another model above, or reload the local files.`;console.error(error);
    return false;
  }
}
const configTitle=id=>scopeDefinitions.get(id).title;
const urlScope=()=>{const requested=new URL(location.href).searchParams.get('view');return scopeDefinitions.has(requested)?requested:'vehicle';};
$('#scope-parent').addEventListener('click',()=>switchScope(currentScope().parentScopeId||'vehicle'));
async function openURL(){nightPreference=new URL(location.href).searchParams.get('night')==='1';state.night=nightPreference;const route=++routeVersion;const loaded=await switchScope(urlScope(),{historyMode:'none'});if(!loaded||route!==routeVersion)return;const part=new URL(location.href).searchParams.get('part');if(part&&assemblies.has(part)){selectPart(part);focusSelection();}else selectPart(null);}
addEventListener('popstate',openURL);
function animate(time){
  const dt=Math.min((time-lastTime)/1000,.1);lastTime=time;
  if(model&&Math.abs(state.grid-state.gridAmount)>.0001){state.grid+=(state.gridAmount-state.grid)*(reducedMotion?1:1-Math.exp(-dt*8));if(Math.abs(state.grid-state.gridAmount)<.0001)state.grid=state.gridAmount;setPositions(state.explosion);}
  if(model&&Math.abs(state.explosion-state.amount)>.0001){state.explosion+= (state.amount-state.explosion)*(reducedMotion?1:1-Math.exp(-dt*8));if(Math.abs(state.explosion-state.amount)<.0001)state.explosion=state.amount;setPositions(state.explosion);}
  if(cameraMove){const t=cameraMove.duration?Math.min(1,(time-cameraMove.start)/cameraMove.duration):1;const e=1-(1-t)**4;camera.position.lerpVectors(cameraMove.from,cameraMove.to,e);controls.target.lerpVectors(cameraMove.fromTarget,cameraMove.target,e);if(t===1)cameraMove=null;}
  engineMotion.setAvailable(state.ready&&scope==='engine'&&state.amount===0&&state.explosion===0&&state.gridAmount===0&&state.grid===0);
  if(state.ready)engineMotion.tick(dt);
  controls.update();if(state.ready){drawLabels();nightView.sync({enabled:state.night,scope,assemblies,camera,viewport,time,reducedMotion,selection:state.selection,xray:state.xray});}renderer.render(scene,camera);requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
loadCatalog().catch(error=>{catalogFailures=['catalog index'];catalogReady=true;console.error(error);if(state.ready)updateList();});
await openURL();

