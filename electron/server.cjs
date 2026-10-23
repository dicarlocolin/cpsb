const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {totalVulns}=require('./vulns.cjs');
async function startServer({publicDir, dataDir, fetchJSON, port = 0}) {
  await fs.mkdir(dataDir, {recursive:true});
  const file = path.join(dataDir, 'observations.json');
  let history = {};
  try { history = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if(e.code !== 'ENOENT') throw e; }
  const cache = new Map();
  const activityClocks = new Map();
  let lastActivitySnapshot;
  let writes = Promise.resolve();
  async function remote(endpoint, ttl=60) {
    const old = cache.get(endpoint);
    if(old && Date.now()-old.at < ttl*1000) return old;
    const value = {at:Date.now(), data:await fetchJSON('https://scoreboard.uscyberpatriot.org'+endpoint)};
    cache.set(endpoint,value); return value;
  }
  const server = http.createServer(async(req,res)=>{
    try {
      const url = new URL(req.url,'http://localhost');
      const ttl=Math.max(15,Math.min(3600,Number(url.searchParams.get('interval'))||60));
      let result;
      if(url.pathname === '/api/scores') {
        const scoreTTL=url.searchParams.get('fresh')==='1'?0:ttl;
        const [value,active]=await Promise.all([
          remote('/api/team/scores.php',scoreTTL),
          remote('/api/team/scores.php?recent=5',scoreTTL).catch(()=>null)
        ]);
        const listedTeams=Array.isArray(active?.data?.data)?active.data.data.map(row=>String(row.team_number)):null;
        if(listedTeams!==null && value!==lastActivitySnapshot){
          const listed=new Set(listedTeams);
          for(const row of value.data.data){
            const id=String(row.team_number),previous=activityClocks.get(id);
            const unchanged=listed.has(id) && /^\d+:\d{2}:\d{2}$/.test(row.play_time) && previous?.time===row.play_time
              ?previous.unchanged+1:0;
            activityClocks.set(id,{time:row.play_time,unchanged});
          }
          lastActivitySnapshot=value;
        }
        const activeTeams=listedTeams===null?null:listedTeams.filter(id=>(activityClocks.get(id)?.unchanged||0)<3);
        const activeIDs=new Set(activeTeams||[]);
        const vulnTotals={};
        if(url.searchParams.get('vulns')==='1'){
          const requested=new Set(url.searchParams.getAll('team'));
          const pending=value.data.data.filter(row=>requested.has(String(row.team_number)));
          async function collect(){
            while(pending.length){
              const id=String(pending.shift().team_number);
              const endpoint='/api/image/scores.php?'+new URLSearchParams({team:id});
              try{
                const imageTTL=activeTeams!==null && !activeIDs.has(id)?Infinity:scoreTTL;
                const images=await remote(endpoint,imageTTL);
                Object.defineProperty(vulnTotals,id,{value:totalVulns(images.data.data),enumerable:true});
              }catch{Object.defineProperty(vulnTotals,id,{value:{found:null,remaining:null},enumerable:true});}
            }
          }
          await Promise.all(Array.from({length:Math.min(4,pending.length)},collect));
        }
        const stamp = Math.floor(value.at/1000);
        for(const row of value.data.data) {
          const score = Number(row.ccs_score);
          if(row.ccs_score == null || !Number.isFinite(score)) continue;
          const id = String(row.team_number);
          if(!Object.hasOwn(history,id)) Object.defineProperty(history,id,{value:[],enumerable:true,writable:true});
          const previous=history[id].at(-1);
          if(!activeIDs.has(id) && previous?.[1]===score) continue;
          if(history[id].at(-1)?.[0] !== stamp) history[id].push([stamp,score]);
        }
        const snapshot=JSON.stringify(history);
        writes = writes.catch(()=>{}).then(async()=>{await fs.writeFile(file+'.tmp',snapshot);await fs.rename(file+'.tmp',file)});
        await writes;
        result = {data:value.data.data,fetchedAt:value.at/1000,
          activeTeams,
          vulnTotals,
          activeFetchedAt:active?active.at/1000:null};
      } else if(url.pathname === '/api/team') {
        const team=url.searchParams.get('team');
        if(!team || team.length>40) {res.writeHead(400);res.end();return;}
        const query='?'+new URLSearchParams({team});
        const detailTTL=url.searchParams.get('fresh')==='1'?0:ttl;
        const [chart,images]=await Promise.all([remote('/api/image/chart.php'+query,detailTTL),remote('/api/image/scores.php'+query,detailTTL)]);
        result={chart:chart.data,images:images.data,observedTotal:Object.hasOwn(history,team)?history[team]:[]};
      } else {
        const relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
        const target=path.resolve(publicDir,relative);
        if(!target.startsWith(path.resolve(publicDir)+path.sep)){res.writeHead(403);res.end();return;}
        const bytes=await fs.readFile(target);
        const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(target)]||'application/octet-stream';
        res.writeHead(200,{'Content-Type':type});res.end(bytes);return;
      }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
    } catch(e) {res.writeHead(e.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Scoreboard unavailable. '+e.message}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(resolve=>server.close(resolve));await writes;}};
}
module.exports={startServer};
