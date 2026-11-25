// Locally hosted, pinned Ara generator. Standard looks are prebuilt at image build time.
import {createCharacterGLB,ANIMATIONS} from 'ara3d';
import options from './character_options.json';
import schema from './avatar-schema.json';
import {avatarRecipe,resolveAvatarRecipe,standardProfiles} from './avatar_recipe.js';
const ids=['idle','walk','run','crouch'];
const clips=Object.fromEntries(ids.map(id=>[id,ANIMATIONS.find(c=>c.id===id)?.name]));
const profiles=standardProfiles(options);
const starterKeys=new Map(Object.entries(profiles).map(([name,profile])=>[JSON.stringify(avatarRecipe(profile,options)),name]));
export async function generateAvatar(recipe,{forceGenerate=false}={}){
 if(ids.some(id=>!clips[id]))throw Error('Missing required character animation');
 const name=starterKeys.get(JSON.stringify(recipe));
 if(name&&!forceGenerate){
  const res=await fetch('/assets/avatars/data/second-live-'+name+'.glb',{signal:AbortSignal.timeout(20000)});
  if(res.ok)return {bytes:await res.arrayBuffer(),clips};
 }
 const input=resolveAvatarRecipe(recipe,schema);
 const bytes=await createCharacterGLB(input,{
  assetsUrl:new URL('/assets/avatars/data/',location.origin).href,
  animations:ids,detail:'low',rootMotion:false,weapon:'none',carry:'none',vehicle:'none'
 });
 if(!(bytes instanceof Uint8Array))throw Error('Avatar generator returned invalid GLB');
 return {bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),clips};
}
