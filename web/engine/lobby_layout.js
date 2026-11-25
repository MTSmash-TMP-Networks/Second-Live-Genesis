// Shared corridor dimensions, identical to server validation.
import layout from './lobby_layout.json';
export const LOBBY_LAYOUT=layout;
export const LOBBY_CAPACITY=layout.roomsPerSide*2;
export function lobbyDoor(slot){
 if(!Number.isInteger(slot)||slot<0||slot>=LOBBY_CAPACITY)return null;
 const side=slot<layout.roomsPerSide?-1:1,z=layout.firstDoorZ+(slot%layout.roomsPerSide)*layout.doorSpacing;
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
 const i=Math.round((z-layout.firstDoorZ)/layout.doorSpacing);
 if(i<0||i>=layout.roomsPerSide)return null;
 const door=lobbyDoor(i+(side===1?layout.roomsPerSide:0));
 return Math.abs(z-door.z)<=layout.doorWidth/2+.10?door:null;
}
