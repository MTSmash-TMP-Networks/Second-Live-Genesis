"""Shared structural cells for the village, with the hotel game's four damage stages.
The cells describe the exterior shell of the prepared modular GLBs, not a real
load-bearing building simulation. Coordinates are normalized to each footprint.
"""
import sqlite3
from contextlib import closing

XZ=(0,.085,.25,.375,.5,.625,.75,.915,1)
Y=(0,.025,.20,.375,.55,.725,.86,1)
NX=len(XZ)-1
NY=len(Y)-1
REMOVED=4

def part_index(x,y,z):
    return x+NX*z+NX*NX*y

def shell_cell(x,y,z):
    return x in (0,NX-1) or z in (0,NX-1) or y in (0,NY-1)

def bounds(row,x,y,z,end=None):
    origin,size=row['bounds']
    a=[XZ[x],Y[y],XZ[z]]
    ex,ey,ez=end or (x+1,y+1,z+1)
    b=[XZ[ex],Y[ey],XZ[ez]]
    return [[round(o+s*t,6) for o,s,t in zip(origin,size,a)],
            [round(s*(v-u),6) for s,u,v in zip(size,a,b)]]

def parts_for(row):
    damage=row.get('damage',{})
    for y in range(NY):
        for z in range(NX):
            for x in range(NX):
                if not shell_cell(x,y,z):continue
                i=part_index(x,y,z);stage=damage.get(str(i),0)
                yield {'id':row['id']+':'+str(i),'building':row['id'],'kind':'building-part','index':i,
                       'stage':stage,'hp':100-25*stage,'bounds':bounds(row,x,y,z)}

def colliders_for(row):
    damage=row.get('damage',{})
    taken=set()
    def live(x,y,z):
        return shell_cell(x,y,z) and part_index(x,y,z) not in taken and damage.get(str(part_index(x,y,z)),0)<REMOVED
    for y in range(NY):
        for z in range(NX):
            for x in range(NX):
                if not live(x,y,z):continue
                ex,ey,ez=x+1,y+1,z+1
                while ex<NX and live(ex,y,z):ex+=1
                while ez<NX and all(live(xx,y,ez) for xx in range(x,ex)):ez+=1
                while ey<NY and all(live(xx,ey,zz) for zz in range(z,ez) for xx in range(x,ex)):ey+=1
                taken.update(part_index(xx,yy,zz) for yy in range(y,ey) for zz in range(z,ez) for xx in range(x,ex))
                yield {'id':row['id']+':solid:'+str(part_index(x,y,z)),'kind':'building-solid',
                       'hp':100,'bounds':bounds(row,x,y,z,(ex,ey,ez))}

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
