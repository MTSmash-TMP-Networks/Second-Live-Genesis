"""Server-authoritative hidden village and destructible scenery for the shared game."""
import math
import random
import sqlite3
import time
from contextlib import closing
from village_structure import VillageStructure, prism_ray, prism_overlap, DOOR_INDEX

TREE_REGROW_SECONDS=24*60*60
NPC_STEP=.05
NPC_WALK_SPEED=1.35
NPC_CHASE_SPEED=2.2
NPC_TRAIL_LENGTH=32
NPC_TURN_SECONDS=.65
NPC_CORPSE_SECONDS=10.
CENTER=(-65.,-30.)
FOREST_ROADS=[
    {'x':-65,'z':-30,'w':7,'d':57,'kind':'street'},
    {'x':-65,'z':-1,'w':3,'d':18,'kind':'path'},
    {'x':-65,'z':-59,'w':3,'d':14,'kind':'path'},
    *[{'x':x,'z':-30,'w':1.8,'d':57,'kind':'walk'} for x in (-70,-60)],
    *[{'x':x,'z':z,'w':5,'d':1.8,'kind':'walk'} for x in (-73,-57) for z in (-49,-30,-11)],
    {'x':-65,'z':-28,'w':24,'d':4,'kind':'walk'},
]
# Keep the original deterministic forest generation, including tree IDs, stable.
# Only the visible village road layout changes.
ROADS=[
    {'x':-65,'z':-30,'w':7,'d':57,'kind':'street'},
    {'x':-65,'z':-1,'w':3,'d':18,'kind':'path'},
    {'x':-65,'z':-59,'w':3,'d':14,'kind':'path'},
    *[{'x':x,'z':-30,'w':2.0,'d':57,'kind':'walk'} for x in (-69.57,-60.43)],
    *[{'x':x,'z':z,'w':4.60,'d':1.8,'kind':'walk'} for x in (-72.87,-57.13) for z in (-49,-30,-11)],
    {'x':-65,'z':-28,'w':7,'d':3.1,'kind':'crosswalk'},
]

# The two continuous sidewalks are derived from the actual village road plan.
NPC_SIDEWALKS=tuple(sorted((r for r in ROADS if r['kind']=='walk' and r['d']>r['w']),key=lambda r:r['x']))
NPC_PATROL_SEEDS=((0,-48.),(1,-33.),(0,-18.),(1,-8.),(0,-30.),(1,-49.))
NPC_MODELS=(1,2,3,4,13,18)
NPC_BUILDINGS=('building-0-0','building-1-1','building-0-2','building-1-2','building-0-1','building-1-0')
SIDEWALK_Y=.075
# Stable staff slots are additional to the six existing training/visitor NPCs.
STAFF_STATIONS=(
    (-106,'market','building-0-1','checkout','checkout',{'model':14,'body':3,'hair':2,'top':2,'topColor':3,'trousers':1,'trousersColor':3,'shoes':1,'beard':0,'height':1}),
    (-107,'cafe','building-1-1','cafe-counter','barista',{'model':5,'body':1,'hair':1,'top':2,'topColor':0,'trousers':1,'trousersColor':3,'shoes':1,'beard':0,'height':1}),
)

def staff_anchor(building,counter):
    """Stand between the rear wall and counter, aligned with its register."""
    b,s=building['bounds'];p,d=counter['bounds'];side=building['door']['side']
    inner_wall=b[0]+s[0]*(.085 if side==1 else .915)
    back_edge=p[0] if side==1 else p[0]+d[0]
    x=(inner_wall+back_edge)/2
    z=p[2]+d[2]*(.5-.28*side)
    return [x,p[1],z],-side*math.pi/2

def sidewalk_height(x,z):
    return SIDEWALK_Y if any(r['kind']=='walk' and abs(x-r['x'])<=r['w']/2 and abs(z-r['z'])<=r['d']/2 for r in ROADS) else 0.

def overlap(a,s,b,t):
    return all(x<y+v and x+u>y for x,u,y,v in zip(a,s,b,t))

def make_scenery(terrain=None):
    rows=[]
    for side,x in enumerate((-80,-50)):
        for i,z in enumerate((-49,-30,-11)):
            kind='shop' if i==1 else 'house'
            size=[10,6 if kind=='shop' else 7.5,10]
            rows.append({'id':f'building-{side}-{i}','kind':kind,'variant':side*3+i,'label':('MARKT' if side==0 else 'CAFE') if kind=='shop' else '',
                         'bounds':[[x-size[0]/2,0,z-size[2]/2],size],'hp':100})
    rng=random.Random(41927)
    def tree(x,z):
        height=round(rng.uniform(7,12),2);width=round(rng.uniform(.65,1.15),2)
        rows.append({'id':f'tree-{len(rows):03d}','kind':'tree','variant':rng.randrange(3),'height':height,
                     'bounds':[[round(x-width/2,2),0,round(z-width/2,2)],[width,round(height*.65,2),width]],'hp':100})
    # Dense irregular ring; the access path bends through the tree line.
    for ix in range(-112,-17,6):
        for iz in range(-78,25,6):
            x=ix+rng.uniform(-1.7,1.7);z=iz+rng.uniform(-1.7,1.7)
            if -89<x<-41 and -59<z<0:continue
            if abs(x+65)<2.8 and (-68<z<-57 or -3<z<9):continue
            if any(abs(x-r['x'])<r['w']/2+1.1 and abs(z-r['z'])<r['d']/2+1.1 for r in FOREST_ROADS):continue
            tree(x,z)
    for x,z in [(20,110),(-28,116),(-57,91),(72,100),(105,60),(126,18),(88,-20),(55,-72),(93,-105),(10,-115),(-35,-126),(-105,-119),(-132,-40),(-122,53),(-88,75),(32,53),(112,125),(-120,119),(125,-125),(23,-32)]:
        tree(x,z)
    if terrain is not None:
        from free_terrain import CONFIG, trail_distance, lake_radius
        # Preserve all old tree IDs and XZ coordinates. Additional trees are
        # on a separate deterministic grid around the new natural features.
        existing=[(r['bounds'][0][0]+r['bounds'][1][0]/2,r['bounds'][0][2]+r['bounds'][1][2]/2) for r in rows if r['kind']=='tree']
        extra=random.Random(987311)
        for ix in range(-138,141,7):
            for iz in range(-138,141,7):
                x=ix+extra.uniform(-2.,2.);z=iz+extra.uniform(-2.,2.)
                if not any(math.hypot((x-cx)/rx,(z-cz)/rz)<1.12 for cx,cz,rx,rz,peak in CONFIG['hills']) and not any(lake_radius(x,z,l)<1.8 for l in terrain.doc['lakes']):continue
                if abs(x)>142 or abs(z)>142 or trail_distance(x,z)<2.4:continue
                if any(lake_radius(x,z,l)<1.10 for l in terrain.doc['lakes']):continue
                if any((x-a)**2+(z-b)**2<4.0**2 for a,b in existing):continue
                if extra.random()<.15:continue
                h=round(extra.uniform(7.5,15.),2);w=round(extra.uniform(.48,.93),2)
                rows.append({'id':f'nature-tree-{ix+150}-{iz+150}','kind':'tree','variant':extra.randrange(3),'height':h,
                             'bounds':[[round(x-w/2,2),0,round(z-w/2,2)],[w,round(h*.65,2),w]],'hp':100})
                existing.append((x,z))
        for row in rows:
            if row['kind']!='tree':continue
            b,s=row['bounds'];b[1]=round(terrain.height(b[0]+s[0]/2,b[2]+s[2]/2),4)
    return rows

class Village:
    def __init__(self,path,blocks,clock,wall_clock=time.time,terrain=None):
        self.terrain=terrain
        self.path=path
        self.rows={}
        self.clock=clock
        self.last_tick=clock();self.motion_time=self.last_tick;self.motion_accumulator=0.
        self.wall_clock=wall_clock;self.next_regrow_check=0.
        self.regrow_at={}
        with closing(sqlite3.connect(path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS village_state(id TEXT PRIMARY KEY,hp INTEGER NOT NULL)')
            if 'regrow_at' not in {r[1] for r in db.execute('PRAGMA table_info(village_state)')}:
                db.execute('ALTER TABLE village_state ADD COLUMN regrow_at REAL')
            saved={i:(hp,due) for i,hp,due in db.execute('SELECT id,hp,regrow_at FROM village_state')}
            wall_now=self.wall_clock()
            for row in make_scenery(terrain):
                key=row['id'];b,s=row['bounds']
                # Never overwrite existing player builds during migration.
                if key not in saved:
                    hp=-1 if any(overlap(b,s,*box) for box in blocks) else row['hp']
                    db.execute('INSERT INTO village_state(id,hp) VALUES(?,?)',(key,hp))
                else:hp=saved[key][0]
                if hp>=0:
                    row['hp']=hp;self.rows[key]=row
                    if row['kind']=='tree' and hp==0:
                        due=saved.get(key,(0,None))[1]
                        if due is None:
                            due=wall_now+TREE_REGROW_SECONDS
                            db.execute('UPDATE village_state SET regrow_at=? WHERE id=?',(due,key))
                        self.regrow_at[key]=due
        self.structure=VillageStructure(path,self.rows.values(),blocks)
        self.door_revision=0;self.door_hold={}
        self.npcs=[]
        for i,(side,z) in enumerate(NPC_PATROL_SEEDS):
            lane=NPC_SIDEWALKS[side];x=lane['x']
            # Move only along the sidewalk if the preferred spawn is occupied.
            # Leave sufficient room for the full ten-metre patrol.
            candidates=([x,SIDEWALK_Y,z+dz] for dz in (0,1,-1,2,-2,3,-3)
                        if abs(z+dz-lane['z'])<=lane['d']/2-5.4)
            home=next((p for p in candidates if not any(overlap([p[0]-.3,p[1],p[2]-.3],[.6,1.6,.6],*box) for box in blocks)),None)
            if home is None:continue
            self.npcs.append({'slot':-100-i,'nickname':f'Test-NPC {i+1}','avatar':{'model':NPC_MODELS[i],'height':1,'beard':0 if i>=4 else 1},
                'position':home[:],'home':home,'yaw':0.,'stance':'walk','weapon':None,'hp':100,'life':1,'score':0,
                'target':None,'velocity':[0.,0.,0.],'moving':False,'trail':[],'route':i%2,'patrol_turn_until':0.,'next_action':self.last_tick,'respawn':0.,'dead_at':None,'shot_seq':0,'shot':None,'hit_seq':0,'hit_zone':None,'hit_at':None,'injured_legs':[],'stagger_until':0.,'visit_building':NPC_BUILDINGS[i],'visit_elapsed':0.,'visit_after':12.+i*4.,'visit_index':-1,'visit_wait':0.,'activity':None})
        for slot,role,building_id,kind,activity,avatar in STAFF_STATIONS:
            building=self.structure.rows.get(building_id)
            if not building:continue
            counter=next((p for p in self.structure.by_building[building_id] if p.get('type')==kind),None)
            if not counter:continue
            home,yaw=staff_anchor(building,counter)
            box=([home[0]-.25,home[1]+.015,home[2]-.25],[.5,1.585,.5])
            npc={'slot':slot,'nickname':'Markt-Mitarbeiterin' if role=='market' else 'Cafe-Mitarbeiter',
                 'avatar':dict(avatar),'staffRole':role,'staffStation':counter['id'],'staffActivity':activity,
                 'position':home[:],'home':home,'yaw':yaw,'stance':'walk','weapon':None,'hp':100,'life':1,'score':0,
                 'target':None,'velocity':[0.,0.,0.],'moving':False,'trail':[],'route':0,'patrol_turn_until':0.,
                 'next_action':self.last_tick,'respawn':0.,'dead_at':None,'shot_seq':0,'shot':None,
                 'hit_seq':0,'hit_zone':None,'hit_at':None,'injured_legs':[],'stagger_until':0.,
                 'visit_building':building_id,'visit_elapsed':0.,'visit_after':math.inf,'visit_index':-1,'visit_wait':0.,'activity':activity}
            if not self.staff_station_open(npc) or any(overlap(*box,*p) for p in blocks) or any(prism_overlap(*box,p) for p in self.structure.solids()):
                npc['hp']=0
            self.npcs.append(npc)
    def staff_station_open(self,npc):
        counter=self.structure.parts.get(npc['staffStation'])
        x,y,z=npc['home']
        return bool(counter and counter['hp']>0 and self.walk_height(x,z)>=y-.005)
    def door_clear(self,row,players,solid_rows,body_box):
        b,s=row['door']['bounds'];b=[b[0]-.25,b[1],b[2]];s=[s[0]+.5,s[1],s[2]]
        if any(overlap(b,s,*body_box(p['position'])) for p in [*players.values(),*(n for n in self.npcs if n['hp']>0)]):return False
        return not any(not obj.get('kind') and overlap(b,s,*obj['bounds']) for obj in solid_rows())
    def set_door(self,row,opened,now,players,solid_rows,body_box):
        if row['damage'].get(str(DOOR_INDEX),0)>=4:return opened
        if not opened and not self.door_clear(row,players,solid_rows,body_box):return False
        if row['door']['open']!=opened:
            row['door']['open']=opened;self.door_revision+=1
        if opened:self.door_hold[row['id']]=now+7.
        else:self.door_hold.pop(row['id'],None)
        return True
    def close_doors(self,now,players,solid_rows,body_box):
        for key,due in list(self.door_hold.items()):
            row=self.structure.rows.get(key)
            if not row or row['damage'].get(str(DOOR_INDEX),0)>=4:
                self.door_hold.pop(key,None);continue
            if now>=due:
                if not self.set_door(row,False,now,players,solid_rows,body_box):self.door_hold[key]=now+1.
    def walk_height(self,x,z):
        height=max(sidewalk_height(x,z),self.terrain.height(x,z) if self.terrain is not None else 0.)
        for row in self.structure.rows.values():
            b,s=row['bounds'];top=b[1]+s[1]*.025
            if not b[0]-.25<=x<=b[0]+s[0]+.25 or not b[2]-.25<=z<=b[2]+s[2]+.25:continue
            for p in self.structure.colliders[row['id']]:
                if p['bounds'][0][1]+p['bounds'][1][1]<=top+1e-7 and prism_overlap([x-.25,0.,z-.25],[.5,top,.5],p):
                    height=max(height,top);break
        return height
    def visit_route(self,npc):
        building=self.structure.rows.get(npc['visit_building'])
        if not building:return None,[]
        d=building['door'];x,z,side=d['front'],d['z'],d['side'];lane=npc['home'][0]
        return building,[[lane,0.,z],[x+side*1.8,0.,z],[x-side*2.,0.,z],[x-side*2.8,0.,z+1.2],[x-side*2.,0.,z],[x+side*1.8,0.,z],[lane,0.,z]]
    def solids(self):
        yield from (row for row in self.rows.values() if row['kind']=='tree' and row['hp']>0)
        yield from self.structure.solids()
    def targets(self,origin,reach):
        yield from (row for row in self.rows.values() if row['kind']=='tree' and row['hp']>0)
        yield from self.structure.targets(origin,reach)
    def snapshot(self):
        server_time=max(self.motion_time,self.clock())
        return [{**{k:r[k] for k in ('slot','nickname','avatar','position','yaw','stance','weapon','hp','life','score','shot_seq','shot','velocity','moving')},'motionTime':self.motion_time,'serverTime':server_time,'motionTrail':list(r['trail']),
                 'hitSeq':r['hit_seq'],'hitZone':r['hit_zone'],'hitAge':max(0.,server_time-r['hit_at']) if r['hit_at'] is not None else None,
                 'injuredLegs':list(r['injured_legs']),'activity':r['activity'],'staffRole':r.get('staffRole')} for r in self.npcs if r['hp']>0]
    def corpses(self,now):
        return [{**{k:r[k] for k in ('slot','nickname','avatar','position','yaw','stance','hp','life')},
                 'weapon':None,'dead':True,'deadAge':max(0.,now-r['dead_at']),'hitZone':r['hit_zone'],'staffRole':r.get('staffRole')}
                for r in self.npcs if r['hp']<=0 and r['dead_at'] is not None and now-r['dead_at']<NPC_CORPSE_SECONDS]
    def damage_tree(self,row,damage):
        if row['kind']!='tree':return 'Gebaeude'
        hp=max(0,row['hp']-damage)
        due=self.regrow_at.get(row['id']) if hp==0 and row['hp']==0 else self.wall_clock()+TREE_REGROW_SECONDS if hp==0 else None
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('UPDATE village_state SET hp=?,regrow_at=? WHERE id=?',(hp,due,row['id']))
        row['hp']=hp
        if due is not None:self.regrow_at[row['id']]=due
        return 'Baum gefaellt' if not hp else 'Baum beschaedigt'
    def regrow(self,occupied):
        """Use persistent real-world time, checking only once per second.
        A due tree waits until its original trunk volume is empty."""
        now=self.wall_clock()
        if now<self.next_regrow_check:return False
        self.next_regrow_check=now+1
        due=[key for key,when in self.regrow_at.items() if when<=now]
        if not due:return False
        boxes=list(occupied)
        ready=[key for key in due if not any(overlap(*self.rows[key]['bounds'],*box) for box in boxes)]
        if not ready:return False
        with closing(sqlite3.connect(self.path)) as db,db:
            db.executemany('UPDATE village_state SET hp=100,regrow_at=NULL WHERE id=?',((key,) for key in ready))
        for key in ready:
            self.rows[key]['hp']=100
            del self.regrow_at[key]
        return True
    def damage_npc(self,npc,player,damage,now,zone='torso'):
        # Gameplay-only damage states and animation triggers.
        if npc['hp']<=0:return False
        npc['hit_seq']+=1;npc['hit_zone']=zone;npc['hit_at']=now
        npc['hp']=0 if zone=='head' else max(0,npc['hp']-damage)
        if zone in ('left-leg','right-leg') and zone not in npc['injured_legs']:
            npc['injured_legs'].append(zone)
        npc['stagger_until']=now+.24
        if not npc['hp']:
            npc.update(target=None,weapon=None,respawn=now+15,dead_at=now,shot=None,velocity=[0.,0.,0.],moving=False)
            return True
        # Civilian employees stay unarmed and do not become training opponents.
        if npc.get('staffRole'):return False
        if npc['target']!=player:npc['next_action']=now+1.0
        npc.update(target=player,weapon='pistol')
        return False
    def tick(self,now,players,blocked,ray_box,solid_rows,body_box,spawn):
        # Requests may arrive in bursts; advance NPC simulation at a stable 20 Hz.
        elapsed=max(0.,min(1.,now-self.last_tick));self.last_tick=now
        self.motion_accumulator=min(1.05,self.motion_accumulator+elapsed)
        count=0
        while self.motion_accumulator+1e-8>=NPC_STEP and count<21:
            self.motion_accumulator=max(0.,self.motion_accumulator-NPC_STEP)
            self.motion_time=max(self.motion_time,now-self.motion_accumulator)
            self._step(self.motion_time,NPC_STEP,players,blocked,ray_box,solid_rows,body_box,spawn)
            self.close_doors(self.motion_time,players,solid_rows,body_box)
            # Keep the authoritative short trajectory, including turns and stops.
            # Clients can recover missing intermediate positions from the next poll.
            for npc in self.npcs:
                if npc['hp']<=0:continue
                p=npc['position'];speed=math.hypot(npc['velocity'][0],npc['velocity'][2])
                sample=[self.motion_time,*p,npc['yaw'],speed]
                npc['trail'].append(sample)
                if len(npc['trail'])>NPC_TRAIL_LENGTH:del npc['trail'][:-NPC_TRAIL_LENGTH]
            count+=1
    def _step(self,now,dt,players,blocked,ray_box,solid_rows,body_box,spawn):
        for npc in self.npcs:
            staff=npc.get('staffRole')
            if staff and not self.staff_station_open(npc):
                if npc['hp']>0:
                    npc.update(hp=0,dead_at=None,respawn=now,trail=[],activity=None,velocity=[0.,0.,0.],moving=False)
                continue
            if npc['hp']<=0:
                if staff and now>=npc['respawn'] and (blocked(npc['home']) or any(overlap(*body_box(npc['home']),*body_box(p['position'])) for p in players.values())):
                    npc['respawn']=now+.5
                if now>=npc['respawn'] and not blocked(npc['home']):
                    npc.update(hp=100,life=npc['life']+1,position=npc['home'][:],target=None,weapon=None,shot=None,velocity=[0.,0.,0.],moving=False,dead_at=None,patrol_turn_until=0.,trail=[],hit_seq=0,hit_zone=None,hit_at=None,injured_legs=[],stagger_until=0.,visit_elapsed=0.,visit_index=-1,visit_wait=0.,activity=None)
                else:continue
            if staff:
                npc.update(position=npc['home'][:],target=None,weapon=None,stance='walk',velocity=[0.,0.,0.],moving=False,activity=npc['staffActivity'])
                continue
            p=npc['position'];home=npc['home'];before=p[:]
            npc.update(velocity=[0.,0.,0.],moving=False,activity=None)
            near=any(math.hypot(r['position'][0]-home[0],r['position'][2]-home[2])<38 for r in players.values())
            if not near:
                npc.update(target=None,weapon=None,stance='walk');continue
            target=players.get(npc['target'])
            if target and math.hypot(target['position'][0]-home[0],target['position'][2]-home[2])>25:target=None
            visiting=False
            if not target:
                npc.update(target=None,weapon=None,stance='walk')
                building,path=self.visit_route(npc)
                if npc['visit_index']<0:
                    npc['visit_elapsed']+=dt
                    if path and npc['visit_elapsed']>=npc['visit_after']:
                        npc.update(visit_index=0,visit_wait=0.)
                if path and npc['visit_index']>=0:
                    visiting=True;goal=path[npc['visit_index']]
                    if npc['visit_index'] in (2,5):
                        self.set_door(building,True,now,players,solid_rows,body_box)
                else:goal=[home[0],home[1],home[2]+(5 if npc['route']==0 else -5)]
            else:
                goal=target['position'];npc['stance']='walk';npc['weapon']='pistol'
            dx,dz=goal[0]-p[0],goal[2]-p[2];dist=math.hypot(dx,dz)
            # A blocked patrol pauses rather than switching direction each tick.
            # Reverse only at a reached waypoint, with a stationary turning phase.
            if visiting and dist<=.06:
                i=npc['visit_index']
                if i==3:
                    if npc['visit_wait']==0.:npc['visit_wait']=now+8.+(abs(npc['slot'])%3)*2.
                    # Face a nearby intact fixture while browsing/visiting.
                    choices=[p for p in self.structure.by_building[building['id']] if p.get('furniture') and p['hp']>0 and p['type'] in ('sofa','bookcase','shelf','cafe-table')]
                    if choices:
                        item=min(choices,key=lambda q:math.hypot(q['bounds'][0][0]+q['bounds'][1][0]/2-p[0],q['bounds'][0][2]+q['bounds'][1][2]/2-p[2]))
                        b,size=item['bounds'];npc['yaw']=math.atan2(p[0]-b[0]-size[0]/2,p[2]-b[2]-size[2]/2)
                        npc['activity']='browse' if item['theme']=='market' else 'cafe' if item['theme']=='cafe' else 'visit'
                if now>=npc['visit_wait']:
                    if i+1<len(path):
                        npc['visit_index']=i+1
                        if i+1 in (2,5):self.set_door(building,True,now,players,solid_rows,body_box)
                    else:
                        npc.update(visit_index=-1,visit_elapsed=0.,visit_after=22.+(abs(npc['slot'])%6)*3.,visit_wait=0.)
                # Advance on the next fixed step; never interpolate across a corner.
                continue
            if not target and dist<=.06:
                npc['route']=1-npc['route']
                npc['patrol_turn_until']=now+NPC_TURN_SECONDS
                goal=[home[0],home[1],home[2]+(5 if npc['route']==0 else -5)]
                dx,dz=goal[0]-p[0],goal[2]-p[2];dist=math.hypot(dx,dz)
            if dist>.06:
                npc['yaw']=math.atan2(-dx,-dz)
                if now>=npc['stagger_until'] and (target and dist>4. or not target and now>=npc['patrol_turn_until']):
                    pace=NPC_CHASE_SPEED if target else NPC_WALK_SPEED
                    if npc['injured_legs']:pace*=.65 if len(npc['injured_legs'])==1 else .48
                    step=min(max(0.,dist-(4. if target else 0.)),dt*pace)
                    steps=max(1,math.ceil(step/.12))
                    for j in range(steps):
                        x=p[0]+dx/dist*step/steps;z=p[2]+dz/dist*step/steps
                        q=[x,self.walk_height(x,z),z]
                        if blocked(q) or any(math.hypot(q[0]-r['position'][0],q[2]-r['position'][2])<=.6 for r in players.values()):
                            break
                        npc['position']=q;p=q
            velocity=[(p[i]-before[i])/dt for i in range(3)]
            npc.update(velocity=velocity,moving=math.hypot(velocity[0],velocity[2])>.04)
            if not target or now<npc['next_action']:continue
            npc['next_action']=now+1.0
            if now<target['shield']:continue
            origin=[p[0],p[1]+1.4,p[2]];aim=[target['position'][0],target['position'][1]+1.,target['position'][2]]
            delta=[b-a for a,b in zip(origin,aim)];distance=math.sqrt(sum(v*v for v in delta))
            if not .3<distance<=8:continue
            direction=[v/distance for v in delta]
            if any(prism_ray(origin,direction,o,distance)<distance-.05 for o in solid_rows()):continue
            if any(ray_box(origin,direction,*body_box(r['position']),distance)<distance-.35 for r in players.values() if r is not target):continue
            npc['shot_seq']+=1;npc['shot']={'origin':origin,'direction':direction,'distance':distance,'impact':True}
            target['hp']=max(0,target['hp']-12)
            if not target['hp']:
                target.update(hp=100,life=target['life']+1,position=list(spawn),yaw=0.,move_at=now,shield=now+3,seat=None,seat_return=None)
                npc.update(target=None,weapon=None)
