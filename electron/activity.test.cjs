const {test}=require('node:test');
const assert=require('node:assert/strict');

test('only active team clocks advance and refreshes replace the estimate',async()=>{
 const {imageActivity,livePlayTime}=await import('../public/activity.mjs');
 const stamp=Date.UTC(2026,9,23,14),active=['19-0687'];
 assert.equal(imageActivity('19-0687',active,stamp,stamp+2000),true);
 assert.equal(imageActivity('19-0512',active,stamp,stamp+2000),false);
 assert.equal(livePlayTime(120,'19-0687',stamp,active,stamp,stamp+2500),122);
 assert.equal(livePlayTime(120,'19-0512',stamp,active,stamp,stamp+2500),120);
 // A refreshed clock can be lower than an estimate; use the source value.
 assert.equal(livePlayTime(121,'19-0687',stamp+3000,active,stamp+3000,stamp+3000),121);
 assert.equal(livePlayTime(121,'19-0687',stamp+3000,[],stamp+3000,stamp+10000),121);
});

test('unknown or stale activity cannot run a clock indefinitely',async()=>{
 const {imageActivity,livePlayTime}=await import('../public/activity.mjs');
 const stamp=Date.UTC(2026,9,23,14),active=['19-0687'];
 assert.equal(imageActivity('19-0687',null,stamp,stamp),null);
 assert.equal(imageActivity('19-0687',active,stamp,stamp+300000),null);
 assert.equal(livePlayTime(120,'19-0687',stamp,null,stamp,stamp+10000),120);
 assert.equal(livePlayTime(120,'19-0687',stamp,active,stamp,stamp+600000),420);
 assert.equal(livePlayTime(120,'19-0687',stamp,active,stamp,stamp-1000),120);
 assert.ok(Number.isNaN(livePlayTime(NaN,'missing',stamp,active,stamp,stamp)));
});
