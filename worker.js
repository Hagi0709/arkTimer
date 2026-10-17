import webpush from 'web-push';

const DAY = 86400000;
const MAX_ATTEMPTS = 8;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value)
)), b => b.toString(16).padStart(2, '0')).join('');
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const configured = env => env.DB && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT;
const statement = (db, sql, ...values) => db.prepare(sql).bind(...values);

function validSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 2500) return false;
  try {
    const url = new URL(s.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
  } catch { return false; }
  return s.keys && ['p256dh', 'auth'].every(k =>
    typeof s.keys[k] === 'string' && /^[A-Za-z0-9_-]{16,200}={0,2}$/.test(s.keys[k]));
}

function notificationOffsets(body) {
  const days = body.days ?? [], hours = body.hours ?? [];
  if (!Array.isArray(days) || !Array.isArray(hours) ||
      days.some(n => !Number.isInteger(n) || n < 0 || n > 7) ||
      hours.some(n => !Number.isInteger(n) || n < 1 || n > 23)) return null;
  return [...new Set(days)].map(n => ({ unit: 'day', amount: n, ms: n * DAY }))
    .concat([...new Set(hours)].map(n => ({ unit: 'hour', amount: n, ms: n * 3600000 })));
}

async function sync(body, env) {
  const offsets = notificationOffsets(body);
  if (!validSubscription(body.subscription) || !offsets?.length ||
      !Array.isArray(body.timers) || body.timers.length > 50) {
    return json({ error: '通知時刻・購読情報・タイマー（最大50件）を確認してください' }, 400);
  }
  const now = Date.now(), revision = body.revision ?? now;
  if (!Number.isSafeInteger(revision) || revision < 1) return json({ error: 'invalid revision' }, 400);
  const id = await hash(body.token), alerts = [];
  const serializedSubscription = JSON.stringify(body.subscription);
  const previous = await statement(env.DB, 'SELECT subscription,sync_revision FROM subscribers WHERE id=?', id).first();
  // Explicit re-subscription can recover failed alerts; ordinary sync must not reset retry limits.
  const repaired = previous && previous.subscription !== serializedSubscription && revision > previous.sync_revision ? 1 : 0;
  for (const timer of body.timers) {
    // Reject the entire snapshot instead of silently cancelling invalid/truncated timers.
    if (!timer || typeof timer.id !== 'string' || !timer.id || timer.id.length > 200 ||
        !Number.isSafeInteger(timer.endsAt) || timer.endsAt > now + 365 * DAY ||
        (timer.startedAt !== undefined && (!Number.isSafeInteger(timer.startedAt) || timer.startedAt > timer.endsAt))) {
      return json({ error: 'invalid timer' }, 400);
    }
    for (const offset of offsets) {
      const due = timer.endsAt - offset.ms;
      const expires = offset.amount === 0 ? due + DAY : Math.min(timer.endsAt, due + DAY);
      if (expires <= now || (timer.startedAt !== undefined && due < timer.startedAt)) continue;
      // Keep legacy day IDs so previously accepted day alerts are not resent.
      const suffix = offset.unit === 'day' ? String(offset.amount) : 'hour|' + offset.amount;
      alerts.push({
        id: await hash(id + '|' + timer.id + '|' + timer.endsAt + '|' + suffix), due, expires,
        title: 'ARK Manager｜タイマー通知',
        body: String(timer.name || '未設定').slice(0, 100) + '（' + String(timer.map || '').slice(0, 60) + '）' +
          (offset.amount === 0 ? 'の期限です' : 'の期限まであと' + offset.amount + (offset.unit === 'day' ? '日' : '時間'))
      });
    }
  }
  // D1 batch is atomic. json_each avoids D1's bound-parameter limit for 50 x 31 alerts.
  await env.DB.batch([
    statement(env.DB, `INSERT INTO subscribers (id,endpoint,subscription,updated_at,sync_revision)
      VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,
      subscription=excluded.subscription,updated_at=excluded.updated_at,
      sync_revision=excluded.sync_revision,invalidated_at=NULL
      WHERE excluded.sync_revision > subscribers.sync_revision`,
    id, body.subscription.endpoint, serializedSubscription, now, revision),
    statement(env.DB, `INSERT INTO alerts (id,subscriber_id,due_at,title,body,expires_at)
      SELECT json_extract(value,'$.id'),?,json_extract(value,'$.due'),
        json_extract(value,'$.title'),json_extract(value,'$.body'),json_extract(value,'$.expires')
      FROM json_each(?) WHERE EXISTS (SELECT 1 FROM subscribers WHERE id=? AND sync_revision=? AND invalidated_at IS NULL)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,cancelled_at=NULL,
      failed_at=CASE WHEN ?=1 THEN NULL ELSE alerts.failed_at END,
      attempts=CASE WHEN ?=1 THEN 0 ELSE alerts.attempts END,
      next_attempt_at=CASE WHEN ?=1 THEN 0 ELSE alerts.next_attempt_at END,
      last_error=CASE WHEN ?=1 THEN NULL ELSE alerts.last_error END
      WHERE alerts.sent_at IS NULL AND (alerts.failed_at IS NULL OR ?=1)`,
    id, JSON.stringify(alerts), id, revision, repaired, repaired, repaired, repaired, repaired),
    statement(env.DB, `UPDATE alerts SET cancelled_at=?,lease_until=NULL,lease_token=NULL
      WHERE subscriber_id=? AND sent_at IS NULL AND cancelled_at IS NULL
      AND id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))
      AND EXISTS (SELECT 1 FROM subscribers WHERE id=? AND sync_revision=?)`,
    now, id, JSON.stringify(alerts), id, revision)
  ]);
  const current = await statement(env.DB, 'SELECT sync_revision FROM subscribers WHERE id=?', id).first();
  const counts = await statement(env.DB, `SELECT COUNT(*) AS scheduled FROM alerts
    WHERE subscriber_id=? AND sent_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL`, id).first();
  return json({ ok: true, revision: current.sync_revision, stale: revision < current.sync_revision, scheduled: counts.scheduled });
}

async function api(req, env) {
  if (!configured(env)) return json({ error: '通知サーバーの設定が不足しています' }, 503);
  const path = new URL(req.url).pathname;
  if (req.method === 'GET' && path === '/api/push/key') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY, protocol: 2, workerVersion: env.CF_VERSION_METADATA?.id ?? null });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 150000) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid JSON' }, 400);
  if (path === '/api/push/receipt') {
    if (!validToken(body.id) || !validToken(body.receiptToken)) return json({ error: 'invalid receipt' }, 400);
    const alert = await statement(env.DB, 'SELECT subscriber_id FROM alerts WHERE id=?', body.id).first();
    if (!alert || await hash(body.id + '|' + alert.subscriber_id) !== body.receiptToken) return json({ error: 'invalid receipt' }, 403);
    await statement(env.DB, 'UPDATE alerts SET displayed_at=COALESCE(displayed_at,?) WHERE id=?', Date.now(), body.id).run();
    return json({ ok: true });
  }
  if (!validToken(body.token)) return json({ error: 'invalid device token' }, 400);
  const id = await hash(body.token);
  if (path === '/api/push/status') {
    const subscriber = await statement(env.DB, 'SELECT sync_revision,invalidated_at,updated_at FROM subscribers WHERE id=?', id).first();
    const rows = await statement(env.DB, `SELECT id,due_at,sent_at,displayed_at,attempts,next_attempt_at,
      last_status,last_error,failed_at,cancelled_at FROM alerts WHERE subscriber_id=? ORDER BY due_at DESC LIMIT 50`, id).all();
    return json({ subscriber, alerts: rows.results });
  }
  if (path === '/api/push/refresh') {
    if (!validSubscription(body.subscription) || typeof body.oldEndpoint !== 'string') return json({ error: 'invalid subscription' }, 400);
    await statement(env.DB, `UPDATE subscribers SET endpoint=?,subscription=?,updated_at=?
      WHERE id=? AND endpoint=? AND invalidated_at IS NULL`, body.subscription.endpoint,
    JSON.stringify(body.subscription), Date.now(), id, body.oldEndpoint).run();
    return json({ ok: true });
  }
  if (path === '/api/push/unsubscribe') {
    const revision = body.revision ?? Date.now();
    if (!Number.isSafeInteger(revision) || revision < 1) return json({ error: 'invalid revision' }, 400);
    await env.DB.batch([
      statement(env.DB, `INSERT INTO subscribers (id,endpoint,subscription,updated_at,sync_revision,invalidated_at)
        VALUES (?,'','{}',?,?,?) ON CONFLICT(id) DO UPDATE SET invalidated_at=excluded.invalidated_at,
        sync_revision=excluded.sync_revision,updated_at=excluded.updated_at
        WHERE subscribers.sync_revision < excluded.sync_revision`, id, Date.now(), revision, Date.now()),
      statement(env.DB, `UPDATE alerts SET cancelled_at=?,lease_until=NULL,lease_token=NULL
        WHERE subscriber_id=? AND sent_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM subscribers WHERE id=? AND sync_revision=? AND invalidated_at IS NOT NULL)`,
      Date.now(), id, id, revision)
    ]);
    return json({ ok: true });
  }
  if (path === '/api/push/sync') return sync(body, env);
  return json({ error: 'not found' }, 404);
}

// Workers fetch transports the encrypted request without relying on Node HTTPS sockets.
export async function sendPush(subscription, payload, options) {
  let request;
  try { request = webpush.generateRequestDetails(subscription, JSON.stringify(payload), options); }
  catch { throw Object.assign(new Error('invalid push request'), { permanent: true }); }
  const response = await fetch(request.endpoint, {
    method: request.method, headers: request.headers, body: request.body, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('push rejected'), {
    statusCode: response.status, retryAfter: response.headers.get('retry-after')
  });
  return response.status;
}

export async function runScheduled(env, { send = sendPush, clock = Date.now } = {}) {
  if (!configured(env)) throw new Error('Push configuration missing');
  await statement(env.DB, `UPDATE alerts SET failed_at=?,
    last_error=CASE WHEN expires_at<=? THEN 'expired' ELSE 'retry_limit' END,lease_until=NULL,lease_token=NULL
    WHERE sent_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL AND (expires_at<=? OR attempts>=?)
    AND (lease_until IS NULL OR lease_until<=?)`, clock(), clock(), clock(), MAX_ATTEMPTS, clock()).run();
  const rows = await statement(env.DB, `SELECT a.id FROM alerts a JOIN subscribers s ON s.id=a.subscriber_id
    WHERE a.sent_at IS NULL AND a.failed_at IS NULL AND a.cancelled_at IS NULL
    AND s.invalidated_at IS NULL AND a.due_at<=? AND a.next_attempt_at<=?
    AND (a.lease_until IS NULL OR a.lease_until<=?) ORDER BY a.due_at LIMIT 100`, clock(), clock(), clock()).all();
  async function deliver(id) {
    const lease = crypto.randomUUID();
    const claimed = await statement(env.DB, `UPDATE alerts SET lease_token=?,lease_until=?,
      attempts=attempts+1,last_attempt_at=? WHERE id=? AND sent_at IS NULL AND failed_at IS NULL
      AND cancelled_at IS NULL AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)`,
    lease, clock() + 120000, clock(), id, clock(), clock()).run();
    if (!claimed.meta?.changes) return;
    const alert = await statement(env.DB, `SELECT a.*,s.subscription FROM alerts a JOIN subscribers s ON s.id=a.subscriber_id
      WHERE a.id=? AND a.lease_token=? AND a.cancelled_at IS NULL AND s.invalidated_at IS NULL`, id, lease).first();
    if (!alert) return;
    if (alert.expires_at <= clock()) {
      await statement(env.DB, `UPDATE alerts SET failed_at=?,last_error='expired',lease_until=NULL,lease_token=NULL
        WHERE id=? AND lease_token=?`, clock(), id, lease).run();
      return;
    }
    try {
      const status = await send(JSON.parse(alert.subscription), {
        title: alert.title, body: alert.body, tag: id, alertId: id,
        receiptToken: await hash(id + '|' + alert.subscriber_id), dueAt: alert.due_at
      }, {
        TTL: Math.max(1, Math.ceil((alert.expires_at - clock()) / 1000)), urgency: 'high', topic: id.slice(0, 32),
        vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
      });
      // Accepted by the provider is distinct from displayed_at on the iPhone.
      await statement(env.DB, `UPDATE alerts SET sent_at=?,last_status=?,last_error=NULL,lease_until=NULL,lease_token=NULL
        WHERE id=? AND lease_token=?`, clock(), status, id, lease).run();
      console.log(JSON.stringify({ event: 'push_accepted', alertId: id, status, attempt: alert.attempts }));
    } catch (error) {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : null;
      if (status === 404 || status === 410) {
        await env.DB.batch([
          statement(env.DB, 'UPDATE subscribers SET invalidated_at=? WHERE id=? AND subscription=?',
            clock(), alert.subscriber_id, alert.subscription),
          statement(env.DB, `UPDATE alerts SET cancelled_at=?,last_status=?,last_error='subscription_expired',
            lease_until=NULL,lease_token=NULL WHERE subscriber_id=? AND sent_at IS NULL
            AND EXISTS (SELECT 1 FROM subscribers WHERE id=? AND invalidated_at IS NOT NULL)`,
          clock(), status, alert.subscriber_id, alert.subscriber_id)
        ]);
        // A concurrent sync may already have renewed this subscription.
        await statement(env.DB, 'UPDATE alerts SET lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?', id, lease).run();
      } else {
        const permanent = error.permanent || (status >= 400 && status < 500 && ![408,425,429].includes(status));
        const retryAfter = /^\d+$/.test(error.retryAfter || '') ? Number(error.retryAfter) * 1000 :
          Math.max(0, (Date.parse(error.retryAfter) || clock()) - clock());
        const retryAt = clock() + Math.max(Math.min(3600000, 60000 * 2 ** (alert.attempts - 1)), retryAfter);
        const failed = permanent || alert.attempts >= MAX_ATTEMPTS || retryAt >= alert.expires_at;
        await statement(env.DB, `UPDATE alerts SET next_attempt_at=?,last_status=?,last_error=?,failed_at=?,
          lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?`,
        retryAt, status, error.permanent ? 'invalid_push_request' : status ? 'http_' + status : 'network_error', failed ? clock() : null, id, lease).run();
      }
      // Exclude endpoints, keys, provider bodies and raw error messages from logs.
      console.warn(JSON.stringify({ event: 'push_failed', alertId: id, status, attempt: alert.attempts }));
    }
  }
  for (let i = 0; i < rows.results.length; i += 5) await Promise.all(rows.results.slice(i, i + 5).map(row => deliver(row.id)));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/push/')) {
      if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'origin mismatch' }, 403);
      try { return await api(req, env); } catch {
        console.error(JSON.stringify({ event: 'push_api_failed', reason: 'database_or_configuration' }));
        return json({ error: '通知予定を保存できませんでした。通信状況を確認して再度保存してください' }, 503);
      }
    }
    const response = await env.ASSETS.fetch(req);
    if (['/', '/index.html', '/push-client.js', '/data-transfer.js', '/sw.js', '/build-info.json'].includes(url.pathname)) {
      const fresh = new Response(response.body, response);
      fresh.headers.set('cache-control', 'no-cache');
      return fresh;
    }
    return response;
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(runScheduled(env)); }
};
