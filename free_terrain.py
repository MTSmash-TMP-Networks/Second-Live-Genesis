"""Persistent metric heightfield shared verbatim with the browser."""
import json
import math
from pathlib import Path

CONFIG=json.loads((Path(__file__).resolve().parent/'web/engine/free_terrain_layout.json').read_text('utf8'))
H=CONFIG['half'];STEP=CONFIG['step'];N=int(2*H/STEP)+1

def smooth(t):
    t=max(0.,min(1.,t))
    return t*t*(3-2*t)

def distance_rect(x,z,b,s):
    return math.hypot(max(b[0]-x,0.,x-b[0]-s[0]),max(b[2]-z,0.,z-b[2]-s[2]))

def trail_distance(x,z):
    best=math.inf
    for path in CONFIG['paths']:
        for a,b in zip(path,path[1:]):
            dx=b[0]-a[0];dz=b[1]-a[1]
            t=max(0.,min(1.,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
            best=min(best,math.hypot(x-a[0]-dx*t,z-a[1]-dz*t))
    return best

ROAD_LAYOUT_VERSION=1
ROAD_SHOULDER=.65
ROAD_TREE_MARGIN=1.25

def road_points(points):
    """Round the same route on the host for rendering, tree clearance and map."""
    points=[list(p) for p in points]
    for _ in range(2):
        out=[points[0]]
        for a,b in zip(points,points[1:]):
            out.extend([[.75*a[i]+.25*b[i] for i in range(2)],
                        [.25*a[i]+.75*b[i] for i in range(2)]])
        out.append(points[-1])
        points=out
    return points

def road_layout():
    return [{**r,'points':road_points(r['points'])} for r in CONFIG.get('roads',[])]

def clear_road_tree(doc,row):
    """Only suppress trees on the new pavement/verge; keep their saved state."""
    if row.get('kind')!='tree':return False
    b,s=row['bounds'];x=b[0]+s[0]/2;z=b[2]+s[2]/2
    # Include trunk width and a modest verge; do not clear the whole canopy.
    for road in doc.get('roads',[]):
        radius=road['width']/2+ROAD_SHOULDER+ROAD_TREE_MARGIN+max(s[0],s[2])/2
        for a,c in zip(road['points'],road['points'][1:]):
            if x<min(a[0],c[0])-radius or x>max(a[0],c[0])+radius or z<min(a[1],c[1])-radius or z>max(a[1],c[1])+radius:continue
            dx=c[0]-a[0];dz=c[1]-a[1];ll=dx*dx+dz*dz
            t=max(0.,min(1.,((x-a[0])*dx+(z-a[1])*dz)/ll)) if ll else 0.
            if (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2<radius*radius:return True
    return False

def ensure_roads(doc):
    if doc.get('roadVersion')==ROAD_LAYOUT_VERSION:return False
    # Add road metadata only; never regenerate a persisted heightfield or lakes.
    doc.update(roadVersion=ROAD_LAYOUT_VERSION,roads=road_layout(),roadJunctions=CONFIG.get('roadJunctions',[]))
    return True

def lake_radius(x,z,lake):
    return math.hypot((x-lake['x'])/lake['rx'],(z-lake['z'])/lake['rz'])

def build_terrain(blocks=()):
    # A lake is skipped if an existing build occupies its future basin/bank.
    lakes=[l for l in CONFIG['lakes'] if not any(distance_rect(l['x'],l['z'],b,s)<max(l['rx'],l['rz'])*1.4+3 for b,s in blocks)]
    pads=[(b,s) for b,s in blocks if any(distance_rect(x,z,b,s)<max(rx,rz)+10 for x,z,rx,rz,h in CONFIG['hills'])]
    heights=[]
    for iz in range(N):
        z=-H+iz*STEP
        for ix in range(N):
            x=-H+ix*STEP
            y=0.
            for cx,cz,rx,rz,peak in CONFIG['hills']:
                d=math.hypot((x-cx)/rx,(z-cz)/rz)
                if d<1:
                    profile=(1-d*d)**2
                    noise=1+.09*math.sin(x*.21+z*.13)+.06*math.cos(z*.29-x*.14)
                    y=max(y,peak*profile*noise)
            for lake in lakes:
                d=lake_radius(x,z,lake)
                # Shallow basin surrounded by a gently irregular grassy bank.
                if d<1.35:
                    bank=1.35*smooth((d-.48)/.40)*(1-smooth((d-1.02)/.33))
                    y=max(y,bank*(1+.09*math.sin(x*.4+z*.21)))
            # Smooth the ground around old constructions, never move them.
            for b,s in pads:
                d=distance_rect(x,z,b,s)
                if d<10:y*=smooth((d-3)/7)
            heights.append(max(0,min(2150,round(y*100))))
    doc={'version':CONFIG['version'],'step':STEP,'half':H,'heights':heights,'lakes':lakes,'paths':CONFIG['paths']}
    ensure_roads(doc)
    return doc

class Terrain:
    def __init__(self,doc):
        self.doc=doc;self.heights=doc['heights']
        if doc.get('version')!=CONFIG['version'] or len(self.heights)!=N*N:
            raise ValueError('Invalid persisted terrain')
    def height(self,x,z):
        u=max(0.,min(N-1.,(x+H)/STEP));v=max(0.,min(N-1.,(z+H)/STEP))
        i=min(N-2,int(u));j=min(N-2,int(v));a=u-i;b=v-j;k=j*N+i
        h00,h10,h01,h11=(self.heights[k],self.heights[k+1],self.heights[k+N],self.heights[k+N+1])
        return ((h00+(h10-h00)*a+(h01-h00)*b) if a+b<=1 else (h11+(h01-h11)*(1-a)+(h10-h11)*(1-b)))/100
    def water(self,x,z):
        for lake in self.doc['lakes']:
            if lake_radius(x,z,lake)<1 and self.height(x,z)<lake['level']-.025:return lake['level']
        return 0.
    def max_height(self,b,s):
        xs=[b[0],b[0]+s[0]]+[i*STEP-H for i in range(max(0,math.ceil((b[0]+H)/STEP)),min(N-1,math.floor((b[0]+s[0]+H)/STEP))+1)]
        zs=[b[2],b[2]+s[2]]+[i*STEP-H for i in range(max(0,math.ceil((b[2]+H)/STEP)),min(N-1,math.floor((b[2]+s[2]+H)/STEP))+1)]
        result=max(self.height(x,z) for x in xs for z in zs)
        # Cell diagonals can intersect a footprint edge between grid nodes.
        for x in (b[0],b[0]+s[0]):
            q=(x+H)/STEP;f=q-math.floor(q)
            for j in range(max(0,math.floor((b[2]+H)/STEP)),min(N-2,math.floor((b[2]+s[2]+H)/STEP))+1):
                z=-H+(j+1-f)*STEP
                if b[2]<=z<=b[2]+s[2]:result=max(result,self.height(x,z))
        for z in (b[2],b[2]+s[2]):
            q=(z+H)/STEP;f=q-math.floor(q)
            for i in range(max(0,math.floor((b[0]+H)/STEP)),min(N-2,math.floor((b[0]+s[0]+H)/STEP))+1):
                x=-H+(i+1-f)*STEP
                if b[0]<=x<=b[0]+s[0]:result=max(result,self.height(x,z))
        return result
    def ray(self,origin,direction,limit):
        # March at <=0.5 m, refine the first ground crossing to millimetres.
        # No terrain damage; this only clips the existing game ray.
        def gap(t):
            x,y,z=(origin[i]+direction[i]*t for i in range(3))
            return y-self.height(x,z)
        if gap(0)<=0:return 0.
        prev=0.;count=max(1,math.ceil(limit/.5))
        for i in range(1,count+1):
            t=limit*i/count
            if gap(t)<=0:
                lo,hi=prev,t
                for _ in range(12):
                    mid=(lo+hi)*.5
                    if gap(mid)>0:lo=mid
                    else:hi=mid
                return hi
            prev=t
        return math.inf

def load_terrain(db,blocks):
    db.execute('CREATE TABLE IF NOT EXISTS free_terrain (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)')
    row=db.execute('SELECT data FROM free_terrain WHERE id=1').fetchone()
    if row:
        doc=json.loads(row[0]);terrain=Terrain(doc)
        if ensure_roads(doc):db.execute('UPDATE free_terrain SET data=? WHERE id=1',(json.dumps(doc,separators=(',',':')),))
        return terrain
    doc=build_terrain(blocks)
    db.execute('INSERT INTO free_terrain VALUES(1,?)',(json.dumps(doc,separators=(',',':')),))
    return Terrain(doc)
