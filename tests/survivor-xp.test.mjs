import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8'),dataSource=readFileSync('survivor-xp-data.js','utf8'),clientSource=readFileSync('survivor-xp.js','utf8');
function harness(){
 const nodes=new Map(),window={scrollTo(){}},node=id=>{
  if(!nodes.has(id)){const classes=new Set(),events={};nodes.set(id,{value:({'survivorXpStart':'1','survivorXpTarget':'105'})[id]??'',children:[],
   classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,on){on?classes.add(name):classes.delete(name)}},
   setAttribute(name,value){this[name]=value},removeAttribute(name){delete this[name]},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},
   addEventListener(name,fn){events[name]=fn},emit(name,event={}){events[name]?.(event)},focus(){this.focused=true}
  })}return nodes.get(id);
 };
 let resize;const context={window,document:{getElementById:node,createElement:()=>node('new-'+nodes.size),createElementNS:(_,tag)=>{const element=node('new-'+nodes.size);element.tagName=tag;return element}},ResizeObserver:class{constructor(fn){resize=fn}observe(){}}};
 runInNewContext(dataSource+clientSource,context);return{window,node,calculate:window.ARKSurvivorXP.calculate,resize:()=>resize()};
}
test('開始レベルから目標レベルの必要経験値を累計値の差で算出する',()=>{
 const h=harness();assert.equal(h.calculate(1,2).needed,5);assert.equal(h.calculate(1,105).needed,4098538);assert.equal(h.calculate(100,105).needed,2300000);
 assert.equal(h.calculate(105,105).needed,0);assert.equal(h.calculate(105,106).needed,110000);
 assert.equal(h.calculate(1,245).needed,7975037952);assert.equal(h.calculate(220,245).needed,3021372928);assert.equal(h.calculate(244,245).needed,150425600);
 assert.equal(h.calculate(151,152).needed,32);assert.equal(h.calculate(212,213).needed,84974336);
});
test('貼り付けられた245行の累計XPを全件そのまま使い、0始まりの番号をレベルと混同しない',()=>{
 const h=harness(),rows=readFileSync('data/survivor-xp.tsv','utf8').trim().split(/\r?\n/).map(row=>row.split('\t').map(Number));
 assert.equal(rows.length,245);assert.equal(h.window.ARKSurvivorXP.maximum,245);
 for(const [index,level,xp] of rows){assert.equal(index+1,level);assert.equal(h.calculate(1,level).targetXP,xp)}
 assert.equal(h.calculate(1,66).targetXP,27499);assert.equal(h.calculate(1,124).targetXP,10073538);assert.equal(h.calculate(1,216).targetXP,4590253568);
 assert.ok(Object.isFrozen(h.window.ARKSurvivorXPData.cumulativeXP));
});
test('全範囲で単調な累計値を使い、レベルごとの内訳も結果と一致する',()=>{
 const h=harness(),table=h.window.ARKSurvivorXPData.cumulativeXP;assert.equal(table.length,h.window.ARKSurvivorXP.maximum);assert.equal(table[0],0);assert.ok(table.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&(i===0||v>table[i-1])));
 const result=h.calculate(1,table.length);assert.equal(result.needed,table.at(-1));assert.equal(result.rows.length,table.length-1);assert.equal(result.rows.at(-1).total,result.needed);
 assert.equal(result.rows.reduce((total,row)=>total+row.xp,0),7975037952);
 for(const row of result.rows)assert.equal(row.total,h.calculate(1,row.level).needed);
});
test('未入力・小数レベル・目標が開始未満の場合に結果を出さない',()=>{
 const h=harness();for(const [start,target] of [[NaN,105],[1.5,105],[105,100],[1,Infinity]])assert.throws(()=>h.calculate(start,target));
 h.node('survivorXpStart').value='';h.node('survivorXpForm').emit('input');assert.equal(h.node('survivorXpNeeded').textContent,'—');assert.equal(h.node('survivorXpError').classList.contains('hidden'),false);assert.equal(h.node('survivorXpStart')['aria-invalid'],'true');
 h.node('survivorXpStart').value='100';h.node('survivorXpForm').emit('input');assert.equal(h.node('survivorXpNeeded').textContent,'2,300,000');assert.equal(h.node('survivorXpError').classList.contains('hidden'),true);assert.equal(h.node('survivorXpStart')['aria-invalid'],undefined);
});
test('開始・目標の0以下を0、246以上を245へ補正し、0からの内訳も計算できる',()=>{
 const h=harness(),result=h.calculate(-10,999);
 assert.equal(result.start,0);assert.equal(result.target,245);assert.equal(result.needed,7975037952);assert.equal(result.startXP,0);assert.equal(result.rows[0].level,1);assert.equal(result.rows[0].xp,0);
 assert.equal(result.rows.reduce((sum,row)=>sum+row.xp,0),result.needed);assert.equal(h.calculate(0,0).needed,0);assert.equal(h.calculate(-2,-1).needed,0);
 assert.equal(h.calculate(0,1).needed,0);assert.equal(h.calculate(246,999).needed,0);
 h.node('survivorXpStart').value='-10';h.node('survivorXpTarget').value='246';h.node('survivorXpForm').emit('input');
 assert.equal(h.node('survivorXpStart').value,'0');assert.equal(h.node('survivorXpTarget').value,'245');assert.equal(h.node('survivorXpNeeded').textContent,'7,975,037,952');assert.equal(h.node('survivorXpError').classList.contains('hidden'),true);
 h.node('survivorXpTarget').value='-1';h.node('survivorXpForm').emit('change');assert.equal(h.node('survivorXpTarget').value,'0');assert.equal(h.node('survivorXpNeeded').textContent,'0');
 h.node('survivorXpStart').value='999';h.node('survivorXpTarget').value='245';h.node('survivorXpForm').emit('change');assert.equal(h.node('survivorXpStart').value,'245');assert.equal(h.node('survivorXpNeeded').textContent,'0');
});
test('入力の変更で再計算し、ツール一覧と詳細を往復しても入力値を維持する',()=>{
 const h=harness();h.node('openSurvivorXp').emit('click');assert.equal(h.node('toolsListView').classList.contains('hidden'),true);assert.equal(h.node('survivorXpView').classList.contains('hidden'),false);
 h.node('survivorXpStart').value='220';h.node('survivorXpTarget').value='245';h.node('survivorXpForm').emit('change');assert.equal(h.node('survivorXpNeeded').textContent,'3,021,372,928');
 h.node('backToTools').emit('click');assert.equal(h.node('survivorXpView').classList.contains('hidden'),true);assert.equal(h.node('toolsListView').classList.contains('hidden'),false);
 h.node('openSurvivorXp').emit('click');assert.equal(h.node('survivorXpStart').value,'220');assert.equal(h.node('survivorXpNeeded').textContent,'3,021,372,928');
});
const chartNode=(h,id)=>{
 function find(node){if(node.id===id)return node;for(const child of node.children){const found=find(child);if(found)return found}}
 return find(h.node('survivorXpChart'));
};
test('全246点の曲線上で指定範囲と端点のレベル・累計XPを強調し、0と245も範囲内に描く',()=>{
 const h=harness(),full=chartNode(h,'xpChartFullCurve').d;assert.equal(full.split(' ').length,246);
 h.node('survivorXpStart').value='220';h.node('survivorXpTarget').value='245';h.node('survivorXpForm').emit('input');
 const selection=chartNode(h,'xpChartSelection'),target=chartNode(h,'xpChartTargetMarker');
 assert.equal(selection['data-start'],'220');assert.equal(selection['data-target'],'245');assert.equal(target['data-xp'],'7975037952');assert.equal(target['data-level'],'245');
 assert.equal(chartNode(h,'xpChartFullCurve').d,full);assert.equal(h.node('survivorXpChartTarget').textContent,'Lv 245');
 const endCircle=target.children.find(child=>child.tagName==='circle');assert.equal(Number(endCircle.cx),586);assert.ok(Number(endCircle.cy)>=24&&Number(endCircle.cy)<25);
 h.node('survivorXpStart').value='-5';h.node('survivorXpTarget').value='999';h.node('survivorXpForm').emit('change');
 assert.equal(chartNode(h,'xpChartSelection')['data-start'],'0');assert.equal(chartNode(h,'xpChartSelection')['data-target'],'245');assert.equal(chartNode(h,'xpChartStartMarker')['data-xp'],'0');
 h.node('survivorXpTarget').value='0';h.node('survivorXpForm').emit('input');assert.equal(chartNode(h,'xpChartSelection')['data-target'],'0');assert.doesNotMatch(chartNode(h,'xpChartSelectedCurve').d,/NaN|undefined|Infinity/);
});
test('不正入力では古い指定範囲を消し、全体曲線を表示し続ける',()=>{
 const h=harness(),full=chartNode(h,'xpChartFullCurve').d;h.node('survivorXpStart').value='';h.node('survivorXpForm').emit('input');
 assert.equal(chartNode(h,'xpChartSelection'),undefined);assert.equal(chartNode(h,'xpChartStartMarker'),undefined);assert.equal(chartNode(h,'xpChartFullCurve').d,full);assert.equal(h.node('survivorXpChartStart').textContent,'—');
 h.node('survivorXpStart').value='100';h.node('survivorXpTarget').value='50';h.node('survivorXpForm').emit('input');assert.equal(chartNode(h,'xpChartSelection'),undefined);
});
test('画面幅の変更に合わせてグラフを再描画し、指定範囲と固定の全体スケールを維持する',()=>{
 const h=harness(),svg=h.node('survivorXpChart');h.node('survivorXpStart').value='100';h.node('survivorXpTarget').value='220';h.node('survivorXpForm').emit('input');
 svg.clientWidth=280;h.resize();assert.equal(svg.viewBox,'0 0 280 230');assert.equal(chartNode(h,'xpChartSelection')['data-start'],'100');assert.equal(chartNode(h,'xpChartSelection')['data-target'],'220');
 const point=chartNode(h,'xpChartTargetMarker').children.find(child=>child.tagName==='circle');assert.ok(Number(point.cx)>=42&&Number(point.cx)<=266);assert.ok(Number(point.cy)>=24&&Number(point.cy)<=194);
 assert.doesNotMatch(chartNode(h,'xpChartFullCurve').d,/NaN|undefined|Infinity/);svg.clientWidth=600;h.resize();assert.equal(svg.viewBox,'0 0 600 285');
});
test('3つのタブは対応する画面と追加ボタンを切り替え、キーボードで循環する',()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{classList:{toggle(name,on){on?classes.add(name):classes.delete(name)},contains:name=>classes.has(name)},setAttribute(name,value){this[name]=value},click(){context.switchTab(({timerTab:'timers',characterTab:'characters',toolsTab:'tools'})[id])},focus(){}})}return nodes.get(id)};
 const tabs=['timerTab','characterTab','toolsTab'].map(node),events={};
 const context={$:node,closeModal(){},closeDialog(){},selectedId:null,window:{scrollTo(){}},document:{activeElement:tabs[0],querySelector:()=>({setAttribute(){},addEventListener:(name,fn)=>events[name]=fn}),querySelectorAll:()=>tabs}};
 runInNewContext(html.slice(html.indexOf(' function switchTab('),html.indexOf(' function formField(')),context);
 for(const [tab,page,button]of[['tools','toolsPage',null],['characters','characterPage','addCharacter'],['timers','timerPage','add']]){
  context.switchTab(tab);for(const id of ['timerPage','characterPage','toolsPage'])assert.equal(node(id).classList.contains('hidden'),id!==page);for(const id of ['add','addCharacter'])assert.equal(node(id).classList.contains('hidden'),id!==button);
 }
 runInNewContext(html.slice(html.indexOf(" document.querySelector('.manager-tabs').setAttribute('role','tablist')"),html.indexOf(" $('closeCharacterDialog').addEventListener")),context);
 context.document.activeElement=tabs[1];events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(node('toolsTab')['aria-selected'],'true');
 context.document.activeElement=tabs[2];events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(node('timerTab')['aria-selected'],'true');
 context.document.activeElement=tabs[0];events.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(node('toolsTab')['aria-selected'],'true');
 assert.equal(existsSync('tool-survivor-xp.png'),true);
});
