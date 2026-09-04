import pathlib,json,csv,collections,statistics,re,subprocess,hashlib,sys
p=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
def csvwrite(name,rows):
 if rows:
  with (out/name).open('w') as f:
   w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
prs=json.loads((p/'topology-primary.json').read_text());checks=json.loads((p/'pr-checks.json').read_text());heads={x['headRefName']:x['number'] for x in prs};rows=[]
for x in prs:
 d=checks.get('p'+str(x['number']),{});ctx=d.get('commits',{}).get('nodes',[{}])[-1].get('commit',{}).get('statusCheckRollup') or {};tests=ctx.get('contexts',{}).get('nodes',[])
 n=x['number'];parent=heads.get(x['baseRefName']);
 if n>=970:parent=n-1
 children=[r['number'] for r in prs if r['baseRefName']==x['headRefName']]+([n+1] if 969<=n<977 else [])
 x.update({'parent':parent,'children':children,'checks':tests,'reviews':d.get('reviews'), 'additions':d.get('additions'),'deletions':d.get('deletions'),'issueRefs':d.get('closingIssuesReferences',{}).get('nodes',[])})
 status='INCLUDED_CANDIDATE' if x['ancestorCandidate'] else 'INDEPENDENT_PENDING'
 if x['ancestorNightly']:status='ABSORBED_ANCESTRY'
 if n==792:status='SUPERSEDED_BY_795_TITLE'
 minus=sum(a.startswith('-') for a in x['cherryNightly']);plus=sum(a.startswith('+') for a in x['cherryNightly'])
 if minus and not plus:status='PATCH_EQUIVALENT_NIGHTLY'
 rows.append(dict(number=n,title=x['title'],base=x['baseRefName'],head=x['headRefName'],baseSHA=x['baseRefOid'],headSHA=x['headRefOid'],mergeBase=x['mergeBaseNightly'],draft=x['isDraft'],mergeability=x['mergeable'],mergeState=x['mergeStateStatus'],checks=json.dumps(tests),reviews=json.dumps(d.get('reviews')),commitsAhead=x['aheadBehindNightly'].split()[-1],files=len(x['changedFilesNightly']),additions=d.get('additions'),deletions=d.get('deletions'),updated=x['updatedAt'],issue=re.search(r'isa-(\d+)',x['headRefName']).group(1) if re.search(r'isa-(\d+)',x['headRefName']) else 'UNKNOWN',parent=parent,children=json.dumps(children),stacked=bool(parent),patchAbsorbed=minus,patchUnmatched=plus,status=status,superseded='795' if n==792 else 'UNKNOWN',dependencies='parent + contracts/reviews; no integration authorization'))
csvwrite('pr-topology.csv',rows);(out/'pr-primary.json').write_text(json.dumps(prs,indent=2))
base='659b2c57dc2c7fc75962cc3c8e425ed1289266ec';tip='813b96c43028353a599903fb035268c354b58896'
(out/'snapshots.json').write_text(json.dumps({'blindFreezeCommit':'96539f54', 'firstLoggedCommandUTC':'2026-09-04T22:02:35.540528+00:00', 'inventoryExactStartUTC':'UNKNOWN','BASE_NIGHTLY':{'sha':base},'NEXT_CANDIDATE':{'sha':tip,'base':base,'includedPRs':[x['number'] for x in prs if x['ancestorCandidate'] and not x['ancestorNightly']],'reason':'git ancestry chain 123 commits; candidate head checks success; no merged claim; Core excluded'},'INDEPENDENT_PENDING':[{'number':r['number'],'sha':r['headSHA'],'status':r['status']} for r in rows if r['status']!='INCLUDED_CANDIDATE'],'countOpenPRsAtInventory':len(prs)},indent=2))
bundle=[];attribution={}
for jf in (p/'bundle').glob('*-minified.json'):
 if jf.name.startswith('candidate-repeat'): continue
 d=json.loads(jf.read_text());chunks=d['chunks'];manifest=d['manifest']
 def manifest_closure(m, seeds):
  seen=set(); todo=[x for x in seeds if x in m]
  while todo:
   key=todo.pop()
   if key in seen:continue
   seen.add(key);todo.extend(m[key].get('imports',[]))
  return {m[key]['file'] for key in seen if m[key]['file'].endswith('.js')}
 for entry,ends in [('Hub',['index.html','src/AppShell.tsx']),('Overlay Desktop',['overlay.html','src/overlay/CompositeApp.tsx']),('OBS',['overlay.html','src/overlay/ObsOverlayApp.tsx']),('Studio (Hub route)',['index.html','src/AppShell.tsx','src/hub/overlay-studio/StudioRoute.tsx'])]:
  seeds=ends+(['src/i18n/locales/es.ts'] if d['label']=='locale-active' else [])+(['src/overlay/track-geometry/track-geometry-pack.ts'] if d['label']=='geometry-defer' else [])
  cs=manifest_closure(manifest,seeds);mods={m for n in cs for m in chunks[n]['modules']};css={c for m in manifest.values() if m['file'] in cs for c in m.get('css',[])}
  groups={name:sum((v.get('renderedLength') or 0) for n in cs for m,v in chunks[n]['modules'].items() if needle in m) for name,needle in [('i18n','/src/i18n/'),('geometry','/track-geometry/track-geometry-pack'),('motion','node_modules/motion'),('motionDom','node_modules/motion-dom'),('supabase','node_modules/@supabase/'),('strategy','/hub/strategy'),('editor','/overlay/edit/')]}
  item=dict(snapshot=d['label'],entry=entry,classification='MEASURED-MAC-CANONICAL',minified=sum(chunks[n]['bytes'] for n in cs),gzip=sum(chunks[n]['gzip'] for n in cs),brotli=sum(chunks[n]['brotli'] for n in cs),chunks=len(cs),modules=len(mods),cssBytes=sum(d['assets'].get(n,{}).get('bytes',0) for n in css),sourceMaps='disabled',scope='entry + selected runtime and synchronous dependencies; ES active for locale experiment')
  rawfile=p/'bundle'/f'{d["label"]}-raw.json';item['raw']='not measured for experiment'
  if rawfile.exists():
   raw=json.loads(rawfile.read_text());rawcs=manifest_closure(raw['manifest'],ends)
   item['raw']=sum(raw['chunks'][n]['bytes'] for n in rawcs)
  bundle.append(item);attribution[d['label']+' / '+entry]={'chunks':sorted(cs),'modules':sorted(mods),'css':sorted(css),'renderedPreMinificationAttribution':groups}
  if d['label']=='candidate': print(entry,item['minified'],item['gzip'],item['cssBytes'],groups)
csvwrite('bundle-baseline.csv',bundle);(out/'bundle-attribution.json').write_text(json.dumps(attribution,indent=2))
bench=[]
for log in ['candidate-go-bench','candidate-transport-bench','storage-bench']:
 for line in (p/(log+'.log')).read_text().splitlines():
  if not line.startswith('Benchmark'):continue
  bits=line.split();metrics=dict(zip(bits[3::2],bits[2::2]));bench.append(dict(snapshot='NEXT_CANDIDATE',classification='MEASURED-MAC-RELATIVE',benchmark=bits[0],iterations=bits[1],ns=metrics.get('ns/op'),B=metrics.get('B/op'),allocs=metrics.get('allocs/op'),payloadBytes=metrics.get('v2_bytes'),source=log+'.log'))
csvwrite('go-benchmarks.csv',bench)
react=[]
for label in ['base','cache']:
 d=json.loads((p/'runtime'/f'{label}-react.json').read_text())
 for i,r in enumerate(d['runs']):
  for comp in ['track-map','pedals','standings']:
   times=[c['duration'] for c in r['commits'] if c['id']==comp];react.append(dict(snapshot='NEXT_CANDIDATE',variant=label,classification='MEASURED-MAC-AUXILIARY',run=i+1,component=comp,seconds=r['seconds'],commits=len(times),commitsPerSecond=len(times)/r['seconds'],meanMs=statistics.mean(times),p95Ms=sorted(times)[int((len(times)-1)*.95)],domMutationsWholeFixture=r['mutations'],listenersAfter50=d['after50']['jsEventListeners'],subscriptionsAfter50=d['cycles50']['subscriptions']))
csvwrite('react-profile.csv',react)
print('PR status counts',collections.Counter(x['status'] for x in rows))
