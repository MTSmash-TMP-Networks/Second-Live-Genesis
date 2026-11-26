// Fictional game sound design; no microphone or remote service.
// Original German "Hallo!" synthesized offline with eSpeak, encoded as 16 kHz MP3.
// No voice recording from the television series and no remote TTS request.
export const HELLO_MP3='SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAzAAAAAAAAAAAAAAD/8yjEAAw4noSzQRgABCCn//gAMYxjGMbL0REKgAAgIAgc8oGIIBh+X//BA5B8Hz/E7/1g+//6wfNfqBD4PgFl3xOP/8/+3jf/8yjECg9YnsDLgTAAtGc9RjELwFZTyhkMNCIUdqbv6Nd8nYh7SgeYuLlxKccgpzAZhAvTCISdNfxoulXKIbc5NWeIiM3HgFP/8yjEBw7I3wr52EgCvLa8E6KWPKpgZbEXnnFM5FKIBR7dqgquXF//DDPqMfr+My4b26h/0Ga4bFZSLbAC///4xCp4MOJiOJz/8yjEBg3o2tiqO9jgSrFQm0Fr0GHqTZZTnWfkfZQ7w7cmWNmicxrycnWnHf//4IhUHgCTM/2AAWA4mA5BSFVNquAgLhsHntr/8yjECQ7JmtoaCwoeg6zrJfkdAKFz7zBTKMv9rqqssH1xEW1LobGAZ5xX9Df////peWWzipn6WmXGjxo9Ow0quRgowMGjnHX/8yjECA6Izr1UE9AMBOiEnwtZLrl/JuCKnkm1AsDY7yrrv330m8sfXTjihYf///nRQCAbIa3lxrLblSE1ILfVmaGvYhu3UHz/8yjECA2pwswAYAVIrCcsH5eNSoO8CylJvix9g8WdA6ZwMW+ct8zMz++p3IQjs4hUBvZ4d5BZw8rmlULEBuugVKAMSk4cG83/8yjEDA1IjvW8CbBmlx8XgiDbEceXJmDvtUKkDcN1AQISNLpXcX///7biJsJnDAu4gwHmf/dVxJAEAOQGwAE3FfTHOruSbhz/8yjEEQ0YjuJ3TDAAFrFLyclWY3mD7EglxVWCUblm///+YLhVovlRRQhN/8q86JFqa1zLijEpUUpkS3m8LECeGKRKCElC+DD/8yjEFxMB0sABj2gAQK0JaSwW4lRxEIK0LSSqAfxklBYW4Sou//////6mT+Ykz1mpju5stHSe5eO81UtRkItAb+oB4ApZERD/8yjEBgyYhmwVyTAAqJkSJFlSlJEFgDACJVhUTTIQCgBACAlmkSJENVgq7K///WGhEDP5bBrLf4NVTEFNRTMuMTAwVVVVVVX/8yjEDgAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8yjESQAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8yjEhAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8yjEvwAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(+v)?+v:.55));
function rand(seed){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296*2-1;};}
export function rainLoopWave(rate){
  const count=Math.ceil(rate*4),fade=Math.max(1,Math.ceil(rate*.13)),raw=new Float32Array(count+fade),noise=rand(53941);
  let low=0,mid=0;const slow=1-Math.exp(-2*Math.PI*170/rate),fast=1-Math.exp(-2*Math.PI*2300/rate);
  for(let i=0;i<raw.length;i++){
    const n=noise();low+=(n-low)*slow;mid+=(n-mid)*fast;
    raw[i]=(.21*(n-mid)+.42*mid+.22*low)*(.88+.12*Math.sin(2*Math.PI*i/(rate*2.7)));
  }
  const wave=new Float32Array(count);
  for(let i=0;i<count;i++){
    const t=Math.max(0,(i-(count-fade))/fade);
    wave[i]=raw[i+fade]*(1-t)+(t>0?raw[i-count+fade]*t:0);
  }
  return wave;
}
export function soundWave(kind,rate,variant=0){
  const duration={shot:.32,click:.07,reload:.15,impact:.19,phone:.10,door:.44,thunder:3.2}[kind]||.1;
  const out=new Float32Array(Math.ceil(rate*duration)),noise=rand(7641+variant*7919+kind.length*71);let low=0,rumble=0,bass=0;
  for(let i=0;i<out.length;i++){
    const t=i/rate,n=noise();low=.86*low+.14*n;let v;
    if(kind==='shot')v=(.56*n*Math.exp(-t*72)+.61*low*Math.exp(-t*18)+.25*Math.sin(2*Math.PI*(85+variant*8)*t)*Math.exp(-t*32));
    else if(kind==='thunder'){
      rumble+=(n-rumble)*(1-Math.exp(-2*Math.PI*110/rate));bass+=(n-bass)*(1-Math.exp(-2*Math.PI*34/rate));
      const attack=Math.min(1,t/.075),decay=Math.exp(-t*.95),roll=.65+.35*Math.sin(t*9+variant*.9)**2;
      v=attack*decay*(rumble*1.6+bass*1.8)*roll+.26*(n-low)*Math.exp(-Math.abs(t-.10)*18)+.10*low*Math.exp(-Math.abs(t-.67)*9);
    }
    else if(kind==='reload')v=(.48*(n-low)+.16*Math.sin(2*Math.PI*870*t))*Math.exp(-t*36)+.17*low*Math.exp(-Math.abs(t-.065)*110);
    else if(kind==='impact')v=(.45*low+.22*n)*Math.exp(-t*27);
    else if(kind==='door')v=(.24*low+.10*Math.sin(2*Math.PI*(118+30*t)*t))*Math.sin(Math.PI*t/duration)*Math.exp(-t*2);
    else if(kind==='phone')v=.19*Math.sin(2*Math.PI*(660+variant*90)*t)*Math.exp(-t*47);
    else v=(.37*n+.11*Math.sin(2*Math.PI*1200*t))*Math.exp(-t*86);
    const envelope=Math.min(1,t/.001,(duration-t)/.012);
    // Explicit positive zero at silent envelope boundaries: negative noise
    // multiplied by zero would otherwise store -0 in the Float32Array.
    out[i]=envelope===0?0:Math.max(-.85,Math.min(.85,v))*envelope;
  }return out;
}
export class GameAudio {
  constructor(){this.ctx=null;this.buffers=new Map();this.sources=new Set();this.enabled=true;this.volume=.55;this.variant=0;try{const saved=JSON.parse(localStorage.getItem('sl_audio_v1')||'null');if(saved){this.enabled=saved.enabled!==false;this.volume=clamp(saved.volume);}}catch{}}
  configure(enabled,volume){this.enabled=!!enabled;this.volume=clamp(volume);try{localStorage.setItem('sl_audio_v1',JSON.stringify({enabled:this.enabled,volume:this.volume}));}catch{}this.applyVolume();if(!this.enabled)this.stopAll();}
  applyVolume(){if(this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume*.55:0,this.ctx.currentTime,.02);}
  async unlock(){try{if(!this.ctx){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return false;this.ctx=new C();const c=this.ctx;this.master=c.createGain();this.master.gain.value=this.enabled?this.volume*.55:0;const limiter=c.createDynamicsCompressor();limiter.threshold.value=-19;limiter.knee.value=14;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.18;this.master.connect(limiter).connect(c.destination);this.reverb=c.createConvolver();const ir=c.createBuffer(2,Math.ceil(c.sampleRate*.37),c.sampleRate);for(let ch=0;ch<2;ch++){const a=ir.getChannelData(ch),r=rand(1105+ch*71);for(let i=0;i<a.length;i++)a[i]=r()*Math.pow(1-i/a.length,3)*.21;}this.reverb.buffer=ir;const wet=c.createGain();wet.gain.value=.18;this.reverb.connect(wet).connect(this.master);
      const bytes=Uint8Array.from(atob(HELLO_MP3),v=>v.charCodeAt(0));
      this.greetingReady=c.decodeAudioData(bytes.buffer).then(buffer=>{this.buffers.set('greeting:0',buffer);return true;}).catch(()=>false);
    }if(this.ctx.state!=='running')await this.ctx.resume();return this.ctx.state==='running';}catch{return false;}}
  listener(eye,dir){const l=this.ctx?.listener;if(!l)return;try{if(l.positionX){l.positionX.value=eye[0];l.positionY.value=eye[1];l.positionZ.value=eye[2];l.forwardX.value=dir[0];l.forwardY.value=dir[1];l.forwardZ.value=dir[2];l.upX.value=0;l.upY.value=1;l.upZ.value=0;}else{l.setPosition(...eye);l.setOrientation(...dir,0,1,0);}}catch{}}
  play(kind,position=null,variant=null,gain=1){const c=this.ctx;if(!this.enabled||!c||c.state!=='running'||this.sources.size>=28)return false;try{const v=kind==='greeting'?0:(variant??this.variant++%4),key=kind+':'+v;let buffer=this.buffers.get(key);if(kind==='greeting'&&!buffer)return false;if(!buffer){const wave=soundWave(kind,c.sampleRate,v);buffer=c.createBuffer(1,wave.length,c.sampleRate);buffer.copyToChannel(wave,0);this.buffers.set(key,buffer);}const source=c.createBufferSource(),level=c.createGain();source.buffer=buffer;level.gain.value=(kind==='greeting'?1.5:kind==='shot'?.82:kind==='impact'?.48:kind==='thunder'?.82:.55)*clamp(gain);source.connect(level);let node=level,panner=null;if(position&&position.every(Number.isFinite)&&c.createPanner){panner=c.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=1.2;panner.maxDistance=20;panner.rolloffFactor=.8;if(panner.positionX){panner.positionX.value=position[0];panner.positionY.value=position[1];panner.positionZ.value=position[2];}else panner.setPosition(...position);level.connect(panner);node=panner;}node.connect(this.master);if(kind==='shot'||kind==='impact'||kind==='door')node.connect(this.reverb);this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();level.disconnect();panner?.disconnect();};source.start();return true;}catch{return false;}}
  weather(rain,sheltered=false,thunder=false){
    const c=this.ctx;if(!this.enabled||!c||c.state!=='running'){this.stopWeather();return;}
    const intensity=clamp(rain);if(thunder)this.play('thunder',null,null,sheltered?.46:.85);
    if(intensity<.008){this.stopWeather();return;}
    try{
      if(!this.rainNodes){
        const key='weather:rain';let buffer=this.buffers.get(key);
        if(!buffer){const wave=rainLoopWave(c.sampleRate);buffer=c.createBuffer(1,wave.length,c.sampleRate);buffer.copyToChannel(wave,0);this.buffers.set(key,buffer);}
        const source=c.createBufferSource(),filter=c.createBiquadFilter(),level=c.createGain();
        source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=sheltered?720:5800;level.gain.value=0;
        source.connect(filter);filter.connect(level);level.connect(this.master);
        this.rainNodes={source,filter,level};source.start();
      }
      const {filter,level}=this.rainNodes;
      level.gain.setTargetAtTime(intensity*(sheltered?.16:.68),c.currentTime,.25);
      filter.frequency.setTargetAtTime(sheltered?720:5800,c.currentTime,.25);
    }catch{this.stopWeather();}
  }
  stopWeather(){const nodes=this.rainNodes;if(!nodes)return;this.rainNodes=null;try{nodes.source.stop();}catch{}for(const node of Object.values(nodes))try{node.disconnect();}catch{}}
  stopAll(){this.stopWeather();for(const s of [...this.sources]){try{s.stop();}catch{}}}
}
