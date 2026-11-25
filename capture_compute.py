"""Offline image inference + CPU SfM and experimental depth-aligned mesh.
No photographs leave the server. Model files alone are fetched on demand.
"""
from __future__ import annotations
import hashlib, json, math, os, shutil, subprocess, tempfile, threading, time
from pathlib import Path
from urllib.request import Request, urlopen

MODELS = {
    'depth': ('https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/709283e53fbd1183571e606f5cb37beae681336d/onnx/model.onnx', 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c', 115_000_000),
    'semantic': ('https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/8995d17/onnx/model.onnx', '3e5c18a4be395f16646438d54c42377ddc202edfa33d5eced0c9506de75c44c2', 20_000_000),
}
# SegFormer checkpoint is for non-commercial research/evaluation only.
LABELS={0:'Wand',1:'Gebaeude',2:'Himmel',3:'Boden',4:'Baum',5:'Decke',6:'Strasse',7:'Bett',8:'Fenster',9:'Gras',10:'Schrank',11:'Gehweg',12:'Person (nicht aufnehmen)',14:'Tuer',15:'Tisch',17:'Pflanze',18:'Vorhang',19:'Stuhl',20:'Auto',22:'Bild',23:'Sofa',24:'Regal',27:'Spiegel',28:'Teppich',30:'Sessel',33:'Schreibtisch',35:'Kleiderschrank',37:'Badewanne',44:'Kommode',62:'Buecherregal',64:'Couchtisch',65:'Toilette',74:'Computer',75:'Buerostuhl',85:'Leuchte',89:'Fernseher',143:'Monitor',146:'Heizkoerper',147:'Glas'}

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while b:=f.read(1024*1024):h.update(b)
    return h.hexdigest()

class Inference:
    def __init__(self,cache,device=None):
        self.cache=Path(cache);self.cache.mkdir(parents=True,exist_ok=True)
        self.requested=(device or os.getenv('SECOND_LIVE_COMPUTE','cpu')).lower()
        if self.requested not in ('cpu','cuda','auto'): raise ValueError('SECOND_LIVE_COMPUTE must be cpu, cuda or auto')
        self.sessions={};self.failures={};self.device='cpu';self.threads=max(1,min(8,int(os.getenv('SECOND_LIVE_COMPUTE_THREADS','4'))))
    def model(self,name):
        url,sha,limit=MODELS[name];path=self.cache/(name+'.onnx')
        if path.is_file() and sha256_file(path)==sha:return path
        tmp=path.with_suffix('.part');tmp.unlink(missing_ok=True)
        try:
            with urlopen(Request(url,headers={'User-Agent':'SecondLive-Capture/0.7.0'}),timeout=45) as response,tmp.open('wb') as f:
                start=time.monotonic();total=0
                while chunk:=response.read(1024*1024):
                    total+=len(chunk)
                    if total>limit or time.monotonic()-start>600:raise RuntimeError('Modelldownload-Limit erreicht')
                    f.write(chunk)
            if sha256_file(tmp)!=sha:raise RuntimeError('Modell-Pruefsumme stimmt nicht')
            tmp.replace(path);return path
        finally:tmp.unlink(missing_ok=True)
    def session(self,name):
        if name in self.sessions:return self.sessions[name]
        if name in self.failures and time.monotonic()-self.failures[name][0]<120:raise RuntimeError(self.failures[name][1])
        try:
            import onnxruntime as ort
            available=ort.get_available_providers();cuda='CUDAExecutionProvider' in available
            if self.requested=='cuda' and not cuda:raise RuntimeError('CUDA angefordert, aber ONNX CUDA Provider fehlt')
            providers=['CUDAExecutionProvider','CPUExecutionProvider'] if cuda and self.requested!='cpu' else ['CPUExecutionProvider']
            opts=ort.SessionOptions();opts.intra_op_num_threads=self.threads;opts.inter_op_num_threads=1
            session=ort.InferenceSession(str(self.model(name)),sess_options=opts,providers=providers)
            if self.requested=='cuda' and 'CUDAExecutionProvider' not in session.get_providers():raise RuntimeError('CUDA Initialisierung fehlgeschlagen')
            self.device='cuda' if 'CUDAExecutionProvider' in session.get_providers() else 'cpu';self.sessions[name]=session;return session
        except Exception as e:
            message=f'{name}: {type(e).__name__}: {str(e)[:220]}';self.failures[name]=(time.monotonic(),message);raise RuntimeError(message) from e
    def infer(self,name,bgr):
        import cv2,numpy as np
        s=self.session(name);inp=s.get_inputs()[0]
        default=518 if name=='depth' else 512
        h,w=[int(x) if isinstance(x,int) and x>0 else default for x in inp.shape[-2:]]
        rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);x=cv2.resize(rgb,(w,h),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255
        x=(x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
        output=s.run(None,{inp.name:np.ascontiguousarray(x.transpose(2,0,1)[None])})[0]
        if not np.isfinite(output).all():raise RuntimeError('Ungueltige KI-Ausgabe')
        return output
    def analyze(self,path,evaluation=False):
        import cv2,numpy as np
        im=cv2.imread(str(path));
        if im is None:raise RuntimeError('Bild konnte nicht dekodiert werden')
        gray=cv2.cvtColor(cv2.resize(im,(320,240)),cv2.COLOR_BGR2GRAY)
        result={'sharpness':round(float(cv2.Laplacian(gray,cv2.CV_64F).var()),1),'brightness':round(float(gray.mean()),1),'semantic':'disabled','classes':[],'device':self.device}
        if evaluation:
            try:
                logits=self.infer('semantic',im)
                if logits.ndim!=4 or logits.shape[0]!=1 or logits.shape[1]!=150:raise RuntimeError('Ungueltige Segmentierungsausgabe')
                mask=cv2.resize(logits[0].argmax(0).astype('uint8'),(64,48),interpolation=cv2.INTER_NEAREST)
                labels,counts=np.unique(mask,return_counts=True)
                result['classes']=[{'id':int(i),'label':LABELS.get(int(i),'Sonstiges / '+str(int(i))),'coverage':round(float(n)/mask.size,3)} for i,n in sorted(zip(labels,counts),key=lambda x:-x[1])[:12] if n>=15]
                result['mask']={'width':64,'height':48,'labels':mask.ravel().tolist()};result['semantic']='ready';result['device']=self.device
            except Exception as e:result['semantic']='unavailable';result['semantic_error']=str(e)[:250]
        return result
    def depth(self,image):
        import cv2,numpy as np
        d=self.infer('depth',image).squeeze()
        if d.ndim!=2 or min(d.shape)<16:raise RuntimeError('Ungueltige Tiefenausgabe')
        return cv2.resize(d,(image.shape[1],image.shape[0]),interpolation=cv2.INTER_LINEAR).astype(np.float32)

def run_colmap(args,log,threads,timeout=1200):
    env={**os.environ,'QT_QPA_PLATFORM':'offscreen','OMP_NUM_THREADS':str(threads),'OPENBLAS_NUM_THREADS':str(threads)}
    with open(log,'a',encoding='utf8') as out:
        out.write('\nCOLMAP '+args[0]+'\n');out.flush()
        p=subprocess.run(['colmap',*args],stdout=out,stderr=subprocess.STDOUT,env=env,timeout=timeout)
    if p.returncode:raise RuntimeError('COLMAP '+args[0]+' fehlgeschlagen (Code '+str(p.returncode)+')')

def read_model(folder):
    """COLMAP text format; SIMPLE_PINHOLE/PINHOLE camera model only."""
    import numpy as np
    cameras={};points={};views=[]
    for line in (folder/'cameras.txt').read_text().splitlines():
        if not line or line.startswith('#'):continue
        k,m,w,h,*p=line.split();p=list(map(float,p))
        if m=='SIMPLE_PINHOLE': f,cx,cy=p; fx=fy=f
        elif m=='PINHOLE':fx,fy,cx,cy=p
        else:raise RuntimeError('Nicht unterstuetzte Kamera '+m)
        cameras[int(k)]=(int(w),int(h),fx,fy,cx,cy)
    for line in (folder/'points3D.txt').read_text().splitlines():
        if not line or line.startswith('#'):continue
        k,x,y,z,r,g,b,err,*track=line.split();p=np.array([float(x),float(y),float(z)])
        if np.isfinite(p).all() and float(err)<=4 and len(track)>=4:points[int(k)]=(p,[int(r),int(g),int(b)])
    lines=[l for l in (folder/'images.txt').read_text().splitlines() if not l.startswith('#')]
    for i in range(0,len(lines)-1,2):
        a=lines[i].split();obs=lines[i+1].split()
        if len(a)!=10 or len(obs)%3:raise RuntimeError('Ungueltige COLMAP Bilddaten')
        qw,qx,qy,qz=map(float,a[1:5]);t=np.array(list(map(float,a[5:8])))
        R=np.array([[1-2*(qy*qy+qz*qz),2*(qx*qy-qw*qz),2*(qx*qz+qw*qy)],[2*(qx*qy+qw*qz),1-2*(qx*qx+qz*qz),2*(qy*qz-qw*qx)],[2*(qx*qz-qw*qy),2*(qy*qz+qw*qx),1-2*(qx*qx+qy*qy)]])
        views.append({'name':a[9],'R':R,'t':t,'camera':cameras[int(a[8])],'obs':[(float(obs[j]),float(obs[j+1]),int(obs[j+2])) for j in range(0,len(obs),3) if int(obs[j+2]) in points]})
    return points,views

def fit_inverse_depth(pred,z):
    """Robust affine alignment of relative inverse depth to sparse camera-space Z."""
    import numpy as np
    pred=np.asarray(pred,dtype=float);z=np.asarray(z,dtype=float)
    valid=np.isfinite(pred)&np.isfinite(z)&(z>1e-6);x=pred[valid];y=1/z[valid]
    if len(x)<20 or np.std(x)<1e-8 or np.std(y)<1e-8:return None
    A=np.column_stack((x,np.ones_like(x)));coef=np.linalg.lstsq(A,y,rcond=None)[0]
    for _ in range(3):
        residual=np.abs(A@coef-y);tol=max(np.median(residual)*2.8,np.median(y)*.045);keep=residual<=tol
        if keep.sum()<15:return None
        coef=np.linalg.lstsq(A[keep],y[keep],rcond=None)[0]
    prediction=A@coef;err=float(np.median(np.abs(prediction-y)/y));corr=float(np.corrcoef(prediction,y)[0,1])
    if not np.isfinite(coef).all() or coef[0]<=0 or not math.isfinite(corr) or corr<.55 or err>.25:return None
    return coef

def depth_mesh(view,points,image,depth,center,scale,grid=52):
    import numpy as np
    h,w=image.shape[:2];cw,ch,fx,fy,cx,cy=view['camera'];fx*=w/cw;fy*=h/ch;cx*=w/cw;cy*=h/ch
    R,t=view['R'],view['t'];samples=[];zs=[]
    for u,v,pid in view['obs']:
        x=min(w-1,max(0,round(u*w/cw)));y=min(h-1,max(0,round(v*h/ch)));z=float((R@points[pid][0]+t)[2]);samples.append(depth[y,x]);zs.append(z)
    fit=fit_inverse_depth(samples,zs)
    if fit is None:return [],[],[]
    ys=np.linspace(0,h-1,grid).astype(int);xs=np.linspace(0,w-1,grid).astype(int);xx,yy=np.meshgrid(xs,ys)
    inv=depth[yy,xx]*fit[0]+fit[1];valid=np.isfinite(inv)&(inv>1e-6)
    zz=np.divide(1,inv,out=np.zeros_like(inv),where=valid);camera=np.stack(((xx-cx)*zz/fx,(yy-cy)*zz/fy,zz),axis=-1);world=((camera-t)@R-center)*scale
    valid&=(np.linalg.norm(world,axis=-1)<2.5)
    vertices=[];colors=[];idx=np.full((grid,grid),-1,dtype=int)
    for y,x in zip(*np.where(valid)):
        idx[y,x]=len(vertices);vertices.append(world[y,x].round(5).tolist());colors.append(image[yy[y,x],xx[y,x],::-1].tolist())
    faces=[]
    for y in range(grid-1):
        for x in range(grid-1):
            for tri in (((y,x),(y,x+1),(y+1,x)),((y,x+1),(y+1,x+1),(y+1,x))):
                if any(idx[a]<0 for a in tri):continue
                a,b,c=[world[i] for i in tri];depths=[zz[i] for i in tri]
                if max(depths)>1.18*min(depths) or max(np.linalg.norm(a-b),np.linalg.norm(a-c),np.linalg.norm(b-c))>.16:continue
                faces.append([int(idx[i]) for i in tri])
    return vertices,colors,faces

def build_preview(points,views,images,inference,semantic_summary=None):
    import cv2,numpy as np
    xyz=np.array([v[0] for v in points.values()]);center=np.median(xyz,axis=0);scale=1/max(float(np.percentile(np.linalg.norm(xyz-center,axis=1),95)),1e-6)
    clean=[v for v in points.values() if np.linalg.norm((v[0]-center)*scale)<2.5];stride=max(1,math.ceil(len(clean)/20000));clean=clean[::stride]
    out={'kind':'sfm_depth_preview','units':'relative; not metric','registered':len(views),'points':[((v[0]-center)*scale).round(5).tolist() for v in clean],'colors':[v[1] for v in clean], 'vertices':[],'mesh_colors':[],'triangles':[],'depth_views':0,'warnings':[],'semantics':semantic_summary or {}}
    if len(clean)<100:raise RuntimeError('Zu wenige zuverlaessige 3D-Punkte; mehr ueberlappende Perspektiven erforderlich')
    candidates=sorted(views,key=lambda v:-len(v['obs']))[:8]
    for view in candidates:
        image=cv2.imread(str(images/view['name']))
        if image is None:continue
        try:depth=inference.depth(image)
        except Exception as e:out['warnings'].append('KI-Tiefe nicht verfuegbar: '+str(e)[:180]);break
        verts,colors,faces=depth_mesh(view,points,image,depth,center,scale)
        if not faces:continue
        offset=len(out['vertices']);out['vertices']+=verts;out['mesh_colors']+=colors;out['triangles'] += [[i+offset for i in face] for face in faces];out['depth_views']+=1
    if not out['triangles']:out['warnings'].append('Nur verifizierte SfM-Punktwolke; keine ausreichend konsistente KI-Oberflaeche')
    return out

def reconstruct(store,scan,inference):
    import numpy as np
    sid=scan['id'];root=store.files/sid;images=root/'frames';frames=store.frames_for(sid)
    if not shutil.which('colmap'):raise RuntimeError('COLMAP fehlt; Docker-Image fuer 0.7.0 erforderlich')
    summary={}
    for row in frames:
        if row['result']:
            for cls in json.loads(row['result']).get('classes',[]):summary[cls['label']]=summary.get(cls['label'],0)+1
    with tempfile.TemporaryDirectory(prefix='reconstruct-',dir=root) as tmp:
        t=Path(tmp);db=t/'database.db';models=t/'sparse';models.mkdir();log=root/'reconstruction.log';log.unlink(missing_ok=True);threads=inference.threads
        run_colmap(['feature_extractor','--database_path',str(db),'--image_path',str(images),'--ImageReader.camera_model','SIMPLE_PINHOLE','--SiftExtraction.use_gpu','0','--SiftExtraction.max_image_size','1600','--SiftExtraction.num_threads',str(threads)],log,threads)
        run_colmap(['exhaustive_matcher','--database_path',str(db),'--SiftMatching.use_gpu','0','--SiftMatching.num_threads',str(threads)],log,threads)
        run_colmap(['mapper','--database_path',str(db),'--image_path',str(images),'--output_path',str(models),'--Mapper.num_threads',str(threads)],log,threads)
        best=None
        for m in sorted(models.iterdir()):
            if not (m/'images.bin').is_file():continue
            txt=t/('text-'+m.name);txt.mkdir();run_colmap(['model_converter','--input_path',str(m),'--output_path',str(txt),'--output_type','TXT'],log,threads,120)
            points,views=read_model(txt)
            if best is None or (len(views),len(points))>(len(best[1]),len(best[0])):best=(points,views)
        if not best or len(best[1])<max(3,math.ceil(len(frames)*.5)) or len(best[0])<100:raise RuntimeError('Zu wenige Fotos raeumlich verbunden. Seitlich versetzen, Ueberlappung halten und mehr Details aufnehmen.')
        result=build_preview(*best,images,inference,summary);result['total_frames']=len(frames)
        temp=root/'preview.tmp';temp.write_text(json.dumps(result,allow_nan=False,separators=(',',':')),encoding='utf8');temp.replace(root/'preview.json')
        return f"{result['registered']}/{len(frames)} Kameraposen, {len(result['points'])} 3D-Punkte, {len(result['triangles'])} experimentelle Dreiecke. Vorschau pruefen."

def main(root):
    from world_capture import CaptureStore
    store=CaptureStore(root);engine=Inference(store.files/'models');store.recover_worker()
    def beat():
        while True:
            try:store.heartbeat(engine.device+' (angefordert: '+engine.requested+')')
            except Exception:pass
            time.sleep(8)
    threading.Thread(target=beat,daemon=True).start()
    while True:
        task=store.claim()
        if not task:time.sleep(.7);continue
        kind,row=task
        if kind=='frame':
            try: result=engine.analyze(store.files/row['scan']/'frames'/(row['id']+'.jpg'),bool(row['evaluation']))
            except Exception as e:result={'error':str(e)[:250]}
            store.finish_frame(row['id'],result)
        else:
            try:message=reconstruct(store,row,engine);store.finish_scan(row['id'],True,message)
            except Exception as e:store.finish_scan(row['id'],False,str(e))

if __name__=='__main__':
    import sys
    main(sys.argv[1])
