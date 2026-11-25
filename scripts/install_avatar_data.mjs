// Install exactly the dataset version used by the pinned npm generator.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {DEFAULT_ASSETS_URL,ANIMATIONS} from 'ara3d';
const version=/ara3d-data@(\d+\.\d+\.\d+)\/assets\//.exec(DEFAULT_ASSETS_URL)?.[1];
if(!version)throw Error('Unrecognized ara3d data pin: '+DEFAULT_ASSETS_URL);
for(const id of ['idle','walk','run','crouch'])if(!ANIMATIONS.some(c=>c.id===id))throw Error('Missing animation '+id);
execFileSync('npm',['install','--no-audit','--no-fund','--save-exact','ara3d-data@'+version],{stdio:'inherit'});
if(!fs.statSync('node_modules/ara3d-data/assets').isDirectory())throw Error('Missing character dataset');
console.log('Pinned MakeHuman character data:',version);
