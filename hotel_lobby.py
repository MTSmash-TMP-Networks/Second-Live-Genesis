"""Bounded, ephemeral hotel lobby presence, keyed by authenticated player.
No private home state, credentials or client-supplied identities are published.
"""
import json, math, secrets, threading, time
from pathlib import Path
from world_capture import CaptureError

LAYOUT=json.loads((Path(__file__).resolve().parent/'web/engine/lobby_layout.json').read_text('utf8'))
CAPACITY=LAYOUT['roomsPerSide']*2
LEASE=LAYOUT['leaseSeconds']

def door(slot):
    side=-1 if slot<LAYOUT['roomsPerSide'] else 1
    z=LAYOUT['firstDoorZ']+(slot%LAYOUT['roomsPerSide'])*LAYOUT['doorSpacing']
    return side,z

def spawn(slot):
    side,z=door(slot)
    return [side*(LAYOUT['halfWidth']-.65),0,z],side*math.pi/2

def pose(data):
    p=data.get('position');yaw=data.get('yaw')
    def number(v):return type(v) in (int,float) and abs(v)<=1_000_000 and math.isfinite(v)
    if not isinstance(p,list) or len(p)!=3 or not all(map(number,p)) or not number(yaw):
        raise CaptureError('Ungueltige Flurposition',400)
    x,y,z=p;m=LAYOUT['playerMargin']
    if abs(x)>LAYOUT['halfWidth']-m+.001 or abs(z)>LAYOUT['halfLength']-m+.001 or not 0<=y<=1.2:
        raise CaptureError('Position ausserhalb des Hotelflurs',400)
    return [round(v,3) for v in p],round(math.remainder(yaw,2*math.pi),4)

class HotelLobby:
    def __init__(self,clock=time.monotonic):
        self.clock=clock;self.lock=threading.Lock();self.players={}
    def prune(self,now):
        for player,row in list(self.players.items()):
            if now-row['seen']>=LEASE:del self.players[player]
    def snapshot(self,player,row):
        peers=[{'slot':r['slot'],'position':list(r['position']),'yaw':r['yaw']}
               for key,r in self.players.items() if key!=player]
        return {'slot':row['slot'],'peers':peers,'online':len(self.players),'capacity':CAPACITY}
    def request(self,player,data):
        if not isinstance(data,dict):raise CaptureError('JSON-Objekt erwartet',400)
        op=data.get('action')
        if op not in ('enter','update','leave'):raise CaptureError('Unbekannte Fluraktion',400)
        with self.lock:
            now=self.clock();self.prune(now);row=self.players.get(player)
            if op=='enter':
                # One presence per existing private identity. Re-entering revokes
                # an older tab's lease; room allocation lasts for this visit.
                occupied={r['slot'] for key,r in self.players.items() if key!=player}
                slot=row['slot'] if row else next((s for s in range(CAPACITY) if s not in occupied),None)
                if slot is None:raise CaptureError('Der Hotelflur ist momentan voll',429)
                p,yaw=spawn(slot);row={'slot':slot,'lease':secrets.token_urlsafe(24),'seen':now,'position':p,'yaw':yaw}
                self.players[player]=row
                return {**self.snapshot(player,row),'lease':row['lease'],'position':p,'yaw':yaw}
            supplied=data.get('lease')
            if not row or not isinstance(supplied,str) or len(supplied)>64 or not secrets.compare_digest(row['lease'],supplied):
                raise CaptureError('Flursitzung abgelaufen; bitte erneut betreten',409)
            if op=='leave':
                del self.players[player];return {'left':True}
            p,yaw=pose(data)
            # Positions are client-driven, but bound impossible jumps and floods.
            elapsed=now-row['seen']
            if math.hypot(p[0]-row['position'][0],p[2]-row['position'][2])>max(.65,elapsed*6+.35):
                raise CaptureError('Positionssprung im Flur nicht erlaubt',400)
            row.update(position=p,yaw=yaw,seen=now)
            return self.snapshot(player,row)
