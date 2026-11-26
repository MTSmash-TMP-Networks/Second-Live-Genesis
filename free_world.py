"""Shared, bounded creative world. Account IDs and private room state never leave the server."""
import hashlib,json,math,secrets,sqlite3,threading,time
from contextlib import closing
from pathlib import Path
from world_capture import CaptureError
from room_models import image_size, MAX_FILE, validate_glb

L=json.loads((Path(__file__).resolve().parent/'web/engine/free_world_layout.json').read_text('utf8'))
HALF=int(L['half']/L['grid']);HEIGHT=int(L['height']/L['grid'])
SIZES=tuple(L['sizes'])
SPAWN=L['spawn']
GAME_PROPS=frozenset(('pistol','rifle','m16'))

def need(ok,message,status=400):
    if not ok:raise CaptureError(message,status)

def numeric(v):
    return type(v) in (int,float) and abs(v)<=1000000 and math.isfinite(v)

def vec(v,n=3):
    need(isinstance(v,list) and len(v)==n and all(numeric(x) for x in v),'Ungueltiger Vektor')
    return v

def grid_box(cell,dims):
    need(isinstance(cell,list) and len(cell)==3 and all(type(x) is int for x in cell),'Ungueltiges Bauraster')
    need(isinstance(dims,list) and len(dims)==3 and all(type(x) is int and x in SIZES for x in dims),'Ungueltige Blockgroesse')
    need(all(lo<=c and c+d<=hi for c,d,lo,hi in zip(cell,dims,[-HALF,0,-HALF],[HALF,HEIGHT,HALF])),'Block ausserhalb der Free World')
    # Keep the entrance and respawn area permanently unobstructed.
    need(not overlap(cell,dims,[-6,0,HALF-12],[12,HEIGHT,12]),'Eingang und Spawn bleiben frei')
    return cell,dims

def overlap(a,s,b,t):
    return all(x<y+v and x+u>y for x,u,y,v in zip(a,s,b,t))

def block_bounds(row):
    return [x*L['grid'] for x in row['cell']],[x*L['grid'] for x in row['dims']]

def distance_to_box(p,b,s):
    return math.sqrt(sum(max(x-y-v,y-x,0)**2 for x,y,v in zip(p,b,s)))

def ray_box(origin,direction,b,s,limit):
    lo=0.;hi=limit
    for o,d,x,w in zip(origin,direction,b,s):
        if abs(d)<1e-9:
            if not x<=o<=x+w:return math.inf
        else:
            a=(x-o)/d;z=(x+w-o)/d
            lo=max(lo,min(a,z));hi=min(hi,max(a,z))
            if lo>hi:return math.inf
    return lo

class FreeWorld:
    def __init__(self,path,clock=time.monotonic,damage_profiles=None,model_library=None):
        self.path=Path(path)/'free_world.sqlite3';self.clock=clock
        self.lock=threading.RLock();self.players={};self.blocks={};self.revision=0
        self.damage_profiles=damage_profiles or {'pistol':(25,1,1),'m16':(40,2,2),'rifle':(90,4,4)}
        self.model_library=model_library;self.models={}
        self.upload_slots=threading.BoundedSemaphore(2)
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,slot INTEGER NOT NULL,cell TEXT NOT NULL,dims TEXT NOT NULL,texture TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS textures(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,data BLOB NOT NULL)')
            columns={r[1] for r in db.execute('PRAGMA table_info(blocks)')}
            if 'hp' not in columns:db.execute('ALTER TABLE blocks ADD COLUMN hp INTEGER NOT NULL DEFAULT 100')
            if 'model' not in columns:db.execute('ALTER TABLE blocks ADD COLUMN model TEXT')
            db.execute('CREATE TABLE IF NOT EXISTS shared_models(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,bytes INTEGER NOT NULL,data BLOB NOT NULL)')
            for i,owner,name,n in db.execute('SELECT id,owner,name,bytes FROM shared_models'):
                self.models[i]={'owner':owner,'name':name,'bytes':n}
            for i,owner,slot,cell,dims,texture,hp,model in db.execute('SELECT id,owner,slot,cell,dims,texture,hp,model FROM blocks'):
                self.blocks[i]={'id':i,'owner':owner,'ownerSlot':slot,'cell':json.loads(cell),'dims':json.loads(dims),'texture':texture,'hp':hp,'model':model}
        self.revision=1
    def prune(self,now):
        for player,row in list(self.players.items()):
            if now-row['seen']>=L['leaseSeconds']:self.players.pop(player,None)
    def disconnect(self,player):
        with self.lock:self.players.pop(player,None)
    def member(self,player,lease=None,require_lease=True):
        self.prune(self.clock());row=self.players.get(player)
        need(row is not None,'Free-World-Sitzung abgelaufen',409)
        if require_lease:
            need(isinstance(lease,str) and len(lease)<=64 and secrets.compare_digest(row['lease'],lease),'Free-World-Sitzung abgelaufen',409)
        return row
    def own_textures(self,player):
        with closing(sqlite3.connect(self.path)) as db:
            return [{'id':i,'name':n} for i,n in db.execute('SELECT id,name FROM textures WHERE owner=? ORDER BY rowid',(player,))]
    def snapshot(self,player,row,revision=-1,corrected=False,notice=''):
        peers=[{k:r[k] for k in ('slot','nickname','avatar','position','yaw','stance','hp','life','score','weapon')} for key,r in self.players.items() if key!=player]
        out={'slot':row['slot'],'hp':row['hp'],'life':row['life'],'score':row['score'],'position':row['position'],'yaw':row['yaw'],'corrected':corrected,'peers':peers,'online':len(self.players),'revision':self.revision,'notice':notice,'textures':self.own_textures(player),'dayPhase':(time.time()%L['daySeconds'])/L['daySeconds']}
        if revision!=self.revision:
            out['blocks']=[{**{k:v for k,v in b.items() if k!='owner'},**({'modelName':self.models[b['model']]['name'],'modelBytes':self.models[b['model']]['bytes']} if b['model'] in self.models else {})} for b in self.blocks.values()]
        return out
    def enter(self,player,profile):
        with self.lock:
            now=self.clock();self.prune(now)
            row={'slot':profile['slot'],'nickname':profile['nickname'],'avatar':profile['avatar'],'lease':secrets.token_urlsafe(24),'seen':now,'move_at':now,'edit_at':-100.,'pulse_at':-100.,'position':list(SPAWN),'yaw':0.,'stance':'walk','weapon':None,'hp':100,'life':1,'score':0,'shield':now+3}
            self.players[player]=row
            return {**self.snapshot(player,row),'lease':row['lease']}
    def body_box(self,p,height=1.6):
        return [p[0]-.25,p[1]+.015,p[2]-.25],[.5,height-.015,.5]
    def blocked(self,p,height=1.6):
        if abs(p[0])>L['half']-.28 or abs(p[2])>L['half']-.28 or p[1]<0 or p[1]+height>L['height']+.001:return True
        b,s=self.body_box(p,height)
        return any(overlap(b,s,*block_bounds(block)) for block in self.blocks.values() if block['hp']>0)
    def update(self,row,data,now):
        if type(data.get('life')) is not int or data['life']!=row['life']:return True
        p=vec(data.get('position'));yaw=data.get('yaw');stance=data.get('stance','walk')
        need(numeric(yaw) and stance in ('walk','sprint','crouch'),'Ungueltige Bewegung')
        weapon=data.get('weapon')
        need(weapon is None or isinstance(weapon,str) and weapon in GAME_PROPS,'Unbekannte Spielwaffe')
        row['weapon']=weapon
        elapsed=min(1.5,max(.05,now-row['move_at']));old=row['position']
        height=1.12 if stance=='crouch' else 1.6
        if math.hypot(p[0]-old[0],p[2]-old[2])>elapsed*6.4+.48 or abs(p[1]-old[1])>elapsed*9+.5 or self.blocked(p,height):return True
        # Client locomotion, bounded on the host; sample the swept path as well.
        steps=max(1,min(48,math.ceil(math.dist(old,p)/.20)))
        if abs(old[1]-p[1])<.025 and any(self.blocked([a+(b-a)*i/steps for a,b in zip(old,p)],height) for i in range(1,steps)):return True
        row.update(position=[round(x,4) for x in p],yaw=math.remainder(yaw,2*math.pi),stance=stance,move_at=now)
        return False
    def build(self,player,row,data,now):
        need(now-row['edit_at']>=.12,'Bitte kurz warten',429)
        cell,dims=grid_box(data.get('cell'),data.get('dims'))
        b=[x*L['grid'] for x in cell];s=[x*L['grid'] for x in dims]
        need(distance_to_box([row['position'][0],row['position'][1]+1.4,row['position'][2]],b,s)<=L['reach'],'Block ausser Reichweite')
        need(len(self.blocks)<L['maxBlocks'] and sum(x['owner']==player for x in self.blocks.values())<L['maxOwned'],'Blocklimit erreicht',409)
        need(not any(overlap(cell,dims,x['cell'],x['dims']) for x in self.blocks.values()),'Bauplatz belegt',409)
        for p in self.players.values():
            need(not overlap(b,s,*self.body_box(p['position'],1.6)),'Spieler im Bauplatz',409)
        texture=data.get('texture');source=data.get('sourceModel');model=None;asset=None
        if source is not None:
            need(self.model_library is not None and isinstance(source,str) and len(source)==32 and texture is None and len(set(dims))==1,'Ungueltiger Modellbau')
            need(sum(bool(b['model']) for b in self.blocks.values())<L['maxModels'] and sum(bool(b['model']) and b['owner']==player for b in self.blocks.values())<L['maxOwnModels'],'Modelllimit erreicht',409)
            private=next((r for r in self.model_library.list(player)['models'] if r['id']==source),None)
            need(private is not None,'Eigenes Modell nicht gefunden',404)
            blob=self.model_library.get(player,source)
            model=hashlib.sha256(player.encode()+source.encode()+blob).hexdigest()[:32]
            if model not in self.models:
                need(0<len(blob)<=MAX_FILE and sum(m['bytes'] for m in self.models.values())+len(blob)<=L['maxModelBytes'],'Gemeinsamer Modellspeicher voll',413)
                validate_glb(blob)
                asset={'owner':player,'name':private['name'],'bytes':len(blob)}
        else:
            need(texture is None or isinstance(texture,str) and len(texture)==32 and any(t['id']==texture for t in self.own_textures(player)),'Textur nicht verfuegbar')
        with closing(sqlite3.connect(self.path)) as db,db:
            if asset:db.execute('INSERT INTO shared_models(id,owner,name,bytes,data) VALUES(?,?,?,?,?)',(model,player,asset['name'],asset['bytes'],blob))
            i=db.execute('INSERT INTO blocks(owner,slot,cell,dims,texture,model,hp) VALUES(?,?,?,?,?,?,100)',(player,row['slot'],json.dumps(cell),json.dumps(dims),texture,model)).lastrowid
        if asset:self.models[model]=asset
        self.blocks[i]={'id':i,'owner':player,'ownerSlot':row['slot'],'cell':cell,'dims':dims,'texture':texture,'model':model,'hp':100}
        self.revision+=1;row['edit_at']=now
        return 'Modell freigegeben und platziert' if model else 'Block gesetzt'
    def remove(self,player,row,data,now):
        need(now-row['edit_at']>=.12,'Bitte kurz warten',429)
        i=data.get('id');need(type(i) is int and i in self.blocks,'Block nicht vorhanden',404)
        block=self.blocks[i]
        need(block['owner']==player,'Nur eigene Bloecke koennen entfernt werden',403)
        need(distance_to_box([row['position'][0],row['position'][1]+1.4,row['position'][2]],*block_bounds(block))<=L['reach'],'Block ausser Reichweite')
        model=block['model'];last=bool(model) and not any(b['id']!=i and b['model']==model for b in self.blocks.values())
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('DELETE FROM blocks WHERE id=? AND owner=?',(i,player))
            if last:db.execute('DELETE FROM shared_models WHERE id=?',(model,))
        if last:self.models.pop(model,None)
        del self.blocks[i];self.revision+=1;row['edit_at']=now
        return 'Block entfernt'
    def model(self,player,identifier):
        with self.lock:
            self.member(player,require_lease=False)
            need(identifier in self.models,'Modell nicht gefunden',404)
            with closing(sqlite3.connect(self.path)) as db:
                row=db.execute('SELECT data FROM shared_models WHERE id=?',(identifier,)).fetchone()
            need(row is not None,'Modell nicht gefunden',404)
            return row[0]

    def repair(self,player,row,data,now):
        i=data.get('id');need(type(i) is int and i in self.blocks,'Objekt nicht vorhanden',404)
        b=self.blocks[i];need(b['owner']==player,'Nur eigene Objekte reparieren',403)
        p,s=block_bounds(b)
        need(distance_to_box(row['position'],p,s)<=L['reach'],'Objekt ausser Reichweite')
        need(not any(overlap(p,s,*self.body_box(r['position'])) for r in self.players.values()),'Spieler im Bauplatz',409)
        with closing(sqlite3.connect(self.path)) as db,db:db.execute('UPDATE blocks SET hp=100 WHERE id=?',(i,))
        b['hp']=100;self.revision+=1
        return 'Objekt repariert'

    def damage_block(self,b,direction,damage):
        hp=max(0,b['hp']-damage);cell=b['cell'][:]
        # Shared grid objects use authoritative displacement, not independent client physics.
        if b['model'] and hp>0:
            axis=0 if abs(direction[0])>=abs(direction[2]) else 2
            if abs(direction[axis])>.2:
                trial=cell[:];trial[axis]+=1 if direction[axis]>0 else -1
                try:
                    grid_box(trial,b['dims'])
                    occupied=any(other['id']!=b['id'] and overlap(trial,b['dims'],other['cell'],other['dims']) for other in self.blocks.values())
                    pos=[v*L['grid'] for v in trial];size=[v*L['grid'] for v in b['dims']]
                    supported=trial[1]==0 or any(o['id']!=b['id'] and o['hp']>0 and o['cell'][1]+o['dims'][1]==trial[1] and all(trial[j]<o['cell'][j]+o['dims'][j] and trial[j]+b['dims'][j]>o['cell'][j] for j in (0,2)) for o in self.blocks.values())
                    if not occupied and supported and not any(overlap(pos,size,*self.body_box(r['position'])) for r in self.players.values()):cell=trial
                except CaptureError:pass
        with closing(sqlite3.connect(self.path)) as db,db:db.execute('UPDATE blocks SET hp=?,cell=? WHERE id=?',(hp,json.dumps(cell),b['id']))
        b.update(hp=hp,cell=cell);self.revision+=1
        return 'Objekt zerstoert' if not hp else 'Objekt beschaedigt'

    def pulse(self,player,row,data,now):
        # Reuse the hotel game's fictional damage classes; the host validates all hits.
        weapon=data.get('weapon')
        need(isinstance(weapon,str) and weapon in GAME_PROPS and weapon==row['weapon'],'Bitte eine Spielwaffe auswaehlen')
        need(now-row['pulse_at']>=({'pistol':.24,'rifle':.45,'m16':.08}[weapon]-.005),'Spielaktion laedt noch',429)
        direction=vec(data.get('direction'));norm=math.sqrt(sum(x*x for x in direction))
        need(.99<=norm<=1.01,'Ungueltige Blickrichtung')
        direction=[x/norm for x in direction];row['pulse_at']=now
        p=row['position'];origin=[p[0],p[1]+(1.02 if row['stance']=='crouch' else 1.58),p[2]]
        reach=L['reach'];stop=reach;target_block=None
        for b in self.blocks.values():
            if b['hp']<=0:continue
            t=ray_box(origin,direction,*block_bounds(b),reach)
            if t<stop:stop=t;target_block=b
        target=None
        for key,other in self.players.items():
            if key==player:continue
            box,size=self.body_box(other['position'],1.12 if other['stance']=='crouch' else 1.6)
            t=ray_box(origin,direction,box,size,reach)
            if t<stop:stop=t;target=other;target_block=None
        shot={'origin':origin,'direction':direction,'distance':stop,'impact':target is not None or target_block is not None}
        if now<row['shield']:return 'Spawn-Schutz aktiv',shot
        damage=self.damage_profiles[weapon][0]
        if target_block is not None:return self.damage_block(target_block,direction,damage),shot
        if target is None:return 'Kein Spieltreffer',shot
        if now<target['shield']:return 'Spawn-Schutz aktiv',shot
        target['hp']=max(0,target['hp']-damage)
        if target['hp']==0:
            target.update(hp=100,life=target['life']+1,position=list(SPAWN),yaw=0.,move_at=now,shield=now+3)
            row['score']+=1
            return 'Spielpunkt +1',shot
        return 'Spieltreffer',shot
    def request(self,player,data):
        with self.lock:
            now=self.clock();row=self.member(player,data.get('lease'));op=data.get('action')
            if op in ('leave','abandon'):
                del self.players[player];return {'left':True}
            if op=='texture_delete':
                i=data.get('id');need(isinstance(i,str),'Ungueltige Textur')
                need(not any(x['texture']==i for x in self.blocks.values()),'Textur wird noch verwendet',409)
                with closing(sqlite3.connect(self.path)) as db,db:
                    need(db.execute('DELETE FROM textures WHERE id=? AND owner=?',(i,player)).rowcount==1,'Textur nicht vorhanden',404)
                row['seen']=now;return self.snapshot(player,row,data.get('revision'))
            if op=='update':
                corrected=self.update(row,data,now);row['seen']=now
                return self.snapshot(player,row,data.get('revision'),corrected)
            need(type(data.get('life')) is int and data['life']==row['life'],'Spieler wurde neu gespawnt',409)
            if op=='place':notice=self.build(player,row,data,now)
            elif op=='remove':notice=self.remove(player,row,data,now)
            elif op=='repair':notice=self.repair(player,row,data,now)
            elif op=='pulse':
                notice,shot=self.pulse(player,row,data,now);row['seen']=now
                return {**self.snapshot(player,row,data.get('revision'),notice=notice),'shot':shot}
            else:raise CaptureError('Unbekannte Free-World-Aktion',400)
            row['seen']=now
            return self.snapshot(player,row,data.get('revision'),notice=notice)
    def add_texture(self,player,lease,name,blob):
        need(0<len(blob)<=L['textureBytes'] and blob[:2]==b'\xff\xd8' and blob[-2:]==b'\xff\xd9','JPEG-Textur erwartet')
        w,h=image_size(blob,'image/jpeg')
        need(1<=w<=L['textureSize'] and 1<=h<=L['textureSize'],'Textur maximal 512 x 512 Pixel')
        name=''.join(c for c in str(name) if c.isprintable()).strip()[:64] or 'Bild'
        i=hashlib.sha256(player.encode()+b'\0'+blob).hexdigest()[:32]
        with self.lock:
            row=self.member(player,lease)
            with closing(sqlite3.connect(self.path)) as db,db:
                if not db.execute('SELECT 1 FROM textures WHERE id=? AND owner=?',(i,player)).fetchone():
                    need(db.execute('SELECT COUNT(*) FROM textures').fetchone()[0]<L['maxTextures'] and db.execute('SELECT COUNT(*) FROM textures WHERE owner=?',(player,)).fetchone()[0]<L['maxOwnTextures'],'Texturlimit erreicht',409)
                    db.execute('INSERT INTO textures(id,owner,name,data) VALUES(?,?,?,?)',(i,player,name,blob))
            row['seen']=self.clock()
            return {'added':i,'textures':self.own_textures(player)}
    def texture(self,player,i):
        with self.lock:
            self.member(player,require_lease=False)
            with closing(sqlite3.connect(self.path)) as db:
                row=db.execute('SELECT data FROM textures WHERE id=?',(i,)).fetchone()
            need(row is not None,'Textur nicht vorhanden',404)
            return row[0]
