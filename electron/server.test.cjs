const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {startServer}=require('./server.cjs');
test('serves UI, caches live data, persists observations and returns image history',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));let calls=0;
 const options={publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async url=>{calls++;if(url.includes('/team/scores'))return {data:[{team_number:'19-0512',ccs_score:'200'}]};if(url.includes('/chart'))return {cols:[],rows:[]};return {data:[]};}};
 let server=await startServer(options);
 try{
 assert.equal((await fetch(server.url)).status,200);
 const timeModule=await fetch(server.url+'/time.mjs');
 assert.equal(timeModule.status,200);assert.equal(timeModule.headers.get('content-type'),'text/javascript');
 const first=await(await fetch(server.url+'/api/scores')).json();assert.equal(first.data[0].ccs_score,'200');
 assert.deepEqual(first.activeTeams,['19-0512']);assert.ok(first.activeFetchedAt>0);
 await fetch(server.url+'/api/scores');assert.equal(calls,2);
 await fetch(server.url+'/api/scores?fresh=1');assert.equal(calls,4);
 let details=await(await fetch(server.url+'/api/team?team=19-0512')).json();assert.equal(details.observedTotal.length,1);assert.equal(details.observedTotal[0][1],200);
 assert.equal((await fetch(server.url+'/api/team')).status,400);
 await server.close();server=await startServer(options);
 details=await(await fetch(server.url+'/api/team?team=19-0512')).json();assert.equal(details.observedTotal[0][1],200);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('activity uses the official active list and failures still return scores',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));let offline=false;
 const server=await startServer({publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async address=>{
  if(new URL(address).searchParams.get('recent')==='5'){
   if(offline)throw Error('activity unavailable');
   return {data:[{team_number:'19-0687'}]};
  }
  return {data:[{team_number:'19-0512',ccs_score:'200'},{team_number:'19-0687',ccs_score:'12'}]};
 }});
 try{
  let response=await fetch(server.url+'/api/scores');let scores=await response.json();
  assert.deepEqual(scores.activeTeams,['19-0687']);assert.equal(scores.data.length,2);
  offline=true;response=await fetch(server.url+'/api/scores?fresh=1');scores=await response.json();
  assert.equal(response.status,200);assert.equal(scores.data.length,2);
  assert.equal(scores.activeTeams,null);assert.equal(scores.activeFetchedAt,null);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('fresh detail requests replace cached image scores and all graph points',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));let charts=0,images=0;
 const server=await startServer({publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async address=>{
  if(address.includes('/chart.php')){
   charts++;
   return {cols:[{label:'Time'},{label:'Image'}],rows:Array.from({length:charts},(_,i)=>({c:[{v:`10/23 14:${35+i*5}`},{v:charts*10}]}))};
  }
  images++;return {data:[{image:'Image',ccs_score:images*10}]};
 }});
 try{
  const url=server.url+'/api/team?team=19-0687&interval=60';
  let result=await(await fetch(url)).json();assert.equal(result.chart.rows.length,1);
  await fetch(url);assert.equal(charts,1);assert.equal(images,1);
  result=await(await fetch(url+'&fresh=1')).json();
  assert.equal(charts,2);assert.equal(images,2);
  assert.equal(result.chart.rows.length,2);assert.equal(result.chart.rows[1].c[0].v,'10/23 14:40');
  assert.equal(result.chart.rows[0].c[1].v,20);assert.equal(result.images.data[0].ccs_score,20);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('inactive teams skip unchanged history samples while final score changes are preserved',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));let inactiveScore=12,active=true;
 const server=await startServer({publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async address=>{
  if(new URL(address).searchParams.get('recent')==='5')return {data:active?[{team_number:'19-active'}]:[]};
  return {data:[{team_number:'19-active',ccs_score:200},{team_number:'19-inactive',ccs_score:inactiveScore}]};
 }});
 try{
  await fetch(server.url+'/api/scores?fresh=1');
  await new Promise(resolve=>setTimeout(resolve,1100));
  await fetch(server.url+'/api/scores?fresh=1');
  let saved=JSON.parse(await fs.readFile(path.join(dir,'observations.json'),'utf8'));
  assert.equal(saved['19-active'].length,2);assert.equal(saved['19-inactive'].length,1);
  active=false;inactiveScore=15;
  await new Promise(resolve=>setTimeout(resolve,1100));
  await fetch(server.url+'/api/scores?fresh=1');
  saved=JSON.parse(await fs.readFile(path.join(dir,'observations.json'),'utf8'));
  assert.equal(saved['19-active'].length,2);assert.equal(saved['19-inactive'].length,2);
  assert.equal(saved['19-inactive'].at(-1)[1],15);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('three unchanged refreshes override the active list and clock progress reactivates a team',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));let elapsed='00:10:00';
 const server=await startServer({publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async address=>{
  if(new URL(address).searchParams.get('recent')==='5')return {data:[{team_number:'19-0687'}]};
  return {data:[{team_number:'19-0687',play_time:elapsed,ccs_score:12}]};
 }});
 const poll=async(fresh=true)=>(await(await fetch(server.url+'/api/scores'+(fresh?'?fresh=1':''))).json()).activeTeams;
 try{
  assert.deepEqual(await poll(),['19-0687']);
  for(let i=0;i<4;i++)assert.deepEqual(await poll(false),['19-0687']);
  assert.deepEqual(await poll(),['19-0687']);
  assert.deepEqual(await poll(),['19-0687']);
  assert.deepEqual(await poll(),[]);
  assert.deepEqual(await poll(),[]);
  elapsed='00:10:05';assert.deepEqual(await poll(),['19-0687']);
  assert.deepEqual(await poll(),['19-0687']);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});
