import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync('install-guide.js','utf8');
const KEY='arkManager_install_guide_dismissed_v1';
const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
function harness({ua=safari,platform='iPhone',touch=1,standalone=false,displayStandalone=false,storage=new Map(),failRead=false,failWrite=false}={}){
  const nodes=new Map();
  function node(id){
    if(!nodes.has(id)){
      const events=new Map();
      nodes.set(id,{open:false,addEventListener(name,callback){events.set(name,callback)},
        showModal(){this.open=true},close(){this.open=false;events.get('close')?.()},click(){events.get('click')?.()}});
    }return nodes.get(id);
  }
  const body={style:{overflow:'auto'}},window={matchMedia:()=>({matches:displayStandalone})};
  runInContext(source,createContext({window,navigator:{userAgent:ua,platform,maxTouchPoints:touch,standalone},
    document:{getElementById:node,body},localStorage:{getItem(key){if(failRead)throw Error('blocked');return storage.get(key)??null},
      setItem(key,value){if(failWrite)throw Error('full');storage.set(key,value)}}}));
  return{node,body,window,storage,dialog:node('homeScreenGuide')};
}

test('iPhoneのSafariで初回表示し、背景スクロールを止める',()=>{
  const h=harness();assert.equal(h.dialog.open,true);assert.equal(h.body.style.overflow,'hidden');
});

test('ホーム画面WebアプリではSafariのUAでも表示しない',()=>{
  for(const flags of [{standalone:true},{displayStandalone:true}])assert.equal(harness(flags).dialog.open,false);
});

test('iPadのデスクトップ表示も案内し、PC・Android・iOSの他ブラウザーは自動表示しない',()=>{
  const macSafari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
  assert.equal(harness({ua:macSafari,platform:'MacIntel',touch:5}).dialog.open,true);
  for(const config of [{ua:macSafari,platform:'MacIntel',touch:0},{ua:safari.replace('Version/18.0','CriOS/130.0')},
    {ua:safari.replace('Version/18.0','FxiOS/130.0')},{ua:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'},
    {ua:safari.replace('Version/18.0 ','')+' [FBAN/FBIOS]'}])assert.equal(harness(config).dialog.open,false);
});

test('今後表示しないは閉じて再起動後も抑止し、既存データを維持',()=>{
  const storage=new Map([['arkTimer_store_v8','existing timers']]),h=harness({storage});
  h.node('homeScreenGuideNever').click();assert.equal(h.dialog.open,false);assert.equal(h.body.style.overflow,'auto');
  assert.equal(storage.get(KEY),'1');assert.equal(storage.get('arkTimer_store_v8'),'existing timers');
  assert.equal(harness({storage}).dialog.open,false);
});

test('あとで・閉じるは次回のSafari起動時に再表示できる',()=>{
  for(const id of ['homeScreenGuideLater','closeHomeScreenGuide']){
    const h=harness();h.node(id).click();assert.equal(h.dialog.open,false);assert.equal(h.storage.has(KEY),false);
    assert.equal(h.body.style.overflow,'auto');assert.equal(harness({storage:h.storage}).dialog.open,true);
  }
});

test('ストレージが使えない場合も案内を閉じてアプリを操作できる',()=>{
  const h=harness({failRead:true,failWrite:true});assert.equal(h.dialog.open,true);
  assert.doesNotThrow(()=>h.node('homeScreenGuideNever').click());assert.equal(h.dialog.open,false);assert.equal(h.body.style.overflow,'auto');
});

test('ブラウザーのダイアログ終了でも元のスクロール状態へ戻る',()=>{
  const h=harness();h.dialog.close();assert.equal(h.body.style.overflow,'auto');
  assert.equal(h.storage.has(KEY),false);
});
