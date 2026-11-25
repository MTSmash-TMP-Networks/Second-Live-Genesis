import assert from 'node:assert/strict';
import options from './character_options.json';
import {ROCKETBOX_CATALOG,resolveRocketboxLook,outfitParts} from './rocketbox_look.js';
const defaults=Object.fromEntries(Object.entries(options).map(([k,v])=>[k,v.default]));
assert.equal(ROCKETBOX_CATALOG.models.length,20);
assert.equal(options.model.values.length,21);
assert.equal(resolveRocketboxLook(defaults,options).model.id,'ryan');
assert.equal(resolveRocketboxLook({...defaults,body:3},options).model.id,'emma');
const chosen=new Set();
for(let model=1;model<options.model.values.length;model++){
 const look=resolveRocketboxLook({...defaults,model},options);
 assert.match(look.model.file,/^[a-z]+_(formal|casual|smart)\.glb$/);
 assert.match(look.model.sha,/^[a-f0-9]{40}$/);
 assert.ok(look.model.size>1000000);chosen.add(look.model.file);
}
assert.equal(chosen.size,20);
for(const key of ['height','top','topColor','trousersColor']){
 const results=new Set();
 for(let i=0;i<options[key].values.length;i++)results.add(JSON.stringify(resolveRocketboxLook({...defaults,[key]:i},options)));
 assert.equal(results.size,options[key].values.length,key);
}
const parts=new Set(['Outfit_original','Skin_original','Outfit_formal','Skin_formal','Top_shirt','Skin_shirt','Top_tee','Skin_tee','Trousers','Shoes']);
assert.deepEqual([...outfitParts('tee',parts).visible],['Top_tee','Skin_tee','Trousers','Shoes']);
assert.deepEqual([...outfitParts('formal',parts).visible],['Outfit_formal','Skin_formal']);
parts.delete('Outfit_formal');assert.equal(outfitParts('formal',parts).top,'original');
console.log('Rocketbox: 20 identities, supported outfit controls and old profile mapping validated');
