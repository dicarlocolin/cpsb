const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.attributes=new Map();this.classes=new Set();this.textContent='';this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name))};}
 append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node)}}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null}}
 setAttribute(key,value){this.attributes.set(key,String(value))}
 getAttribute(key){return this.attributes.get(key)??null}
 get firstChild(){return this.children[0]}
 getScreenCTM(){return {inverse:()=>({})}}
 createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}}
}
function harness(){
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const start=source.indexOf('function chart('),end=source.indexOf('function toggleDetails',start);
 const tooltips=[];
 let dismiss=null;
 const hideTooltip=()=>{const callback=dismiss;dismiss=null;callback?.()};
 const chart=vm.runInNewContext(source.slice(start,end)+';chart',{
  document:{createElementNS:(_,tag)=>new Element(tag)},
  el:(tag,text)=>{const node=new Element(tag);node.textContent=text??'';return node},
  requestAnimationFrame:callback=>callback(),hideGraphTooltip:hideTooltip,showGraphTooltip:(...args)=>{
   if(dismiss!==args[5])dismiss?.();dismiss=args[5];tooltips.push(args);
  }
 });
 return {chart,tooltips,hideTooltip};
}
function descendants(node,tag){return node.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...descendants(child,tag)])}

test('history updates retain the SVG and existing points, replace revised values, and preserve gaps',()=>{
 const {chart}=harness(),container=new Element('div'),view=chart(container,'History');
 view.update(['14:35'],[[0]],['Image']);
 const svg=descendants(container,'svg')[0],first=descendants(svg,'circle')[0];
 view.update(['14:35','14:40'],[[10,20]],['Image']);
 assert.equal(descendants(container,'svg')[0],svg);
 assert.equal(descendants(svg,'circle')[0],first);
 assert.equal(descendants(svg,'circle').length,2);
 assert.match(first.getAttribute('aria-label'),/score 10$/);
 const second=descendants(svg,'circle')[1];
 view.update(['14:35','14:40'],[[null,20]],['Image']);
 assert.deepEqual(descendants(svg,'circle'),[second]);
 view.update([],[],[]);assert.equal(descendants(svg,'circle').length,0);
 assert.equal(svg.style.display,'none');
});

test('polling graph follows the cursor and highlights only the nearest real point',()=>{
 const {chart,tooltips}=harness(),container=new Element('div'),view=chart(container,'Polling',{crosshair:true});
 view.update(['14:35','14:40'],[[10,20]],['Total']);
 const svg=descendants(container,'svg')[0],dots=descendants(svg,'circle'),guide=descendants(svg,'line')[0];
 svg.onpointermove({clientX:100,clientY:50});
 assert.equal(guide.getAttribute('x1'),'100');assert.ok(dots[0].classes.has('is-hovered'));
 svg.onpointermove({clientX:580,clientY:50});
 assert.equal(guide.getAttribute('x1'),'580');assert.ok(dots[1].classes.has('is-hovered'));
 assert.equal(dots[0].classes.has('is-hovered'),false);assert.equal(tooltips.at(-1)[3],20);
 svg.onpointerleave();assert.equal(guide.style.display,'none');
 assert.equal(dots.some(dot=>dot.classes.has('is-hovered')),false);
 dots[0].onfocus();assert.ok(dots[0].classes.has('is-hovered'));
});

test('distinct source timestamps retain separate points when local clock labels repeat',()=>{
 const {chart}=harness(),container=new Element('div'),view=chart(container,'History');
 view.update(['11/01 01:30','11/01 01:30'],[[10,20]],['Total'],['11/01 06:30','11/01 07:30']);
 assert.equal(descendants(container,'circle').length,2);
});

test('dismissed hover cannot reappear on refresh or persist across total graphs',()=>{
 const {chart,tooltips,hideTooltip}=harness(),first=new Element('div'),second=new Element('div');
 const a=chart(first,'Calculated',{crosshair:true}),b=chart(second,'Polling',{crosshair:true});
 a.update(['14:35'],[[10]],['Total']);b.update(['14:35'],[[10]],['Total']);
 const svgA=descendants(first,'svg')[0],svgB=descendants(second,'svg')[0];
 svgA.onpointermove({clientX:100,clientY:50});
 svgB.onpointermove({clientX:100,clientY:50});
 assert.equal(descendants(svgA,'line')[0].style.display,'none');
 hideTooltip();
 assert.equal(descendants(svgB,'line')[0].style.display,'none');
 assert.equal(descendants(svgB,'circle')[0].classes.has('is-hovered'),false);
 const count=tooltips.length;
 a.update(['14:35','14:40'],[[10,20]],['Total']);
 b.update(['14:35','14:40'],[[10,20]],['Total']);
 assert.equal(tooltips.length,count);
 svgB.onpointermove({clientX:100,clientY:50});svgB.onpointercancel();
 b.update(['14:35','14:40','14:45'],[[10,20,30]],['Total']);
 assert.equal(tooltips.length,count+1);
});

test('public totals retain earlier scores when later images join and carry scores after images stop reporting',async()=>{
 const {totalImageHistory}=await import('../public/history.mjs');
 const chart={cols:[{label:'Time'},{label:'Windows'},{label:'Linux'}],rows:[
  {c:[{v:'14:35'},{v:10},{v:'20'}]},
  {c:[{v:'14:40'},{v:0},{v:0}]},
  {c:[{v:'14:45'},{v:20},{v:'null'}]},
  {c:[{v:'14:50'},{v:20}]},
  {c:[{v:'14:55'},{v:null},{v:'null'}]}
 ]};
 assert.deepEqual(totalImageHistory(chart),[30,0,20,20,20]);
 assert.deepEqual(totalImageHistory({cols:chart.cols,rows:[
  {c:[{v:'14:35'},{v:10},{v:null}]},
  {c:[{v:'14:40'},{v:20},{v:'null'}]},
  {c:[{v:'14:45'},{v:25},{v:15}]}
 ]}),[10,20,40]);
 assert.deepEqual(totalImageHistory({cols:[{label:'Time'}],rows:[{c:[{v:'14:35'}]}]}),[null]);
 assert.deepEqual(totalImageHistory({cols:chart.cols,rows:[
  {c:[{v:'14:30'},{v:null},{v:'null'}]},
  {c:[{v:'14:35'},{v:50},{v:10}]},
  {c:[{v:'14:40'},{v:null},{v:20}]},
  {c:[{v:'14:45'},{v:'null'},{v:25}]},
  {c:[{v:'14:50'},{v:0}]},
  {c:[{v:'14:55'},{v:null},{v:null}]}
 ]}),[null,60,70,75,25,25]);
});
