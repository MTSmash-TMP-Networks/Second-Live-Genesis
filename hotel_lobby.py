"""Bounded, ephemeral hotel lobby presence, keyed by authenticated player.
No private home state, credentials or client-supplied identities are published.
"""
import json, math, secrets, sqlite3, threading, time
from contextlib import closing
from wall_damage import WALLS, REMOVED
from pathlib import Path
from world_capture import CaptureError

LAYOUT=json.loads((Path(__file__).resolve().parent/'web/engine/lobby_layout.json').read_text('utf8'))
CAPACITY=LAYOUT['roomsPerSide']*2
LEASE=LAYOUT['leaseSeconds']

def door(slot):
    side=-1 if slot<LAYOUT['roomsPerSide'] else 1
    i=slot%LAYOUT['roomsPerSide']
    z=LAYOUT['firstDoorZ']+i*LAYOUT['doorSpacing']+(i//2)*LAYOUT['pairGap']
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

ENTRANCE_WALLS=('surface_8','surface_9','surface_10')

class FacadeDirectory:
    """Read-only public opening geometry; no private furnishing or account data."""
    def __init__(self,accounts,clock=time.monotonic):
        self.accounts=accounts;self.clock=clock;self.lock=threading.Lock()
        self.expires=0;self.value=[]
    def snapshot(self):
        with self.lock:
            now=self.clock()
            if now<self.expires:return self.value
            out=[]
            for slot,player in self.accounts.room_owners():
                path=self.accounts.capture.home_path(player)/'world.sqlite3'
                if not path.is_file():continue
                try:
                    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=.3)) as db:
                        rows=db.execute("SELECT target,col,row,stage FROM wall_cells WHERE target IN ('surface_8','surface_9','surface_10') AND stage=? ORDER BY target,row,col",(REMOVED,)).fetchall()
                except sqlite3.OperationalError as exc:
                    if 'no such table' in str(exc):continue
                    # A temporarily locked room must not falsely appear repaired.
                    return self.value
                walls={}
                for target,col,row,stage in rows:
                    w=WALLS[target]
                    if 0<=col<w['cols'] and 0<=row<w['rows']:
                        walls.setdefault(target,[]).append([col,row,stage])
                if walls:out.append({'slot':slot,'walls':walls})
            self.value=out;self.expires=now+1.0
            return out

class HotelLobby:
    def __init__(self,clock=time.monotonic):
        self.clock=clock;self.lock=threading.Lock();self.players={}
    def prune(self,now):
        for player,row in list(self.players.items()):
            if now-row['seen']>=LEASE:del self.players[player]
    def observe(self,player,profile,directory):
        with self.lock:
            self.prune(self.clock())
            return self.snapshot(player,{'slot':profile['slot']},directory)
    def snapshot(self,player,row,directory):
        peers=[{'slot':r['slot'],'position':list(r['position']),'yaw':r['yaw'],'nickname':r['nickname'],'avatar':r['avatar']}
               for key,r in self.players.items() if key!=player]
        return {'slot':row['slot'],'peers':peers,'online':len(self.players),'capacity':CAPACITY,'rooms':directory}
    def disconnect(self,player):
        with self.lock:self.players.pop(player,None)
    def request(self,player,data,profile,directory):
        if not isinstance(data,dict):raise CaptureError('JSON-Objekt erwartet',400)
        op=data.get('action')
        if op not in ('enter','update','leave'):raise CaptureError('Unbekannte Fluraktion',400)
        with self.lock:
            now=self.clock();self.prune(now);row=self.players.get(player)
            if op=='enter':
                # Fixed room slot comes from the authenticated account, never request data.
                slot=profile['slot']
                if type(slot) is not int or not 0<=slot<CAPACITY:raise CaptureError('Zimmer nicht verfuegbar',409)
                if any(r['slot']==slot for key,r in self.players.items() if key!=player):raise CaptureError('Zimmer bereits belegt',409)
                p,yaw=spawn(slot);row={'slot':slot,'lease':secrets.token_urlsafe(24),'seen':now,'position':p,'yaw':yaw,'nickname':profile['nickname'],'avatar':profile['avatar']}
                self.players[player]=row
                return {**self.snapshot(player,row,directory),'lease':row['lease'],'position':p,'yaw':yaw}
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
            row.update(position=p,yaw=yaw,seen=now,nickname=profile['nickname'],avatar=profile['avatar'])
            return self.snapshot(player,row,directory)
