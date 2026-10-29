import base64, hashlib, json, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch, Mock
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.private=patch.object(server,'PRIVATE',Path(self.temp.name)); self.private.start()
        self.workers=patch.object(server,'workers',{}); self.workers.start()
    def tearDown(self):
        self.workers.stop(); self.private.stop(); self.temp.cleanup()
    def test_result_merge_preserves_submission(self):
        path=server.PRIVATE/'applications.json'
        server.write(path,[{'jobId':'one','status':'Opening browser','updated':'2026-01-01'}])
        result=server.PRIVATE/(hashlib.sha256(b'one').hexdigest()+'.json.result')
        server.write(result,{'status':'Needs your review','updated':'2026-02-01','filled':['Email']})
        self.assertEqual(server.applications()[0]['filled'],['Email'])
        apps=server.applications();apps[0]['status']='Submitted by user';server.write(path,apps)
        server.write(result,{'status':'Needs your review','updated':'2026-03-01'})
        self.assertEqual(server.applications()[0]['status'],'Submitted by user')
    def test_launch_retry_and_failure(self):
        job={'id':'one','url':'https://example.com/job','company':'Test','title':'Intern'}
        profile={'preferredStart':'2027-05-15'}
        with patch.object(server.subprocess,'Popen',side_effect=OSError('missing node')):
            self.assertEqual(server.launch(job,profile)['status'],'Autofill failed')
        with self.assertRaises(ValueError):server.launch(job,profile)
        with patch.object(server.subprocess,'Popen',return_value=Mock(poll=Mock(return_value=None))):
            self.assertTrue(server.launch(job,profile,True)['active'])
            with self.assertRaises(ValueError):server.launch(job,profile,True)
        self.assertEqual(len(server.read(server.PRIVATE/'applications.json',[])),1)
    def test_feed_and_failed_source_cache(self):
        source={'name':'Test','type':'greenhouse','board':'test'}
        payload={'jobs':[{'id':1,'title':'Software Engineering Intern','absolute_url':'https://example.com/job','content':'&lt;p&gt;Freshmen welcome&lt;/p&gt;','location':{'name':'Atlanta'}}]}
        import io
        with patch.object(server,'urlopen',return_value=io.BytesIO(json.dumps(payload).encode())):
            self.assertEqual(server.feed(source)[0]['description'],'Freshmen welcome')
        server.write(server.PRIVATE/'jobs.json',{'jobs':[{'id':'old','company':'Test','url':'https://example.com/job'}]})
        original=server.read
        with patch.object(server,'read',side_effect=lambda path,default: [source] if path.name=='sources.json' else original(path,default)),patch.object(server,'feed',side_effect=OSError('offline')):
            result=server.discover()
        self.assertTrue(result['jobs'][0]['stale'])
        self.assertEqual(result['coverage'][0]['status'],'offline')
    def test_ashby_and_lever_feeds(self):
        import io
        ashby={'jobs':[{'title':'Software Engineering Intern','location':'Atlanta','isListed':True,'applyUrl':'https://example.com/apply','descriptionPlain':'Freshmen welcome'}, {'title':'Software Intern','isListed':False}]}
        lever=[{'id':'one','text':'Embedded Software Internship','applyUrl':'https://example.com/lever','categories':{'location':'Atlanta'},'descriptionPlain':'Engineering students','lists':[]}]
        for kind,payload in [('ashby',ashby),('lever',lever)]:
            with patch.object(server,'urlopen',return_value=io.BytesIO(json.dumps(payload).encode())):
                jobs=server.feed({'name':'Test','type':kind,'board':'Test'})
                self.assertEqual(len(jobs),1)
                self.assertEqual(jobs[0]['location'],'Atlanta')
                self.assertTrue(jobs[0]['description'])

    def test_http_auth_private_files_and_upload(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        with patch.object(server,'PORT',http.server_port),patch.object(server,'ORIGIN',f'http://127.0.0.1:{http.server_port}'):
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=server.ORIGIN
            try:
                state=json.load(urlopen(base+'/api/state'));self.assertEqual(state['token'],server.TOKEN)
                for path in ['/private/applications.json','/.git/config']:
                    with self.assertRaises(HTTPError) as caught:urlopen(base+path)
                    self.assertEqual(caught.exception.code,404); caught.exception.close()
                with self.assertRaises(HTTPError) as caught:urlopen(Request(base+'/api/discover',data=b'{}'))
                self.assertEqual(caught.exception.code,403); caught.exception.close()
                data=json.dumps({'name':'resume.pdf','data':base64.b64encode(b'%PDF-test').decode()}).encode()
                request=Request(base+'/api/resume',data=data,headers={'Origin':base,'X-Local-Token':server.TOKEN})
                self.assertTrue(json.load(urlopen(request))['ok'])
                self.assertTrue(json.load(urlopen(base+'/api/state'))['resumeAvailable'])
                payload=json.dumps({'profile':{'customAnswers':{'Language skills':'English'}}}).encode()
                request=Request(base+'/api/profile',data=payload,headers={'Origin':base,'X-Local-Token':server.TOKEN})
                self.assertTrue(json.load(urlopen(request))['ok'])
                self.assertEqual(server.read(server.PRIVATE/'profile.json',{})['customAnswers']['Language skills'],'English')
            finally:http.shutdown();http.server_close()

if __name__=='__main__':unittest.main()
