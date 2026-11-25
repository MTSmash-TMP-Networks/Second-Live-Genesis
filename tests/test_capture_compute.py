import json, tempfile, unittest
from pathlib import Path
import numpy as np
import cv2
from capture_compute import fit_inverse_depth, depth_mesh, build_preview, read_model, Inference
class ComputeTest(unittest.TestCase):
    def test_fit(self):
        x=np.linspace(.1,2,60);z=1/(.5*x+.3);z[3]=20;fit=fit_inverse_depth(x,z);self.assertIsNotNone(fit);np.testing.assert_allclose(fit,[.5,.3],atol=.02);self.assertIsNone(fit_inverse_depth(np.ones(30),np.ones(30)));self.assertIsNone(fit_inverse_depth(x,1/(3-x)))
    def test_mesh_projection_and_faces(self):
        h,w=96,128;image=np.full((h,w,3),120,np.uint8);yy,xx=np.mgrid[:h,:w];d=(.3+xx/w+.12*yy/h).astype(np.float32);z=1/(.5*d+.2);fx=fy=110.;cx=w/2;cy=h/2;points={};obs=[]
        for i,(y,x) in enumerate((y,x) for y in range(8,h-8,9) for x in range(8,w-8,9)):
            points[i]=(np.array([(x-cx)*z[y,x]/fx,(y-cy)*z[y,x]/fy,z[y,x]]),[120,120,120]);obs.append((x,y,i))
        v={'camera':(w,h,fx,fy,cx,cy),'R':np.eye(3),'t':np.zeros(3),'obs':obs};center=np.array([0.,0.,2.]);verts,colors,faces=depth_mesh(v,points,image,d,center,.5,grid=24);self.assertGreater(len(verts),300);self.assertGreater(len(faces),100);self.assertEqual(len(colors),len(verts));self.assertLess(max(max(t) for t in faces),len(verts))
    def test_colmap_parser(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'cameras.txt').write_text('# Camera\n1 SIMPLE_PINHOLE 640 480 500 320 240\n');(p/'images.txt').write_text('# Images\n1 1 0 0 0 0 0 0 1 a.jpg\n100 100 1 150 120 -1\n2 1 0 0 0 1 0 0 1 b.jpg\n200 100 1\n');(p/'points3D.txt').write_text('# Points\n1 0 0 3 255 120 50 0.2 1 0 2 0\n2 0 1 2 0 0 0 8 1 0 2 0\n');points,views=read_model(p);self.assertEqual(len(points),1);self.assertEqual(len(views),2);self.assertEqual(views[0]['obs'],[(100.,100.,1)]);np.testing.assert_allclose(views[0]['R'],np.eye(3))
    def test_actual_image_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'im.jpg';img=np.indices((240,320)).sum(0)%2*255;cv2.imwrite(str(p),img.astype(np.uint8));r=Inference(tmp).analyze(p);self.assertGreater(r['sharpness'],100);self.assertEqual(r['semantic'],'disabled')
    def test_preview_no_fake_depth(self):
        class Missing:
            def depth(self,*args):raise RuntimeError('offline')
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);cv2.imwrite(str(p/'a.jpg'),np.full((220,220,3),100,np.uint8));points={i:(np.array([np.sin(i),np.cos(i),i/200]),[10,20,30]) for i in range(150)};v={'name':'a.jpg','obs':[]};r=build_preview(points,[v],p,Missing());self.assertEqual(len(r['points']),150);self.assertEqual(r['depth_views'],0);self.assertEqual(r['triangles'],[]);self.assertTrue(r['warnings'])
