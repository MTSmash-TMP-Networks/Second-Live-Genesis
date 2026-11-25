"""Synthetic projection and persistence regression tests; no camera/hardware required."""
import base64, io, tempfile, unittest
from PIL import Image, ImageDraw
from world_capture import CaptureStore, CaptureError
from panorama_capture import PanoramaStore, project_panorama, TARGETS

def sample_photo(i):
    im=Image.new('RGB',(270,480),(30+i*6,100,145))
    ImageDraw.Draw(im).text((20,20),str(i),fill='white')
    b=io.BytesIO();im.save(b,'JPEG')
    return b.getvalue()

def uri(i):return 'data:image/jpeg;base64,'+base64.b64encode(sample_photo(i)).decode()

class PanoramaTest(unittest.TestCase):
    def test_projection(self):
        rows=[dict(jpeg=sample_photo(i),yaw=y,pitch=p,roll=0) for i,(y,p) in enumerate(TARGETS[:12])]
        jpg,horizontal,sphere=project_panorama(rows,75,384)
        self.assertEqual(Image.open(io.BytesIO(jpg)).size,(384,192))
        self.assertGreater(horizontal,98)
        self.assertLess(sphere,80)
        full=rows+[dict(jpeg=sample_photo(i),yaw=y,pitch=p,roll=0) for i,(y,p) in enumerate(TARGETS[12:],12)]
        _,h2,s2=project_panorama(full,75,384)
        self.assertGreater(h2,98);self.assertGreater(s2,sphere)
        self.assertGreater(s2,90)
    def test_private_station_lifecycle(self):
        with tempfile.TemporaryDirectory() as tmp:
            capture=CaptureStore(tmp);p=PanoramaStore(capture);a,_=capture.session();b,_=capture.session()
            with self.assertRaises(CaptureError):p.create(a)
            sid=p.create(a,consent=True)['id']
            with self.assertRaises(CaptureError):p.frame(b,sid,0,uri(0))
            with self.assertRaises(CaptureError):p.create(a,consent=True)
            with self.assertRaises(CaptureError):p.build(a,sid)
            with self.assertRaises(CaptureError):p.frame(a,sid,0,uri(0),yaw=90,pitch=0,source='sensor')
            for i in range(12):p.frame(a,sid,i,uri(i))
            self.assertEqual(len(p.status(a)['stations'][0]['frames']),12)
            self.assertEqual(p.status(b)['stations'],[])
            with self.assertRaises(CaptureError):p.image(b,sid,0)
            result=p.build(a,sid)
            self.assertTrue(result['stations'][0]['preview'])
            self.assertGreater(result['stations'][0]['horizontal'],98)
            self.assertTrue(p.image(a,sid)['image'].startswith('data:image/jpeg;base64,'))
            self.assertTrue(PanoramaStore(CaptureStore(tmp)).status(a)['stations'][0]['preview'])
            sid2=p.create(a,distance=1,bearing=90,consent=True)['id']
            self.assertAlmostEqual(p.status(a)['stations'][1]['x'],1)
            self.assertAlmostEqual(p.status(a)['stations'][1]['z'],0)
            p.frame(a,sid,0,uri(20))
            self.assertFalse(p.status(a)['stations'][0]['preview'])
            with self.assertRaises(CaptureError):p.image(a,sid)
            p.remove(a,sid,0);p.delete(a,sid2);p.delete(a,sid)
            self.assertEqual(p.status(a)['stations'],[])
            self.assertEqual(capture.status(a)['status'],'unexplored')

if __name__=='__main__':unittest.main()
