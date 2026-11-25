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
STANCES=('walk','sprint','crouch')
SPRINT_SPEED=5.8
NPC_SPEED=LAYOUT['npcSpeed']
NPC_TURN=LAYOUT['npcTurnSeconds']

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

def npc_patrol(elapsed):
    """Shared clock-driven route: steady walk, brief stationary turn, then return."""
    elapsed=max(0,elapsed)
    edge=LAYOUT['halfLength']-2.0
    leg=2*edge/NPC_SPEED
    half=leg+NPC_TURN
    t=(elapsed+4.0/NPC_SPEED)%(2*half)
    reverse=t>=half
    if reverse:t-=half
    walking=t<leg
    d=min(t,leg)*NPC_SPEED
    z=edge-d if reverse else -edge+d
    yaw=0.0 if reverse else math.pi
    if not walking:
        u=min(1.0,max(0.0,(t-leg)/NPC_TURN))
        yaw+=math.pi*u*u*(3-2*u)
    return {'position':[.62,0,round(z,3)],'yaw':round(yaw%(2*math.pi),4),'walking':walking,'phase':round(elapsed,3)}


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
        self.clock=clock;self.started=clock();self.lock=threading.Lock();self.players={}
    def prune(self,now):
        for player,row in list(self.players.items()):
            if now-row['seen']>=LEASE:del self.players[player]
    def observe(self,player,profile,directory):
        with self.lock:
            self.prune(self.clock())
            return self.snapshot(player,{'slot':profile['slot']},directory)
    def snapshot(self,player,row,directory):
        peers=[{'slot':r['slot'],'position':list(r['position']),'yaw':r['yaw'],'nickname':r['nickname'],'avatar':r['avatar'],'stance':r.get('stance','walk')}
               for key,r in self.players.items() if key!=player]
        return {'slot':row['slot'],'peers':peers,'online':len(self.players),'capacity':CAPACITY,'rooms':directory,'npc':npc_patrol(self.clock()-self.started)}
    def take_free(self,player,lease):
        with self.lock:
            self.prune(self.clock());row=self.players.get(player)
            if not row or not isinstance(lease,str) or len(lease)>64 or not secrets.compare_digest(row['lease'],lease):
                raise CaptureError('Flursitzung abgelaufen',409)
            x,y,z=row['position']
            if abs(x)>1.4 or z>-LAYOUT['halfLength']+3.5:
                raise CaptureError('Bitte zur Free-World-Tuer gehen',400)
            del self.players[player]

    def return_free(self,player,profile,directory):
        result=self.request(player,{'action':'enter'},profile,directory)
        with self.lock:
            row=self.players[player];p=[0,0,-LAYOUT['halfLength']+1.5]
            row['position']=p;row['yaw']=math.pi
            result.update(position=p,yaw=math.pi)
        return result

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
                p,yaw=spawn(slot);row={'slot':slot,'lease':secrets.token_urlsafe(24),'seen':now,'position':p,'yaw':yaw,'nickname':profile['nickname'],'avatar':profile['avatar'],'stance':'walk'}
                self.players[player]=row
                return {**self.snapshot(player,row,directory),'lease':row['lease'],'position':p,'yaw':yaw}
            supplied=data.get('lease')
            if not row or not isinstance(supplied,str) or len(supplied)>64 or not secrets.compare_digest(row['lease'],supplied):
                raise CaptureError('Flursitzung abgelaufen; bitte erneut betreten',409)
            if op=='leave':
                del self.players[player];return {'left':True}
            p,yaw=pose(data)
            stance=data.get('stance','walk')
            if not isinstance(stance,str) or stance not in STANCES:
                raise CaptureError('Ungueltige Bewegungsart',400)
            # Positions are client-driven, but bound impossible jumps and floods.
            elapsed=now-row['seen']
            if math.hypot(p[0]-row['position'][0],p[2]-row['position'][2])>max(.65,elapsed*(SPRINT_SPEED+.6)+.35):
                raise CaptureError('Positionssprung im Flur nicht erlaubt',400)
            row.update(position=p,yaw=yaw,seen=now,nickname=profile['nickname'],avatar=profile['avatar'],stance=stance)
            return self.snapshot(player,row,directory)
