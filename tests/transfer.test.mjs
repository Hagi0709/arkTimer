import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';

const window = {};
runInNewContext(readFileSync('data-transfer.js', 'utf8'), { window, TextEncoder });
const api = window.ARKTransfer;
const plain = value => JSON.parse(JSON.stringify(value));
const picture = 'data:image/png;base64,aW1hZ2U=';
function fixture() {
  return {
    characters: [{ id: 'character_1', name: 'サバイバー', appearance: picture, implant: picture, level: '210',
      levelUnlocks: ['overseer'], levelBossTiers: { overseer: 'beta' }, extNotes: ['0-1'],
      tribeByMap: { '["アイランド","5041"]': true }, sortOrder: 3 }],
    timers: [{ id: 'timer_1', timerName: '拠点', type: 'building', material: 'TEK', map: 'アイランド',
      imageMode: 'custom', imageSrc: picture, startedAt: 1800000000000, endsAt: 1800007200000, sortOrder: 7 }],
    servers: [{ map: 'アイランド', serverNo: '5041', memo: 'メイン' }],
    levelRules: [{ id: 'overseer', type: 'boss', name: '監督者', points: 15 }], sortMode: 'manual',
    notificationSettings: { enabled: true, days: [0,1], hours: [1,2] }, hasNotificationSettings: true,
    token: 'private-device-token', subscription: { endpoint: 'private-subscription' }
  };
}
function empty() {
  return { characters: [], timers: [], servers: [], levelRules: [], sortMode: 'dueSoon',
    notificationSettings: { enabled: false, days: [1], hours: [] }, hasNotificationSettings: false };
}
const storage = () => {
  const map = new Map([['unrelated', 'keep'],['arkManager_push_device_token_v1','existing-token']]);
  return { map, getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,value), removeItem: key => map.delete(key) };
};
async function database() {
  const indexedDB = new IDBFactory();
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('arkManager_characters_v1',1);
    request.onupgradeneeded = () => request.result.createObjectStore('characters',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function records(db) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction('characters','readonly'), request = tx.objectStore('characters').getAll();
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error);
  });
}

test('画像・ノート・トライブ・期限を完全に書き出し、端末固有情報は含めない', () => {
  const source = fixture(), serialized = JSON.stringify(api.createBackup(source));
  const backup = api.parse('\uFEFF' + serialized);
  assert.deepEqual(plain(backup.data.characters), source.characters);
  assert.deepEqual(plain(backup.data.timers), source.timers);
  assert.deepEqual(plain(backup.data.notificationSettings), { days: [0,1], hours: [1,2] });
  assert.doesNotMatch(serialized, /private-|subscription|"enabled"|token/);
});

test('新規端末には画像と期限を保って追加し、通知は勝手に有効化しない', () => {
  const next = api.plan(empty(), api.createBackup(fixture()));
  assert.equal(next.characters[0].appearance, picture);
  assert.equal(next.timers[0].endsAt, fixture().timers[0].endsAt);
  assert.equal(next.data.notificationSettings.enabled, false);
  assert.deepEqual(plain(next.data.notificationSettings.hours), [1,2]);
  assert.equal(next.data.sortMode, 'manual');
});
test('自由入力の種類名と9999日のタイマーをそのまま引き継ぐ',()=>{
  const source=fixture();source.timers[0]={...source.timers[0],type:'other',customType:'食料補充',endsAt:source.timers[0].startedAt+9999*86400000};
  const next=api.plan(empty(),api.parse(JSON.stringify(api.createBackup(source))));
  assert.equal(next.timers[0].customType,'食料補充');assert.equal(next.timers[0].endsAt,source.timers[0].endsAt);
  const bad=api.createBackup(source);bad.data.timers[0].customType={};assert.throws(()=>api.parse(JSON.stringify(bad)));
});

test('座標が空の手動ピンも書き出し・読み込みで同じ位置を保持', () => {
  const source=fixture();source.timers[0]={...source.timers[0],lat:'',lng:'',manualPin:{left:0,top:75.5}};
  const backup=api.parse(JSON.stringify(api.createBackup(source))),next=api.plan(empty(),backup);
  assert.deepEqual(plain(next.timers[0].manualPin),{left:0,top:75.5});assert.equal(next.timers[0].lat,'');assert.equal(next.timers[0].lng,'');
  for(const manualPin of [{left:101,top:10},{left:10,top:-1},{left:'10',top:10},[]]){
    const bad=plain(backup);bad.data.timers[0].manualPin=manualPin;assert.throws(()=>api.parse(JSON.stringify(bad)));
  }
});

test('同じファイルの繰り返し読み込みで重複せず既存編集・通知設定を保持', () => {
  const current = fixture();
  current.characters[0].name = 'この端末で編集';
  current.notificationSettings.hours = [3];
  const next = api.plan(current, api.createBackup(fixture()));
  assert.deepEqual(plain(next.counts), { characters: 0, timers: 0, skipped: 2 });
  assert.equal(next.data.characters[0].name, 'この端末で編集');
  assert.deepEqual(next.data.notificationSettings.hours, [3]);
  assert.equal(next.data.notificationSettings.enabled, true);
  assert.equal(next.data.servers.length, 1);
});

test('レベル条件の同じIDが異なる場合は両方を保持し新しいキャラだけ参照を変える', () => {
  const current = fixture(), incoming = fixture();
  incoming.characters[0].id = 'character_2'; incoming.levelRules[0].name = '変更後の条件';
  const backup = api.createBackup(incoming), next = api.plan(current, backup);
  assert.equal(next.data.levelRules.length, 2);
  assert.deepEqual(next.data.characters[0].levelUnlocks, ['overseer']);
  const newId = next.characters[0].levelUnlocks[0];
  assert.notEqual(newId, 'overseer');
  assert.equal(next.characters[0].levelBossTiers[newId], 'beta');
  assert.equal(next.data.levelRules.find(r => r.id === newId).type, 'boss');
  assert.equal(api.plan({ ...next.data, hasNotificationSettings: true }, backup).data.levelRules.length, 2);
});

test('壊れたJSON・形式違い・新しい形式・危険な画像やID・重複IDを保存前に拒否', () => {
  assert.throws(() => api.parse('{'));
  assert.throws(() => api.parse('{}'));
  const backup = api.createBackup(fixture());
  assert.throws(() => api.parse(JSON.stringify({ ...backup, version: 2 })));
  for (const change of [
    b => b.data.characters[0].appearance = 'javascript:alert(1)',
    b => b.data.characters[0].appearance = 'https://other.test/tracker.png',
    b => b.data.timers[0].id = '" onclick="alert(1)',
    b => b.data.characters.push(b.data.characters[0]),
    b => b.data.characters[0].levelUnlocks = {},
    b => b.data.timers[0].endsAt = 'tomorrow'
  ]) {
    const bad = plain(backup); change(bad);
    assert.throws(() => api.parse(JSON.stringify(bad)));
  }
  assert.throws(() => api.parse(JSON.stringify(backup).replace('"name":"サバイバー"', '"__proto__":{"polluted":true},"name":"サバイバー"')));
});

test('IndexedDBへ画像ごと追加し、タイマー同期に使う保存先へ反映', async () => {
  const db = await database(), local = storage();
  const next = api.plan(empty(), api.createBackup(fixture()));
  await api.persist(next, { storage: local, database: db });
  assert.equal((await records(db))[0].appearance, picture);
  assert.equal(JSON.parse(local.getItem(api.KEYS.timers))[0].endsAt, fixture().timers[0].endsAt);
  assert.equal(local.getItem('arkManager_push_device_token_v1'), 'existing-token');
  assert.equal(local.getItem('unrelated'), 'keep');
  db.close();
});

test('localStorageの容量不足時は書き込みを戻して既存データを保持', async () => {
  const db = await database(), local = storage(), before = [...local.map];
  const original = local.setItem;
  local.setItem = (key,value) => { if (key === api.KEYS.levelRules) throw Error('QuotaExceeded'); original(key,value); };
  await assert.rejects(api.persist(api.plan(empty(), api.createBackup(fixture())), { storage: local, database: db }), /既存データは保持/);
  assert.deepEqual([...local.map], before);
  assert.equal((await records(db)).length, 0);
  db.close();
});

test('IndexedDBのID競合時は追加全体を中止しlocalStorageも戻す', async () => {
  const db = await database(), local = storage();
  await api.persist(api.plan(empty(), api.createBackup(fixture())), { storage: local, database: db });
  const before = [...local.map], other = fixture();
  other.characters.unshift({ id: 'character_other', name: '途中追加' });
  other.timers[0].id = 'timer_new';
  await assert.rejects(api.persist(api.plan(empty(), api.createBackup(other)), { storage: local, database: db }), /既存データは保持/);
  assert.deepEqual([...local.map], before);
  assert.deepEqual((await records(db)).map(c => c.id), ['character_1']);
  db.close();
});

test('IndexedDBを使えない環境でも既存のフォールバック保存先に追加', async () => {
  const local = storage();
  await api.persist(api.plan(empty(), api.createBackup(fixture())), { storage: local, database: null });
  assert.equal(JSON.parse(local.getItem(api.KEYS.characters))[0].implant, picture);
});
