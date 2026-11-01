import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const helpers=html.slice(html.indexOf(' function registeredCharacterServer('),html.indexOf(' function renderServerSettings('));
const fieldSource=html.slice(html.indexOf(' function formField('),html.indexOf(' function formImageInner('));
const changeSource=html.slice(html.indexOf(" $('characterFormFields').addEventListener('change'"),html.indexOf(" $('settingsMap').innerHTML"));
const submitSource=html.slice(html.indexOf(" $('characterForm').addEventListener('submit'"),html.indexOf(' async function copyField('));
const plain=value=>JSON.parse(JSON.stringify(value));
function harness({map='アイランド',serverNo='5041',editingField='serverNo',withMap=false,servers}={}){
  const handlers={},nodes=new Map(),classes=new Set(),writes=[],messages=[];
  const choice={value:'manual'},number={value:serverNo,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)}}};
  const mapChoice=withMap?{value:'map:'+map}:null;
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{addEventListener(name,fn){handlers[id+':'+name]=fn},querySelector(selector){return({'#characterServerChoice':choice,'[name="serverNo"]':number,'#characterMapChoice':mapChoice})[selector]||null}});
    return nodes.get(id);
  };
  const original={id:'c1',map,serverNo,name:'既存のキャラ',appearance:'image',levelUnlocks:['overseer'],extNotes:['0-1']};
  const context={savedServers:servers??[{map:'アイランド',serverNo:'5041',memo:'拠点'},{map:'アベレーション',serverNo:'5777',memo:''},{map:'ジェネシス1(Ocean)',serverNo:'5041',memo:'別マップ'}],
    CHARACTER_MAPS:['アイランド','アベレーション','ジェネシス1(Ocean)','アップロード中'],
    $:node,selected:()=>original,editingField,records:[original],pendingFormImages:{appearance:'',implant:''},labels:{serverNo:'サーバー番号'},
    esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    async persistChange(record){writes.push(plain(record));return true},async writeRecord(record){writes.push(plain(record))},
    closeDialog(){},renderCharacters(){},showDetail(){},toast:message=>messages.push(message),generateId:()=> 'new-c',
    FormData:class{constructor(form){return Object.entries(form.values)}}
  };
  runInNewContext(helpers+fieldSource+changeSource+submitSource,context);
  return {context,choice,number,mapChoice,classes,writes,messages,original,
    change(id){handlers['characterFormFields:change']({target:{id,matches:()=>false}})},
    async submit(values){await handlers['characterForm:submit']({preventDefault(){},target:{values,querySelectorAll:()=>[]}})}
  };
}

test('番号の指定は自由入力と登録済みから選べ、同じ番号でもマップで区別する',()=>{
  const h=harness();
  const markup=h.context.characterServerNumberField('ジェネシス1(Ocean)','5041');
  assert.match(markup,/>自由入力</);assert.match(markup,/登録済みサーバー/);
  assert.match(markup,/<option value="preset:2" selected>ジェネシス1\(Ocean\)：5041 \(別マップ\)/);
  assert.doesNotMatch(h.context.characterServerNumberField('アイランド','9999'),/preset:\d+" selected/);
  assert.match(h.context.formField('serverNo','5041'),/<option value="preset:0" selected>/);
  assert.match(harness({editingField:null}).context.formField('serverNo'),/<option value="manual" selected>/);
  const unsafe=harness({servers:[{map:'<img>',serverNo:'" onfocus="x',memo:'<script>'}]}).context.characterServerNumberField();
  assert.doesNotMatch(unsafe,/<img>|<script>|" onfocus=/);
});

test('登録済み選択でマップと番号を連動し、自由入力への切替後の値を上書きしない',async()=>{
  const h=harness({withMap:true});h.choice.value='preset:1';h.change('characterServerChoice');
  assert.equal(h.mapChoice.value,'preset:1');assert.equal(h.number.value,'5777');assert.equal(h.number.disabled,true);assert.equal(h.classes.has('hidden'),true);
  h.choice.value='manual';h.change('characterServerChoice');
  assert.equal(h.mapChoice.value,'map:アベレーション');assert.equal(h.number.value,'5777');assert.equal(h.number.disabled,false);assert.equal(h.classes.has('hidden'),false);
  h.number.value='任意-6000';await h.submit({mapChoice:h.mapChoice.value,serverChoice:'manual',serverNo:h.number.value});
  assert.equal(h.writes[0].map,'アベレーション');assert.equal(h.writes[0].serverNo,'任意-6000');
  assert.deepEqual(h.writes[0].levelUnlocks,h.original.levelUnlocks);assert.deepEqual(h.writes[0].extNotes,h.original.extNotes);
});

test('番号だけの編集でも登録済みのマップと番号を保存し、他の記録は保持する',async()=>{
  const h=harness();h.choice.value='preset:1';h.change('characterServerChoice');
  await h.submit({serverChoice:'preset:1'});
  assert.deepEqual(h.writes[0],{...h.original,map:'アベレーション',serverNo:'5777'});
  assert.equal(h.writes[0].serverChoice,undefined);
  const manual=harness();await manual.submit({serverChoice:'manual',serverNo:'  7777  '});
  assert.deepEqual(manual.writes[0],{...manual.original,serverNo:'7777'});
});

test('新規追加でも登録済みと自由入力の双方を保存し、古いマップ選択と競合させない',async()=>{
  for(const [values,map,serverNo] of [
    [{mapChoice:'map:アイランド',serverChoice:'preset:1'},'アベレーション','5777'],
    [{mapChoice:'preset:0',serverChoice:'manual',serverNo:'6000'},'アイランド','6000'],
    [{mapChoice:'',serverChoice:'manual',serverNo:''},undefined,'']
  ]){
    const h=harness({editingField:null});await h.submit({name:'新しいキャラ',...values});
    assert.equal(h.writes[0].map,map);assert.equal(h.writes[0].serverNo,serverNo);
    assert.equal(h.writes[0].mapChoice,undefined);assert.equal(h.writes[0].serverChoice,undefined);
  }
});

test('アップロード中と通常マップを往復しても入力制限が残らず、不正な登録選択は保存しない',async()=>{
  const h=harness({withMap:true});h.mapChoice.value='map:アップロード中';h.change('characterMapChoice');
  assert.equal(h.choice.disabled,true);assert.equal(h.number.value,'-');assert.equal(h.number.readOnly,true);
  h.mapChoice.value='preset:1';h.change('characterMapChoice');
  assert.equal(h.choice.disabled,false);assert.equal(h.number.readOnly,false);assert.equal(h.choice.value,'preset:1');
  assert.deepEqual(plain(h.context.resolveCharacterServerValues({mapChoice:'map:アップロード中',serverNo:'123'})),{map:'アップロード中',serverNo:'-'});
  for(const invalid of ['preset:999','preset:','preset:-1','invalid']){
    await h.submit({serverChoice:invalid});assert.equal(h.writes.length,0);
  }
  assert.ok(h.messages.every(message=>message.includes('再選択')));
});
