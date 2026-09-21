import {CanvasTexture,Group,Mesh,MeshBasicMaterial,PlaneGeometry,PointLight,Vector3} from './vendor/three-bridge.js';

// Visual anchors inspected on the approved derivative, in assembly coordinates.
// These effects do not add service-part identities or alter the acquired meshes.
const groundY=-.015;
const forwardAnchors=[[-.64,1.055,2.16],[.64,1.055,2.16]];
const rearAnchors=[[-.79,1.17,-2.34],[.79,1.17,-2.34]];

function beamTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,256);
  for(let y=0;y<256;y++)for(let x=0;x<128;x++){
    const distance=y/255,spread=.075+.42*distance,side=(x/127-.5)/spread;
    const alpha=Math.exp(-side*side*3)*Math.pow(Math.sin(Math.PI*distance),.9)*(1-distance*.65);
    const i=(y*128+x)*4;pixels.data.set([255,249,231,Math.round(alpha*255)],i);
  }
  ctx.putImageData(pixels,0,0);return new CanvasTexture(canvas);
}

function isVisible(object){
  for(let o=object;o;o=o.parent)if(!o.visible)return false;
  return true;
}

function lensGeometry(mesh,owner,headlamp){
  owner.updateWorldMatrix(true,true);
  const local=owner.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const geometry=mesh.geometry.clone().applyMatrix4(local);
  if(headlamp){
    const position=geometry.attributes.position,index=geometry.index,selected=[];
    const count=index?index.count:position.count;
    for(let i=0;i<count;i+=3){
      const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
      // The lower glass in this same source object belongs to the fog lights.
      if(ids.every(id=>position.getY(id)>.95))selected.push(...ids);
    }
    geometry.setIndex(selected);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function createVehicleLamps(scene){
  const records=[],texture=beamTexture(),worldPoint=new Vector3();
  let lastState='';
  function clear(){
    for(const r of records){
      scene.remove(r.group,...r.beams);
      r.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
      for(const b of r.beams){b.geometry.dispose();b.material.dispose();}
    }
    records.length=0;lastState='';
  }
  function base(ownerId,owner,type){
    const group=new Group();group.name=`Night ${type} presentation`;group.matrixAutoUpdate=false;
    group.userData={presentationOnly:true,presentationOwner:ownerId};scene.add(group);
    const r={ownerId,owner,type,group,beams:[],lights:[],glows:[],cells:null};records.push(r);return r;
  }
  function addPoint(r,position,color,intensity,range){
    const light=new PointLight(color,intensity,range,2);light.position.set(...position);
    r.group.add(light);r.lights.push({light,intensity});return light;
  }
  function addLens(r,mesh,headlamp){
    const material=new MeshBasicMaterial({color:headlamp?0xfff5df:0xff2414,transparent:true,
      opacity:headlamp?.58:.8,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const glow=new Mesh(lensGeometry(mesh,r.owner,headlamp),material);
    glow.name=headlamp?'Headlamp lens glow':'Red running-light lens glow';glow.renderOrder=2;
    glow.userData.presentationOnly=true;r.group.add(glow);r.glows.push({mesh:glow,opacity:material.opacity});
  }
  function register(assemblies){
    clear();
    for(const [ownerId,sourceObject,type] of [['bumper-front','Object_10','headlights'],['body-shell','Object_11','taillights']]){
      const entry=assemblies.get(ownerId);if(!entry)continue;
      const meshes=entry.meshes.filter(m=>m.userData.sourceObject===sourceObject);
      if(!meshes.length)continue;
      const r=base(ownerId,entry.object,type),front=type==='headlights';
      for(const mesh of meshes)addLens(r,mesh,front);
      for(const anchor of front?forwardAnchors:rearAnchors){
        addPoint(r,anchor,front?0xfff2dc:0xff2110,front?.9:.32,front?1.7:.75);
        if(front){
          const beam=new Mesh(new PlaneGeometry(.95,1.35),new MeshBasicMaterial({map:texture,color:0xfff6e3,
            transparent:true,opacity:.15,depthWrite:false,blending:2,toneMapped:false}));
          beam.name='Headlight ground illumination';beam.rotation.x=-Math.PI/2;beam.userData={presentationOnly:true,anchor};
          scene.add(beam);r.beams.push(beam);
        }
      }
    }
    const frame=assemblies.get('frame');
    if(frame){
      const r=base('frame',frame.object,'light-bar');
      // Owner-marked lower-grille opening; dimensions and fixture revision unknown.
      const housing=new Mesh(new PlaneGeometry(.80,.055),new MeshBasicMaterial({color:0x0b0d0e,transparent:true}));
      housing.position.set(0,.725,2.237);r.group.add(housing);r.housing=housing;
      const cells=new Mesh(new PlaneGeometry(.76,.034),new MeshBasicMaterial({color:0x59636a,transparent:true,toneMapped:false}));
      cells.position.set(0,.725,2.242);cells.userData.presentationOnly=true;r.group.add(cells);r.cells=cells;
      addPoint(r,[0,.725,2.29],0xf4f9ff,.85,1.6);
    }
  }
  function sync({enabled,scope,selection=null,xray=false}){
    const state={headlights:false,taillights:false,lightBar:false};
    for(const r of records){
      const shown=scope==='vehicle'&&isVisible(r.owner),on=shown&&enabled;
      const dim=((xray||Boolean(selection))&&selection!==r.ownerId) ? .13 : 1;
      r.owner.updateWorldMatrix(true,false);r.group.matrix.copy(r.owner.matrixWorld);
      r.group.matrixWorldNeedsUpdate=true;
      r.group.visible=shown&&(enabled||r.type==='light-bar');
      for(const {mesh,opacity} of r.glows)mesh.material.opacity=opacity*dim;
      for(const {light,intensity} of r.lights){light.visible=on;light.intensity=intensity*dim;}
      for(const beam of r.beams){
        beam.visible=on;beam.material.opacity=.15*dim;
        worldPoint.fromArray(beam.userData.anchor);r.owner.localToWorld(worldPoint);
        beam.position.set(worldPoint.x,groundY,worldPoint.z+.675);
      }
      if(r.cells){
        r.cells.material.color.set(enabled?0xf5f9ff:0x59636a);
        r.cells.material.opacity=dim;r.housing.material.opacity=dim;
      }
      if(on)state[r.type==='light-bar'?'lightBar':r.type]=true;
    }
    const signature=JSON.stringify(state);
    if(signature!==lastState){
      document.documentElement.dataset.nightHeadlights=String(state.headlights);
      document.documentElement.dataset.nightTaillights=String(state.taillights);
      document.documentElement.dataset.nightLightBar=String(state.lightBar);lastState=signature;
    }
  }
  return {register,sync};
}
