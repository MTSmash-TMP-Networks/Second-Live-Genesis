"""Synthetic geometric fixtures only; does not claim a real camera/model test."""
import unittest
from types import SimpleNamespace
import numpy as np
from da3_geometry import geometry,select_indices

class DA3GeometryTest(unittest.TestCase):
    def fixture(self):
        n,h,w=3,100,120
        depth=np.full((n,h,w),2.,dtype=np.float32)
        k=np.repeat(np.array([[[85.,0.,60.],[0.,85.,50.],[0.,0.,1.]]]),n,axis=0)
        e=np.repeat(np.eye(4)[None,:,:],n,axis=0);e[:,0,3]=[-.15,0.,.15]
        return SimpleNamespace(depth=depth,conf=np.full_like(depth,2.),intrinsics=k,extrinsics=e[:,:3,:],
            processed_images=np.full((n,h,w,3),128,dtype=np.uint8))
    def test_consistent_views_and_surfaces(self):
        p=self.fixture();ids=['a','b','c']
        live=geometry(p,ids,False,12)
        self.assertEqual(live['registered'],3);self.assertEqual(live['input_count'],12)
        self.assertGreater(len(live['points']),500);self.assertFalse(live['triangles'])
        final=geometry(p,ids,True,12)
        self.assertGreater(len(final['triangles']),100)
        self.assertEqual(len(final['vertices']),len(final['mesh_colors']))
        self.assertLess(max(max(t) for t in final['triangles']),len(final['vertices']))
    def test_disjoint_cameras_rejected(self):
        p=self.fixture();p.extrinsics[:,0,3]=[-100.,0.,100.]
        with self.assertRaises(ValueError):geometry(p,['a','b','c'])
    def test_invalid_predictions_rejected(self):
        p=self.fixture();p.depth[:]=np.nan
        with self.assertRaises(ValueError):geometry(p,['a','b','c'])
    def test_keyframes(self):
        ids=select_indices(60,8);self.assertEqual(len(ids),8);self.assertEqual((ids[0],ids[-1]),(0,59))
        self.assertEqual(select_indices(4,8),[0,1,2,3])
if __name__=='__main__':unittest.main()
