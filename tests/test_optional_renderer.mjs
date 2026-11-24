// Exercise the actual isolated renderer method without requiring WebGL/Three.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../web/engine/renderer.js',import.meta.url),'utf8');
const start=code.indexOf('  async loadOptionalWeaponPhotos('),end=code.indexOf('  async loadRealism(',start);
assert.ok(start>=0&&end>start);
const warnings=[];
const method=vm.runInNewContext('({'+code.slice(start,end)+'}).loadOptionalWeaponPhotos',{console:{warn:(...args)=>warnings.push(args)}});
const renderer={photoPaths:{}};
const path=url=>{if(!url.startsWith('/assets/polyhaven/'))throw new Error('bad path');return url;};
await method.call(renderer,{},path,null);assert.equal(JSON.stringify(renderer.photoPaths),'{}');
await method.call(renderer,{photos:{pistol:'/assets/polyhaven/photos/pistol.png',rifle:'/assets/polyhaven/photos/rifle.jpg'}},path,null);
assert.equal(JSON.stringify(renderer.photoPaths),JSON.stringify({pistol:'/assets/polyhaven/photos/pistol.png',rifle:'/assets/polyhaven/photos/rifle.jpg'}));
await method.call(renderer,{photos:{pistol:'https://example.invalid/foo'}},path,null);
assert.equal(warnings.length,1);
assert.equal(JSON.stringify(renderer.photoPaths),'{}');
console.log('Optional renderer photo paths: absent, valid and unsafe path OK');
