const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export function validateHairIdle(config){
  if(config?.mode!=='yaw-centered-idle-state-review'||
     !Number.isFinite(config.settleSeconds)||config.settleSeconds<.1||
     config.settleSeconds>1||
     !Number.isFinite(config.resumeRate)||config.resumeRate<1||
     config.resumeRate>10||
     !config.parts||!['fronthair','backhair'].every(name=>{
       const part=config.parts[name];
       return part&&Number.isFinite(part.amplitude)&&
         part.amplitude>=0&&part.amplitude<=.6&&
         Number.isFinite(part.phase);
     }))throw Error('頭髮待機狀態設定無效');
}

export function initialHairIdleState(yaw=0){
  return {lastYaw:clamp(yaw,-1,1),quietSeconds:0,idleMix:0,mode:'turn'};
}

export function advanceHairIdle(state,yaw,dt,time,enabled,strength,config){
  validateHairIdle(config);
  const base=clamp(yaw,-1,1),step=clamp(dt,0,.05);
  const moved=Math.abs(base-state.lastYaw)>1e-5;
  const quiet=moved?0:state.quietSeconds+step;
  const turning=quiet<config.settleSeconds;
  const idleEnabled=Boolean(enabled)&&clamp(strength,0,1)>0;
  const mode=turning?'turn':idleEnabled?'idle':'held';
  const desiredMix=mode==='idle'?1:0;
  // Turn input overrides idle immediately; idle returns gradually after the
  // control stops, without changing the current yaw-centred rest position.
  const idleMix=moved?0:state.idleMix+
    (desiredMix-state.idleMix)*(1-Math.exp(-config.resumeRate*step));
  const targets={};
  for(const name of ['fronthair','backhair']){
    const part=config.parts[name],phase=part.phase;
    const wave=(.76*Math.sin(time*.82+phase)+
      .24*Math.sin(time*1.39+phase*1.7));
    targets[name]=clamp(base+idleMix*clamp(strength,0,1)*
      part.amplitude*wave,-1.15,1.15);
  }
  return {state:{lastYaw:base,quietSeconds:quiet,idleMix,mode},targets};
}
