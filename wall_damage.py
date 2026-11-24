"""Abstract persistent game-wall cells. No engineering or ballistics model."""
import json
from pathlib import Path

WALLS = json.loads((Path(__file__).parent / 'web' / 'engine' / 'wall_layout.json').read_text())
REMOVED = 4


def hit_cell(wall, point, normal):
    """Resolve a rendered surface point in the original wall-local frame.

    A tiny inward offset selects the surviving cell when hitting a cut edge.
    The server bounds-checks the reported point; the client is not authoritative
    for multiplayer spatial validation in this prototype.
    """
    s, a = wall['s'], wall['axis']
    if any(abs(point[i]) > s[i]/2 + .015 for i in range(3)):
        raise ValueError('Treffer ausserhalb der Spielwand')
    p = [point[i] - normal[i]*.0003 for i in range(3)]
    c = min(wall['cols']-1, max(0, int((p[a]/s[a]+.5)*wall['cols'])))
    r = min(wall['rows']-1, max(0, int((p[1]/s[1]+.5)*wall['rows'])))
    # Broad faces are always valid. An interior cut edge must lie on a cell line.
    b=2 if a==0 else 0
    if abs(abs(point[b])-s[b]/2) > .015:
        axis=max(range(3),key=lambda i:abs(normal[i]))
        if axis not in (a,1) or abs(normal[axis]) < .98:
            raise ValueError('Treffer liegt nicht auf einer Spielwandflaeche')
        count=wall['cols'] if axis==a else wall['rows']
        coord=(point[axis]/s[axis]+.5)*count
        if abs(coord-round(coord))*s[axis]/count>.015:
            raise ValueError('Treffer liegt nicht auf einer Segmentkante')
        return c,r,axis,1 if normal[axis]>0 else -1
    if abs(normal[b])<.98 or normal[b]*point[b]<=0:
        raise ValueError('Ungueltige Normalenrichtung fuer die Spielwand')
    return c,r,None,0


def create_schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS wall_cells (target TEXT NOT NULL, col INTEGER NOT NULL, row INTEGER NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4), PRIMARY KEY(target,col,row))')


def state(db):
    out={}
    for t,c,r,stage in db.execute('SELECT target,col,row,stage FROM wall_cells ORDER BY target,row,col'):
        out.setdefault(t,[]).append([c,r,stage])
    return out


def damage(db,target,point,normal):
    wall=WALLS[target]
    c,r,edge,side=hit_cell(wall,point,normal)
    def get(x,y):
        v=db.execute('SELECT stage FROM wall_cells WHERE target=? AND col=? AND row=?',(target,x,y)).fetchone()
        return v[0] if v else 0
    old=get(c,r)
    if edge is not None:
        nc,nr=(c+side,r) if edge==wall['axis'] else (c,r+side)
        if 0<=nc<wall['cols'] and 0<=nr<wall['rows'] and get(nc,nr)<REMOVED:
            raise ValueError('Segmentkante ist noch verdeckt')
    if old>=REMOVED:
        return {'target':target,'col':c,'row':r,'stage':REMOVED,'changed':False}
    new=old+1
    db.execute('INSERT INTO wall_cells VALUES (?,?,?,?) ON CONFLICT(target,col,row) DO UPDATE SET stage=excluded.stage',(target,c,r,new))
    return {'target':target,'col':c,'row':r,'stage':new,'changed':True}
