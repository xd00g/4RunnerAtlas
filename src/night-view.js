import {AmbientLight, Box3, CanvasTexture, DirectionalLight, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight, Vector3} from './vendor/three-bridge.js';
import {createVehicleLamps} from './vehicle-lamps.js';

const rockLightId='body-shell.underglow';
const groundY=-.015;

function poolTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d');
  const glow=context.createRadialGradient(128,128,7,128,128,128);
  glow.addColorStop(0,'rgba(109,255,106,.70)');
  glow.addColorStop(.2,'rgba(53,255,94,.40)');
  glow.addColorStop(.58,'rgba(18,206,72,.11)');
  glow.addColorStop(1,'rgba(0,128,46,0)');
  context.fillStyle=glow;context.fillRect(0,0,256,256);
  return new CanvasTexture(canvas);
}

/** Presentation-only Three objects: never attached to a GLTF root or catalog. */
export function createNightView(scene){
  const vehicleLamps=createVehicleLamps(scene);
  const dayLights=[new AmbientLight(0xe4f0ff,2.0)];
  for(const [color,intensity,position] of [[0xfff7eb,3.9,[4,7,5]],[0xb9dceb,2.65,[-5,3,-1]],[0xffffff,2.6,[0,4,-7]]]){
    const light=new DirectionalLight(color,intensity);light.position.set(...position);dayLights.push(light);
  }
  const nightLights=[new AmbientLight(0x8ba5bd,1.18)];
  for(const [color,intensity,position] of [[0xdcecff,3.45,[4.5,7,5.8]],[0x4f79a1,2.0,[-5,3.5,-1]],[0xf1fbff,1.7,[0,5,-7]]]){
    const light=new DirectionalLight(color,intensity);light.position.set(...position);light.visible=false;nightLights.push(light);
  }
  scene.add(...dayLights,...nightLights);
  const effects=new Group();effects.name='Night rock-light presentation';effects.visible=false;scene.add(effects);
  const texture=poolTexture(),anchors=[],pools=[];
  let renderedMode=null,renderedVisibility=null;

  function clearAnchors(){
    anchors.length=0;
    for(const pool of pools){effects.remove(pool.mesh,pool.light,pool.light.target);pool.mesh.geometry.dispose();pool.mesh.material.dispose();}
    pools.length=0;
  }
  function register(assemblies){
    clearAnchors();
    vehicleLamps.register(assemblies);
    for(const entry of assemblies.values())entry.object.traverse(object=>{
      if(!object.isMesh||object.userData.stableId!==rockLightId||object.userData.rockLight!==true)return;
      const material=new MeshBasicMaterial({map:texture,color:0x43ff78,transparent:true,opacity:.74,depthWrite:false,blending:2,toneMapped:false});
      const mesh=new Mesh(new PlaneGeometry(1,1),material);mesh.rotation.x=-Math.PI/2;mesh.userData.presentationOnly=true;
      const light=new SpotLight(0x38ff70,2.2,2.5,Math.PI/3,.8,2);light.userData.presentationOnly=true;
      effects.add(mesh,light,light.target);anchors.push(object);pools.push({mesh,light});
    });
  }
  function setEnabled(enabled){
    if(renderedMode===enabled)return;
    renderedMode=enabled;for(const light of dayLights)light.visible=!enabled;for(const light of nightLights)light.visible=enabled;
    document.documentElement.dataset.nightView=String(enabled);
  }
  function setVisible(visible){
    if(renderedVisibility===visible)return;
    renderedVisibility=visible;effects.visible=visible;document.documentElement.dataset.nightUnderglow=String(visible);
  }
  function sync({enabled,scope,assemblies,time,reducedMotion,selection=null,xray=false}){
    setEnabled(enabled);
    vehicleLamps.sync({enabled,scope,selection,xray});
    const owner=scope==='lighting'?assemblies.get(rockLightId):scope==='vehicle'?assemblies.get('body-shell'):null;
    const visible=Boolean(enabled&&(scope==='vehicle'||scope==='lighting')&&owner?.object.visible&&anchors.length);
    setVisible(visible);if(!visible)return;
    const pulse=reducedMotion?1:1+Math.sin(time*.0014)*.045;
    for(let index=0;index<anchors.length;index++){
      const anchor=anchors[index],pool=pools[index];anchor.updateWorldMatrix(true,false);
      const bounds=new Box3().setFromObject(anchor,true),center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
      const width=1.05,depth=1.05;
      // Pools stay on the assembled ground plane while their X/Z follows the
      // live fixture. This keeps the light grounded if its body group explodes.
      pool.mesh.position.set(center.x,groundY,center.z);pool.mesh.scale.set(width*pulse,depth*pulse,1);
      pool.light.position.set(center.x,bounds.min.y-.005,center.z);pool.light.target.position.set(center.x,bounds.min.y-1,center.z);pool.light.intensity=2.2*pulse;
    }
  }
  return {register,sync};
}
