"""Local-only job discovery and browser worker service. No submission endpoint."""
import ssl, sys, base64, concurrent.futures, hashlib, html, json, os, re, secrets, subprocess, threading, time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
PRIVATE=ROOT/'private'
PRIVATE.mkdir(exist_ok=True, mode=0o700)
TOKEN=secrets.token_urlsafe(32)
PORT=int(os.environ.get('PORT','8765'))
ORIGIN=f'http://127.0.0.1:{PORT}'
lock=threading.Lock()
RESUME=PRIVATE/'resume.pdf'
workers={}
TLS=ssl.create_default_context()
# python.org macOS installs may lack their own CA bundle; use the OS bundle.
if sys.platform=='darwin' and Path('/etc/ssl/cert.pem').is_file():
    TLS.load_verify_locations('/etc/ssl/cert.pem')
discovery_lock=threading.Lock()
def read(path, default):
    try: return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError): return default

def write(path, obj):
    temp=path.with_suffix('.tmp'); temp.write_text(json.dumps(obj,indent=2)); temp.replace(path)

def plain(s): return re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', html.unescape(s or ''))).strip()

def feed(source):
    board=source['board']; kind=source['type']
    if kind not in ('greenhouse','lever','ashby','remotive','jobicy'): raise ValueError('Unsupported source type')
    if kind!='remotive' and not re.fullmatch(r'[a-zA-Z0-9_-]+', board): raise ValueError('Invalid board slug')
    cache=PRIVATE/'jobicy-feed.json'
    if kind=='jobicy':
        cached=read(cache,{})
        if cached.get('jobs') and time.time()-cached.get('fetchedAt',0)<3600: return cached['jobs']
        url='https://jobicy.com/api/jobs?count=200&geo=usa&industry=engineering'
    else:
        url={'greenhouse':f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true','lever':f'https://api.lever.co/v0/postings/{board}?mode=json','ashby':f'https://api.ashbyhq.com/posting-api/job-board/{board}','remotive':'https://remotive.com/api/remote-jobs?search=intern'}[kind]
    with urlopen(Request(url,headers={'User-Agent':'InternshipAssistant/1.0'}),timeout=25,context=TLS) as r: payload=json.load(r)
    rows=payload['jobs'] if kind in ('greenhouse','ashby','remotive','jobicy') else payload
    result=[]
    for row in rows:
        if kind=='ashby' and not row.get('isListed',False): continue
        title=row.get('jobTitle',row.get('title',row.get('text','')))
        if not re.search(r'\bintern(?:ship)?s?\b|co[- ]?op',title,re.I): continue
        if not re.search(r'software|embedded|firmware|hardware|fpga|robot|electrical|computer|digital|silicon|verification|controls|engineering',title,re.I): continue
        description=plain(row.get('jobDescription','')) if kind=='jobicy' else plain(row.get('description','')) if kind=='remotive' else plain(row.get('content','')) if kind=='greenhouse' else plain(row.get('descriptionPlain','')+' '+row.get('additionalPlain','')+' '+' '.join(x.get('text','')+' '+x.get('content','') for x in row.get('lists',[])))
        if kind=='ashby': description=plain(row.get('descriptionPlain') or row.get('descriptionHtml',''))
        url=row.get('absolute_url') or row.get('applyUrl') or row.get('hostedUrl') or row.get('jobUrl') or row.get('url')
        company=row.get('companyName',row.get('company_name',source['name'])) if kind in ('remotive','jobicy') else source['name']
        location=row.get('jobGeo','Remote') if kind=='jobicy' else row.get('candidate_required_location',row.get('location','')) if kind=='remotive' else row.get('location','') if kind=='ashby' else (row.get('location',{}).get('name','') if kind=='greenhouse' else row.get('categories',{}).get('location',''))
        result.append({'id':f'{kind}:{board}:{row.get("id") or hashlib.sha256(url.encode()).hexdigest()}','company':company,'title':title,'url':url,'location':location,'description':description,'source':kind,'board':board,'sourceName':source['name'],'publicationDate':row.get('pubDate',row.get('publication_date','')),'checkedAt':datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')})
    if kind=='jobicy': write(cache,{'fetchedAt':time.time(),'jobs':result})
    return result

def discover():
    with discovery_lock:
        return discover_locked()
def discover_locked():
    sources=read(ROOT/'sources.json',[]); jobs=[]; coverage=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures={pool.submit(feed,s):s for s in sources}
        for f in concurrent.futures.as_completed(futures):
            s=futures[f]
            try:
                found=f.result(); jobs+=found; coverage.append({'name':s['name'],'count':len(found),'status':'ok'})
            except Exception as e: coverage.append({'name':s['name'],'count':0,'status':str(e)})
    jobs+=read(PRIVATE/'manual.json',[])
    result={'jobs':list({j['url']:j for j in jobs}.values()),'coverage':coverage,'updatedAt':datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')}
    # Preserve cached postings for failed sources, with an explicit stale flag.
    failed={s['name'] for s in coverage if s['status']!='ok'}
    for j in read(PRIVATE/'jobs.json',{}).get('jobs',[]):
        if j['company'] in failed: result['jobs'].append(dict(j,stale=True))
    write(PRIVATE/'jobs.json',result); return result

def applications():
    with lock:
        apps=read(PRIVATE/'applications.json',[])
        changed=False
        for app in apps:
            path=PRIVATE/(hashlib.sha256(app['jobId'].encode()).hexdigest()+'.json.result')
            result=read(path,{})
            if result.get('updated','') > app.get('updated','') and app['status'] not in ('Submitted by user','Withdrawn'):
                app.update(result); changed=True
            worker=workers.get(app['jobId'])
            active=worker is not None and worker.poll() is None
            if app.get('active') != active:
                app['active']=active; changed=True
            if not active and app['status']=='Opening browser':
                app.update(status='Autofill failed',message='Worker stopped. Check setup and retry.'); changed=True
        if changed: write(PRIVATE/'applications.json',apps)
        return apps

def launch(job, profile, retry=False):
    if not isinstance(profile,dict): raise ValueError('Save your profile first')
    if not re.fullmatch(r'\d{4}-05-15',profile.get('preferredStart','')): raise ValueError('Choose your May 15 start date in Your profile')
    if urlparse(job['url']).scheme not in ('http','https'): raise ValueError('Invalid posting URL')
    with lock:
        apps=read(PRIVATE/'applications.json',[])
        app=next((a for a in apps if a['jobId']==job['id']),None)
        if app and not retry: raise ValueError('Application already tracked. Use Resume autofill in Applications.')
        if app and app['status']=='Submitted by user': raise ValueError('Already marked submitted')
        worker=workers.get(job['id'])
        if worker and worker.poll() is None: raise ValueError('The application browser is already open')
        if not app:
            app={'jobId':job['id'],'company':job['company'],'title':job['title'],'url':job['url']}; apps.append(app)
        app.update(status='Opening browser',updated=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),filled=[],unresolved=[],message='')
        path=PRIVATE/(hashlib.sha256(job['id'].encode()).hexdigest()+'.json')
        result_path=Path(str(path)+'.result')
        result_path.unlink(missing_ok=True)
        resume=read(PRIVATE/'settings.json',{}).get('resume',str(RESUME))
        write(PRIVATE/'profile.json',profile)
        write(path,{'job':job,'profile':profile,'resume':resume})
        try:
            with open(PRIVATE/'worker.log','a') as log:
                workers[job['id']]=subprocess.Popen(['node',str(ROOT/'autofill.mjs'),str(path)],cwd=ROOT,stdout=log,stderr=log)
            app['active']=True
        except Exception as e:
            app.update(status='Autofill failed',message=str(e),active=False)
        write(PRIVATE/'applications.json',apps)
        return app

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
    def reply(self,obj,status=200):
        body=json.dumps(obj).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{PORT}',f'localhost:{PORT}')
    def do_HEAD(self):
        # Do not expose the static handler's unrestricted filesystem mapping.
        self.send_response(405); self.end_headers()
    def do_GET(self):
        if not self.valid_host(): return self.reply({'error':'Invalid host'},403)
        path=urlparse(self.path).path
        if path=='/api/state': return self.reply({'token':TOKEN,'catalog':read(PRIVATE/'jobs.json',{'jobs':[],'coverage':[]}), 'applications':applications(),'resumeAvailable':Path(read(PRIVATE/'settings.json',{}).get('resume',str(RESUME))).is_file()})
        if path=='/api/results': return self.reply(applications())
        if path not in ['/', '/index.html','/app.js','/styles.css','/matching.mjs','/answer-bank.mjs']: return self.reply({'error':'Not found'},404)
        self.directory=str(ROOT); super().do_GET()
    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in (ORIGIN,f'http://localhost:{PORT}') or self.headers.get('X-Local-Token')!=TOKEN: return self.reply({'error':'Local authorization required'},403)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>15000000: raise ValueError('Request too large (maximum resume size 10 MB)')
            body=json.loads(self.rfile.read(n) or '{}')
            if self.path=='/api/profile':
                profile=body.get('profile')
                if not isinstance(profile,dict) or not isinstance(profile.get('customAnswers',{}),dict): raise ValueError('Invalid profile')
                with lock: write(PRIVATE/'profile.json',profile)
                return self.reply({'ok':True})
            if self.path=='/api/discover': return self.reply(discover())
            if self.path=='/api/manual':
                url=body.get('url','').strip()
                if urlparse(url).scheme not in ('https','http') or not urlparse(url).hostname: raise ValueError('Enter a valid company posting URL')
                if not body.get('title','').strip() or not body.get('company','').strip(): raise ValueError('Title and company are required')
                job={key:str(body.get(key,''))[:50000] for key in ('title','company','description','location')}
                job.update(id='manual:'+hashlib.sha256(url.encode()).hexdigest(),url=url,source='manual',checkedAt='Added by you; verify on company site')
                with discovery_lock:
                    manual=read(PRIVATE/'manual.json',[])
                    manual=[j for j in manual if j['url']!=url]+[job]; write(PRIVATE/'manual.json',manual)
                    catalog=read(PRIVATE/'jobs.json',{'jobs':[],'coverage':[]})
                    catalog['jobs']=[j for j in catalog['jobs'] if j['url']!=url]+[job]; write(PRIVATE/'jobs.json',catalog)
                return self.reply(catalog)
            if self.path=='/api/resume':
                suffix=Path(body.get('name','')).suffix.lower()
                if suffix not in ('.pdf','.docx'): raise ValueError('Choose a PDF or DOCX resume')
                data=base64.b64decode(body['data'],validate=True)
                if not data or len(data)>10000000: raise ValueError('Resume must be between 1 byte and 10 MB')
                path=PRIVATE/('resume'+suffix); path.write_bytes(data)
                write(PRIVATE/'settings.json',{'resume':str(path)})
                return self.reply({'ok':True})
            if self.path in ('/api/apply','/api/resume-autofill'):
                catalog=read(PRIVATE/'jobs.json',{}).get('jobs',[])
                job=next((j for j in catalog if j['id']==body.get('jobId')),None)
                if not job: raise ValueError('Refresh discovery and choose a current posting')
                if job.get('stale'): raise ValueError('Source unavailable; refresh before applying')
                return self.reply(launch(job,body.get('profile'),self.path=='/api/resume-autofill'))
            if self.path=='/api/status':
                allowed=['Submitted by user','Withdrawn','Needs attention']
                if body.get('status') not in allowed: raise ValueError('Invalid status')
                with lock:
                    apps=read(PRIVATE/'applications.json',[])
                    app=next((a for a in apps if a['jobId']==body.get('jobId')),None)
                    if not app: raise ValueError('Application not found')
                    app.update(status=body['status'],updated=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))
                    write(PRIVATE/'applications.json',apps)
                return self.reply(apps)
            return self.reply({'error':'Not found'},404)
        except Exception as e: self.reply({'error':str(e)},400)

if __name__=='__main__':
    print(f'Open {ORIGIN}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
