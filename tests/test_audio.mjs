import assert from 'node:assert/strict';
import { GameAudio,soundWave } from '../web/audio.js';
for(const kind of ['shot','reload','click','impact','phone','door']){const a=soundWave(kind,48000);assert.ok(a.length>0);assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=.850001));assert.ok(a.some(v=>Math.abs(v)>.001));assert.ok(a[0]===0);}
const audio=new GameAudio();assert.equal(audio.play('shot'),false);assert.equal(await audio.unlock(),false);audio.configure(false,5);assert.equal(audio.volume,1);assert.equal(audio.enabled,false);console.log('Sound samples, volume clamp and unavailable audio fallback OK');
