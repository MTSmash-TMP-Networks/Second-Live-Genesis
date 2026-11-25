"""Live SfM queue/authorization and measured point serialization; no real camera fixture."""
import base64, io, tempfile, unittest, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
from world_capture import CaptureStore, CaptureError
from capture_compute import build_live_preview
from server import SAFE_FILES

def jpeg(n):
    im=Image.new('RGB',(220,180),(40+n*10,100,120))
    ImageDraw.Draw(im).text((10,20),str(n),fill='white')
    b=io.BytesIO();im.save(b,'JPEG')
    return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()

class LiveCaptureTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=CaptureStore(self.tmp.name)
        self.a,_=self.s.session();self.b,_=self.s.session()
        self.sid=self.s.reserve(self.a,'private')['id']
    def tearDown(self):self.tmp.cleanup()
    def add(self,n,start=0):
        return [self.s.frame(self.a,self.sid,jpeg(i))['id'] for i in range(start,start+n)]
    def fixture(self,job):
        ids=job['frames']
        points={i:(np.array([np.sin(i),np.cos(i),i/200.]),[10,20,30]) for i in range(160)}
        views=[{'name':f'{i:04d}_{fid}.jpg','R':np.eye(3),'t':np.array([i*.2,0.,0.])} for i,fid in enumerate(ids[:3])]
        return build_live_preview(points,views,ids)
    def test_live_after_four_and_private(self):
        self.add(3);self.assertIsNone(self.s.claim_live());self.add(1,3)
        job=self.s.claim_live();self.assertEqual(len(job['frames']),4);self.assertTrue(self.s.live_allowed(job))
        dest=self.s.files/'snapshot';dest.mkdir();self.assertTrue(self.s.snapshot_live(job,dest));self.assertEqual(len(list(dest.glob('*.jpg'))),4)
        self.assertEqual(self.s.status(self.a)['live']['state'],'running')
        result=self.fixture(job);self.assertTrue(self.s.finish_live(job,result,'ok'))
        meta=self.s.status(self.a)['live'];self.assertEqual(meta['registered'],3);self.assertEqual(meta['source_count'],4)
        self.assertEqual(len(meta['registered_ids']),3);self.assertEqual(self.s.live_preview(self.a,self.sid)['revision'],meta['revision'])
        with self.assertRaises(CaptureError):self.s.live_preview(self.b,self.sid)
        self.assertIsNone(self.s.claim_live())
        self.add(3,4);next_job=self.s.claim_live();self.assertEqual(len(next_job['frames']),7)
        self.s.finish_live(next_job,message='overlap insufficient')
        self.assertEqual(self.s.status(self.a)['live']['state'],'insufficient')
        self.assertEqual(self.s.live_preview(self.a,self.sid)['revision'],meta['revision'])
    def test_switch_to_da3_rechecks_existing_frames_and_allows_early_submit(self):
        self.add(4)
        old=self.s.claim_live();self.s.finish_live(old,message='not connected')
        self.assertIsNone(self.s.claim_live())
        job=self.s.claim_live('da3');self.assertEqual(job['frames'],old['frames'])
        data=self.fixture(job);data['kind']='da3_multiview';data['input_count']=4
        self.assertTrue(self.s.finish_live(job,data,'DA3 ready'))
        self.assertIsNone(self.s.claim_live('da3'))
        self.assertEqual(self.s.status(self.a)['live']['kind'],'da3_multiview')
        self.s.heartbeat('cpu',{'status':'ready','device':'cpu'})
        self.assertEqual(self.s.status(self.a)['worker']['da3']['status'],'ready')
        self.assertEqual(self.s.transition(self.a,self.sid,'submit')['status'],'queued')
    def test_removal_cancel_and_final_priority(self):
        ids=self.add(8);job=self.s.claim_live();self.s.remove_frame(self.a,self.sid,ids[0])
        self.assertFalse(self.s.live_allowed(job));self.assertFalse(self.s.finish_live(job,self.fixture(job)))
        with self.assertRaises(CaptureError):self.s.live_preview(self.a,self.sid)
        self.add(1,8);next_job=self.s.claim_live();self.s.transition(self.a,self.sid,'submit')
        self.assertFalse(self.s.live_allowed(next_job));self.assertFalse(self.s.finish_live(next_job,self.fixture(next_job)))
        self.assertIsNone(self.s.claim_live())
        self.s.transition(self.a,self.sid,'cancel')
        self.assertFalse((self.s.files/self.sid).exists())
    def test_shared_reservation_does_not_expose_live(self):
        loc={'lat':51.0,'lon':9.0,'accuracy':10}
        self.s.locate(self.a,loc);self.s.locate(self.b,loc)
        self.sid=self.s.reserve(self.a,'shared',loc)['id'];self.add(4)
        job=self.s.claim_live();self.s.finish_live(job,self.fixture(job),'ok')
        self.assertNotIn('live',self.s.status(self.b,'shared'))
        with self.assertRaises(CaptureError):self.s.live_preview(self.b,self.sid)
    def test_recover_and_no_fake_geometry(self):
        self.add(4);job=self.s.claim_live();self.s.recover_worker();next_job=self.s.claim_live()
        self.assertNotEqual(job['token'],next_job['token']);self.assertFalse(self.s.live_allowed(job))
        with self.assertRaises(ValueError):build_live_preview({},[],next_job['frames'])
        result=self.fixture(next_job);self.assertEqual(result['kind'],'live_sfm');self.assertEqual(result['triangles'],[])
        self.assertEqual(len(result['points']),160);self.assertEqual(len(result['camera_positions']),3)
        self.assertEqual(SAFE_FILES['/capture-flow.js'],'capture-flow.js')

if __name__=='__main__':unittest.main()
