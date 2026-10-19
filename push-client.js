/* Notification scheduling lives on the server. This page only synchronizes snapshots. */
(() => {
  const SETTINGS = 'arkTimer_notification_settings_v1';
  const TOKEN = 'arkManager_push_device_token_v1'; // Reuse the deployed installation's identity.
  const REVISION = 'arkManager_push_revision_v2';
  const PENDING = 'arkManager_push_pending_v2';
  const $ = id => document.getElementById(id);
  const clean = (values, min, max) => Array.isArray(values) ?
    [...new Set(values.filter(n => Number.isInteger(n) && n >= min && n <= max))] : [];
  function readSettings() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS) || 'null'); } catch {}
    const days=clean(saved?.days ?? [1],1,7),hours=clean(saved?.hours,1,23);
    return { enabled: !!saved?.enabled, days, hours };
  }
  function timerNotificationSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean' ||
        !Array.isArray(value.days) || !Array.isArray(value.hours) ||
        value.days.some(n => !Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(n * 86400000)) ||
        value.hours.some(n => !Number.isInteger(n) || n < 1 || n > 23) ||
        (value.hourlyWithinDay !== undefined && typeof value.hourlyWithinDay !== 'boolean') ||
        (value.enabled && !value.days.length && !value.hours.length && !value.hourlyWithinDay)) throw Error('タイマーの通知時刻を確認してください。');
    return { enabled: value.enabled, days: [...new Set(value.days)], hours: [...new Set(value.hours)],
      ...(value.hourlyWithinDay !== undefined ? {hourlyWithinDay:value.hourlyWithinDay} : {}) };
  }
  const applicationKey = key => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - key.length % 4) % 4)), c => c.charCodeAt(0));

  class PushController {
    constructor({ getTimers, onSettingsChange = () => {} }) {
      this.getTimers = getTimers;
      this.onSettingsChange = onSettingsChange;
      this.settings = this.readSettings();
      this.revision = Number(localStorage.getItem(REVISION)) || 0;
      this.pending = localStorage.getItem(PENDING) === '1';
      this.subscription = null;
      this.retryDelay = 1000;
    }
    readSettings() { return readSettings(); }
    storeSettings(settings) {
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
      this.settings = settings;
      this.onSettingsChange();
    }
    supported() {
      return window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
    }
    isStaticPage() {
      return /(^|\.)github\.io$/i.test(window.location?.hostname || '');
    }
    isIOSBrowser() {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      return ios && !(navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
    }
    status(message) {
      this.message = message;
      if ($('timerNotifyStatus')) {
        $('timerNotifyStatus').textContent = message;
        $('timerNotifyStatus').classList.toggle('hidden', !message);
      }
      this.refreshPermissionButton();
    }
    refreshPermissionButton() {
      const button = $('timerNotifyPermission');
      if (!button) return;
      const available = this.supported() && !this.isIOSBrowser() && !this.isStaticPage();
      const permission = available ? Notification.permission : 'unavailable';
      button.disabled = !available || permission !== 'default' || !!this.preparing || !!this.allowing;
      button.textContent = permission === 'granted' ? '✓ 通知は許可済みです' :
        permission === 'denied' ? '通知はブロックされています' :
        this.isStaticPage() ? '通知対応版で設定してください' :
        !available ? (this.isIOSBrowser() ? 'ホーム画面のアプリで通知を設定してください' : 'この環境では通知を利用できません') :
        this.allowing ? '通知を設定しています…' : this.preparing ? '通知を準備しています…' : 'iPhoneの通知を許可する';
    }
    showStatus() {
      $('timerHostingGuide')?.classList.toggle('hidden', !this.isStaticPage());
      $('timerNotifyEnabled').disabled = this.isStaticPage();
      if (this.isStaticPage()) $('timerNotifyEnabled').checked = false;
      $('timerInstallGuide')?.classList.toggle('hidden', this.isStaticPage() || (this.supported() && !this.isIOSBrowser()));
      this.status(this.isStaticPage() ? 'このページではバックグラウンド通知を利用できません。データ引き継ぎから通知対応版へ移行できます。' :
        this.isIOSBrowser() ? 'ホーム画面に追加したARK Managerのアイコンから開いてください。' :
        !this.supported() ? 'この環境ではWeb Pushを利用できません。' :
        Notification.permission === 'denied' ? '通知がブロックされています。端末の設定で許可してください。' :
        this.message || (Notification.permission === 'granted' ? '' :
          '「iPhoneの通知を許可する」を押してください。'));
    }
    deviceToken() {
      let token = localStorage.getItem(TOKEN);
      if (!/^[a-f0-9]{64}$/.test(token || '')) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(TOKEN, token);
      }
      return token;
    }
    prepare() {
      if (!this.registration) this.registration = navigator.serviceWorker.register('/sw.js', {
        scope: '/', updateViaCache: 'none'
      }).then(async reg => {
        if (!reg.active) await navigator.serviceWorker.ready;
        const response = await fetch('/api/push/key', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error('通知サーバーに接続できません（' + response.status + '）。');
        const key = await response.json();
        if (key.protocol !== 2) throw Error('サーバーの通知機能の更新が必要です。');
        this.supportsTimerNotifications = key.timerNotifications === true;
        this.supportsFlexibleTimerNotifications = key.flexibleTimerNotifications === true;
        this.publicKey = applicationKey(key.publicKey);
        this.subscription = await reg.pushManager.getSubscription();
        this.readyRegistration = reg;
        return reg;
      }).catch(error => { this.registration = null; throw error; });
      return this.registration;
    }
    async ensureSubscription() {
      if (this.isStaticPage()) throw Error('通知対応版で通知を設定してください。');
      if (!this.supported() || this.isIOSBrowser()) throw Error('ホーム画面のWebアプリから通知を許可してください。');
      if (Notification.permission !== 'granted') throw Error('端末の通知許可が必要です。');
      const reg = this.readyRegistration || await this.prepare();
      if (!this.subscription) this.subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: this.publicKey
      });
      reg.active?.postMessage({ type: 'ark:push-device', token: this.deviceToken() });
      return this.subscription;
    }
    markChanged() {
      if (this.isStaticPage()) return Promise.resolve(false);
      try {
        this.settings = this.readSettings();
        if (!this.settings.enabled && !localStorage.getItem(TOKEN)) return;
        this.revision = Math.max(Date.now(), this.revision + 1, (Number(localStorage.getItem(REVISION)) || 0) + 1);
        localStorage.setItem(REVISION, String(this.revision));
        localStorage.setItem(PENDING, '1');
        this.pending = true;
        this.status('通知予定をサーバーに保存中…');
        // Start immediately: a one-second debounce loses changes when iOS closes the page.
        return this.flush();
      } catch {
        this.status('タイマーは端末に保存されましたが、通知の同期状態を保存できません。端末の空き容量を確認してください。');
        return Promise.resolve(false);
      }
    }
    snapshot() {
      this.settings = this.readSettings();
      this.revision = Math.max(this.revision, Number(localStorage.getItem(REVISION)) || 0);
      const body = { token: this.deviceToken(), revision: this.revision };
      if (this.settings.enabled && (!this.supportsTimerNotifications || !this.supportsFlexibleTimerNotifications)) throw Error('通知サーバーを更新してから、通知設定を保存してください。');
      if (this.settings.enabled) Object.assign(body, {
        subscription: this.subscription.toJSON(), days: [], hours: [],
        timers: this.getTimers().map(timer => {
          const item = { id: String(timer.id), name: String(timer.timerName || '未設定').slice(0, 100),
            map: String(timer.map || '').slice(0, 60), endsAt: Number(timer.endsAt) };
          if (Number.isFinite(Number(timer.startedAt))) item.startedAt = Number(timer.startedAt);
          item.notificationSettings = timerNotificationSettings(timer.notificationSettings === undefined ? {
            enabled: !!(this.settings.days.length || this.settings.hours.length), days: this.settings.days, hours: this.settings.hours
          } : timer.notificationSettings);
          return item;
        })
      });
      return { path: this.settings.enabled ? '/api/push/sync' : '/api/push/unsubscribe', body };
    }
    async post(snapshot) {
      const response = await fetch(snapshot.path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot.body), keepalive: true, signal: AbortSignal.timeout(20000)
      });
      let data;
      try { data = await response.json(); } catch {}
      if (!response.ok || !data?.ok) throw Error(data?.error || '通知予定の保存に失敗しました（' + response.status + '）。');
      if (data.stale) throw Error('新しい通知設定が保存されています。画面を開き直してください。');
      return data;
    }
    flush() {
      if (this.running) return this.running;
      clearTimeout(this.retryTimer);
      this.running = this.drain().catch(error => {
        this.status('通知予定は未同期です。' + error.message + ' オンラインで再度開いてください。');
        if (!document.hidden) {
          const toast = $('managerToast');
          if (toast) {
            toast.textContent = '通知予定を保存できませんでした。通知設定を確認してください。';
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 5000);
          }
        }
        if (navigator.onLine !== false) {
          this.retryTimer = setTimeout(() => this.flush(), this.retryDelay);
          this.retryDelay = Math.min(60000, this.retryDelay * 2);
        }
        return false;
      }).finally(() => { this.running = null; });
      return this.running;
    }
    async drain() {
      while (this.pending) {
        if (navigator.onLine === false) throw Error('通信できません。');
        if (this.readSettings().enabled) await this.ensureSubscription();
        const snapshot = this.snapshot();
        await this.post(snapshot);
        if (snapshot.body.revision !== Number(localStorage.getItem(REVISION))) continue;
        this.pending = false;
        localStorage.setItem(PENDING, '0');
        this.retryDelay = 1000;
        this.status('');
      }
      return true;
    }
    flushOnHide() {
      if (this.isStaticPage() || !this.pending || (this.readSettings().enabled && !this.subscription)) return;
      // Revision checks on the Worker make this safe alongside an older in-flight request.
      try { this.post(this.snapshot()).catch(() => {}); } catch { /* Keep pending until the server supports this snapshot. */ }
    }
    resume() {
      this.showStatus();
      this.registration = null;
      this.readyRegistration = null;
      this.subscription = null;
      return this.markChanged();
    }
    open() {
      this.settings = this.readSettings();
      $('timerNotifyEnabled').checked = this.settings.enabled;
      this.showStatus();
      const dialog = $('timerNotificationDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    close() {
      const dialog = $('timerNotificationDialog');
      if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    }
    // Invoke permission synchronously in the click handler, before any network/SW await.
    async allow() {
      if (this.allowing) return;
      try {
        if (!this.supported() || this.isIOSBrowser() || this.isStaticPage()) { this.showStatus(); return; }
        this.allowing = true;
        this.refreshPermissionButton();
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') throw Error('端末の設定で通知を許可してください。');
        this.refreshPermissionButton();
        if (!this.readyRegistration) await this.prepare();
        await this.ensureSubscription();
        this.settings = this.readSettings();
        this.settings.enabled = true;
        this.storeSettings(this.settings);
        $('timerNotifyEnabled').checked = true;
        await this.markChanged();
      } catch (error) { this.status(error.message); }
      finally { this.allowing = false; this.refreshPermissionButton(); }
    }
    async saveSettings() {
      const next = { ...this.readSettings(), enabled: $('timerNotifyEnabled').checked };
      try {
        if (this.isStaticPage()) {
          next.enabled = false;
          this.storeSettings(next);
          this.close();
          return;
        }
        if (next.enabled) {
          if (!this.supported() || this.isIOSBrowser()) { this.showStatus(); return; }
          const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
          if (permission !== 'granted') throw Error('通知を許可してください。');
          await this.ensureSubscription();
        }
        this.storeSettings(next);
        if (await this.markChanged()) this.close();
      } catch (error) { this.status(error.message); }
      finally { this.refreshPermissionButton(); }
    }
    init() {
      $('openTimerNotificationSettings').addEventListener('click', () => this.open());
      $('closeTimerNotificationSettings').addEventListener('click', () => this.close());
      $('timerNotifyPermission').addEventListener('click', () => this.allow());
      $('timerNotifySave').addEventListener('click', () => this.saveSettings());
      window.addEventListener('online', () => this.resume());
      window.addEventListener('pageshow', () => this.resume());
      document.addEventListener('visibilitychange', () => document.hidden ? this.flushOnHide() : this.resume());
      window.addEventListener('pagehide', () => this.flushOnHide());
      navigator.serviceWorker?.addEventListener('message', event => {
        if (event.data?.type === 'ark:push-subscription-changed') {
          this.subscription = null;
          this.readyRegistration = null;
          this.registration = null;
          this.markChanged();
        }
      });
      if (this.supported() && !this.isStaticPage()) {
        this.preparing = true;
        this.prepare().catch(() => this.status('通知の準備に失敗しました。オンラインで再度開いてください。'))
          .finally(() => { this.preparing = false; this.refreshPermissionButton(); });
      }
      this.showStatus();
      navigator.permissions?.query({ name: 'notifications' }).then(permission => {
        permission.addEventListener('change', () => this.showStatus());
      }).catch(() => {});
      this.markChanged();
      return this;
    }
  }
  window.ARKPush = {
    getSettings: readSettings,
    create: options => new PushController(options),
    init: options => {
      try { return new PushController(options).init(); }
      catch {
        if ($('timerNotifyStatus')) $('timerNotifyStatus').textContent = '通知設定を読み込めません。端末のストレージ設定を確認してください。';
        return null;
      }
    }
  };
})();
