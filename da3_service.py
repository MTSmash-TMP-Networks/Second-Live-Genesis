"""Private, local DA3 inference service. No image files or cloud inference."""
import base64, io, json, os, re, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
from da3_geometry import geometry

MODEL='depth-anything/DA3-SMALL'
REVISION='e08cab6'
MAX_BODY=40_000_000
state={'status':'loading','model':MODEL,'device':'initializing'}
model=None
lock=threading.Lock()

def load():
    global model
    try:
        import torch
        from depth_anything_3.api import DepthAnything3
        requested=os.getenv('SL_DA3_DEVICE','cpu')
        if requested not in ('cpu','cuda'):raise ValueError('Ungültiges Gerät')
        if requested=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA nicht verfügbar')
        device=torch.device(requested);torch.set_num_threads(max(1,min(8,int(os.getenv('SL_DA3_THREADS','4')))))
        m=DepthAnything3.from_pretrained(MODEL,revision=REVISION).to(device=device).eval()
        # Upstream automatic FP16 is GPU-oriented; CPU inference uses float32.
        if device.type=='cpu':
            def cpu_forward(image,extrinsics=None,intrinsics=None,export_feat_layers=None,infer_gs=False,use_ray_pose=False,ref_view_strategy='saddle_balanced'):
                with torch.inference_mode():
                    return m.model(image,extrinsics,intrinsics,export_feat_layers,infer_gs,use_ray_pose,ref_view_strategy)
            m.forward=cpu_forward
        model=m;state.update(status='ready',device=device.type)
    except Exception as exc:
        state.update(status='error',error=str(exc)[:300]);print('DA3 initialization failed:',type(exc).__name__,str(exc)[:300],flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,code,data):
        raw=json.dumps(data,allow_nan=False,separators=(',',':')).encode()
        self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_GET(self):
        if self.path!='/health':return self.reply(404,{'error':'Nicht gefunden'})
        self.reply(200,{**state,'busy':lock.locked()})
    def do_POST(self):
        if self.path!='/reconstruct':return self.reply(404,{'error':'Nicht gefunden'})
        if state['status']!='ready':return self.reply(503,{'error':'DA3 noch nicht bereit'})
        if not lock.acquire(blocking=False):return self.reply(409,{'error':'DA3 rechnet bereits'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=MAX_BODY:raise ValueError('Ungültige Anfragegröße')
            self.connection.settimeout(30);data=json.loads(self.rfile.read(size))
            rows=data.get('frames');final=data.get('final') is True
            if not isinstance(rows,list) or not 2<=len(rows)<=(16 if final else 8):raise ValueError('Ungültige Schlüsselbildanzahl')
            ids=[];images=[]
            for row in rows:
                fid=row['id']
                if not isinstance(fid,str) or not re.fullmatch('[0-9a-f]{32}',fid) or fid in ids:raise ValueError('Ungültiges Bild')
                b=base64.b64decode(row['jpeg'],validate=True)
                if len(b)>2_100_000:raise ValueError('Bild zu groß')
                with Image.open(io.BytesIO(b)) as im:
                    if im.format!='JPEG' or im.width*im.height>3_000_000 or min(im.size)<160:raise ValueError('Ungültiges JPEG')
                    images.append(im.convert('RGB'))
                ids.append(fid)
            pred=model.inference(images,process_res=420 if final else 280,ref_view_strategy='middle')
            result=geometry(pred,ids,final,int(data.get('input_count',len(ids))))
            self.reply(200,result)
        except ValueError as exc:self.reply(422,{'error':str(exc)[:240]})
        except Exception as exc:
            print('DA3 inference:',type(exc).__name__,str(exc)[:300],flush=True)
            self.reply(500,{'error':'DA3-Berechnung fehlgeschlagen: '+type(exc).__name__})
        finally:lock.release()

if __name__=='__main__':
    threading.Thread(target=load,daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',8766),Handler).serve_forever()
