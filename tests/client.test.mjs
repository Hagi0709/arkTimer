import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('push-client.js', 'utf8');
const SETTINGS = 'arkTimer_notification_settings_v1', TOKEN = 'arkManager_push_device_token_v1';
const PENDING = 'arkManager_push_pending_v2';
const token = 'c'.repeat(64);
function harness({ settings = { enabled: true, days: [], hours: [1, 2] }, storage, permission = 'granted', online = true,
  hostname = 'ark-manager.arktools.workers.dev', timerNotifications = true, flexibleTimerNotifications = true } = {}) {
  storage ??= new Map([[SETTINGS, JSON.stringify(settings)], [TOKEN, token]]);
  const calls = [], traces = [], listeners = {}, nodes = new Map(), timers = new Map();
  let sequence = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', checked: false, open: true, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(name, handler) { listeners[id + ':' + name] = handler; }, close() { this.open = false; },
      showModal() { this.open = true; }, setAttribute() {}, removeAttribute() {} });
    return nodes.get(id);
  };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const sub = { async unsubscribe() { traces.push('unsubscribe'); return true; },
    toJSON: () => ({ endpoint: 'https://push.example.test/device', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }) };
  const reg = { active: { postMessage() {} }, pushManager: { async getSubscription() { return sub; }, async subscribe() { return sub; } } };
  const navigator = { onLine: online, standalone: true, userAgent: 'iPhone', serviceWorker: {
    async register() { traces.push('register'); return reg; }, ready: Promise.resolve(reg),
    addEventListener(name, handler) { listeners['sw:' + name] = handler; }
  } };
  const Notification = { permission, async requestPermission() { traces.push('permission'); this.permission = 'granted'; return 'granted'; } };
  const window = { isSecureContext: true, Notification, PushManager() {}, matchMedia: () => ({ matches: true }),
    location: { hostname },
    addEventListener(name, handler) { listeners[name] = handler; } };
  const document = { hidden: false, getElementById: node, querySelectorAll: () => [],
    addEventListener(name, handler) { listeners[name] = handler; } };
  const h = { storage, calls, traces, node, navigator, window, document, listeners, Notification, localStorage, timers, settingsChanges: [],
    timersData: [{ id: 'timer1', timerName: '拠点', map: 'アイランド', startedAt: 1800000000000, endsAt: 1800007200000, imageSrc: 'private-image' }],
    async response() { return new Response(JSON.stringify({ ok: true, scheduled: 2 }), { status: 200 }); }
  };
  runInNewContext(source, { window, document, navigator, Notification, localStorage, crypto, Uint8Array, atob, AbortSignal,
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    async fetch(path, options) {
      traces.push(path);
      if (path.endsWith('/key')) return new Response(JSON.stringify({ publicKey: 'AQ', protocol: 2, timerNotifications, flexibleTimerNotifications }));
      const call = { path, options, body: JSON.parse(options.body) };
      calls.push(call);
      return h.response(call);
    }
  });
  h.controller = window.ARKPush.create({ getTimers: () => h.timersData, onSettingsChange: () => h.settingsChanges.push(JSON.parse(storage.get(SETTINGS))) });
  return h;
}
async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('async condition not met');
}

test('各タイマーの時刻とOFFを別々に同期し、画像や余分な情報は送らない',async()=>{
  const h=harness();
  h.timersData=[{...h.timersData[0],notificationSettings:{enabled:true,days:[2,2],hours:[3],private:'secret'}},
    {...h.timersData[0],id:'timer2',notificationSettings:{enabled:false,days:[],hours:[1]}}];
  assert.equal(await h.controller.markChanged(),true);
  const items=h.calls[0].body.timers;
  assert.deepEqual(items.map(t=>t.notificationSettings),[{enabled:true,days:[2],hours:[3]},{enabled:false,days:[],hours:[1]}]);
  assert.doesNotMatch(JSON.stringify(h.calls[0].body),/private-image|secret/);
  h.timersData[0].notificationSettings.hours=[4];await h.controller.markChanged();
  assert.deepEqual(h.calls[1].body.timers[0].notificationSettings.hours,[4]);
});

test('任意日数と毎時通知をタイマー別に同期し、未対応サーバーへ送らない',async()=>{
  const h=harness();h.timersData[0].notificationSettings={enabled:true,days:[14,30,30],hours:[],hourlyWithinDay:true};
  assert.equal(await h.controller.markChanged(),true);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings,{enabled:true,days:[14,30],hours:[],hourlyWithinDay:true});
  const old=harness({flexibleTimerNotifications:false});old.timersData=h.timersData;
  assert.equal(await old.controller.markChanged(),false);assert.equal(old.calls.length,0);assert.equal(old.storage.get(PENDING),'1');
});

test('任意指定がOFFの保存済み日数を通知へ混ぜず、7〜1日前の選択だけを同期',async()=>{
  const h=harness();h.timersData[0].notificationSettings={enabled:true,days:[7,1],hours:[],hourlyWithinDay:true,customDays:[14,30]};
  assert.equal(await h.controller.markChanged(),true);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings,{enabled:true,days:[7,1],hours:[],hourlyWithinDay:true});
});

test('追加した日数ごとのチェック状態を同期用の有効な日数に分け、画面用設定は送らない',async()=>{
  const h=harness();h.timersData[0].notificationSettings={enabled:true,days:[1,14],hours:[],hourlyWithinDay:true,presetDays:[1],
    customNotifications:{enabled:true,entries:[{days:14,enabled:true},{days:999,enabled:false}]}};
  assert.equal(await h.controller.markChanged(),true);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings,{enabled:true,days:[1,14],hours:[],hourlyWithinDay:true});
  h.timersData[0].notificationSettings.days=[1];await h.controller.markChanged();
  assert.deepEqual(h.calls[1].body.timers[0].notificationSettings.days,[1]);
});

test('日数なしの毎時通知を同期でき、不正な任意日数は未同期として保つ',async()=>{
  const h=harness();h.timersData[0].notificationSettings={enabled:true,days:[],hours:[],hourlyWithinDay:true};
  assert.equal(await h.controller.markChanged(),true);
  h.timersData[0].notificationSettings.days=[Number.MAX_SAFE_INTEGER];
  assert.equal(await h.controller.markChanged(),false);assert.equal(h.calls.length,1);assert.equal(h.storage.get(PENDING),'1');
});

test('個別設定に未対応のサーバーや不正な時刻へ同期せず、未同期として保持',async()=>{
  const old=harness({timerNotifications:false});assert.equal(await old.controller.markChanged(),false);
  assert.equal(old.calls.length,0);assert.equal(old.storage.get(PENDING),'1');
  const bad=harness();bad.timersData[0].notificationSettings={enabled:true,days:[],hours:[]};
  assert.equal(await bad.controller.markChanged(),false);assert.equal(bad.calls.length,0);assert.equal(bad.storage.get(PENDING),'1');
});

test('既存端末トークン・時間設定を維持して画像を送らず同期', async () => {
  const h = harness();
  assert.equal(await h.controller.markChanged(), true);
  assert.deepEqual(h.calls[0].body.hours, []);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings, {enabled:true,days:[],hours:[1,2]});
  assert.equal(h.calls[0].body.token, token);
  assert.equal(h.calls[0].body.timers[0].imageSrc, undefined);
  assert.equal(h.calls[0].options.keepalive, true);
  assert.equal(h.storage.get(PENDING), '0');
  assert.ok(!h.traces.includes('permission'));
});
test('同期中の追加変更を直列化し最新予定まで保存', async () => {
  const h = harness();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.response = async () => { if (h.calls.length === 1) await gate; return new Response('{"ok":true,"scheduled":2}'); };
  const running = h.controller.markChanged();
  await until(() => h.calls.length === 1);
  h.timersData = [{ ...h.timersData[0], endsAt: 1800009900000 }];
  h.controller.markChanged();
  release();
  await running;
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].body.timers[0].endsAt, 1800009900000);
  assert.ok(h.calls[1].body.revision > h.calls[0].body.revision);
});
test('閉じる直前の最新変更をkeepaliveで送る', async () => {
  const h = harness();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.response = async () => { if (h.calls.length === 1) await gate; return new Response('{"ok":true,"scheduled":2}'); };
  const running = h.controller.markChanged();
  await until(() => h.calls.length === 1);
  h.timersData = [];
  h.controller.markChanged();
  h.controller.flushOnHide();
  await until(() => h.calls.length === 2);
  assert.equal(h.calls[1].options.keepalive, true);
  assert.deepEqual(h.calls[1].body.timers, []);
  release();
  await running;
});
test('オフラインでも未同期状態を残し、再起動後に同期', async () => {
  const h = harness({ online: false });
  assert.equal(await h.controller.markChanged(), false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.storage.get(PENDING), '1');
  const reopened = harness({ storage: h.storage });
  assert.equal(await reopened.controller.markChanged(), true);
  assert.equal(reopened.storage.get(PENDING), '0');
});
test('HTTP保存失敗を成功表示せず、再送できる', async () => {
  const h = harness();
  h.response = async () => new Response('{"error":"test failure"}', { status: 503 });
  assert.equal(await h.controller.markChanged(), false);
  assert.equal(h.storage.get(PENDING), '1');
  assert.match(h.node('timerNotifyStatus').textContent, /未同期/);
  h.response = async () => new Response('{"ok":true,"scheduled":2}');
  assert.equal(await h.controller.flush(), true);
  assert.equal(h.storage.get(PENDING), '0');
});
test('通知OFFは購読取得・権限許可を待たずサーバー停止を同期', async () => {
  const h = harness({ settings: { enabled: false, days: [], hours: [] }, permission: 'denied' });
  assert.equal(await h.controller.markChanged(), true);
  assert.equal(h.calls[0].path, '/api/push/unsubscribe');
  assert.ok(!h.traces.includes('register'));
});
test('iOSの許可要求がネットワーク/SW登録より先に始まる', async () => {
  const h = harness({ permission: 'default' });
  await h.controller.allow();
  assert.equal(h.traces[0], 'permission');
  assert.equal(h.calls.length, 1);
});
test('許可済みの購読を許可処理や通常保存で作り直さない', async () => {
  const h = harness();
  await h.controller.markChanged();
  assert.ok(!h.traces.includes('unsubscribe'));
  await h.controller.allow();
  assert.equal(h.traces.filter(value => value === 'unsubscribe').length, 0);
  assert.equal(h.calls.at(-1).body.token, token);
});

test('許可済みは準備完了後や再表示後も押せない許可済み表示', async () => {
  const h = harness();
  h.controller.init();
  await until(() => !h.controller.preparing && !h.controller.running);
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  assert.match(h.node('timerNotifyPermission').textContent, /許可済み/);
  assert.equal(h.node('timerNotifyStatus').textContent, '');
  h.controller.open();
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  assert.equal(h.node('timerNotifyStatus').textContent, '');
});

test('未許可は準備後に押せる、許可後は即座に押せなくなる', async () => {
  const h = harness({ permission: 'default', settings: { enabled: false, days: [1], hours: [] } });
  h.controller.init();
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  await until(() => !h.controller.preparing);
  assert.equal(h.node('timerNotifyPermission').disabled, false);
  await h.controller.allow();
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  assert.match(h.node('timerNotifyPermission').textContent, /許可済み/);
  assert.equal(h.traces.filter(value => value === 'permission').length, 1);
  assert.equal(h.node('timerNotifyStatus').textContent, '');
});

test('通知拒否は押せないブロック表示、同期エラーは残す', async () => {
  const h = harness({ permission: 'denied' });
  h.controller.showStatus();
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  assert.match(h.node('timerNotifyPermission').textContent, /ブロック/);
  assert.match(h.node('timerNotifyStatus').textContent, /端末の設定/);
  assert.equal(await h.controller.markChanged(), false);
  assert.match(h.node('timerNotifyStatus').textContent, /未同期/);
});
test('端末全体の有効無効だけを保存し、各タイマーの時刻を変更しない', async () => {
  const h = harness();
  h.node('timerNotifyEnabled').checked = true;
  h.document.querySelectorAll = () => assert.fail('共通の通知時刻は選択しない');
  await h.controller.saveSettings();
  assert.deepEqual(h.calls[0].body.days, []);
  assert.deepEqual(h.calls[0].body.hours, []);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings.hours, [1,2]);
  assert.equal(h.node('timerNotificationDialog').open, false);
});

test('全体OFFは全予定を停止し、ONで個別ON/OFFと通知時刻を保ったまま再同期する',async()=>{
  const h=harness();
  h.timersData=[{...h.timersData[0],notificationSettings:{enabled:true,days:[7,1,14],hours:[],hourlyWithinDay:true}},
    {...h.timersData[0],id:'timer2',notificationSettings:{enabled:false,days:[3],hours:[],hourlyWithinDay:false}}];
  const original=structuredClone(h.timersData);
  h.node('timerNotifyEnabled').checked=false;await h.controller.saveSettings();
  assert.equal(h.calls[0].path,'/api/push/unsubscribe');assert.equal(h.calls[0].body.timers,undefined);
  assert.deepEqual(h.timersData,original);assert.equal(h.settingsChanges.at(-1).enabled,false);
  h.node('timerNotifyEnabled').checked=true;await h.controller.saveSettings();
  assert.equal(h.calls[1].path,'/api/push/sync');
  assert.deepEqual(h.calls[1].body.timers.map(t=>t.notificationSettings),original.map(t=>t.notificationSettings));
  assert.deepEqual(h.timersData,original);assert.equal(h.settingsChanges.at(-1).enabled,true);
});

test('全体OFFの保存後はサーバーの応答を待たず個別画面へ変更を知らせる',async()=>{
  const h=harness();let release;
  h.response=()=>new Promise(resolve=>{release=()=>resolve(new Response('{"ok":true}'))});
  h.node('timerNotifyEnabled').checked=false;const saving=h.controller.saveSettings();
  assert.equal(h.settingsChanges.at(-1).enabled,false);assert.equal(h.window.ARKPush.getSettings().enabled,false);
  await until(()=>h.calls.length===1);release();await saving;
});
test('旧設定の期限当日を除外して各タイマーに引き継ぐ', async () => {
  const h = harness({ settings: { enabled: true, days: [0, 1], hours: [] } });
  h.controller.open();
  await h.controller.markChanged();
  assert.deepEqual(h.calls[0].body.days, []);
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings.days, [1]);
});

test('期限当日のみだった設定はタイマーを通知OFFにして同期', async () => {
  const h = harness({ settings: { enabled: true, days: [0], hours: [] } });
  h.controller.open();
  assert.equal(h.node('timerNotifyEnabled').checked, true);
  assert.equal(await h.controller.markChanged(), true);
  assert.equal(h.calls[0].path, '/api/push/sync');
  assert.deepEqual(h.calls[0].body.timers[0].notificationSettings, {enabled:false,days:[],hours:[]});
});
test('通知ストレージエラーがタイマー画面の初期化を中断しない', () => {
  const h = harness();
  h.localStorage.getItem = () => { throw Error('Storage denied'); };
  assert.equal(h.window.ARKPush.init({ getTimers: () => [] }), null);
  assert.match(h.node('timerNotifyStatus').textContent, /ストレージ/);
});

test('GitHub Pagesでも通知設定が開き、使えない通知許可を要求せず案内を表示', async () => {
  const h = harness({ hostname: 'hagi0709.github.io', permission: 'default' });
  h.controller.init();
  h.listeners['openTimerNotificationSettings:click']();
  assert.equal(h.node('timerNotificationDialog').open, true);
  assert.equal(h.node('timerNotifyEnabled').disabled, true);
  assert.equal(h.node('timerNotifyEnabled').checked, false);
  assert.equal(h.node('timerNotifyPermission').disabled, true);
  assert.match(h.node('timerNotifyPermission').textContent, /通知対応版/);
  assert.match(h.node('timerNotifyStatus').textContent, /データ引き継ぎ/);
  await h.controller.allow();
  await h.controller.resume();
  h.controller.pending = true;
  h.controller.subscription = { toJSON: () => ({}) };
  h.controller.flushOnHide();
  assert.equal(h.traces.length, 0);
  assert.equal(h.calls.length, 0);
});

test('GitHub Pagesでは端末の通知を無効にして閉じ、サーバーへ送信しない', async () => {
  const h = harness({ hostname: 'hagi0709.github.io' });
  h.controller.open();
  h.document.querySelectorAll = selector => selector.includes('"hour"') ? [{ value: '1' }] : [];
  await h.controller.saveSettings();
  const settings = JSON.parse(h.storage.get(SETTINGS));
  assert.deepEqual(settings, { enabled: false, days: [], hours: [1,2] });
  assert.equal(h.node('timerNotificationDialog').open, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.storage.get(TOKEN), token);
});
