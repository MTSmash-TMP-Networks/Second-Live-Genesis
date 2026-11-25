import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withAssetDeadline } from '../web/engine/optional_asset.js';
assert.equal(await withAssetDeadline(()=>Promise.resolve('ready'),50),'ready');
await assert.rejects(withAssetDeadline(()=>{throw Error('broken model')},50),/broken model/);
await assert.rejects(withAssetDeadline(()=>new Promise(()=>{}),10),/timeout/);
// A late decoder rejection is handled; it cannot change the chosen fallback.
await assert.rejects(withAssetDeadline(()=>new Promise((_,reject)=>setTimeout(()=>reject(Error('late')),35)),5),/timeout/);
await new Promise(resolve=>setTimeout(resolve,45));
const renderer=fs.readFileSync(new URL('../web/engine/renderer.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.py',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
assert(!renderer.includes('KTX2Loader'));assert(!renderer.includes('setKTX2Loader'));
assert(server.includes("script-src 'self' 'wasm-unsafe-eval'"));assert(!server.includes("'unsafe-eval'"));assert(!server.includes('basis_transcoder'));
assert(docker.includes('COPY --from=door-converted /build/polyhaven /app/web/assets/polyhaven/'));
assert(!docker.includes('/app/web/assets/decoders/basis_transcoder'));
assert(renderer.includes('new GLTFLoader(new THREE.LoadingManager()).setMeshoptDecoder(MeshoptDecoder)'));
console.log('Door timeout, late rejection, isolated load manager and strict CSP OK');
