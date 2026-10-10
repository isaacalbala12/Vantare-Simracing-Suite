import json
import unittest
import urllib.error
from roadmap_data_branch import publish


class DataBranchTests(unittest.TestCase):
    def test_first_publication_creates_only_orphan_data_ref(self):
        calls = []
        def api(method, path, body=None):
            calls.append((method,path,body))
            if method == 'GET': raise urllib.error.HTTPError('fixture',404,'missing',{},None)
            return {'sha':'abc'}
        publish(api, {'id':'fixture','document':{'items':[]}})
        self.assertEqual(calls[-1][2], {'ref':'refs/heads/roadmap-data','sha':'abc'})
        self.assertEqual(calls[-2][2]['parents'], [])
        self.assertEqual(calls[-3][2]['tree'][0]['path'], 'roadmap.json')
        self.assertNotIn('nightly',json.dumps(calls))

    def test_update_is_non_force_and_conflict_is_not_retried(self):
        calls=[]
        def api(method,path,body=None):
            calls.append((method,path,body))
            if path.startswith('git/ref/'): return {'object':{'sha':'previous'}}
            if path.startswith('git/commits/'): return {'tree':{'sha':'tree'}}
            if path.startswith('git/trees/'): return {'tree':[]}
            if method == 'PATCH': raise urllib.error.HTTPError('fixture',422,'conflict',{},None)
            return {'sha':'next'}
        with self.assertRaises(urllib.error.HTTPError): publish(api, {'document':{}})
        self.assertEqual(calls[-1], ('PATCH','git/refs/heads/roadmap-data',{'sha':'next','force':False}))
        self.assertEqual(sum(method == 'PATCH' for method,_,_ in calls),1)

    def test_existing_source_tree_is_rejected_before_writes(self):
        calls=[]
        def api(method,path,body=None):
            calls.append(method)
            if path.startswith('git/ref/'): return {'object':{'sha':'previous'}}
            if path.startswith('git/commits/'): return {'tree':{'sha':'tree'}}
            return {'tree':[{'path':'AGENTS.md','type':'blob'}]}
        with self.assertRaises(ValueError): publish(api, {'document':{}})
        self.assertTrue(all(method=='GET' for method in calls))

if __name__=='__main__': unittest.main()
