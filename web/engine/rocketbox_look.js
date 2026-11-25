// Only settings that genuinely exist in the prepared Rocketbox GLBs.
import catalog from './rocketbox_manifest.json';
export const ROCKETBOX_CATALOG=catalog;
export function rocketboxLook(profile,options,manifest){
 const model=manifest.models[profile.model-1]||manifest.models.find(m=>m.id===(profile.body===3?'emma':'ryan'));
 const top=['tee','formal','shirt','original'][profile.top]||'original';
 const color=(key,index)=>'#'+options[key].colors[index];
 return {model,top,tint:profile.topColor===options.topColor.values.length-1?null:color('topColor',profile.topColor),trousers:color('trousersColor',profile.trousersColor),height:[1.65,1.77,1.90][profile.height]||1.77};
}
export const resolveRocketboxLook=(profile,options)=>rocketboxLook(profile,options,catalog);
export const OUTFIT_PARTS={
 original:['Outfit_original','Skin_original'],
 formal:['Outfit_formal','Skin_formal'],
 shirt:['Top_shirt','Skin_shirt','Trousers','Shoes'],
 tee:['Top_tee','Skin_tee','Trousers','Shoes']
};
export function outfitParts(top,available){
 if(top==='formal'&&!available.has('Outfit_formal'))top='original';
 if((top==='shirt'||top==='tee')&&!available.has(top==='shirt'?'Top_shirt':'Top_tee'))top='original';
 return {top,visible:new Set(OUTFIT_PARTS[top]||OUTFIT_PARTS.original)};
}

// Stable staff identity, independent of any player profile or editor defaults.
export function hotelNpcProfile(defaults,catalog){
 const model=catalog.models.findIndex(m=>m.id==='daniel'&&m.outfit==='formal')+1;
 if(!model)throw Error('Missing hotel staff Rocketbox model');
 return {...defaults,model,body:1,height:1,top:1,topColor:8,trousers:1,trousersColor:3,shoes:2,beard:0,glasses:0};
}
export function isGreetingTrack(name){
 // Include upper-body bone tracks only. Never override hips, legs, feet or root motion.
 return /(?:shoulder|clavicle|forearm|upperarm|(?:left|right)arm|hand|thumb|index|middle|ring|pinky|finger)/i.test(name.split('.')[0])&&/\.(quaternion|rotation)$/.test(name);
}
