"""Authoritative, arcade-style fictional vehicle traffic for Free World."""
import math
from bisect import bisect_left
from game_accounts import DEFAULT_AVATAR
from world_capture import CaptureError

STEP=.05
WIDTH=1.95
LENGTH=4.8
HEIGHT=1.65
MAX_SPEED=13.0
REVERSE=4.0

def clamp(v,lo,hi):return max(lo,min(hi,v))
def approach(v,target,delta):return v+clamp(target-v,-delta,delta)
def wrap(v):return math.atan2(math.sin(v),math.cos(v))
def need(ok,message,status=409):
    if not ok:raise CaptureError(message,status)

def local_point(p,yaw,x,z):
    c,s=math.cos(yaw),math.sin(yaw)
    return [p[0]+c*x+s*z,p[1],p[2]-s*x+c*z]

def car_bounds(position,yaw):
    c,s=abs(math.cos(yaw)),abs(math.sin(yaw))
    x=c*WIDTH+s*LENGTH;z=s*WIDTH+c*LENGTH
    return [[position[0]-x/2,position[1]+.12,position[2]-z/2],[x,HEIGHT,z]]

def intersects(position,yaw,box):
    """SAT for the vehicle's oriented rectangular footprint and an AABB."""
    b,d=box
    if position[1]+.12>=b[1]+d[1] or position[1]+HEIGHT+.12<=b[1]:return False
    dx=b[0]+d[0]/2-position[0];dz=b[2]+d[2]/2-position[2]
    if abs(dx)>d[0]/2+2.7 or abs(dz)>d[2]/2+2.7:return False
    c,s=math.cos(yaw),math.sin(yaw);w,l=WIDTH/2,LENGTH/2
    for x,z in ((1,0),(0,1),(c,-s),(s,c)):
        if abs(dx*x+dz*z)>=abs(x)*d[0]/2+abs(z)*d[2]/2+abs(x*c-z*s)*w+abs(x*s+z*c)*l:return False
    return True

def car_intersects(p,yaw,q,angle):
    if abs(p[1]-q[1])>=HEIGHT:return False
    dx,dz=q[0]-p[0],q[2]-p[2]
    if abs(dx)>5.3 or abs(dz)>5.3:return False
    a=(math.cos(yaw),-math.sin(yaw));b=(math.sin(yaw),math.cos(yaw))
    c=(math.cos(angle),-math.sin(angle));d=(math.sin(angle),math.cos(angle))
    for x,z in (a,b,c,d):
        first=abs(x*a[0]+z*a[1])*WIDTH/2+abs(x*b[0]+z*b[1])*LENGTH/2
        second=abs(x*c[0]+z*c[1])*WIDTH/2+abs(x*d[0]+z*d[1])*LENGTH/2
        if abs(x*dx+z*dz)>=first+second:return False
    return True

def concat(*paths):
    out=[]
    for path in paths:
        for p in path:
            if not out or math.dist(out[-1],p)>.001:out.append(list(p))
    if len(out)>1 and math.dist(out[0],out[-1])<.001:out.pop()
    return out

def round_loop(points):
    # Only short corner cuts; do not stray outside the road at intersections.
    out=[]
    for i,p in enumerate(points):
        a=points[i-1];b=points[(i+1)%len(points)]
        la=math.dist(a,p);lb=math.dist(p,b);d=min(1.5,la*.35,lb*.35)
        if d<.001:continue
        q=[p[j]+(a[j]-p[j])*d/la for j in range(2)]
        r=[p[j]+(b[j]-p[j])*d/lb for j in range(2)]
        for k in range(5):
            t=k/4;out.append([(1-t)**2*q[j]+2*t*(1-t)*p[j]+t*t*r[j] for j in range(2)])
    return concat(out)

class Route:
    def __init__(self,points):
        self.points=round_loop(points)
        self.sections=[];self.ends=[];self.length=0.
        for a,b in zip(self.points,self.points[1:]+self.points[:1]):
            length=math.dist(a,b)
            if length<.001:continue
            self.sections.append((self.length,a,b,length))
            self.length+=length;self.ends.append(self.length)
    def center(self,d):
        d%=self.length
        i=min(len(self.sections)-1,bisect_left(self.ends,d))
        start,a,b,length=self.sections[i];t=(d-start)/length
        return [a[j]+(b[j]-a[j])*t for j in range(2)]
    def sample(self,d):
        p=self.center(d);a=self.center(d-.7);b=self.center(d+.7)
        dx,dz=b[0]-a[0],b[1]-a[1];norm=math.hypot(dx,dz) or 1.
        # Right-hand traffic in the same -Z-forward convention as avatars.
        x=p[0]-dz/norm*1.55;z=p[1]+dx/norm*1.55
        return x,z,math.atan2(-dx,-dz)

def routes(doc):
    r={r['id']:r['points'] for r in doc.get('roads',[])}
    if not all(k in r for k in ('east-country','village-north','village-south','west-country','hotel-link')):return []
    village=[[-65,-58.5],[-65,-1.5]]
    east=concat(r['east-country'],r['village-north'],village,r['village-south'])
    west=concat(r['west-country'],r['hotel-link'],r['village-south'][::-1],village[::-1],r['village-north'][::-1])
    return [Route(east),Route(east[::-1]),Route(west),Route(west[::-1])]

class Traffic:
    def __init__(self,terrain,clock):
        self.terrain=terrain;self.routes=routes(terrain.doc);self.last=clock();self.accumulator=0.;self.cars={};self.departed={}
        if not self.routes:return
        kinds=['sedan','hatchback','suv','sedan','hatchback','suv','sedan','hatchback','taxi','taxi','taxi']
        colors=['#667785','#a03236','#3e454a','#c6c8c9','#31574d','#4a5e80','#b49c7b','#535764','#efbd28','#efbd28','#efbd28']
        for i,(kind,color) in enumerate(zip(kinds,colors)):
            route=self.routes[i%4];d=(.19+.29*(i//4))*route.length
            x,z,yaw=route.sample(d)
            parked=i==10
            if parked:x,z,yaw=5.8,133.,0.
            driver={**DEFAULT_AVATAR,'model':[1,14,5,18,3,13,4,16,2,15,6][i]}
            c={'id':'car-'+str(i+1),'kind':kind,'color':color,'position':[x,terrain.height(x,z)+.085,z],'yaw':yaw,
               'speed':0.,'steer':0.,'brake':True,'indicator':0,'route':i%4,'d':d,'cruise':5.6+(i%3)*.65,
               'owner':None,'ownerLife':None,'npc':True,'avatar':driver,'parked':parked,'input':[0.,0.],
               'inputAt':self.last,'abandoned':None,'seatSlot':None}
            self.cars[c['id']]=c
    def place_initial(self,world):
        static=self.static(world)
        for key,c in list(self.cars.items()):
            if not self.occupied(world,c,c['position'],c['yaw'],static):continue
            route=self.routes[c['route']]
            for i in range(1,81):
                nd=(c['d']+i*5.)%route.length;x,z,yaw=route.sample(nd);p=[x,self.terrain.height(x,z)+.085,z]
                if not self.occupied(world,c,p,yaw,static):
                    c.update(position=p,yaw=yaw,d=nd,parked=False);break
            else:self.cars.pop(key,None)
    def snapshot(self,players):
        rows=[]
        for c in self.cars.values():
            owner=players.get(c['owner'])
            rows.append({**{k:c[k] for k in ('id','kind','color','position','yaw','speed','steer','brake','indicator','npc')},
                         'driverSlot':owner['slot'] if owner else None,'avatar':owner['avatar'] if owner else c['avatar'] if c['npc'] else None})
        return rows
    def get(self,row):
        c=self.cars.get(row.get('vehicle'))
        return c if c and c['owner'] is not None else None
    def static(self,world):
        return [r['bounds'] for r in world.solid_rows()]
    def occupied(self,world,c,p,yaw,static,walkers=True,ignore=None):
        b,s=car_bounds(p,yaw)
        if abs(p[0])+s[0]/2>149.6 or abs(p[2])+s[2]/2>149.6:return True
        if self.terrain.water(p[0],p[2])>p[1]+.1:return True
        # Avoid cliffs and excessive cross-slope. Arcade driving, not a rigid body.
        for x,z in ((-.82,-1.8),(.82,-1.8),(-.82,1.8),(.82,1.8)):
            q=local_point(p,yaw,x,z)
            if abs(self.terrain.height(q[0],q[2])-(p[1]-.085))>.85:return True
        for box in static:
            if intersects(p,yaw,box):return True
        for o in self.cars.values():
            if o is c:continue
            if car_intersects(p,yaw,o['position'],o['yaw']):return True
        if walkers:
            for key,row in world.players.items():
                if key in (c['owner'],ignore) or row.get('vehicle'):continue
                if intersects(p,yaw,world.body_box(row['position'])):return True
            for row in world.village.npcs:
                if row['hp']>0 and intersects(p,yaw,world.body_box(row['position'])):return True
        return False
    def walk_blocked(self,p,height=1.6,ignore=None):
        box=([p[0]-.25,p[1]+.015,p[2]-.25],[.5,height-.015,.5])
        return any(c['id']!=ignore and intersects(c['position'],c['yaw'],box) for c in self.cars.values())
    def build_blocked(self,b,s):
        return any(intersects(c['position'],c['yaw'],(b,s)) for c in self.cars.values())
    def safe_exit(self,world,c,player=None):
        for x,z in [(-2.,.15),(2.,.15),(-2.2,1.5),(2.2,1.5),(0.,3.2),(0.,-3.2),(-3.2,0.),(3.2,0.)]:
            p=local_point(c['position'],c['yaw'],x,z);p[1]=self.terrain.height(p[0],p[2])
            if world.blocked(p) or self.walk_blocked(p,ignore=c['id']) or self.terrain.water(p[0],p[2])>p[1]+.1:continue
            if any(key!=player and not row.get('vehicle') and math.dist(row['position'],p)<.8 for key,row in world.players.items()):continue
            return p
        return None
    def enter(self,world,player,row,data,now):
        need(not row.get('seat') and not row.get('vehicle'),'Bitte zuerst aufstehen oder aussteigen')
        key=data.get('id');need(isinstance(key,str) and key in self.cars,'Fahrzeug nicht vorhanden')
        c=self.cars[key]
        need(c['owner'] is None,'Fahrzeug ist bereits besetzt')
        need(math.dist(row['position'],c['position'])<=3.6,'Fahrzeug ausser Reichweite')
        need(abs(c['speed'])<=2.2,'Warte bis das Fahrzeug anhaelt')
        # Do not permit entering through a wall.
        static=self.static(world)
        for j in range(1,6):
            q=[row['position'][k]+(c['position'][k]-row['position'][k])*j/6 for k in range(3)]
            q[1]=self.terrain.height(q[0],q[2])
            b,s=world.body_box(q)
            if any(all(b[k]<p[k]+d[k] and b[k]+s[k]>p[k] for k in range(3)) for p,d in static):
                raise CaptureError('Zugang zum Fahrzeug blockiert',409)
        was_npc=c['npc']
        if was_npc:
            exit_p=self.safe_exit(world,c,player)
            need(exit_p is not None,'Kein Platz zum Aussteigen des Fahrers')
            self.departed[key]={'id':key,'position':exit_p,'yaw':c['yaw'],'avatar':c['avatar'],'until':now+12.,'moving':False}
        c.update(owner=player,ownerLife=row['life'],seatSlot=row['slot'],npc=False,speed=0.,steer=0.,input=[0.,0.],inputAt=now,parked=False,abandoned=None)
        row.update(vehicle=key,position=c['position'][:],yaw=c['yaw'],stance='walk',weapon=None,move_at=now)
        return 'Fahrzeug uebernommen' if was_npc else 'Eingestiegen'
    def exit(self,world,player,row,now):
        c=self.get(row);need(c is not None and c['owner']==player,'Kein Fahrzeug')
        need(abs(c['speed'])<2.2,'Zum Aussteigen zuerst anhalten')
        p=self.safe_exit(world,c,player);need(p is not None,'Kein freier Ausstieg')
        self.release(player,row,now)
        row.update(position=p,yaw=c['yaw'],move_at=now,weapon=None)
        return 'Ausgestiegen'
    def release(self,player,row,now):
        c=self.get(row)
        if c and c['owner']==player:c.update(owner=None,ownerLife=None,seatSlot=None,npc=False,input=[0.,0.],speed=0.,steer=0.,brake=True,abandoned=now)
        row['vehicle']=None
    def control(self,player,row,data,now):
        c=self.get(row)
        need(c is not None and c['owner']==player,'Fahrzeug nicht verfuegbar')
        value=data.get('drive',[0.,0.])
        need(isinstance(value,list) and len(value)==2 and all(type(x) in (int,float) and math.isfinite(x) and abs(x)<=1.001 for x in value),'Ungueltige Fahrzeugsteuerung',400)
        c.update(input=[clamp(x,-1.,1.) for x in value],inputAt=now)
        row.update(position=c['position'][:],yaw=c['yaw'],stance='walk',weapon=None,move_at=now)
    def tick(self,world,now):
        dt=clamp(now-self.last,0.,.5);self.last=now
        for key,d in list(self.departed.items()):
            if d['until']<=now:self.departed.pop(key,None)
        if not self.cars:return
        for c in self.cars.values():
            owner=world.players.get(c['owner'])
            if c['owner'] is not None and (not owner or owner.get('vehicle')!=c['id'] or owner['life']!=c['ownerLife']):
                if owner and owner.get('vehicle')==c['id']:owner['vehicle']=None
                c.update(owner=None,ownerLife=None,seatSlot=None,npc=False,speed=0.,steer=0.,input=[0.,0.],brake=True,abandoned=now)
        if dt<=0:return
        # Exiting civilian NPCs walk away from the vehicle when space permits.
        for d in self.departed.values():
            p=d['position'];a=d['yaw'];q=[p[0]-math.sin(a)*dt*.95,p[1],p[2]-math.cos(a)*dt*.95];q[1]=self.terrain.height(q[0],q[2])
            d['moving']=not world.blocked(q) and not self.terrain.water(q[0],q[2])
            if d['moving']:d['position']=q
        self.accumulator=min(.5,self.accumulator+dt)
        count=int((self.accumulator+1e-8)/STEP)
        if count<1:return
        self.accumulator=max(0.,self.accumulator-count*STEP)
        static=self.static(world);step=STEP
        for _ in range(count):
            for c in self.cars.values():
                p=c['position'];yaw=c['yaw'];old=c['speed']
                if c['owner'] is not None:
                    throttle,turn=c['input'] if now-c['inputAt']<.8 else (0.,0.)
                    target=MAX_SPEED*throttle if throttle>=0 else REVERSE*throttle
                    speed=approach(old,target,(7.5 if abs(target)<abs(old) or target*old<0 else 3.8)*step)
                    steer=approach(c['steer'],turn,.0+3.4*step)
                    angle=wrap(yaw-steer*speed*.17*step)
                    q=[p[0]-math.sin(angle)*speed*step,0.,p[2]-math.cos(angle)*speed*step]
                    q[1]=self.terrain.height(q[0],q[2])+.085
                    if self.occupied(world,c,q,angle,static):speed=0.;q=p;angle=yaw
                    c.update(position=q,yaw=angle,speed=speed,steer=steer,brake=abs(speed)<abs(old)-.02 or throttle<0 and old>0,indicator=0)
                    row=world.players[c['owner']];row.update(position=q[:],yaw=angle,weapon=None)
                    continue
                if not c['npc']:
                    # An abandoned car stays where the player left it. Rejoin
                    # traffic only when nobody can see the reset or occupy its start.
                    if c['abandoned'] is not None and now-c['abandoned']>35 and all(math.dist(r['position'],p)>45 for r in world.players.values()):
                        route=self.routes[c['route']];x,z,angle=route.sample(c['d']);q=[x,self.terrain.height(x,z)+.085,z]
                        if all(math.dist(r['position'],q)>45 for r in world.players.values()) and not self.occupied(world,c,q,angle,static):
                            c.update(npc=True,position=q,yaw=angle,speed=0.,abandoned=None)
                    continue
                if c['parked']:continue
                route=self.routes[c['route']]
                # Slow through bends, near pedestrians, and before vehicles.
                _,_,ahead=route.sample(c['d']+4.5)
                turn=wrap(ahead-yaw);target=c['cruise']*max(.4,1-abs(turn)*.65)
                if any(not r.get('vehicle') and math.dist(r['position'],p)<5.5 for r in world.players.values()):target=0.
                look=max(2.4,old*.85+1.5)
                for dist in (1.25,look):
                    x,z,a=route.sample(c['d']+dist);q=[x,self.terrain.height(x,z)+.085,z]
                    if self.occupied(world,c,q,a,static):target=0.;break
                speed=approach(old,target,(8.5 if target<old else 2.5)*step)
                nd=(c['d']+speed*step)%route.length;x,z,a=route.sample(nd);q=[x,self.terrain.height(x,z)+.085,z]
                if self.occupied(world,c,q,a,static):speed=0.;nd=c['d'];q=p;a=yaw
                c.update(d=nd,position=q,yaw=a,speed=speed,steer=clamp(-turn*1.5,-1.,1.),brake=speed<old-.015 or target==0.,indicator=1 if turn<-.24 else -1 if turn>.24 else 0)
