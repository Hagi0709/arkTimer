(() => {
 'use strict';
 const data=window.ARKSurvivorXPData,$=id=>document.getElementById(id);
 const maximum=data.cumulativeXP.length;
 const format=value=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:0}).format(value);
 function boundedLevel(value){
  if(!Number.isFinite(value))throw Error('レベルは0〜'+maximum+'の整数で入力してください。');
  return Math.min(maximum,Math.max(0,value));
 }
 function calculate(start,target){
  start=boundedLevel(start);target=boundedLevel(target);
  for(const value of [start,target])if(!Number.isInteger(value))throw Error('レベルは0〜'+maximum+'の整数で入力してください。');
  if(target<start)throw Error('目標レベルは開始レベル以上で入力してください。');
  const xpAt=level=>level===0?0:data.cumulativeXP[level-1],startXP=xpAt(start),targetXP=xpAt(target),rows=[];
  for(let level=start+1;level<=target;level++)rows.push({level,xp:xpAt(level)-xpAt(level-1),total:xpAt(level)-startXP});
  return{start,target,startXP,targetXP,needed:targetXP-startXP,rows};
 }
 window.ARKSurvivorXP=Object.freeze({calculate,maximum});
 const form=$('survivorXpForm');if(!form)return;
 const start=$('survivorXpStart'),target=$('survivorXpTarget');
 for(const input of [start,target]){input.min='0';input.max=String(maximum)}
 function inputLevel(input){
  if(input.value==='')return NaN;
  const value=Number(input.value);if(!Number.isFinite(value))return value;
  const level=boundedLevel(value);if(level!==value)input.value=String(level);return level;
 }
 const chart=$('survivorXpChart');let chartResult=null,chartWidth=0;
 function svgElement(tag,attributes={},text){
  const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value]of Object.entries(attributes))element.setAttribute(name,String(value));
  if(text!==undefined)element.textContent=text;return element;
 }
 function drawChart(result){
  chartResult=result;chart.replaceChildren();
  const width=Math.max(240,Math.round(chart.clientWidth||600)),height=width<460?230:285;chartWidth=width;
  chart.setAttribute('viewBox','0 0 '+width+' '+height);chart.setAttribute('width',width);chart.setAttribute('height',height);
  const left=42,right=width-14,top=24,bottom=height-36,ceiling=Math.ceil(data.cumulativeXP.at(-1)/2000000000)*2000000000;
  const x=level=>left+(right-left)*level/maximum,y=xp=>bottom-(bottom-top)*xp/ceiling;
  const points=Array.from({length:maximum+1},(_,level)=>({level,xp:level===0?0:data.cumulativeXP[level-1]}));
  const path=items=>items.map((point,index)=>(index?'L':'M')+x(point.level).toFixed(2)+','+y(point.xp).toFixed(2)).join(' ');
  chart.appendChild(svgElement('title',{id:'survivorXpChartTitle'},'Lv0〜245の累計経験値'));
  chart.appendChild(svgElement('desc',{id:'survivorXpChartDescription'},result?'開始Lv'+result.start+'（'+format(result.startXP)+'XP）から目標Lv'+result.target+'（'+format(result.targetXP)+'XP）を強調。必要経験値は'+format(result.needed)+'XP。':'横軸はLv0〜245、縦軸は累計経験値。'));
  const defs=svgElement('defs');
  for(const [id,color,opacity]of [['xpChartArea','#5799ca',.2],['xpChartRange','#69eedb',.4],['xpChartBand','#69eedb',.12]]){
   const gradient=svgElement('linearGradient',{id,x1:0,y1:0,x2:0,y2:1});gradient.appendChild(svgElement('stop',{offset:'0%','stop-color':color,'stop-opacity':opacity}));gradient.appendChild(svgElement('stop',{offset:'100%','stop-color':color,'stop-opacity':.015}));defs.appendChild(gradient);
  }
  const glow=svgElement('filter',{id:'xpChartGlow',filterUnits:'userSpaceOnUse',x:0,y:0,width,height});glow.appendChild(svgElement('feDropShadow',{dx:0,dy:0,stdDeviation:3,'flood-color':'#69eedb','flood-opacity':.55}));defs.appendChild(glow);chart.appendChild(defs);
  const label=(text,px,py,anchor='start')=>chart.appendChild(svgElement('text',{x:px,y:py,fill:'#91a9bc','font-size':11,'font-family':'system-ui,sans-serif','text-anchor':anchor},text));
  label('累計XP',left,12);
  for(let step=0;step<=4;step++){
   const xp=ceiling*step/4,py=y(xp);chart.appendChild(svgElement('line',{x1:left,y1:py,x2:right,y2:py,stroke:'#afcfe5','stroke-opacity':step===0?.2:.09,'stroke-dasharray':step===0?'none':'3 5'}));label(xp===0?'0':format(xp/100000000)+'億',left-7,py+4,'end');
  }
  for(const level of [0,50,100,150,200,maximum]){
   const px=x(level);chart.appendChild(svgElement('line',{x1:px,y1:top,x2:px,y2:bottom,stroke:'#afcfe5','stroke-opacity':.055}));label(String(level),px,bottom+18,level===0?'start':level===maximum?'end':'middle');
  }
  label('レベル',right,height-2,'end');
  const full=path(points);chart.appendChild(svgElement('path',{id:'xpChartFullArea',d:full+' L'+right+','+bottom+' L'+left+','+bottom+' Z',fill:'url(#xpChartArea)'}));
  if(result){
   const selected=points.slice(result.start,result.target+1),startX=x(result.start),targetX=x(result.target);
   const group=svgElement('g',{id:'xpChartSelection','data-start':result.start,'data-target':result.target});
   group.appendChild(svgElement('rect',{x:startX,y:top,width:targetX-startX,height:bottom-top,fill:'url(#xpChartBand)'}));
   group.appendChild(svgElement('path',{d:path(selected)+' L'+targetX+','+bottom+' L'+startX+','+bottom+' Z',fill:'url(#xpChartRange)'}));chart.appendChild(group);
  }
  chart.appendChild(svgElement('path',{id:'xpChartFullCurve',d:full,fill:'none',stroke:'#55748e','stroke-width':2,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));
  if(result){
   chart.appendChild(svgElement('path',{id:'xpChartSelectedCurve',d:path(points.slice(result.start,result.target+1)),fill:'none',stroke:'#69eedb','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round',filter:'url(#xpChartGlow)','vector-effect':'non-scaling-stroke'}));
   for(const [kind,level,xp,color]of [['Start',result.start,result.startXP,'#67bbff'],['Target',result.target,result.targetXP,'#69eedb']]){
    const px=x(level),py=y(xp);chart.appendChild(svgElement('line',{x1:px,y1:top,x2:px,y2:bottom,stroke:color,'stroke-opacity':.45,'stroke-dasharray':'3 4'}));
    const marker=svgElement('g',{id:'xpChart'+kind+'Marker','data-level':level,'data-xp':xp});marker.appendChild(svgElement('title',{},'Lv'+level+'：'+format(xp)+'XP'));
    marker.appendChild(svgElement('circle',{cx:px,cy:py,r:kind==='Start'?6:4,fill:'#0d2131',stroke:color,'stroke-width':2}));chart.appendChild(marker);
   }
  }
  $('survivorXpChartStart').textContent=result?'Lv '+result.start:'—';$('survivorXpChartTarget').textContent=result?'Lv '+result.target:'—';
 }
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{const width=Math.max(240,Math.round(chart.clientWidth||600));if(width!==chartWidth)drawChart(chartResult)}).observe(chart);
 function render(){
  const error=$('survivorXpError'),rows=$('survivorXpRows');rows.replaceChildren();
  try{
   const result=calculate(inputLevel(start),inputLevel(target));
   error.classList.add('hidden');error.textContent='';start.removeAttribute('aria-invalid');target.removeAttribute('aria-invalid');
   $('survivorXpNeeded').textContent=format(result.needed);$('survivorXpRange').textContent='Lv '+result.start+' → Lv '+result.target+'（'+(result.target-result.start)+'レベル分）';
   $('survivorXpStartTotal').textContent=format(result.startXP)+' XP';$('survivorXpTargetTotal').textContent=format(result.targetXP)+' XP';
   $('survivorXpBreakdown').classList.toggle('hidden',!result.rows.length);
   drawChart(result);
   for(const row of result.rows){const tr=document.createElement('tr');for(const value of ['Lv '+row.level,format(row.xp),format(row.total)]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}rows.appendChild(tr)}
  }catch(reason){
   error.textContent=reason.message;error.classList.remove('hidden');
   for(const input of [start,target]){const value=Number(input.value);if(input.value===''||!Number.isInteger(value)||value<0||value>maximum||input===target&&value<Number(start.value))input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid')}
   for(const id of ['survivorXpNeeded','survivorXpRange','survivorXpStartTotal','survivorXpTargetTotal'])$(id).textContent='—';$('survivorXpBreakdown').classList.add('hidden');
   drawChart(null);
  }
 }
 form.addEventListener('input',render);form.addEventListener('change',render);form.addEventListener('submit',event=>{event.preventDefault();render()});
 $('openSurvivorXp').addEventListener('click',()=>{$('toolsListView').classList.add('hidden');$('survivorXpView').classList.remove('hidden');render();window.scrollTo(0,0);$('survivorXpTitle').focus({preventScroll:true})});
 $('backToTools').addEventListener('click',()=>{$('survivorXpView').classList.add('hidden');$('toolsListView').classList.remove('hidden');window.scrollTo(0,0);$('openSurvivorXp').focus({preventScroll:true})});
 render();
})();
