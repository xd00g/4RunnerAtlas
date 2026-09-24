// Illustrative rigid linkage; these model-space dimensions are not service data.
export function linkagePose(m, angle) {
  const a = angle + m.phase, x = m.radius * Math.cos(a), y = m.radius * Math.sin(a);
  const ux = m.bank * Math.SQRT1_2, uy = Math.SQRT1_2;
  const along = x * ux + y * uy;
  const distance = along + Math.sqrt(Math.max(0, m.rodLength ** 2 - (x * x + y * y - along * along)));
  return {end:[x,y,m.station], pin:[ux*distance,uy*distance,m.station]};
}

export function createEngineMotion(panel, {appearanceChanged, announce}) {
  const play=panel.querySelector('#engine-play'), revealButton=panel.querySelector('#engine-reveal');
  const scrub=panel.querySelector('#engine-angle'), readout=panel.querySelector('#engine-angle-value');
  const speed=panel.querySelector('#engine-speed'), resetButton=panel.querySelector('#engine-motion-reset');
  const hint=panel.querySelector('#engine-motion-hint');
  let pieces=[], active=false, allowed=false, playing=false, angle=0, reveal=false, lastReadout=-1;
  const TAU=Math.PI*2;
  const opaque=new Set(['engine-drive-plate','engine-drive-plate-spacer-front','engine-drive-plate-spacer-rear','engine-crankshaft','engine-cam-pulleys','engine-crank-pulley','engine-timing-belt','engine-accessory-belt','engine-fan-pulley','engine-oil-strainer-jets']);

  function sync() {
    panel.hidden=!active;
    play.textContent=playing?'Pause':'Play';play.setAttribute('aria-pressed',String(playing));
    revealButton.setAttribute('aria-pressed',String(reveal));
    play.disabled=scrub.disabled=speed.disabled=revealButton.disabled=!allowed;
    resetButton.disabled=!active||(!angle&&!playing);
    hint.textContent=allowed?'Illustrative motion · Valve lift, VVT-i phase and combustion are not simulated.':'Reassemble in Spatial layout to play.';
    panel.dataset.playing=String(playing);panel.dataset.reveal=String(reveal);
    const degrees=Math.round(angle*180/Math.PI);
    if(degrees!==lastReadout){scrub.value=String(degrees);readout.value=degrees+'°';lastReadout=degrees;}
  }
  function rotate(piece, pivot, rotation, destination=pivot) {
    const {object,position,quaternion,axis}=piece;
    object.position.copy(position).sub(pivot).applyAxisAngle(axis,rotation).add(destination);
    object.quaternion.setFromAxisAngle(axis,rotation).multiply(quaternion);
  }
  function apply() {
    for(const p of pieces) {
      const {object,position,quaternion,m,role}=p;
      // Exact rest restoration prevents accumulated transform drift.
      if(angle===0){object.position.copy(position);object.quaternion.copy(quaternion);continue;}
      if(role==='rotate')rotate(p,p.pivot,angle*m.ratio);
      else {
        const pose=linkagePose(m,angle);
        if(role==='piston')object.position.copy(position).add(p.vector.set(...pose.pin).sub(p.pin));
        else {
          const rotation=Math.atan2(pose.pin[1]-pose.end[1],pose.pin[0]-pose.end[0])-p.rodAngle;
          rotate(p,p.end,rotation,p.vector.set(...pose.end));
        }
      }
      object.updateMatrix();
    }
  }
  function pause(message) {playing=false;sync();if(message)announce(message);}
  function reset({clearReveal=false}={}) {
    playing=false;angle=0;apply();
    if(clearReveal&&reveal){reveal=false;appearanceChanged();}
    sync();
  }
  play.addEventListener('click',()=>{
    if(!allowed)return;
    playing=!playing;
    if(playing&&!reveal){reveal=true;appearanceChanged();}
    sync();announce(playing?'Engine motion playing slowly. Internals revealed.':'Engine motion paused.');
  });
  revealButton.addEventListener('click',()=>{reveal=!reveal;sync();appearanceChanged();});
  scrub.addEventListener('input',()=>{playing=false;angle=Number(scrub.value)*Math.PI/180;apply();sync();});
  resetButton.addEventListener('click',()=>{reset();announce('Engine motion returned to its reference pose.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause('Engine motion paused while the page is hidden.');});
  window.addEventListener('pagehide',()=>pause());
  return {
    bind(model) {
      reset({clearReveal:true});pieces=[];active=Boolean(model);allowed=false;
      model?.traverse(object=>{
        const role=object.userData.motionRole,m=object.userData.motion;
        // Multi-material glTF nodes load as Groups; the rig belongs to that node.
        if(!['rotate','piston','rod'].includes(role)||!m)return;
        const vector=object.position.clone(),p={object,role,m,vector,position:object.position.clone(),quaternion:object.quaternion.clone(),axis:vector.clone().set(0,0,1)};
        if(role==='rotate')p.pivot=vector.clone().set(...m.pivot);
        else {p.end=vector.clone().set(...m.restEnd);p.pin=vector.clone().set(...m.restPin);p.rodAngle=Math.atan2(m.restPin[1]-m.restEnd[1],m.restPin[0]-m.restEnd[0]);}
        pieces.push(p);
      });
      if(active&&!pieces.length)throw new Error('Engine motion geometry unavailable');
      sync();
    },
    setAvailable(value) {value=active&&value;if(value===allowed)return;allowed=value;if(!value)reset({clearReveal:true});sync();},
    tick(dt) {if(!playing||!allowed||document.hidden)return false;angle=(angle+dt*Math.PI/2*Number(speed.value))%(TAU*2);apply();sync();return true;},
    reset,
    leave() {reset({clearReveal:true});active=false;allowed=false;sync();},
    isGhost(id) {return active&&reveal&&!opaque.has(id)&&!id.includes('-piston-rod-')&&!id.endsWith('-camshaft');}
  };
}
