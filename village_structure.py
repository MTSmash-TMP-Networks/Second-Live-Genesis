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
DOOR_INDEX=448

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

def door_definition(row):
    """A centred, street-facing entrance matches the prepared Quaternius models."""
    b,s=row['bounds'];side=1 if b[0]+s[0]/2<-65 else -1
    front=b[0]+s[0] if side==1 else b[0]
    z=b[2]+s[2]/2;half=.53
    height=2.04 if row['kind']=='shop' else 2.40
    # Aperture extends through the front wall. Keep the shallow floor threshold.
    return {'side':side,'front':front,'z':z,'width':2*half,'height':height,
            'bounds':[[front-s[0]*.085 if side==1 else front,0.,z-half],[s[0]*.085,height,2*half]],'open':False}

def door_part(row):
    d=row['door'];i=DOOR_INDEX;stage=row.get('damage',{}).get(str(i),0)
    return {'id':row['id']+':'+str(i),'building':row['id'],'kind':'building-part','index':i,
            'stage':stage,'hp':100-25*stage,'bounds':d['bounds'],'doorLeaf':True}

def cut_entrance(part,row,face):
    """Remove the same rectangular opening from every front-wall prism.
    Original Voronoi cell IDs and damage stages do not change."""
    d=row.get('door')
    if not d or face!=(3 if d['side']==1 else 2):return part
    b,s=part['bounds'];z0=d['z']-d['width']/2;z1=d['z']+d['width']/2;h=d['height']
    if b[2]>=z1 or b[2]+s[2]<=z0 or b[1]>=h:return part
    pieces=[]
    for low,high,bottom in ((b[2],min(z0,b[2]+s[2]),b[1]),(max(z1,b[2]),b[2]+s[2],b[1]),(max(z0,b[2]),min(z1,b[2]+s[2]),max(h,b[1]))):
        if high-low<1e-8 or b[1]+s[1]-bottom<1e-8:continue
        if part.get('poly'):
            poly=part['poly']
            for n,k in (((-1,0),-low),((1,0),high),((0,-1),-bottom)):
                if poly:poly=clip(poly,n,k)
            if len(poly)<3:continue
            lo=[b[0],min(p[1] for p in poly),min(p[0] for p in poly)]
            hi=[b[0]+s[0],max(p[1] for p in poly),max(p[0] for p in poly)]
            pieces.append({'bounds':[lo,[y-x for x,y in zip(lo,hi)]],'axes':part['axes'],'poly':poly})
        else:pieces.append({'bounds':[[b[0],bottom,low],[s[0],b[1]+s[1]-bottom,high-low]]})
    return {**part,'pieces':pieces}

# Stable furniture indices live above the legacy wall and door IDs.
# u = distance in from the front door, v = lateral room coordinate.
# Layouts leave a 3.3 m central aisle and a clear area at every entrance.
INTERIOR_LAYOUTS={
    'home':(
        ('sofa',2.6,3.05,.95,.91,2.1),('coffee',4.0,3.0,.62,.46,1.25),
        ('media',5.2,3.1,.46,1.30,1.65),('bed',7.25,-2.65,2.0,.88,1.65),
        ('dresser',8.15,2.8,.65,1.12,1.55),('kitchen',5.5,-3.15,.70,.94,1.85),
        ('dining',7.2,.0,1.65,.82,1.65),('chair',6.0,0.,.52,.96,.52),
        ('chair',8.35,0.,.52,.96,.52),('bookcase',3.2,-3.5,.44,1.86,1.25),
        ('lamp',1.45,3.65,.40,1.82,.40),('lamp',8.15,-3.85,.40,1.82,.40),
        ('plant',1.55,-3.65,.46,.90,.46)),
    'market':(
        ('shelf',3.0,3.15,.76,1.82,1.95),('shelf',5.35,3.15,.76,1.82,1.95),
        ('shelf',3.0,-3.15,.76,1.82,1.95),('shelf',5.35,-3.15,.76,1.82,1.95),
        ('shelf',7.9,-2.8,.78,2.0,2.6),('checkout',7.7,2.75,1.25,1.15,2.45),
        ('produce',6.35,0.,1.30,1.13,1.55),('crate',8.15,.0,.72,.64,.80),
        ('lamp',1.4,3.7,.4,1.82,.4),('lamp',6.5,3.8,.4,1.82,.4),
        ('plant',1.4,-3.7,.46,.9,.46)),
    'cafe':(
        ('cafe-table',2.75,3.1,.83,.78,.83),('chair',1.85,3.1,.52,.96,.52),
        ('chair',3.65,3.1,.52,.96,.52),('cafe-table',2.75,-3.1,.83,.78,.83),
        ('chair',1.85,-3.1,.52,.96,.52),('chair',3.65,-3.1,.52,.96,.52),
        ('cafe-table',5.25,3.1,.83,.78,.83),('chair',4.35,3.1,.52,.96,.52),
        ('chair',6.15,3.1,.52,.96,.52),('cafe-table',5.25,-3.1,.83,.78,.83),
        ('chair',4.35,-3.1,.52,.96,.52),('chair',6.15,-3.1,.52,.96,.52),
        ('cafe-counter',7.85,0.,1.30,1.36,4.30),('bookcase',8.15,-3.3,.50,1.86,1.2),
        ('lamp',1.4,3.8,.40,1.82,.40),('lamp',7.8,3.8,.40,1.82,.40),
        ('plant',1.4,-3.8,.46,.90,.46)),
}

def interior_layout(row):
    d=row['door'];side=d['side'];floor=row['bounds'][0][1]+row['bounds'][1][1]*.025
    theme='home' if row['kind']=='house' else 'market' if row['label']=='MARKT' else 'cafe'
    result=[]
    for i,(kind,u,v,depth,height,width) in enumerate(INTERIOR_LAYOUTS[theme]):
        x=d['front']-side*u;z=d['z']-side*v
        tables=[q for q in INTERIOR_LAYOUTS[theme] if q[0] in ('dining','cafe-table')]
        nearest=min(tables,key=lambda q:(q[1]-u)**2+(q[2]-v)**2) if kind=='chair' and tables else None
        flip=kind=='sofa' or bool(nearest and nearest[1]>u)
        result.append({'index':512+i,'type':kind,'theme':theme,'side':side,'flip':flip,
                       'bounds':[[round(x-depth/2,6),round(floor,6),round(z-width/2,6)],[depth,height,width]]})
    return result

def furniture_parts(row):
    for item in row.get('interior',[]):
        i=item['index'];stage=row.get('damage',{}).get(str(i),0)
        yield {**item,'id':row['id']+':'+str(i),'building':row['id'],'kind':'building-part',
               'furniture':True,'stage':stage,'hp':100-25*stage}

def parts_for(row):
    damage=row.get('damage',{})
    for face,(_,parts) in enumerate(faces_for(*map(tuple,row['bounds']))):
        for p in parts:
            i=p['index'];stage=damage.get(str(i),0)
            yield cut_entrance({**p,'id':row['id']+':'+str(i),'building':row['id'],'kind':'building-part','stage':stage,'hp':100-25*stage},row,face)
    if row.get('door'):yield door_part(row)
    yield from furniture_parts(row)

def colliders_for(row):
    damage=row.get('damage',{})
    for face,(bounds,parts) in enumerate(faces_for(*map(tuple,row['bounds']))):
        if not any(damage.get(str(p['index']),0)>=REMOVED for p in parts):
            yield cut_entrance({'id':row['id']+':solid:'+str(face),'kind':'building-solid','hp':100,'bounds':bounds},row,face)
        else:
            for p in parts:
                if damage.get(str(p['index']),0)<REMOVED:
                    yield cut_entrance({**p,'id':row['id']+':'+str(p['index']),'kind':'building-solid','hp':100},row,face)
    yield from (p for p in furniture_parts(row) if p['hp']>0)

def prism_overlap(a,s,part):
    """Exact convex polygon/rectangle SAT plus the prism's thickness interval."""
    if 'pieces' in part:return any(prism_overlap(a,s,p) for p in part['pieces'])
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
    if 'pieces' in part:return min((prism_ray(origin,direction,p,limit) for p in part['pieces']),default=math.inf)
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
    def __init__(self,path,rows,blocks=()):
        self.path=path;self.rows={r['id']:r for r in rows if r['kind']!='tree'}
        self.parts={};self.by_building={};self.colliders={}
        with closing(sqlite3.connect(path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS village_parts (building TEXT NOT NULL, cell INTEGER NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4), PRIMARY KEY(building,cell))')
            for row in self.rows.values():
                row['damage']={str(i):s for i,s in db.execute('SELECT cell,stage FROM village_parts WHERE building=?',(row['id'],))}
                row['door']=door_definition(row)
                row['interior']=interior_layout(row)
                # Preserve any earlier player-built furniture at migration. The
                # skipped default item can be repaired after its space is clear.
                for p in furniture_parts(row):
                    if p['stage']<4 and any(prism_overlap(*box,p) for box in blocks):
                        db.execute('INSERT INTO village_parts VALUES (?,?,4) ON CONFLICT(building,cell) DO UPDATE SET stage=4',(row['id'],p['index']))
                        row['damage'][str(p['index'])]=4
                if row['damage'].get(str(DOOR_INDEX),0)>=REMOVED:row['door']['open']=True
                self.refresh(row)
    def refresh(self,row):
        key=row['id'];parts=list(parts_for(row))
        self.by_building[key]=parts;self.parts.update((p['id'],p) for p in parts)
        self.colliders[key]=list(colliders_for(row))
    def solids(self):
        for rows in self.colliders.values():yield from rows
        for row in self.rows.values():
            part=door_part(row)
            if part['hp']>0 and not row['door']['open']:yield part
    def targets(self,origin,reach):
        for key,row in self.rows.items():
            b,s=row['bounds']
            if sum(max(lo-p,p-lo-w,0)**2 for p,lo,w in zip(origin,b,s))>reach**2:continue
            yield from (p for p in self.by_building[key] if p['hp']>0 and not (p.get('doorLeaf') and row['door']['open']))
    def damage(self,part,step):
        row=self.rows[part['building']];i=part['index']
        stage=min(REMOVED,part['stage']+max(1,min(4,int(step))))
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('INSERT INTO village_parts VALUES (?,?,?) ON CONFLICT(building,cell) DO UPDATE SET stage=excluded.stage',(row['id'],i,stage))
        row['damage'][str(i)]=stage
        if i==DOOR_INDEX and stage>=REMOVED:row['door']['open']=True
        self.refresh(row)
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
