import json, time, threading, sqlite3, urllib.request, urllib.parse, subprocess, re
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
BASE=Path(__file__).parent
DB=BASE/'history.sqlite3'
lock=threading.Lock()
cache={}
activity_clocks={}
last_activity_data=None
def effective_activity(data, listed_teams):
    global last_activity_data
    if listed_teams is None: return None
    with lock:
        if data is not last_activity_data:
            listed=set(listed_teams)
            for row in data['data']:
                team=str(row['team_number'])
                elapsed=row.get('play_time')
                previous=activity_clocks.get(team)
                unchanged=(previous[1]+1 if team in listed and re.fullmatch(r'\d+:\d{2}:\d{2}',str(elapsed)) and previous and previous[0]==elapsed else 0)
                activity_clocks[team]=(elapsed,unchanged)
            last_activity_data=data
        return [team for team in listed_teams if activity_clocks.get(team,(None,0))[1]<3]
def remote(path, ttl=60):
    now=time.time()
    with lock:
        if path in cache and now-cache[path][0]<ttl: return cache[path][1]
    result=subprocess.run(['/usr/bin/curl','--fail','--silent','--show-error','--header','Cache-Control: no-cache','--max-time','20','https://scoreboard.uscyberpatriot.org'+path],capture_output=True,check=True)
    data=json.loads(result.stdout)
    with lock: cache[path]=(now,data)
    return data
def total_vulns(images):
    def total(field):
        values=[image.get(field) for image in images]
        try:
            if any(value is None or value=='' or value=='null' for value in values): return None
            return sum(int(value) for value in values)
        except (TypeError,ValueError): return None
    return {'found':total('found'),'remaining':total('remaining')}
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS samples (team TEXT, stamp INTEGER, score REAL, PRIMARY KEY(team,stamp))')
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(BASE/'public'),**kw)
    def do_GET(self):
        url=urllib.parse.urlparse(self.path)
        if not url.path.startswith('/api/'): return super().do_GET()
        try:
            params=urllib.parse.parse_qs(url.query)
            ttl=max(15,min(3600,int(params.get('interval',['60'])[0])))
            if url.path=='/api/scores':
                data=remote('/api/team/scores.php',0 if params.get('fresh')==['1'] else ttl)
                try:
                    active=remote('/api/team/scores.php?recent=5',0 if params.get('fresh')==['1'] else ttl)
                    active_teams=[str(r['team_number']) for r in active['data']]
                    active_at=cache['/api/team/scores.php?recent=5'][0]
                except Exception:
                    active_teams=None
                    active_at=None
                active_teams=effective_activity(data,active_teams)
                vuln_totals={}
                if params.get('vulns')==['1']:
                    requested=set(params.get('team',[]))
                    for row in data['data']:
                        team=str(row['team_number'])
                        if team not in requested: continue
                        try:
                            image_ttl=float('inf') if active_teams is not None and team not in active_teams else (0 if params.get('fresh')==['1'] else ttl)
                            images=remote('/api/image/scores.php?'+urllib.parse.urlencode({'team':team}),image_ttl)
                            vuln_totals[team]=total_vulns(images['data'])
                        except Exception: vuln_totals[team]={'found':None,'remaining':None}
                stamp=int(cache['/api/team/scores.php'][0])
                with sqlite3.connect(DB) as db:
                    active_ids=set(active_teams or [])
                    for row in data['data']:
                        if row.get('ccs_score') is None: continue
                        team=str(row['team_number'])
                        score=float(row['ccs_score'])
                        previous=db.execute('SELECT score FROM samples WHERE team=? ORDER BY stamp DESC LIMIT 1',(team,)).fetchone()
                        if team in active_ids or previous is None or previous[0]!=score:
                            db.execute('INSERT OR IGNORE INTO samples VALUES (?,?,?)',(team,stamp,score))
                result={'data':data['data'],'fetchedAt':cache['/api/team/scores.php'][0], 'activeTeams':active_teams,'activeFetchedAt':active_at,'vulnTotals':vuln_totals}
            elif url.path=='/api/team':
                team=urllib.parse.parse_qs(url.query).get('team',[''])[0]
                if not team or len(team)>40: raise ValueError('Invalid team ID')
                q=urllib.parse.urlencode({'team':team})
                detail_ttl=0 if params.get('fresh')==['1'] else ttl
                chart=remote('/api/image/chart.php?'+q,detail_ttl)
                images=remote('/api/image/scores.php?'+q,detail_ttl)
                with sqlite3.connect(DB) as db: history=db.execute('SELECT stamp,score FROM samples WHERE team=? ORDER BY stamp',(team,)).fetchall()
                result={'chart':chart,'images':images,'observedTotal':history}
            else:
                self.send_error(404); return
            body=json.dumps(result).encode(); self.send_response(200)
        except Exception as e:
            body=json.dumps({'error':'Scoreboard unavailable. '+str(e)}).encode(); self.send_response(502)
        self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
if __name__=='__main__':
    print('CyPat Scoreboard: http://localhost:8000',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
