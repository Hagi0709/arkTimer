const ICON = '/ark-manager-app-icon-pastel.png';
let pushQueue = Promise.resolve();

// Store only the device identity needed to renew a subscription while the app is closed.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ark-manager-push-v2', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('displayed', { keyPath: 'id' }).createIndex('time', 'time');
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storage(store, mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function acknowledge(data) {
  if (!data.alertId || !data.receiptToken) return;
  try {
    await fetch('/api/push/receipt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.alertId, receiptToken: data.receiptToken }),
      signal: AbortSignal.timeout(10000)
    });
  } catch { /* Offline receipts must never prevent notification display. */ }
}
async function displayPush(data) {
  const id = data.alertId || data.tag;
  // WebKit requires showNotification for EVERY push; silently discarding a duplicate
  // can revoke the subscription. A stable tag replaces its visible notification.
  await self.registration.showNotification(data.title || 'ARK Manager｜タイマー通知', {
    body: data.body || 'タイマーの期限が近づいています', tag: id || 'ark-manager', renotify: false,
    icon: ICON, badge: ICON, data: { url: '/', alertId: id }
  });
  // This means showNotification resolved, not that the user saw/read the banner.
  await acknowledge(data);
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const task = pushQueue.then(() => displayPush(data));
  pushQueue = task.catch(() => {});
  event.waitUntil(task);
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const found = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (found) return found.focus();
    return self.clients.openWindow('/');
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ark:push-device' && /^[a-f0-9]{64}$/.test(event.data.token || '')) {
    event.waitUntil(storage('settings', 'readwrite', store => store.put(event.data.token, 'token')));
  }
});
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const token = await storage('settings', 'readonly', store => store.get('token'));
    const key = event.oldSubscription?.options?.applicationServerKey;
    if (token && event.oldSubscription?.endpoint && (event.newSubscription || key)) {
      const subscription = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key
      });
      const response = await fetch('/api/push/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, oldEndpoint: event.oldSubscription.endpoint, subscription: subscription.toJSON() }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw Error('Subscription refresh failed');
    }
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'ark:push-subscription-changed' });
  })());
});
