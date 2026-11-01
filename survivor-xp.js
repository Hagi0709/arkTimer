(() => {
 'use strict';
 const data=window.ARKSurvivorXPData,$=id=>document.getElementById(id);
 const maximum=data.cumulativeXP.length;
 const format=value=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:0}).format(value);
 function calculate(start,target){
  for(const value of [start,target])if(!Number.isInteger(value)||value<1||value>maximum)throw Error('レベルは1〜'+maximum+'の整数で入力してください。');
  if(target<start)throw Error('目標レベルは開始レベル以上で入力してください。');
  const totals=data.cumulativeXP,startXP=totals[start-1],targetXP=totals[target-1],rows=[];
  for(let level=start+1;level<=target;level++)rows.push({level,xp:totals[level-1]-totals[level-2],total:totals[level-1]-startXP});
  return{start,target,startXP,targetXP,needed:targetXP-startXP,rows};
 }
 window.ARKSurvivorXP=Object.freeze({calculate,maximum});
 const form=$('survivorXpForm');if(!form)return;
 const start=$('survivorXpStart'),target=$('survivorXpTarget');
 for(const input of [start,target])input.max=String(maximum);
 function render(){
  const error=$('survivorXpError'),rows=$('survivorXpRows');rows.replaceChildren();
  try{
   const result=calculate(start.value===''?NaN:Number(start.value),target.value===''?NaN:Number(target.value));
   error.classList.add('hidden');error.textContent='';start.removeAttribute('aria-invalid');target.removeAttribute('aria-invalid');
   $('survivorXpNeeded').textContent=format(result.needed);$('survivorXpRange').textContent='Lv '+result.start+' → Lv '+result.target+'（'+(result.target-result.start)+'レベル分）';
   $('survivorXpStartTotal').textContent=format(result.startXP)+' XP';$('survivorXpTargetTotal').textContent=format(result.targetXP)+' XP';
   $('survivorXpBreakdown').classList.toggle('hidden',!result.rows.length);
   for(const row of result.rows){const tr=document.createElement('tr');for(const value of ['Lv '+row.level,format(row.xp),format(row.total)]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}rows.appendChild(tr)}
  }catch(reason){
   error.textContent=reason.message;error.classList.remove('hidden');
   for(const input of [start,target]){const value=Number(input.value);if(input.value===''||!Number.isInteger(value)||value<1||value>maximum||input===target&&value<Number(start.value))input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid')}
   for(const id of ['survivorXpNeeded','survivorXpRange','survivorXpStartTotal','survivorXpTargetTotal'])$(id).textContent='—';$('survivorXpBreakdown').classList.add('hidden');
  }
 }
 form.addEventListener('input',render);form.addEventListener('change',render);form.addEventListener('submit',event=>{event.preventDefault();render()});
 $('openSurvivorXp').addEventListener('click',()=>{$('toolsListView').classList.add('hidden');$('survivorXpView').classList.remove('hidden');render();window.scrollTo(0,0);$('survivorXpTitle').focus({preventScroll:true})});
 $('backToTools').addEventListener('click',()=>{$('survivorXpView').classList.add('hidden');$('toolsListView').classList.remove('hidden');window.scrollTo(0,0);$('openSurvivorXp').focus({preventScroll:true})});
 render();
})();
