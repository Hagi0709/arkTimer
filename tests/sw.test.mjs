import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
const source = readFileSync('sw.js', 'utf8');
const payload = { alertId: 'a'.repeat(64), receiptToken: 'b'.repeat(64), tag: 'a'.repeat(64), title: 'ARK', body: '1時間前' };
function harness(indexedDB = new IDBFactory()) {
  const handlers = {}, shown = [], calls = [], notifications = new Map();
  const h = { handlers, shown, calls, indexedDB, notifications };
  const self = { location: { origin: 'https://ark.test' }, async skipWaiting() {},
    clients: { async claim() {}, async matchAll() { return []; }, async openWindow() {} },
    registration: { async getNotifications() { return []; }, async showNotification(title, options) {
      if (h.failDisplay) throw Error('show failed');
      shown.push({ title, ...options });
      notifications.set(options.tag, { title, ...options });
    } },
    addEventListener(name, handler) { handlers[name] = handler; }
  };
  h.self = self;
  runInNewContext(source, { self, indexedDB, IDBKeyRange, AbortSignal, URL, Date,
    async fetch(path, options) { calls.push({ path, body: JSON.parse(options.body) }); if (h.offline) throw Error('offline'); return new Response('{"ok":true}'); }
  });
  h.event = async (name, extra = {}) => {
    let promise;
    handlers[name]({ waitUntil(value) { promise = value; }, ...extra });
    await promise;
  };
  h.push = (data = payload) => h.event('push', { data: { json: () => data } });
  return h;
}
test('PushイベントのwaitUntil内で表示後にだけreceiptを送信', async () => {
  const h = harness();
  await h.push();
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].tag, payload.alertId);
  assert.equal(h.calls[0].path, '/api/push/receipt');
  assert.equal(h.calls[0].body.receiptToken, payload.receiptToken);
});
test('同じPushもWebKit向けに必ず表示APIを呼び、同じtagで通知を置換', async () => {
  const h = harness();
  await Promise.all([h.push(), h.push()]);
  assert.equal(h.shown.length, 2);
  assert.equal(h.notifications.size, 1);
  assert.equal(h.shown[1].renotify, false);
  const restarted = harness(h.indexedDB);
  await restarted.push();
  assert.equal(restarted.shown.length, 1);
  assert.equal(restarted.shown[0].tag, h.shown[0].tag);
  assert.equal(restarted.calls.length, 1);
});
test('通知表示失敗は配信済みにせず、次のPushで再表示できる', async () => {
  const h = harness();
  h.failDisplay = true;
  await assert.rejects(h.push(), /show failed/);
  assert.equal(h.calls.length, 0);
  h.failDisplay = false;
  await h.push();
  assert.equal(h.notifications.size, 1);
});
test('receiptがオフラインでも通知は表示され、重複受信時にreceiptを再送', async () => {
  const h = harness();
  h.offline = true;
  await h.push();
  h.offline = false;
  await h.push();
  assert.equal(h.notifications.size, 1);
  assert.equal(h.shown.length, 2);
  assert.equal(h.calls.length, 2);
});
test('不正なPushデータでも既定通知を表示', async () => {
  const h = harness();
  await h.event('push', { data: { json() { throw Error('invalid'); } } });
  assert.equal(h.shown[0].title, 'ARK Manager｜タイマー通知');
});
test('通知タップで既存のアプリをフォーカス', async () => {
  const h = harness();
  let focused = 0, closed = 0;
  h.self.clients.matchAll = async () => [{ url: 'https://ark.test/', async focus() { focused++; } }];
  await h.event('notificationclick', { notification: { close() { closed++; } } });
  assert.equal(focused, 1);
  assert.equal(closed, 1);
});
test('閉じた状態の購読更新でタイマーを消さずendpointを更新', async () => {
  const h = harness();
  await h.event('message', { data: { type: 'ark:push-device', token: 'c'.repeat(64) } });
  await h.event('pushsubscriptionchange', {
    oldSubscription: { endpoint: 'https://push.example.test/old' },
    newSubscription: { toJSON: () => ({ endpoint: 'https://push.example.test/new' }) }
  });
  assert.equal(h.calls[0].path, '/api/push/refresh');
  assert.equal(h.calls[0].body.oldEndpoint, 'https://push.example.test/old');
  assert.equal(h.calls[0].body.timers, undefined);
});
