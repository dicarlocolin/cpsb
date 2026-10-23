const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {totalVulns}=require('./vulns.cjs');
const {startServer}=require('./server.cjs');

test('vulnerability totals sum all images and retain zero and unavailable counts',()=>{
 assert.deepEqual(totalVulns([{found:3,remaining:7},{found:'5',remaining:'2'},{found:0,remaining:0}]),{found:8,remaining:9});
 assert.deepEqual(totalVulns([]),{found:0,remaining:0});
 assert.deepEqual(totalVulns([{found:null,remaining:4},{found:2,remaining:3}]),{found:null,remaining:7});
 assert.throws(()=>totalVulns(null));
});

test('optional columns fetch only followed teams, pause inactive teams, resume and handle image failures',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cypat-'));const calls=[];
 let active=['19-a'],failed=false;
 const server=await startServer({publicDir:path.join(__dirname,'../public'),dataDir:dir,fetchJSON:async address=>{
  const url=new URL(address);
  if(url.pathname==='/api/image/scores.php'){
   const id=url.searchParams.get('team');calls.push(id);
   if(failed&&id==='19-a')throw Error('unavailable');
   return {data:[{found:3,remaining:7},{found:'5',remaining:'2'}]};
  }
  if(url.searchParams.get('recent')==='5')return {data:active.map(team_number=>({team_number}))};
  return {data:['19-a','19-b','19-c'].map(team_number=>({team_number,ccs_score:20}))};
 }});
 try{
  await fetch(server.url+'/api/scores?fresh=1');assert.equal(calls.length,0);
  const query='/api/scores?fresh=1&vulns=1&team=19-a&team=19-b&team=missing';
  let result=await(await fetch(server.url+query)).json();
  assert.deepEqual(result.vulnTotals,{'19-a':{found:8,remaining:9},'19-b':{found:8,remaining:9}});
  await fetch(server.url+query);
  assert.equal(calls.filter(id=>id==='19-a').length,2);assert.equal(calls.filter(id=>id==='19-b').length,1);
  active=['19-a','19-b'];failed=true;
  const response=await fetch(server.url+query);result=await response.json();
  assert.equal(response.status,200);assert.equal(result.data.length,3);
  assert.deepEqual(result.vulnTotals['19-a'],{found:null,remaining:null});
  assert.equal(calls.filter(id=>id==='19-b').length,2);
  assert.equal(calls.includes('19-c'),false);assert.equal(calls.includes('missing'),false);
 }finally{await server.close();await fs.rm(dir,{recursive:true,force:true});}
});
