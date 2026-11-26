"""Server-authoritative hidden village and destructible scenery for the shared game."""
import math
import random
import sqlite3
from contextlib import closing

CENTER=(-65.,-30.)
ROADS=[
    {'x':-65,'z':-30,'w':7,'d':57,'kind':'street'},
    {'x':-65,'z':-1,'w':3,'d':18,'kind':'path'},
    {'x':-65,'z':-59,'w':3,'d':14,'kind':'path'},
    *[{'x':x,'z':-30,'w':1.8,'d':57,'kind':'walk'} for x in (-70,-60)],
    *[{'x':x,'z':z,'w':5,'d':1.8,'kind':'walk'} for x in (-73,-57) for z in (-49,-30,-11)],
    {'x':-65,'z':-28,'w':24,'d':4,'kind':'walk'},
]

def overlap(a,s,b,t):
    return all(x<y+v and x+u>y for x,u,y,v in zip(a,s,b,t))

def make_scenery():
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
            if any(abs(x-r['x'])<r['w']/2+1.1 and abs(z-r['z'])<r['d']/2+1.1 for r in ROADS):continue
            tree(x,z)
    for x,z in [(20,110),(-28,116),(-57,91),(72,100),(105,60),(126,18),(88,-20),(55,-72),(93,-105),(10,-115),(-35,-126),(-105,-119),(-132,-40),(-122,53),(-88,75),(32,53),(112,125),(-120,119),(125,-125),(23,-32)]:
        tree(x,z)
    return rows

class Village:
    def __init__(self,path,blocks,clock):
        self.path=path
        self.rows={}
        self.last_tick=clock()
        with closing(sqlite3.connect(path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS village_state(id TEXT PRIMARY KEY,hp INTEGER NOT NULL)')
            saved=dict(db.execute('SELECT id,hp FROM village_state'))
            for row in make_scenery():
                key=row['id'];b,s=row['bounds']
                # Never overwrite existing player builds during migration.
                if key not in saved:
                    hp=-1 if any(overlap(b,s,*box) for box in blocks) else row['hp']
                    db.execute('INSERT INTO village_state(id,hp) VALUES(?,?)',(key,hp))
                else:hp=saved[key]
                if hp>=0:
                    row['hp']=hp;self.rows[key]=row
        self.npcs=[]
        for i,(x,z) in enumerate([(-65,-48),(-67,-33),(-63,-18),(-65,-8)]):
            candidates=([x+dx,0.,z+dz] for dx,dz in ((0,0),(2,0),(-2,0),(0,2),(0,-2),(2,3),(-2,-3)))
            home=next((p for p in candidates if not any(overlap([p[0]-.3,0.,p[2]-.3],[.6,1.6,.6],*box) for box in blocks)),None)
            if home is None:continue
            self.npcs.append({'slot':-100-i,'nickname':f'Test-NPC {i+1}','avatar':{'model':i+1,'height':1},
                'position':home[:],'home':home,'yaw':0.,'stance':'walk','weapon':None,'hp':100,'life':1,'score':0,
                'target':None,'route':i%2,'next_action':self.last_tick,'respawn':0.,'shot_seq':0,'shot':None})
    def solids(self):
        return (row for row in self.rows.values() if row['hp']>0)
    def snapshot(self):
        return [{k:r[k] for k in ('slot','nickname','avatar','position','yaw','stance','weapon','hp','life','score','shot_seq','shot')} for r in self.npcs if r['hp']>0]
    def damage_tree(self,row,damage):
        if row['kind']!='tree':return 'Gebaeude'
        hp=max(0,row['hp']-damage)
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('UPDATE village_state SET hp=? WHERE id=?',(hp,row['id']))
        row['hp']=hp
        return 'Baum gefaellt' if not hp else 'Baum beschaedigt'
    def damage_npc(self,npc,player,damage,now):
        npc['hp']=max(0,npc['hp']-damage)
        if not npc['hp']:
            npc.update(target=None,weapon=None,respawn=now+15,shot=None)
            return True
        if npc['target']!=player:npc['next_action']=now+1.0
        npc.update(target=player,weapon='pistol')
        return False
    def tick(self,now,players,blocked,ray_box,block_boxes,body_box,spawn):
        dt=max(0.,min(.3,now-self.last_tick));self.last_tick=now
        if dt<=0:return
        for npc in self.npcs:
            if npc['hp']<=0:
                if now>=npc['respawn'] and not blocked(npc['home']):
                    npc.update(hp=100,life=npc['life']+1,position=npc['home'][:],target=None,weapon=None,shot=None)
                else:continue
            p=npc['position'];home=npc['home']
            near=any(math.hypot(r['position'][0]-home[0],r['position'][2]-home[2])<38 for r in players.values())
            if not near:
                npc.update(target=None,weapon=None,stance='walk');continue
            target=players.get(npc['target'])
            if target and math.hypot(target['position'][0]-home[0],target['position'][2]-home[2])>25:target=None
            if not target:
                npc.update(target=None,weapon=None,stance='walk')
                goal=[home[0],0,home[2]+(5 if npc['route']==0 else -5)]
            else:
                goal=target['position'];npc['stance']='walk';npc['weapon']='pistol'
            dx,dz=goal[0]-p[0],goal[2]-p[2];dist=math.hypot(dx,dz)
            if dist>.12:
                npc['yaw']=math.atan2(-dx,-dz)
                if dist>(4 if target else .6):
                    step=min(dist,dt*(2.2 if target else 1.15))
                    q=[p[0]+dx/dist*step,0.,p[2]+dz/dist*step]
                    if not blocked(q) and all(math.hypot(q[0]-r['position'][0],q[2]-r['position'][2])>.6 for r in players.values()):
                        npc['position']=q;p=q
                    elif not target:npc['route']=1-npc['route']
                elif not target:npc['route']=1-npc['route']
            if not target or now<npc['next_action']:continue
            npc['next_action']=now+1.0
            if now<target['shield']:continue
            origin=[p[0],1.4,p[2]];aim=[target['position'][0],target['position'][1]+1.,target['position'][2]]
            delta=[b-a for a,b in zip(origin,aim)];distance=math.sqrt(sum(v*v for v in delta))
            if not .3<distance<=8:continue
            direction=[v/distance for v in delta]
            if any(ray_box(origin,direction,b,s,distance)<distance-.05 for b,s in block_boxes()):continue
            if any(ray_box(origin,direction,*body_box(r['position']),distance)<distance-.35 for r in players.values() if r is not target):continue
            npc['shot_seq']+=1;npc['shot']={'origin':origin,'direction':direction,'distance':distance,'impact':True}
            target['hp']=max(0,target['hp']-12)
            if not target['hp']:
                target.update(hp=100,life=target['life']+1,position=list(spawn),yaw=0.,move_at=now,shield=now+3)
                npc.update(target=None,weapon=None)
