"""Village shell uses the same jittered Voronoi sites as the hotel walls.
The former grid IDs remain stable so stored damage and repairs survive upgrades.
These are convex game-surface prisms, not a structural-collapse simulation.
"""
import math
import sqlite3
from contextlib import closing
from functools import lru_cache
from wall_damage import site, REMOVED

XZ=(0,.085,.25,.375,.5,.625,.75,.915,1)
Y=(0,.025,.20,.375,.55,.725,.86,1)
NX=len(XZ)-1
NY=len(Y)-1

def part_index(x,y,z):
    return x+NX*z+NX*NX*y

def shell_cell(x,y,z):
    return x in (0,NX-1) or z in (0,NX-1) or y in (0,NY-1)

# Non-overlapping six slabs, in the same order as the shader's face selection.
# (normal axis, normal cell, U axis, V axis, U start/end, V start/end)
FACE_SPECS=((1,0,0,2,0,8,0,8),(1,6,0,2,0,8,0,8),
            (0,0,2,1,0,8,1,6),(0,7,2,1,0,8,1,6),
            (2,0,0,1,1,7,1,6),(2,7,0,1,1,7,1,6))
EDGES=(XZ,Y,XZ)

def clip(poly,n,k):
    out=[]
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)]
        da=a[0]*n[0]+a[1]*n[1]-k;db=b[0]*n[0]+b[1]*n[1]-k
        ia=da<=1e-10;ib=db<=1e-10
        if ia:out.append(a)
        if ia!=ib:
            t=da/(da-db);out.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    return out

@lru_cache(maxsize=48)
def faces_for(origin,size):
    result=[]
    for axis,layer,u,v,cs,ce,rs,re in FACE_SPECS:
        a=[0.]*3;b=[0.]*3
        for j,start,end in ((axis,layer,layer+1),(u,cs,ce),(v,rs,re)):
            a[j]=origin[j]+size[j]*EDGES[j][start];b[j]=origin[j]+size[j]*EDGES[j][end]
        w={'axis':u,'verticalAxis':v,'p':[(x+y)/2 for x,y in zip(a,b)],'s':[y-x for x,y in zip(a,b)],'cols':ce-cs,'rows':re-rs}
        sites=[site(w,c,r) for r in range(w['rows']) for c in range(w['cols'])]
        parts=[]
        for j,p in enumerate(sites):
            c,r=j%w['cols'],j//w['cols'];cell=[0]*3;cell[axis]=layer;cell[u]=cs+c;cell[v]=rs+r
            poly=[(-w['s'][u]/2,-w['s'][v]/2),(w['s'][u]/2,-w['s'][v]/2),(w['s'][u]/2,w['s'][v]/2),(-w['s'][u]/2,w['s'][v]/2)]
            for k,q in enumerate(sites):
                if k!=j:poly=clip(poly,(q[0]-p[0],q[1]-p[1]),(q[0]**2+q[1]**2-p[0]**2-p[1]**2)/2)
            poly=[(x+w['p'][u],y+w['p'][v]) for x,y in poly]
            lo=a[:];hi=b[:]
            for dim,i in ((u,0),(v,1)):
                lo[dim]=min(p[i] for p in poly);hi[dim]=max(p[i] for p in poly)
            parts.append({'index':part_index(*cell),'bounds':[lo,[y-x for x,y in zip(lo,hi)]],
                          'axes':[u,v,axis],'poly':poly,'site':[p[0]+w['p'][u],p[1]+w['p'][v]]})
        result.append(([a,[y-x for x,y in zip(a,b)]],parts))
    return result

def parts_for(row):
    damage=row.get('damage',{})
    for _,parts in faces_for(*map(tuple,row['bounds'])):
        for p in parts:
            i=p['index'];stage=damage.get(str(i),0)
            yield {**p,'id':row['id']+':'+str(i),'building':row['id'],'kind':'building-part','stage':stage,'hp':100-25*stage}

def colliders_for(row):
    damage=row.get('damage',{})
    for face,(bounds,parts) in enumerate(faces_for(*map(tuple,row['bounds']))):
        if not any(damage.get(str(p['index']),0)>=REMOVED for p in parts):
            yield {'id':row['id']+':solid:'+str(face),'kind':'building-solid','hp':100,'bounds':bounds}
        else:
            for p in parts:
                if damage.get(str(p['index']),0)<REMOVED:
                    yield {**p,'id':row['id']+':'+str(p['index']),'kind':'building-solid','hp':100}

def prism_overlap(a,s,part):
    """Exact convex polygon/rectangle SAT plus the prism's thickness interval."""
    b,t=part['bounds']
    if not all(x<y+v-1e-8 and x+u>y+1e-8 for x,u,y,v in zip(a,s,b,t)):return False
    if not part.get('poly'):return True
    u,v,_=part['axes'];poly=part['poly']
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];nx=q[1]-p[1];ny=p[0]-q[0]
        if abs(nx)+abs(ny)<1e-10:continue
        # Outward normal of a CCW polygon; the nearest rectangle corner must
        # lie inside its supporting half-plane. Axis-aligned axes checked above.
        nearest=nx*(a[u] if nx>=0 else a[u]+s[u])+ny*(a[v] if ny>=0 else a[v]+s[v])
        if nearest>=nx*p[0]+ny*p[1]-1e-8:return False
    return True

def prism_ray(origin,direction,part,limit):
    """Parametric clipping against the same convex prism as the renderer."""
    if not part.get('poly'):
        b,s=part['bounds'];lo=0.;hi=limit
        for o,d,x,w in zip(origin,direction,b,s):
            if abs(d)<1e-9:
                if not x<=o<=x+w:return math.inf
            else:
                a=(x-o)/d;z=(x+w-o)/d;lo=max(lo,min(a,z));hi=min(hi,max(a,z))
                if lo>hi:return math.inf
        return lo
    u,v,axis=part['axes'];b,s=part['bounds'];lo=0.;hi=limit
    def plane(value,slope):
        nonlocal lo,hi
        if abs(slope)<1e-10:return value>=-1e-8
        t=-value/slope
        if slope>0:lo=max(lo,t)
        else:hi=min(hi,t)
        return lo<=hi+1e-9
    if not plane(origin[axis]-b[axis],direction[axis]) or not plane(b[axis]+s[axis]-origin[axis],-direction[axis]):return math.inf
    poly=part['poly']
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];dx=q[0]-p[0];dy=q[1]-p[1]
        if not plane(dx*(origin[v]-p[1])-dy*(origin[u]-p[0]),dx*direction[v]-dy*direction[u]):return math.inf
    return max(0.,lo) if lo<=limit else math.inf

class VillageStructure:
    def __init__(self,path,rows):
        self.path=path;self.rows={r['id']:r for r in rows if r['kind']!='tree'}
        self.parts={};self.by_building={};self.colliders={}
        with closing(sqlite3.connect(path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS village_parts (building TEXT NOT NULL, cell INTEGER NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4), PRIMARY KEY(building,cell))')
            for row in self.rows.values():
                row['damage']={str(i):s for i,s in db.execute('SELECT cell,stage FROM village_parts WHERE building=?',(row['id'],))}
                self.refresh(row)
    def refresh(self,row):
        key=row['id'];parts=list(parts_for(row))
        self.by_building[key]=parts;self.parts.update((p['id'],p) for p in parts)
        self.colliders[key]=list(colliders_for(row))
    def solids(self):
        for rows in self.colliders.values():yield from rows
    def targets(self,origin,reach):
        for key,row in self.rows.items():
            b,s=row['bounds']
            if sum(max(lo-p,p-lo-w,0)**2 for p,lo,w in zip(origin,b,s))>reach**2:continue
            yield from (p for p in self.by_building[key] if p['hp']>0)
    def damage(self,part,step):
        row=self.rows[part['building']];i=part['index']
        stage=min(REMOVED,part['stage']+max(1,min(4,int(step))))
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('INSERT INTO village_parts VALUES (?,?,?) ON CONFLICT(building,cell) DO UPDATE SET stage=excluded.stage',(row['id'],i,stage))
        row['damage'][str(i)]=stage;self.refresh(row)
        return 'Gebaeudeteil zerstoert' if stage==REMOVED else 'Gebaeudeteil beschaedigt'
    def repair(self,part,whole=False):
        row=self.rows[part['building']]
        with closing(sqlite3.connect(self.path)) as db,db:
            if whole:db.execute('DELETE FROM village_parts WHERE building=?',(row['id'],))
            else:db.execute('DELETE FROM village_parts WHERE building=? AND cell=?',(row['id'],part['index']))
        if whole:row['damage'].clear()
        else:row['damage'].pop(str(part['index']),None)
        self.refresh(row)
        return 'Gebaeude wiederaufgebaut' if whole else 'Gebaeudeteil repariert'
