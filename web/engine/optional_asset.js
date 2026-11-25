// Do not let a failed/unfinished optional GLTF load hold the room startup open.
export async function withAssetDeadline(load, ms=8000){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Optional asset load timeout')),ms);})
    ]);
  }finally{clearTimeout(timer);}
}
