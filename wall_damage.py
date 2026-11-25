"""Deterministic abstract game-surface partition, not a structural simulation."""
import json
import math
from pathlib import Path
from functools import lru_cache

WALLS = json.loads((Path(__file__).parent / 'web' / 'engine' / 'wall_layout.json').read_text())
REMOVED = 4
MASK = 0xffffffff

def axes(w):
    u,v=w['axis'],w.get('verticalAxis',1)
    return u,v,3-u-v

def random(c,r,k):
    h=((c+1)*73856093 ^ (r+1)*19349663 ^ (k+1)*83492791)&MASK
    for _ in range(2): h=((h^(h>>16))*0x45d9f3b)&MASK
    return (h^(h>>16))/4294967296

def site(w,c,r):
    u,v,_=axes(w)
    return (-w['s'][u]/2+(c+.5+(random(c,r,0)-.5)*.64)*w['s'][u]/w['cols'], -w['s'][v]/2+(r+.5+(random(c,r,1)-.5)*.64)*w['s'][v]/w['rows'])

def nearest(w,u,v):
    return min(((c,r) for r in range(w['rows']) for c in range(w['cols'])),key=lambda a:sum((x-y)**2 for x,y in zip(site(w,*a),(u,v))))

def hit_cell(wall, point, normal):
    s=wall['s'];u,v,b=axes(wall)
    if any(abs(point[i]) > s[i]/2 + .015 for i in range(3)):
        raise ValueError('Treffer ausserhalb der Spielflaeche')
    # On a broad face, find its Voronoi cell. On a fracture edge, look a
    # tiny distance to either side of the reported virtual surface.
    if abs(abs(point[b])-s[b]/2)<=.015 and abs(normal[b])>.98 and normal[b]*point[b]>0:
        c,r=nearest(wall,point[u],point[v]);return c,r,None
    if abs(normal[b])>.05:
        raise ValueError('Treffer liegt nicht auf einer Spielflaeche')
    eps=.0015
    inside=(point[u]-normal[u]*eps,point[v]-normal[v]*eps)
    outside=(point[u]+normal[u]*eps,point[v]+normal[v]*eps)
    c,r=nearest(wall,*inside)
    if abs(outside[0])>s[u]/2 or abs(outside[1])>s[v]/2: return c,r,(-1,-1)
    other=nearest(wall,*outside)
    if other==(c,r): raise ValueError('Treffer liegt nicht auf einer Bruchkante')
    a,q=site(wall,c,r),site(wall,*other);d=(q[0]-a[0],q[1]-a[1]);length=math.hypot(*d)
    if (d[0]*normal[u]+d[1]*normal[v])/length<.95: raise ValueError('Ungueltige Bruchkantennormale')
    return c,r,other

def create_schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS wall_cells (target TEXT NOT NULL, col INTEGER NOT NULL, row INTEGER NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4), PRIMARY KEY(target,col,row))')
    db.execute('CREATE TABLE IF NOT EXISTS decor_damage (target TEXT PRIMARY KEY, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4))')

def state(db):
    out={}
    for t,c,r,stage in db.execute('SELECT target,col,row,stage FROM wall_cells ORDER BY target,row,col'):
        out.setdefault(t,[]).append([c,r,stage])
    return out

def damage(db,target,point,normal):
    wall=WALLS[target];c,r,other=hit_cell(wall,point,normal)
    def get(x,y):
        v=db.execute('SELECT stage FROM wall_cells WHERE target=? AND col=? AND row=?',(target,x,y)).fetchone()
        return v[0] if v else 0
    old=get(c,r)
    if other is not None and other!=(-1,-1) and get(*other)<REMOVED:
        raise ValueError('Bruchkante ist noch verdeckt')
    if old>=REMOVED: return {'target':target,'col':c,'row':r,'stage':REMOVED,'changed':False}
    new=old+1
    db.execute('INSERT INTO wall_cells VALUES (?,?,?,?) ON CONFLICT(target,col,row) DO UPDATE SET stage=excluded.stage',(target,c,r,new))
    return {'target':target,'col':c,'row':r,'stage':new,'changed':True}
