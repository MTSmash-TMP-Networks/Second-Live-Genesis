import base64, io, json, tempfile, threading, unittest, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
from PIL import Image, ImageDraw
from server import create_server, GameStore
from world_capture import CaptureStore, CaptureError, region_for

def jpeg(n=0):
    im=Image.new('RGB',(220,180),(30+n*7,100,120));ImageDraw.Draw(im).text((10,20),str(n),fill='white');b=io.BytesIO();im.save(b,'JPEG');return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
LOC={'lat':51.01234,'lon':9.01234,'accuracy':10}

class CaptureStoreTest(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.s=CaptureStore(Path(self.tmp.name));self.a,self.key=self.s.session();self.b,_=self.s.session()
    def tearDown(self):self.tmp.cleanup()
    def test_sessions_and_gps(self):
        self.assertEqual(self.s.identify(self.key),self.a);self.assertEqual(self.s.session(self.key),(self.a,None));self.assertNotEqual(self.a,self.b);self.assertEqual(self.s.locate(self.a,LOC)['region'],region_for(LOC));self.assertEqual(self.s.locate(self.a,{'lat':50,'lon':10,'accuracy':5})['region'],region_for(LOC));self.assertIsNone(self.s.profile(self.b)['region'])
        with self.assertRaises(CaptureError):region_for({'lat':51,'lon':9,'accuracy':100})
    def test_pair_code_one_time_and_separate_cookie(self):
        code=self.s.pair_code(self.a);player,key=self.s.redeem(code);self.assertEqual(player,self.a);self.assertNotEqual(key,self.key);self.assertEqual(self.s.identify(key),self.a);self.assertEqual(self.s.identify(self.key),self.a)
        with self.assertRaises(CaptureError):self.s.redeem(code)
    def test_home_anchor_immutable_and_new_scan_region(self):
        start=self.s.locate(self.a,LOC);other={'lat':50.,'lon':10.,'accuracy':5};new=self.s.locate(self.a,other);self.assertEqual(new['region'],start['region']);self.assertNotEqual(new['scan_region'],start['scan_region']);self.s.reserve(self.a,'shared',other)
    def test_region_atomic_reservation(self):
        self.s.locate(self.a,LOC);self.s.locate(self.b,LOC);result=self.s.reserve(self.a,'shared',LOC);self.assertEqual(self.s.status(self.b,'shared')['status'],'capturing');self.assertFalse(self.s.status(self.b,'shared')['mine'])
        with self.assertRaises(CaptureError):self.s.reserve(self.b,'shared',LOC)
        with self.assertRaises(CaptureError):self.s.frame(self.b,result['id'],jpeg())
        self.s.transition(self.a,result['id'],'cancel');self.assertEqual(self.s.status(self.b,'shared')['status'],'unexplored');self.s.reserve(self.b,'shared',LOC)
    def test_private_reservation_and_worker(self):
        a=self.s.reserve(self.a,'private',evaluation=True);b=self.s.reserve(self.b,'private');self.assertNotEqual(a['id'],b['id']);sid=a['id'];f=self.s.frame(self.a,sid,jpeg());self.assertFalse(f['duplicate']);self.assertTrue(self.s.frame(self.a,sid,jpeg())['duplicate'])
        with self.assertRaises(CaptureError):self.s.transition(self.a,sid,'submit')
        for n in range(1,8):self.s.frame(self.a,sid,jpeg(n))
        self.s.transition(self.a,sid,'submit')
        for i in range(8):
            kind,row=self.s.claim();self.assertEqual(kind,'frame');self.assertEqual(row['evaluation'],1);self.s.finish_frame(row['id'],{'classes':[]})
        kind,row=self.s.claim();self.assertEqual(kind,'scan');self.assertEqual(row['id'],sid)
        self.s.finish_scan(sid,False,'missing overlap');self.assertEqual(self.s.status(self.a)['status'],'failed');self.s.transition(self.a,sid,'retry');self.assertEqual(self.s.status(self.a)['status'],'capturing');self.s.transition(self.a,sid,'cancel');self.assertFalse((self.s.files/sid).exists())
    def test_public_preview_only_and_lock(self):
        self.s.locate(self.a,LOC);self.s.locate(self.b,LOC);sid=self.s.reserve(self.a,'shared',LOC)['id']
        with self.s.tx() as db:db.execute("UPDATE scans SET status='processing' WHERE id=?",(sid,))
        self.s.finish_scan(sid,True,'ready');data={'points':[[0,0,0]],'colors':[[1,2,3]],'mesh_colors':[[4,5,6]],'semantics':{'wall':1},'triangles':[]};(self.s.files/sid/'preview.json').write_text(json.dumps(data))
        with self.assertRaises(CaptureError):self.s.preview(self.b,sid)
        self.s.transition(self.a,sid,'publish');self.assertEqual(self.s.status(self.b,'shared')['status'],'published');self.assertNotIn('colors',self.s.preview(self.b,sid));self.assertNotIn('mesh_colors',self.s.preview(self.b,sid));self.assertIn('colors',self.s.preview(self.a,sid));
        with self.assertRaises(CaptureError):self.s.reserve(self.b,'shared',LOC)
        with self.assertRaises(CaptureError):self.s.frame(self.a,sid,jpeg())
    def test_worker_recovery(self):
        sid=self.s.reserve(self.a,'private')['id'];fid=self.s.frame(self.a,sid,jpeg())['id'];self.s.claim();self.s.recover_worker();self.assertEqual(self.s.claim()[1]['id'],fid)
    def test_invalid_photo(self):
        sid=self.s.reserve(self.a,'private')['id'];
        with self.assertRaises(CaptureError):self.s.frame(self.a,sid,'data:image/jpeg;base64,abcd')

class CaptureHTTPTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.server=create_server(port=0,data_dir=self.tmp.name,token='private-key',guest_game=True,world_capture=True);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=f'http://127.0.0.1:{self.server.server_port}';self.a=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.b=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def req(self,opener,path,data=None,headers=None):
        return json.load(opener.open(urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json',**(headers or {})})))
    def test_isolated_homes_and_legacy(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/game')
        self.assertEqual(e.exception.code,401);a=self.req(self.a,'/api/session',{});b=self.req(self.b,'/api/session',{});self.assertNotEqual(a['home'],b['home']);self.assertEqual(self.req(self.a,'/api/session',{})['home'],a['home']);self.req(self.a,'/api/game',{'action':'hit','id':'crate'});self.assertEqual(self.req(self.a,'/api/game')['objects']['crate'],35);self.assertEqual(self.req(self.b,'/api/game')['objects']['crate'],60);self.assertEqual(GameStore(Path(self.tmp.name)).state()['objects']['crate'],60)
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/game',{'action':'unlock'})
        self.assertEqual(e.exception.code,409)
    def test_qr_and_consent(self):
        a=self.req(self.a,'/api/session',{});pair=self.req(self.a,'/api/capture',{'action':'pair','address':'https://example.invalid:8443','scope':'private'});self.assertTrue(pair['qr'].startswith('data:image/png;base64,'));from urllib.parse import urlsplit,parse_qs
        code=parse_qs(urlsplit(pair['url']).fragment)['pair'][0];b=self.req(self.b,'/api/session/pair',{'code':code});self.assertEqual(b['home'],a['home']);self.assertEqual(self.req(self.b,'/api/session',{})['home'],a['home'])
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.b,'/api/session/pair',{'code':code})
        self.assertEqual(e.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/capture',{'action':'reserve'})
        self.assertEqual(e.exception.code,400)
    def test_phone_pair_requires_reachable_https_address(self):
        self.req(self.a,'/api/session',{})
        for address in ('http://192.168.1.20:8765','https://localhost:8443','https://127.0.0.1:8443','https://0.0.0.0:8443','https://[::1]:8443','https://[::ffff:127.0.0.1]:8443','https://example.invalid:0','https://example.invalid:bad','https://user:secret@example.invalid','https://example.invalid?secret=1'):
            with self.subTest(address=address):
                with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/capture',{'action':'pair','address':address})
                self.assertEqual(e.exception.code,400)
        p=self.req(self.a,'/api/capture',{'action':'pair','address':'https://192.168.1.20:8443'})
        self.assertTrue(p['url'].startswith('https://192.168.1.20:8443/scanner.html#'))
    def test_mobile_device_helper_served(self):
        with self.a.open(self.base+'/device-access.js') as r:
            self.assertEqual(r.status,200);self.assertIn(b'export async function cameraStream',r.read())
    def test_http_scan_permissions_and_csrf(self):
        self.req(self.a,'/api/session',{});self.req(self.b,'/api/session',{});sid=self.req(self.a,'/api/capture',{'action':'reserve','consent':True})['id']
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.b,'/api/capture',{'action':'frame','id':sid,'photo':jpeg()})
        self.assertEqual(e.exception.code,404)
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/capture',{'action':'frame','id':sid,'photo':jpeg()},{'Origin':'https://foreign.invalid'})
        self.assertEqual(e.exception.code,403);self.assertFalse(self.req(self.a,'/api/capture',{'action':'frame','id':sid,'photo':jpeg()})['duplicate'])
        with self.assertRaises(urllib.error.HTTPError) as e:self.req(self.a,'/api/scans')
        self.assertEqual(e.exception.code,401)

    def test_private_frame_review_and_delete(self):
        self.req(self.a,'/api/session',{});self.req(self.b,'/api/session',{})
        sid=self.req(self.a,'/api/capture',{'action':'reserve','consent':True})['id']
        fid=self.req(self.a,'/api/capture',{'action':'frame','id':sid,'photo':jpeg()})['id']
        path='/api/capture/photo/'+sid+'/'+fid
        with self.a.open(self.base+path) as response:
            self.assertEqual(response.headers.get_content_type(),'image/jpeg');self.assertEqual(response.read()[:2],b'\xff\xd8')
        with self.assertRaises(urllib.error.HTTPError) as e:self.b.open(self.base+path)
        self.assertEqual(e.exception.code,404)
        self.assertTrue(self.req(self.a,'/api/capture',{'action':'remove_frame','id':sid,'frame':fid})['deleted'])
        with self.assertRaises(urllib.error.HTTPError) as e:self.a.open(self.base+path)
        self.assertEqual(e.exception.code,404)
