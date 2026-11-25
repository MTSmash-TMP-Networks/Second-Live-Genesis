// This module is bundled separately so the room renderer never depends on
// the character worker during startup or in Node-only smoke tests.
import {createCharacterGLB,ANIMATIONS} from 'ara3d';
const ids=['idle','walk','run','crouch'];
export async function generateAvatar(recipe){
 const clips=Object.fromEntries(ids.map(id=>[id,ANIMATIONS.find(c=>c.id===id)?.name]));
 if(ids.some(id=>!clips[id]))throw Error('Missing required character animation');
 const bytes=await createCharacterGLB({kind:'ara-character',version:1,params:recipe.params},{
  assetsUrl:new URL('/assets/avatars/data/',location.origin).href,
  animations:ids,detail:'low',rootMotion:false,weapon:'none',carry:'none',vehicle:'none',colors:recipe.colors
 });
 if(!(bytes instanceof Uint8Array))throw Error('Avatar generator returned invalid GLB');
 return {bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),clips};
}
