import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf(' function refreshCharacterProgress('),html.indexOf(" $('characterFormFields').addEventListener('change'"));
const handlerSource=html.slice(html.indexOf(" $('characterDetail').addEventListener('change'"),html.indexOf(" $('characterDetail').addEventListener('click'"));
function harness(){
  const summary={},points={},totals=[{},{}],progress=[{},{}];
  let change;
  const checkbox={checked:true},group={open:true},detail={scrollTop:1600,checkbox,group,addEventListener(name,fn){change=fn},
    querySelector(selector){return selector==='.level-summary'?summary:progress[selector.includes('"0"')?0:1]},
    querySelectorAll(selector){return selector==='[data-level-boss]'?[{dataset:{levelBoss:'overseer'},closest:()=>({querySelector:()=>points})}]:totals}
  };
  let fullRenders=0,saved=false,fail=false,confirm=true;
  const context={records:[{id:'c1',levelUnlocks:[],extNotes:[]}],selectedId:'c1',
    $:()=>detail,EXT_NOTES:[{mult:4,items:[{id:'0-1'},{id:'0-2'}]},{mult:2,items:[{id:'1-1'}]}],
    BOSS_LEVELS:{alpha:15,beta:10,gamma:5},bossTier:c=>c.levelBossTiers?.overseer||'alpha',
    getLevelTotal:c=>105+(c.levelUnlocks?.length?10:0),
    async writeRecord(){if(fail)throw Error('storage');saved=true},renderCharacters(){},renderDetail(){fullRenders++},toast(){}
  };
  runInNewContext(source,context);
  Object.assign(context,{selected:()=>context.records.find(c=>c.id===context.selectedId),levelRules:[{id:'overseer',type:'boss'}],
    checkedLevelIds:c=>c.levelUnlocks||[],bossRule:r=>r.type==='boss',window:{confirm:()=>confirm}});
  runInNewContext(handlerSource,context);
  return {context,detail,summary,points,totals,progress,change:event=>change(event),cancel(){confirm=false},get fullRenders(){return fullRenders},get saved(){return saved},fail(){fail=true}};
}
test('レベル・難易度とノート取得の保存では操作欄と展開状態・表示位置を維持して集計のみ更新',async()=>{
  const h=harness(),input=h.detail.checkbox,group=h.detail.group;
  const next={id:'c1',levelUnlocks:['overseer'],levelBossTiers:{overseer:'beta'},extNotes:['0-2']};
  assert.equal(await h.context.persistChange(next,{progressOnly:true}),true);
  assert.equal(h.saved,true);assert.equal(h.fullRenders,0);assert.equal(h.detail.scrollTop,1600);
  assert.equal(h.detail.checkbox,input);assert.equal(h.detail.group,group);assert.equal(group.open,true);
  assert.equal(h.summary.textContent,'現在の上限：Lv 115');assert.equal(h.points.textContent,'+10 Lv');
  assert.deepEqual(h.totals.map(n=>n.textContent),['0 / 1','1 / 2']);assert.match(h.progress[0].innerHTML,/1\/2/);
  await h.context.persistChange({...next,levelUnlocks:[],extNotes:[]},{progressOnly:true});
  assert.equal(h.summary.textContent,'現在の上限：Lv 105');assert.match(h.progress[0].innerHTML,/0\/2/);assert.equal(h.fullRenders,0);
});
test('保存失敗時は既存の記録と表示を維持し、別キャラへ移った後はその画面を書き換えない',async()=>{
  const h=harness();h.fail();
  assert.equal(await h.context.persistChange({id:'c1',levelUnlocks:['overseer']},{progressOnly:true}),false);
  assert.equal(h.context.records[0].levelUnlocks.length,0);assert.equal(h.summary.textContent,undefined);
  const moved=harness();moved.context.selectedId='c2';
  assert.equal(await moved.context.persistChange({id:'c1',extNotes:['0-1']},{progressOnly:true}),true);
  assert.equal(moved.summary.textContent,undefined);assert.equal(moved.fullRenders,0);
});

test('実際の変更ハンドラーもレベル・ノートのチェックと解除で画面全体を作り直さない',async()=>{
  const h=harness();
  function input(attribute,dataset){const control={checked:true,dataset,closest:selector=>selector===attribute?control:selector==='label'?{querySelector:()=>({textContent:'項目',firstChild:{textContent:'ノート'}})}:null};return control}
  const level=input('[data-level-id]',{levelId:'overseer'});
  await h.change({target:level});assert.deepEqual([...h.context.records[0].levelUnlocks],['overseer']);
  level.checked=false;await h.change({target:level});assert.equal(h.context.records[0].levelUnlocks.length,0);
  const note=input('[data-ext-note]',{extNote:'0-1'});
  await h.change({target:note});assert.match(h.progress[0].innerHTML,/1\/2/);
  note.checked=false;await h.change({target:note});assert.match(h.progress[0].innerHTML,/0\/2/);
  assert.equal(h.fullRenders,0);assert.equal(h.detail.scrollTop,1600);assert.equal(h.detail.group.open,true);
  level.checked=true;await h.change({target:level});h.cancel();level.checked=false;await h.change({target:level});
  assert.equal(level.checked,true);assert.equal(h.context.records[0].levelUnlocks.length,1);
});
