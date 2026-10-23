import {displayTimeZone, formatTimestamp, publicTimestamp, formatPublicTime} from './time.mjs';
import {imageActivity, livePlayTime} from './activity.mjs';
import {totalImageHistory} from './history.mjs';
import {detailsFraction} from './layout.mjs';
const $=id=>document.getElementById(id), fields={Pos:'Pos.',Overall:'Overall',TeamID:'Team ID',TeamName:'Team Name',Score:'Score',TimeSeconds:'Time',Active:'Active',Images:'Images',VulnsFound:'Found',VulnsRemaining:'Remain',Location:'Location',Division:'Division',Tier:'Tier',Warnings:'Warnings'};
let config;try{config=JSON.parse(localStorage.getItem('cypat-config'))}catch{}config||={name:'CyPat Scoreboard',teams:'19-0512\n19-1074\n19-0479',format:'HH:MM:SS',columns:['Pos','Overall','TeamID','TeamName','Score','TimeSeconds','PPM','Warnings'],formulas:'PPM = Score / TimeMinutes'};
config.refreshSeconds ||= 60;
config.localTimes ??= false;
let refreshTimer, fetchInFlight=false, lastFetchDuration=0, nextFetchTarget=0;
function scheduleRefresh(){
 clearTimeout(refreshTimer);
 const interval=config.refreshSeconds*1000;
 if(!nextFetchTarget)nextFetchTarget=Date.now()+interval;
 const lead=Math.min(lastFetchDuration,interval*0.8);
 refreshTimer=setTimeout(load,Math.max(250,nextFetchTarget-lead-Date.now()));
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!fetchInFlight){if(Date.now()>=nextFetchTarget)load();else scheduleRefresh()}});
let activeTeams=null,activeFetchedAt=0,detailView=null,vulnTotals={};
const detailCache=new Map();
let data=[],sort='Score',direction=-1,selected=null,request=0,lastFetch=0;
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
let detailsRatio=0.5,resizePointer=null;
try{detailsRatio=detailsFraction(localStorage.getItem('cypat-details-height'))}catch{}
function applyDetailSize(){
 document.querySelector('.tablebox').style.flex=$('details').hidden?'1 1 0':`${1-detailsRatio} 1 0`;
 $('details').style.flex=`${detailsRatio} 1 0`;
 $('detailsresize').setAttribute('aria-valuenow',Math.round(detailsRatio*100));
 $('detailsresize').setAttribute('aria-valuetext',Math.round(detailsRatio*100)+'% of available height');
}
function setDetailsVisible(visible){$('details').hidden=!visible;$('detailsresize').hidden=!visible;applyDetailSize()}
function saveDetailSize(){try{localStorage.setItem('cypat-details-height',detailsRatio)}catch{}}
$('detailsresize').onpointerdown=event=>{
 if(event.button!==0)return;
 event.preventDefault();hideGraphTooltip();resizePointer=event.pointerId;
 $('detailsresize').setPointerCapture(event.pointerId);document.body.classList.add('resizing-details');
};
$('detailsresize').onpointermove=event=>{
 if(resizePointer!==event.pointerId)return;
 const area=document.querySelector('main').getBoundingClientRect();
 detailsRatio=detailsFraction((area.bottom-event.clientY-$('detailsresize').offsetHeight/2)/(area.height-$('detailsresize').offsetHeight));
 applyDetailSize();
};
function finishDetailResize(event){
 if(resizePointer!==event.pointerId)return;
 resizePointer=null;document.body.classList.remove('resizing-details');saveDetailSize();
 if($('detailsresize').hasPointerCapture(event.pointerId))$('detailsresize').releasePointerCapture(event.pointerId);
}
$('detailsresize').onpointerup=$('detailsresize').onpointercancel=$('detailsresize').onlostpointercapture=finishDetailResize;
$('detailsresize').onkeydown=event=>{
 const changes={ArrowUp:0.05,ArrowDown:-0.05};
 if(!(event.key in changes)&&event.key!=='Home'&&event.key!=='End')return;
 event.preventDefault();hideGraphTooltip();
 detailsRatio=detailsFraction(event.key==='Home'?0.15:event.key==='End'?0.85:detailsRatio+changes[event.key]);
 applyDetailSize();saveDetailSize();
};
applyDetailSize();
function evaluate(source,values){const tokens=source.match(/[A-Za-z_][A-Za-z_0-9]*|(?:\d+\.?\d*|\.\d+)|[()+*/-]/g)||[];if(tokens.join('')!==source.replace(/\s/g,''))throw Error('Invalid expression');let i=0;function atom(){let t=tokens[i++];if(t==='('){let v=sum();if(tokens[i++]!==')')throw Error('Missing closing parenthesis');return v}if(t==='-')return -atom();if(t==='+')return atom();if(/^(\d|\.)/.test(t||''))return Number(t);if(Object.hasOwn(values,t))return values[t];throw Error('Unknown field: '+t)}function product(){let v=atom();while(['*','/'].includes(tokens[i])){const op=tokens[i++],r=atom();v=op==='*'?v*r:(r===0?NaN:v/r)}return v}function sum(){let v=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],r=product();v=op==='+'?v+r:v-r}return v}const v=sum();if(i!==tokens.length)throw Error('Invalid expression');return v}
function formulas(text){return text.split('\n').filter(x=>x.trim()).map(line=>{const m=line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+)$/);if(!m)throw Error('Use Name = expression');if(Object.hasOwn(fields,m[1]))throw Error('Choose a different column name');return [m[1],m[2]]})}
function seconds(t){return String(t||'').split(':').reduce((a,b)=>a*60+Number(b),0)}
function time(s){if(!Number.isFinite(s))return '—';if(config.format==='minutes')return (s/60).toFixed(2);if(config.format==='hours')return(s/3600).toFixed(2);let h=Math.floor(s/3600),m=Math.floor(s%3600/60),v=Math.floor(s%60);return [h,m,...(config.format==='HH:MM:SS'?[v]:[])].map(n=>String(n).padStart(2,'0')).join(':')}
function rows(){const teams=config.teams.split('\n').filter(x=>x.trim()).map(x=>{let [id,...alias]=x.split(',');return [id.trim(),alias.join(',').trim()]});const ranked=teams.map(([id])=>id).filter(id=>data.some(r=>String(r.team_number)===id)).sort((a,b)=>data.findIndex(r=>String(r.team_number)===a)-data.findIndex(r=>String(r.team_number)===b));return teams.map(([id,alias],i)=>{let d=data.find(r=>String(r.team_number)===id);const s=d?livePlayTime(seconds(d.play_time),id,lastFetch,activeTeams,activeFetchedAt):NaN;let r={Pos:d?ranked.indexOf(id)+1:null,Overall:d?data.indexOf(d)+1:null,TeamID:id,TeamName:alias||d?.team_name||id,Score:d?Number(d.ccs_score):NaN,TimeSeconds:s,TimeMinutes:s/60,TimeHours:s/3600,Images:d?.images,VulnsFound:d?vulnTotals[id]?.found??NaN:NaN,VulnsRemaining:d?vulnTotals[id]?.remaining??NaN:NaN,ImageActivity:imageActivity(id,activeTeams,activeFetchedAt),Location:d?.location,Division:d?.division,Tier:d?.tier,Warnings:d?.code||'—',missing:!d};r.Active=activityLabel(r.ImageActivity);for(const [name,f]of formulas(config.formulas)){try{r[name]=evaluate(f,r)}catch{r[name]=NaN}}return r})}
function render(){ $('title').textContent=config.name;$('head').replaceChildren();const hr=el('tr');for(const key of config.columns){const th=el('th',null,key==='TeamName'?'name':'');th.setAttribute('aria-sort',sort===key?(direction<0?'descending':'ascending'):'none');const b=el('button',fields[key]||key);if(sort===key){const im=el('img');im.src='assets/chevron.svg';im.alt=direction<0?'Descending':'Ascending';if(direction>0)im.style.transform='rotate(180deg)';b.append(im)}b.onclick=()=>{direction=sort===key?-direction:1;sort=key;render()};th.append(b);hr.append(th)}$('head').append(hr);$('rows').replaceChildren();let rs=rows().sort((a,b)=>{let x=a[sort],y=b[sort];if(x==null||Number.isNaN(x))return 1;if(y==null||Number.isNaN(y))return -1;return direction*(typeof x==='number'?x-y:String(x).localeCompare(String(y)))});for(const r of rs){let tr=el('tr',null,selected===r.TeamID?'selected':'');tr.dataset.teamId=r.TeamID;tr.tabIndex=0;tr.setAttribute('aria-label','Details for '+r.TeamName);for(const k of config.columns){let v=r[k];if(k==='TimeSeconds')v=time(v);else if(typeof v==='number')v=Number.isFinite(v)?(Number.isInteger(v)?v:v.toFixed(2)):'—';const cell=el('td',v??'—',k==='TeamName'?'name':'');cell.dataset.field=k;tr.append(cell)}tr.onclick=()=>toggleDetails(r);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleDetails(r)}};$('rows').append(tr)}if(!rs.length)$('status').textContent='Configure the team IDs you want to follow.'}
async function load(){
 if(fetchInFlight)return;
 clearTimeout(refreshTimer);fetchInFlight=true;
 const started=performance.now(),target=nextFetchTarget;
 $('updated').textContent='Updating…';
 try{
  const query=new URLSearchParams({fresh:'1',interval:config.refreshSeconds});
  if(config.columns.some(key=>key==='VulnsFound'||key==='VulnsRemaining')||/\b(?:VulnsFound|VulnsRemaining)\b/.test(config.formulas)){
   query.set('vulns','1');
   for(const line of config.teams.split('\n')){const id=line.split(',')[0].trim();if(id)query.append('team',id)}
  }
  const r=await fetch('/api/scores?'+query,{cache:'no-store'});
  const j=await r.json();if(!r.ok)throw Error(j.error);
  data=j.data;vulnTotals=j.vulnTotals||{};lastFetch=j.fetchedAt*1000;activeTeams=j.activeTeams??null;activeFetchedAt=(j.activeFetchedAt||0)*1000;
  $('status').textContent=data.length?'':'The public scoreboard returned no teams.';
  render();if(selected){const row=rows().find(r=>r.TeamID===selected);if(row)details(row,true)}
 }catch(e){$('status').textContent=e.message+' Previous scores remain visible.';$('updated').textContent='Connection unavailable'}
 finally{
  lastFetchDuration=performance.now()-started;fetchInFlight=false;
  const interval=config.refreshSeconds*1000,now=Date.now();
  nextFetchTarget=target?target+interval:now+interval;
  while(nextFetchTarget<=now)nextFetchTarget+=interval;
  scheduleRefresh();
 }
}
const graphTooltip=el('div',null,'graph-tooltip');
let dismissGraphHover=null;
graphTooltip.id='graph-tooltip';graphTooltip.setAttribute('role','tooltip');graphTooltip.hidden=true;graphTooltip.setAttribute('aria-hidden','true');graphTooltip.append(el('strong'),el('span'),el('span'));document.body.append(graphTooltip);
function hideGraphTooltip(){
 const dismiss=dismissGraphHover;dismissGraphHover=null;dismiss?.();
 graphTooltip.hidden=true;graphTooltip.setAttribute('aria-hidden','true');
}
function showGraphTooltip(dot,name,time,value,color,onDismiss=null){
 if(dismissGraphHover!==onDismiss){dismissGraphHover?.();dismissGraphHover=onDismiss}
 [name,'Time: '+time,'Score: '+value].forEach((text,i)=>{if(graphTooltip.children[i].textContent!==String(text))graphTooltip.children[i].textContent=text});
 graphTooltip.style.borderColor=color;graphTooltip.hidden=false;graphTooltip.setAttribute('aria-hidden','false');
 const rect=dot.getBoundingClientRect(),box=graphTooltip.getBoundingClientRect();
 graphTooltip.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.x+rect.width/2-box.width/2))+'px';
 graphTooltip.style.top=Math.max(8,rect.top-box.height-12<8?Math.min(innerHeight-box.height-8,rect.bottom+12):rect.top-box.height-12)+'px';
}
document.addEventListener('scroll',hideGraphTooltip,true);window.addEventListener('resize',hideGraphTooltip);document.addEventListener('keydown',e=>{if(e.key==='Escape')hideGraphTooltip()});
window.addEventListener('blur',hideGraphTooltip);document.addEventListener('visibilitychange',()=>{if(document.hidden)hideGraphTooltip()});
function chart(container,title,{crosshair=false}={}){
 const colors=['#83aaff','#7de1b1','#ffbc77','#df9eff','#ff879f'];
 const ns='http://www.w3.org/2000/svg';
 const node=(tag,attributes={})=>{const n=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,value);return n};
 const svg=node('svg',{viewBox:'0 0 600 170',role:'img','aria-label':title});
 const heading=el('h3',title),empty=el('p','No history available yet.','muted'),legend=el('div',null,'legend');
 const gridLabels=[];
 for(let g=0;g<4;g++){
  const y=15+g*40;
  svg.append(node('path',{d:`M35 ${y} H590`,stroke:'#ffffff18'}));
  const text=node('text',{x:0,y:y+4});gridLabels.push(text);svg.append(text);
 }
 const first=node('text',{x:35,y:160,'text-anchor':'start'}),last=node('text',{x:590,y:160,'text-anchor':'end'});
 svg.append(first,last);container.append(heading,empty,svg,legend);
 const groups=new Map();let signature,plotted=[],highlighted=null,hoverX=null;
 const cursorLine=node('line',{y1:15,y2:135,stroke:'#ffffff88','stroke-width':1,'stroke-dasharray':'3 3',class:'graph-crosshair'});
 cursorLine.style.display='none';cursorLine.style.pointerEvents='none';
 function resetHover(){
  highlighted?.classList.remove('is-hovered');highlighted=null;hoverX=null;
  cursorLine.style.display='none';
 }
 function clearHover(){resetHover();hideGraphTooltip()}
 function highlight(sample,x){
  highlighted?.classList.remove('is-hovered');highlighted=sample.dot;hoverX=x;
  sample.dot.classList.add('is-hovered');cursorLine.setAttribute('x1',x);cursorLine.setAttribute('x2',x);cursorLine.style.display='';
  showGraphTooltip(sample.dot,sample.name,sample.label,sample.value,sample.color,resetHover);
 }
 function nearest(x){return plotted.reduce((best,sample)=>!best||Math.abs(sample.x-x)<Math.abs(best.x-x)?sample:best,null)}
 if(crosshair){
  svg.classList.add('crosshair-chart');svg.append(cursorLine);
  svg.onpointermove=event=>{
   const matrix=svg.getScreenCTM();if(!matrix)return;
   const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
   const position=point.matrixTransform(matrix.inverse());
   if(position.x<35||position.x>590||position.y<15||position.y>135){clearHover();return}
   const sample=nearest(position.x);if(sample)highlight(sample,position.x);else clearHover();
  };
  svg.onpointerleave=clearHover;
  svg.onpointercancel=clearHover;
  svg.onkeydown=event=>{if(event.key==='Escape')clearHover()};
 }
 return {update(labels,series,names,keys=labels){
  const next=JSON.stringify([labels,series,names,keys]);if(next===signature)return;signature=next;
  empty.hidden=!!labels.length;svg.style.display=labels.length?'block':'none';legend.hidden=!labels.length;
  const max=Math.max(1,...series.flat().filter(Number.isFinite));
  gridLabels.forEach((text,g)=>{text.textContent=Math.round(max*(1-g/3))});
  first.textContent=labels[0]??'';last.textContent=labels.at(-1)??'';
  const retained=new Set();plotted=[];
  series.forEach((values,k)=>{
   const name=names[k]??'',key=k+':'+name,color=colors[k%colors.length];retained.add(key);
   let group=groups.get(key);
   if(!group){
    const root=node('g'),path=node('path',{fill:'none','stroke-width':2,class:'graph-line'}),label=el('span',name);
    path.style.pointerEvents='none';root.append(path);svg.append(root);legend.append(label);
    group={root,path,label,points:new Map()};groups.set(key,group);
   }
   group.path.setAttribute('stroke',color);group.label.style.color=color;
   let d='',open=false;const kept=new Set();
   values.forEach((v,i)=>{
    if(!Number.isFinite(v)){open=false;return}
    const x=35+i*555/Math.max(1,labels.length-1),y=135-v/max*120;
    d+=(open?'L':'M')+x+' '+y+' ';open=true;
    const pointKey=keys[i];kept.add(pointKey);let dot=group.points.get(pointKey);
    if(!dot){
     dot=node('circle',{r:4,class:'graph-point new-point',tabindex:0,role:'graphics-symbol','aria-describedby':'graph-tooltip',stroke:'transparent','stroke-width':14});
     dot.append(node('title'));group.root.append(dot);group.points.set(pointKey,dot);
     requestAnimationFrame(()=>requestAnimationFrame(()=>dot.classList.remove('new-point')));
    }
    dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('fill',color);
    dot.setAttribute('aria-label',`${name}, time ${labels[i]}, score ${v}`);
    dot.firstChild.textContent=`${name} · ${labels[i]} · ${v}`;
    const sample={dot,x,name,label:labels[i],value:v,color};plotted.push(sample);
    if(crosshair){dot.onfocus=()=>highlight(sample,x);dot.onblur=clearHover}
    else{dot.onpointerenter=dot.onfocus=()=>showGraphTooltip(dot,name,labels[i],v,color);dot.onpointerleave=dot.onblur=hideGraphTooltip}
   });
   for(const [key,dot]of group.points)if(!kept.has(key)){hideGraphTooltip();dot.remove();group.points.delete(key)}
   if(group.path.getAttribute('d')!==d)group.path.setAttribute('d',d);
  });
  for(const [key,group]of groups)if(!retained.has(key)){hideGraphTooltip();group.root.remove();group.label.remove();groups.delete(key)}
  if(crosshair){
   svg.append(cursorLine);
   if(hoverX!==null){const sample=nearest(hoverX);if(sample)highlight(sample,hoverX);else clearHover()}
  }
 }};
}
function toggleDetails(r){if(selected===r.TeamID){hideGraphTooltip();selected=null;request++;setDetailsVisible(false);render()}else details(r)}
function setStat(view,key,label,value){
 let entry=view.stats.get(key);
 if(!entry){const term=el('dt',label),description=el('dd');view.list.append(term,description);entry=description;view.stats.set(key,entry)}
 const text=String(value??'—');if(entry.textContent!==text)entry.textContent=text;
 return entry;
}
function openDetailView(id){
 hideGraphTooltip();$('graphs').replaceChildren();$('stats').replaceChildren();
 const zone=el('p',null,'muted'),notice=el('p','Loading history…','muted');
 const body=el('div'),imageContainer=el('div'),sumContainer=el('div'),totalContainer=el('div');body.hidden=true;
 body.append(imageContainer,sumContainer,totalContainer,el('p','Public total history keeps each image’s last reported score when it stops reporting, and includes images from their first report onward. Polling history starts when this server first observes the team.','muted'));
 $('graphs').append(zone,notice,body);
 const list=el('dl'),images=el('div');
 $('stats').append(el('h3','Team statistics'),list,el('p','Activity follows the public Active Teams list (reports within the last 5 minutes). Three refreshes without play time changing mark a team inactive. The clock between refreshes is estimated.','muted'),images);
 return {id,zone,notice,body,list,stats:new Map(),images,imageNodes:new Map(),imageChart:chart(imageContainer,'Per-image score · public history'),sumChart:chart(sumContainer,'Total score · public image history',{crosshair:true}),totalChart:chart(totalContainer,'Total score · observed while polling',{crosshair:true})};
}
async function details(r,refresh=false){
 r=rows().find(row=>row.TeamID===r.TeamID)||r;
 const changed=selected!==r.TeamID;selected=r.TeamID;
 if(changed)render();setDetailsVisible(true);
 if(!detailView||detailView.id!==r.TeamID)detailView=openDetailView(r.TeamID);
 const view=detailView;
 const title=r.TeamName+'  ·  '+r.TeamID;if($('teamtitle').textContent!==title)$('teamtitle').textContent=title;
 for(const k of ['Score','TimeSeconds','Overall','Images','Division','Tier','Location','Warnings']){
  const entry=setStat(view,k,k==='Images'?'Scored images':fields[k],k==='TimeSeconds'?time(r[k]):Number.isNaN(r[k])?'—':r[k]);
  if(k==='TimeSeconds')entry.id='detailtime';
 }
 setStat(view,'activity','Images',activityLabel(r.ImageActivity)).id='imageactivity';
 const zone=displayTimeZone(config.localTimes);
 const zoneNote='Times shown in '+zone+'.'+(r.ImageActivity===false?' Inactive — history polling paused until activity resumes.':'');
 if(view.zone.textContent!==zoneNote)view.zone.textContent=zoneNote;
 setStat(view,'zone','Time zone',zone);
 const token=++request;
 try{
  const cached=detailCache.get(r.TeamID);let j=cached?.data;
  if(!refresh||r.ImageActivity!==false||!j||cached.activity!==false){
   const response=await fetch('/api/team?team='+encodeURIComponent(r.TeamID)+'&interval='+config.refreshSeconds+'&fresh=1',{cache:'no-store'});
   j=await response.json();
   if(token!==request)return;if(!response.ok)throw Error(j.error);
   detailCache.set(r.TeamID,{data:j,activity:r.ImageActivity});
  }
  if(token!==request)return;
  view.notice.textContent='';view.notice.hidden=true;view.body.hidden=false;
  const reference=lastFetch||Date.now(),c=j.chart,history=c.rows||[],names=(c.cols||[]).slice(1).map(c=>c.label);
  const labels=history.map(row=>formatPublicTime(row.c[0].v,config.localTimes,reference));
  const publicKeys=history.map(row=>row.c[0].v);
  view.imageChart.update(labels,names.map((_,i)=>history.map(row=>{
   const v=row.c[i+1]?.v;return v==null||v==='null'?null:Number(v);
  })),names,publicKeys);
  view.sumChart.update(labels,[totalImageHistory(c)],['Image score total'],publicKeys);
  view.totalChart.update(j.observedTotal.map(v=>formatTimestamp(v[0]*1000,config.localTimes,true)),[j.observedTotal.map(v=>v[1])],['CCS total'],j.observedTotal.map(v=>v[0]));
  const publicTimes=history.map(row=>publicTimestamp(row.c[0].v,reference)).filter(v=>v!==null);
  setStat(view,'publicSample','Latest public sample',publicTimes.length?formatTimestamp(Math.max(...publicTimes),config.localTimes):'—');
  setStat(view,'observation','Latest observation',j.observedTotal.length?formatTimestamp(j.observedTotal.at(-1)[0]*1000,config.localTimes,true):'—');
  const retained=new Set();
  for(const image of j.images.data||[]){
   retained.add(image.image);let item=view.imageNodes.get(image.image);
   if(!item){const root=el('div'),text=el('p');root.append(el('h3',image.image),text);view.images.append(root);item={root,text};view.imageNodes.set(image.image,item)}
   const text=`Score: ${image.ccs_score??'—'} · Found: ${image.found??'—'} · Remaining: ${image.remaining??'—'} · Penalties: ${image.penalties??'—'}`;
   if(item.text.textContent!==text)item.text.textContent=text;
  }
  for(const [name,item]of view.imageNodes)if(!retained.has(name)){item.root.remove();view.imageNodes.delete(name)}
 }catch(e){if(token===request){view.notice.textContent=e.message;view.notice.hidden=false}}
}
function activityLabel(value){return value===null?'Unknown':value?'Active':'Inactive'}
function tickClocks(){
 const current=rows(),byId=new Map(current.map(row=>[row.TeamID,row]));
 const calculated=new Set(formulas(config.formulas).map(([name])=>name));
 for(const tr of $('rows').children){
  const row=byId.get(tr.dataset.teamId);if(!row)continue;
  for(const cell of tr.children){
   const key=cell.dataset.field;if(key!=='TimeSeconds'&&key!=='Active'&&!calculated.has(key))continue;
   const value=row[key];cell.textContent=key==='Active'?value:key==='TimeSeconds'?time(value):Number.isFinite(value)?(Number.isInteger(value)?value:value.toFixed(2)):'—';
  }
 }
 if(selected){
  const row=byId.get(selected);
  if(row&&$('detailtime'))$('detailtime').textContent=time(row.TimeSeconds);
  if(row&&$('imageactivity'))$('imageactivity').textContent=activityLabel(row.ImageActivity);
 }
}
setInterval(tickClocks,1000);
$('configure').onclick=()=>{hideGraphTooltip();$('refreshinterval').value=config.refreshSeconds;$('boardname').value=config.name;$('teams').value=config.teams;$('timeformat').value=config.format;$('localtimes').checked=config.localTimes;$('localtimezone').textContent=displayTimeZone(true);$('formulas').value=config.formulas;$('configerror').textContent='';$('columns').replaceChildren();for(const [k,v]of Object.entries(fields)){let l=el('label'),c=el('input');c.type='checkbox';c.value=k;c.checked=config.columns.includes(k);l.append(c,document.createTextNode(' '+v));$('columns').append(l)}$('settings').showModal()};$('cancel').onclick=()=>$('settings').close();$('form').onsubmit=e=>{e.preventDefault();try{const fs=formulas($('formulas').value);let vals={Score:1,TimeMinutes:1,TimeHours:1,TimeSeconds:1,Images:1,VulnsFound:1,VulnsRemaining:1,Overall:1};for(const [k,v]of fs){if(Object.hasOwn(vals,k))throw Error('Duplicate field: '+k);vals[k]=evaluate(v,vals)}const columns=[...$('columns').querySelectorAll('input:checked')].map(x=>x.value).concat(fs.map(x=>x[0]));if(!columns.length)throw Error('Select at least one column');const interval=Number($('refreshinterval').value);if(!Number.isInteger(interval)||interval<15||interval>3600)throw Error('Refresh interval must be 15–3600 seconds');config={localTimes:$('localtimes').checked,refreshSeconds:interval,name:$('boardname').value,teams:$('teams').value,format:$('timeformat').value,formulas:$('formulas').value,columns};localStorage.setItem('cypat-config',JSON.stringify(config));$('settings').close();render();if(selected){const row=rows().find(r=>r.TeamID===selected);if(row)details(row,true)}nextFetchTarget=0;load()}catch(err){$('configerror').textContent=err.message}};$('close').onclick=()=>{hideGraphTooltip();selected=null;request++;setDetailsVisible(false);render()};$('date').textContent=new Date().toLocaleDateString();setInterval(()=>{if(lastFetch&&!fetchInFlight)$('updated').textContent=Math.max(0,Math.floor((Date.now()-lastFetch)/1000))+' seconds ago'},1000);render();load();
