import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import worker, { runScheduled, sendPush } from '../worker.js';
import { D1 } from './d1.mjs';

const NOW = 1800000000000, HOUR = 3600000, DAY = 24 * HOUR;
const token = 'a'.repeat(64);
const id = createHash('sha256').update(token).digest('hex');
const subscription = { endpoint: 'https://push.example.test/device', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } };
const timer = { id: 'timer1', name: '拠点', map: 'アイランド', startedAt: NOW - DAY, endsAt: NOW + 3 * HOUR };
const snapshot = (extra = {}) => ({ token, subscription, timers: [timer], days: [], hours: [1, 2], revision: 1, ...extra });
function setup(t) {
  t.mock.method(Date, 'now', () => NOW);
  const DB = new D1();
  t.after(() => DB.close());
  return { DB, VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private', VAPID_SUBJECT: 'mailto:test@example.test' };
}
async function call(env, path, data) {
  const response = await worker.fetch(new Request('https://ark.test/api/push/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  }), env);
  return { status: response.status, body: await response.json() };
}
const alerts = env => env.DB.sql.prepare('SELECT * FROM alerts ORDER BY due_at').all();
async function due(env) {
  await call(env, 'sync', snapshot({ timers: [{ ...timer, endsAt: NOW + HOUR }], hours: [1] }));
}

test('1時間前・2時間前・日前を正しく予約し、同一同期で重複しない', async t => {
  const env = setup(t);
  const body = snapshot({ days: [1], timers: [{ ...timer, endsAt: NOW + 2 * DAY }] });
  assert.equal((await call(env, 'sync', body)).body.scheduled, 3);
  assert.deepEqual(alerts(env).map(a => a.due_at), [NOW + DAY, NOW + 2 * DAY - 2 * HOUR, NOW + 2 * DAY - HOUR]);
  await call(env, 'sync', body);
  assert.equal(alerts(env).length, 3);
  assert.match(alerts(env)[1].body, /あと2時間/);
});
test('編集・リセット・削除・通知設定変更を原子的に同期し履歴を保持', async t => {
  const env = setup(t);
  await call(env, 'sync', snapshot());
  await call(env, 'sync', snapshot({ revision: 2, timers: [{ ...timer, name: '変更後' }], hours: [1] }));
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 1);
  assert.match(alerts(env).find(a => a.cancelled_at === null).body, /変更後/);
  await call(env, 'sync', snapshot({ revision: 3, timers: [{ ...timer, endsAt: NOW + 5 * HOUR }] }));
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 2);
  await call(env, 'sync', snapshot({ revision: 4, timers: [] }));
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 0);
  assert.equal(alerts(env).length, 4);
});
test('古い同期・古い通知停止が新しい設定を上書きしない', async t => {
  const env = setup(t);
  await call(env, 'sync', snapshot({ revision: 5 }));
  const old = await call(env, 'sync', snapshot({ revision: 4, timers: [] }));
  assert.equal(old.body.stale, true);
  await call(env, 'unsubscribe', { token, revision: 3 });
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 2);
  await call(env, 'unsubscribe', { token, revision: 6 });
  await call(env, 'sync', snapshot({ revision: 5 }));
  assert.ok(alerts(env).every(a => a.cancelled_at !== null));
});
test('先に届いた通知停止が遅れて届く初回同期を無効化', async t => {
  const env = setup(t);
  await call(env, 'unsubscribe', { token, revision: 2 });
  await call(env, 'sync', snapshot({ revision: 1 }));
  assert.equal(alerts(env).length, 0);
});
test('無効な入力・51件以上のタイマーで既存予定を失わない', async t => {
  const env = setup(t);
  await call(env, 'sync', snapshot());
  for (const extra of [{ hours: [24] }, { days: [1.5] }, { timers: [{ ...timer, endsAt: 'bad' }] },
    { timers: Array.from({ length: 51 }, () => timer) }]) {
    assert.equal((await call(env, 'sync', snapshot({ revision: 2, ...extra }))).status, 400);
  }
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 2);
});
test('最大50タイマー・全通知時刻をD1のパラメータ制限内で同期', async t => {
  const env = setup(t);
  const result = await call(env, 'sync', snapshot({
    timers: Array.from({ length: 50 }, (_, i) => ({ ...timer, id: String(i), endsAt: NOW + 8 * DAY })),
    days: [0,1,2,3,4,5,6,7], hours: Array.from({ length: 23 }, (_, i) => i + 1)
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.scheduled, 1550);
});
test('D1同期の途中エラーをロールバック', async t => {
  const env = setup(t);
  await call(env, 'sync', snapshot());
  env.DB.sql.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON alerts BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  assert.equal((await call(env, 'sync', snapshot({ revision: 2, timers: [{ ...timer, id: 'other' }] }))).status, 503);
  assert.equal(env.DB.sql.prepare('SELECT sync_revision FROM subscribers').get().sync_revision, 1);
  assert.equal(alerts(env).filter(a => a.cancelled_at === null).length, 2);
});
test('Push受付成功後にのみsent_atを記録し、再同期・Cron重複でも再送しない', async t => {
  const env = setup(t);
  await due(env);
  let count = 0, payload;
  const send = async (sub, data, options) => {
    assert.equal(alerts(env)[0].sent_at, null);
    assert.ok(alerts(env)[0].lease_token);
    assert.equal(options.urgency, 'high');
    payload = data; count++; return 201;
  };
  await Promise.all([runScheduled(env, { send }), runScheduled(env, { send })]);
  await runScheduled(env, { send });
  await call(env, 'sync', snapshot({ revision: 2, timers: [{ ...timer, endsAt: NOW + HOUR }], hours: [1] }));
  await runScheduled(env, { send });
  assert.equal(count, 1);
  assert.equal(alerts(env)[0].last_status, 201);
  assert.equal(alerts(env)[0].displayed_at, null);
  assert.equal((await call(env, 'receipt', { id: payload.alertId, receiptToken: '0'.repeat(64) })).status, 403);
  assert.equal((await call(env, 'receipt', { id: payload.alertId, receiptToken: payload.receiptToken })).status, 200);
  assert.equal(alerts(env)[0].displayed_at, NOW);
});
test('429・ネットワークエラーは送信扱いにせずRetry-Afterを守って再試行', async t => {
  const env = setup(t);
  await due(env);
  let now = NOW, calls = 0;
  const send = async () => { calls++; if (calls === 1) throw Object.assign(Error('redacted'), { statusCode: 429, retryAfter: '120' }); return 201; };
  await runScheduled(env, { send, clock: () => now });
  assert.equal(alerts(env)[0].sent_at, null);
  assert.equal(alerts(env)[0].next_attempt_at, NOW + 120000);
  now += 60000;
  await runScheduled(env, { send, clock: () => now });
  assert.equal(calls, 1);
  now += 60000;
  await runScheduled(env, { send, clock: () => now });
  assert.equal(calls, 2);
  assert.equal(alerts(env)[0].sent_at, now);
});
test('Worker中断後の期限切れリースを回収して再送', async t => {
  const env = setup(t);
  await due(env);
  env.DB.sql.exec("UPDATE alerts SET lease_token='crashed',lease_until=" + (NOW + 120000));
  let calls = 0;
  const send = async () => { calls++; return 201; };
  await runScheduled(env, { send });
  assert.equal(calls, 0);
  await runScheduled(env, { send, clock: () => NOW + 120001 });
  assert.equal(calls, 1);
});
test('410で購読を無効化して履歴を残す。他端末は維持する', async t => {
  const env = setup(t);
  await due(env);
  await call(env, 'sync', snapshot({ token: 'b'.repeat(64) }));
  await runScheduled(env, { send: async () => { throw Object.assign(Error('expired'), { statusCode: 410 }); } });
  assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n, 2);
  assert.notEqual(env.DB.sql.prepare('SELECT invalidated_at FROM subscribers WHERE id=?').get(id).invalidated_at, null);
  assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM subscribers WHERE invalidated_at IS NULL').get().n, 1);
  assert.equal(alerts(env).length, 3);
});
test('403は恒久失敗、ネットワーク障害は最大8回、期限切れは送信しない', async t => {
  const env = setup(t);
  await due(env);
  await runScheduled(env, { send: async () => { throw Object.assign(Error(), { statusCode: 403 }); } });
  assert.equal(alerts(env)[0].failed_at, NOW);
  assert.equal(alerts(env)[0].sent_at, null);
  env.DB.sql.exec('UPDATE alerts SET failed_at=NULL,attempts=7,next_attempt_at=0');
  await runScheduled(env, { send: async () => { throw Error('network secret not logged'); } });
  assert.equal(alerts(env)[0].attempts, 8);
  assert.notEqual(alerts(env)[0].failed_at, null);
  env.DB.sql.exec('UPDATE alerts SET failed_at=NULL,expires_at=' + NOW);
  await runScheduled(env, { send: async () => assert.fail('expired alert sent') });
  assert.equal(alerts(env)[0].last_error, 'expired');
});
test('追加マイグレーションが既存データと旧日単位IDを保持', async t => {
  const DB = new D1({ migrate: false });
  t.after(() => DB.close());
  const oldId = createHash('sha256').update(id + '|timer1|' + (NOW + DAY) + '|1').digest('hex');
  DB.sql.prepare('INSERT INTO subscribers VALUES (?,?,?,?)').run(id, subscription.endpoint, JSON.stringify(subscription), NOW);
  DB.sql.prepare('INSERT INTO alerts VALUES (?,?,?,?,?,?)').run(oldId, id, NOW, 'old', 'old', NOW - 1);
  DB.migrate();
  const env = { ...setup(t), DB };
  await call(env, 'sync', snapshot({ timers: [{ ...timer, endsAt: NOW + DAY }], days: [1], hours: [] }));
  assert.equal(alerts(env).length, 1);
  assert.equal(alerts(env)[0].sent_at, NOW - 1);
});
test('購読更新は旧endpointが一致する有効な端末だけに適用', async t => {
  const env = setup(t);
  await due(env);
  const updated = { ...subscription, endpoint: 'https://push.example.test/renewed' };
  await call(env, 'refresh', { token, oldEndpoint: 'wrong', subscription: updated });
  assert.equal(env.DB.sql.prepare('SELECT endpoint FROM subscribers').get().endpoint, subscription.endpoint);
  await call(env, 'refresh', { token, oldEndpoint: subscription.endpoint, subscription: updated });
  assert.equal(env.DB.sql.prepare('SELECT endpoint FROM subscribers').get().endpoint, updated.endpoint);
  await call(env, 'unsubscribe', { token, revision: 2 });
  await call(env, 'refresh', { token, oldEndpoint: updated.endpoint, subscription });
  assert.notEqual(env.DB.sql.prepare('SELECT invalidated_at FROM subscribers').get().invalidated_at, null);
});
test('再登録した購読なら失敗予定を復旧するが、通常同期で再試行上限をリセットしない', async t => {
  const env = setup(t);
  await due(env);
  await runScheduled(env, { send: async () => { throw Object.assign(Error(), { statusCode: 403 }); } });
  const current = snapshot({ revision: 2, timers: [{ ...timer, endsAt: NOW + HOUR }], hours: [1] });
  await call(env, 'sync', current);
  assert.notEqual(alerts(env)[0].failed_at, null);
  await call(env, 'sync', { ...current, revision: 3, subscription: { ...subscription, endpoint: 'https://push.example.test/renewed' } });
  assert.equal(alerts(env)[0].failed_at, null);
  assert.equal(alerts(env)[0].attempts, 0);
  await runScheduled(env, { send: async () => 201 });
  assert.equal(alerts(env)[0].sent_at, NOW);
});
test('本物の暗号化/VAPIDリクエストをWorkers fetchに渡す（外部送信なし）', async t => {
  const client = createECDH('prime256v1');
  client.generateKeys();
  const vapid = webpush.generateVAPIDKeys();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, subscription.endpoint);
    assert.ok(options.body.byteLength > 0);
    assert.match(options.headers.Authorization, /^vapid /);
    assert.equal(options.headers.Urgency, 'high');
    return new Response(null, { status: 201 });
  });
  await sendPush({ ...subscription, keys: { p256dh: client.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } },
    { title: 'test' }, { TTL: 60, urgency: 'high', vapidDetails: { subject: 'mailto:test@example.test', ...vapid } });
});
