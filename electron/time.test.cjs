const {test}=require('node:test');
const assert=require('node:assert/strict');

test('UTC chart timestamps convert using the device zone and date-specific daylight saving',async()=>{
 const {formatPublicTime,formatTimestamp,displayTimeZone}=await import('../public/time.mjs');
 const previous=process.env.TZ;
 try{
  process.env.TZ='America/Chicago';
  assert.equal(displayTimeZone(true),'America/Chicago');
  assert.equal(displayTimeZone(false),'UTC');
  const reference=Date.UTC(2026,9,23);
  assert.equal(formatPublicTime('10/23 14:35',false,reference),'10/23 14:35');
  assert.equal(formatPublicTime('10/23 14:35',true,reference),'10/23 09:35');
  assert.equal(formatPublicTime('01/23 14:35',true,Date.UTC(2026,0,23)),'01/23 08:35');
  assert.equal(formatPublicTime('10/23 02:05:07',true,reference),'10/22 21:05:07');
  assert.equal(formatTimestamp(Date.UTC(2026,9,23,14,35,7),true,true),'10/23 09:35:07');
  assert.equal(formatTimestamp(Date.UTC(2026,9,23,14,35,7),false,true),'10/23 14:35:07');
  process.env.TZ='Asia/Kolkata';
  assert.equal(formatPublicTime('10/23 22:35',true,reference),'10/24 04:05');
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('yearless public dates handle New Year and invalid input without inventing timestamps',async()=>{
 const {publicTimestamp,formatPublicTime}=await import('../public/time.mjs');
 assert.equal(publicTimestamp('12/31 23:55',Date.UTC(2027,0,1)),Date.UTC(2026,11,31,23,55));
 assert.equal(publicTimestamp('01/01 00:05',Date.UTC(2026,11,31,23,59)),Date.UTC(2027,0,1,0,5));
 for(const label of ['unknown','00:20:00','13/23 14:35','02/30 14:35','10/23 24:35','10/23 14:60']){
  assert.equal(publicTimestamp(label,Date.UTC(2026,9,23)),null);
  assert.equal(formatPublicTime(label,true,Date.UTC(2026,9,23)),label);
 }
});
