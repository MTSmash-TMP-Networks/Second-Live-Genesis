// Shared corridor dimensions, identical to server validation.
import layout from './lobby_layout.json';
export const LOBBY_LAYOUT=layout;
export const LOBBY_CAPACITY=layout.roomsPerSide*2;
export function lobbyDoor(slot){
 if(!Number.isInteger(slot)||slot<0||slot>=LOBBY_CAPACITY)return null;
 const side=slot<layout.roomsPerSide?-1:1,i=slot%layout.roomsPerSide,z=layout.firstDoorZ+i*layout.doorSpacing+Math.floor(i/2)*layout.pairGap;
 return {slot,number:layout.firstRoom+slot,side,z,x:side*layout.halfWidth};
}
export function lobbyWalkable(x,z){
 return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=layout.halfWidth-layout.playerMargin&&Math.abs(z)<=layout.halfLength-layout.playerMargin;
}
export function lobbyDoorAt(origin,direction){
 // Side-wall intersection, then test the exact door aperture. No selection
 // through the end wall, floor or ceiling. Only reachable from inside the hall.
 if(Math.abs(direction[0])<1e-8)return null;
 const side=Math.sign(direction[0]),t=(side*layout.halfWidth-origin[0])/direction[0];
 if(t<0||t>3)return null;
 const y=origin[1]+t*direction[1],z=origin[2]+t*direction[2];
 if(y<0||y>layout.doorHeight||Math.abs(z)>layout.halfLength)return null;
 for(let i=0;i<layout.roomsPerSide;i++){const door=lobbyDoor(i+(side===1?layout.roomsPerSide:0));if(Math.abs(z-door.z)<=layout.doorWidth/2+.10)return door;}
 return null;
}

export function pairedRoom(slot){
 if(!lobbyDoor(slot))return null;
 return slot%2===0?slot+1:slot-1;
}
// The two rooms of each pair are mirrored. Their existing exterior windows
// face light wells, while their solid east walls share one partition.
export function roomHallTransform(slot){
 const d=lobbyDoor(slot);if(!d)return null;
 const mirror=-d.side*(slot%2===0?1:-1);
 return {rotation:-d.side*Math.PI/2,mirror,p:[d.side*mirror*d.z,0,-5.1-layout.halfWidth]};
}
export function hallToRoom(slot,p){
 const t=roomHallTransform(slot);if(!t)return null;
 const c=Math.cos(t.rotation),s=Math.sin(t.rotation),z=p[2]*t.mirror;
 return [t.p[0]+c*p[0]+s*z,p[1],t.p[2]-s*p[0]+c*z];
}
