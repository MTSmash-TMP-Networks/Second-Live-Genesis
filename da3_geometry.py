"""Convert DA3 predictions to bounded, confidence-filtered multi-view geometry.
Cross-view depth agreement is a heuristic on predictions, not measured SLAM.
"""
import math
import numpy as np

def select_indices(n, limit):
    if n<1 or limit<2:raise ValueError('Keine Bildfolge')
    return np.unique(np.rint(np.linspace(0,n-1,min(n,limit))).astype(int)).tolist()

def geometry(pred, ids, final=False, input_count=None):
    d=np.asarray(pred.depth,dtype=np.float32)
    c=np.asarray(pred.conf,dtype=np.float32)
    e=np.asarray(pred.extrinsics,dtype=np.float64)
    k=np.asarray(pred.intrinsics,dtype=np.float64)
    rgb=np.asarray(pred.processed_images)
    n=len(ids)
    if d.ndim!=3 or d.shape[0]!=n or c.shape!=d.shape or k.shape!=(n,3,3) or e.shape not in ((n,3,4),(n,4,4)) or rgb.shape!=(*d.shape,3):
        raise ValueError('DA3 lieferte unvollständige Kameradaten')
    if not np.isfinite(e).all() or not np.isfinite(k).all() or np.any(k[:,0,0]<=0) or np.any(k[:,1,1]<=0):
        raise ValueError('Ungültige geschätzte Kameraparameter')
    if n<2:raise ValueError('Mehrere Blickwinkel erforderlich')
    h,w=d.shape[1:];rot=e[:,:3,:3];trans=e[:,:3,3]
    inv=np.linalg.inv(rot);cams=-np.einsum('nij,nj->ni',inv,trans)
    valid=np.isfinite(d)&(d>1e-6)&np.isfinite(c)&(c>0)
    for i in range(n):
        if valid[i].any():valid[i]&=c[i]>=np.percentile(c[i][valid[i]],35)
    # Each point must agree with another view's predicted depth; no invented fill.
    target=30000 if final else 9000
    stride=max(1,math.ceil(math.sqrt(n*h*w/target)))
    ys=np.arange(0,h,stride);xs=np.arange(0,w,stride);yy,xx=np.meshgrid(ys,xs,indexing='ij')
    uv=np.stack([xx.ravel(),yy.ravel(),np.ones(xx.size)],axis=1)
    patches=[];registered=[];scores={}
    for i in range(n):
        z=d[i,yy,xx].ravel()
        cam=(uv@np.linalg.inv(k[i]).T)*z[:,None]
        world=(cam-trans[i])@inv[i].T
        ok=valid[i,yy,xx].ravel()&np.isfinite(world).all(axis=1)
        agree=np.zeros(len(z),dtype=bool)
        for j in range(n):
            if j==i:continue
            other=world@rot[j].T+trans[j];zj=other[:,2]
            proj=other@k[j].T
            safe=np.isfinite(proj).all(axis=1)&(zj>1e-6)
            with np.errstate(divide='ignore',invalid='ignore'):
                u=np.divide(proj[:,0],zj,out=np.full(len(z),-1.),where=safe)
                v=np.divide(proj[:,1],zj,out=np.full(len(z),-1.),where=safe)
            inside=ok&safe&(u>=0)&(u<w-1)&(v>=0)&(v<h-1)
            ix=np.flatnonzero(inside)
            if not len(ix):continue
            a=np.rint(v[ix]).astype(int);b=np.rint(u[ix]).astype(int)
            dj=d[j,a,b]
            agree[ix]|=valid[j,a,b]&(np.abs(dj-zj[ix])<=.22*np.maximum(dj,zj[ix]))
        keep=ok&agree
        scores[ids[i]]=round(float(keep.sum()/max(1,ok.sum())),3)
        if keep.sum()<32 or scores[ids[i]]<.08:continue
        registered.append(ids[i]);patches.append((i,world,keep,z,rgb[i,yy,xx].reshape(-1,3)))
    if len(registered)<2 or sum(int(p[2].sum()) for p in patches)<100:
        raise ValueError('Noch keine konsistente Mehrbild-Geometrie. Geh ein Stück seitlich und halte dieselben Details im Bild.')
    cloud=np.concatenate([p[1][p[2]] for p in patches]);center=np.median(cloud,axis=0)
    scale=1/max(float(np.percentile(np.linalg.norm(cloud-center,axis=1),95)),1e-6)
    points=[];colors=[];triangles=[]
    for i,world,keep,z,cols in patches:
        pos=(world-center)*scale;keep=keep&(np.linalg.norm(pos,axis=1)<2.5)
        index=np.full(len(keep),-1,dtype=int);index[keep]=np.arange(len(points),len(points)+int(keep.sum()))
        points.extend(pos[keep].round(5).tolist());colors.extend(cols[keep].clip(0,255).astype('uint8').tolist())
        if final:
            grid=np.arange(len(keep)).reshape(yy.shape)
            for a,b,cc in ((grid[:-1,:-1],grid[1:,:-1],grid[:-1,1:]),(grid[:-1,1:],grid[1:,:-1],grid[1:,1:])):
                tri=np.stack([a.ravel(),b.ravel(),cc.ravel()],axis=1)
                tri=tri[keep[tri].all(axis=1)]
                if not len(tri):continue
                depth=z[tri];p=pos[tri]
                good=(depth.max(axis=1)<1.22*depth.min(axis=1))&(np.linalg.norm(p-np.roll(p,1,axis=1),axis=2).max(axis=1)<.14)
                triangles.extend(index[tri[good]].tolist())
    if len(points)<100:raise ValueError('Zu wenige konsistente 3D-Punkte')
    poses=[{'id':fid,'position':((cams[i]-center)*scale).round(5).tolist()} for i,fid in enumerate(ids) if fid in registered and np.linalg.norm((cams[i]-center)*scale)<5]
    warnings=['DA3: KI-geschätzte relative Geometrie; keine vermessene Raumabdeckung und kein natives AR-Tracking.']
    if len(registered)<n:warnings.append('Einige ausgewählte Ansichten liefern noch keine ausreichende Tiefenübereinstimmung.')
    if input_count and input_count>n:warnings.append('Ausgewählte Schlüsselbilder: '+str(n)+' von '+str(input_count)+'.')
    return {'kind':'da3_multiview','engine':'DA3-SMALL','units':'relative; not metric','registered':len(registered),'registered_ids':registered,
      'frame_ids':ids,'total_frames':n,'input_count':input_count or n,'agreement':scores,'points':points,'colors':colors,
      'camera_positions':poses,'vertices':points if final and triangles else [],'mesh_colors':colors if final and triangles else [],
      'triangles':triangles,'warnings':warnings}
