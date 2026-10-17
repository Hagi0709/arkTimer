/* Local-file transfer only. Push credentials and installation identity never leave the device. */
(() => {
  const FORMAT = 'ark-manager-backup';
  const MAX_BYTES = 100 * 1024 * 1024;
  const KEYS = {
    timers: 'arkTimer_store_v8', characters: 'arkManager_characters_local_v1',
    servers: 'arkManager_saved_servers_v1', levelRules: 'arkManager_level_rules_v1',
    sortMode: 'arkTimer_sort_mode', notifications: 'arkTimer_notification_settings_v1'
  };
  const bossIds = new Set(['overseer','manticore','rockwell','king_titan','lost_queen','master_controller','abyssalus_shallocis']);
  const sorts = new Set(['dueSoon','dueLate','name','map','manual']);
  const fail = () => { throw Error('引き継ぎファイルの内容が正しくありません。'); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function safeTree(value, depth = 0) {
    if (depth > 12) fail();
    if (Array.isArray(value)) value.forEach(item => safeTree(item, depth + 1));
    else if (object(value)) for (const [key, item] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) fail();
      safeTree(item, depth + 1);
    }
  }
  function list(value, check, key = item => item.id) {
    if (!Array.isArray(value) || value.length > 10000) fail();
    const seen = new Set();
    return value.map(item => {
      if (!object(item)) fail();
      check(item);
      const id = key(item);
      if (seen.has(id)) fail();
      seen.add(id);
      return item;
    });
  }
  const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) fail(); };
  const string = (value, max = 10000) => { if (typeof value !== 'string' || value.length > max) fail(); };
  function image(value) {
    if (!value) return;
    if (typeof value !== 'string' || !(/^(?:data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=\r\n]+|[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif|avif))$/i.test(value))) fail();
  }
  function validate(data) {
    if (!object(data)) fail();
    safeTree(data);
    list(data.characters, c => {
      id(c.id); string(c.name, 100);
      for (const key of ['level','map','serverNo','eosId','steamId','implantNumber']) if (c[key] !== undefined) {
        if (typeof c[key] !== 'number') string(c[key]);
      }
      image(c.appearance); image(c.implant);
      for (const key of ['levelUnlocks','extNotes']) if (c[key] !== undefined &&
        (!Array.isArray(c[key]) || c[key].some(value => typeof value !== 'string'))) fail();
      for (const key of ['levelBossTiers','tribeByMap']) if (c[key] !== undefined && !object(c[key])) fail();
    });
    list(data.timers, t => {
      id(t.id); string(t.timerName ?? '', 100); string(t.map ?? '', 80);
      if (!Number.isFinite(t.startedAt) || !Number.isFinite(t.endsAt) ||
        Math.abs(t.startedAt) > 8640000000000000 || Math.abs(t.endsAt) > 8640000000000000 || t.endsAt < t.startedAt) fail();
      if (!['building','tribe_tower','generator','other'].includes(t.type)) fail();
      if (t.customType !== undefined) string(t.customType, 80);
      if (t.type === 'building' && !['わら','木','石','金属','TEK'].includes(t.material)) fail();
      image(t.imageSrc);
      if (t.manualPin != null && (!object(t.manualPin) || ['left','top'].some(key =>
        !Number.isFinite(t.manualPin[key]) || t.manualPin[key] < 0 || t.manualPin[key] > 100))) fail();
    });
    list(data.servers, s => { string(s.map, 80); string(s.serverNo, 100); if (s.memo !== undefined) string(s.memo); },
      s => JSON.stringify([s.map, s.serverNo]));
    list(data.levelRules, r => {
      id(r.id); string(r.name, 120);
      if (!Number.isFinite(Number(r.points)) || Number(r.points) < 0 || Number(r.points) > 245) fail();
      if (r.type !== undefined && !['normal','boss'].includes(r.type)) fail();
    });
    if (!sorts.has(data.sortMode)) fail();
    const settings = data.notificationSettings;
    if (!object(settings)) fail();
    for (const [key, min, max] of [['days',0,7],['hours',1,23]]) {
      if (!Array.isArray(settings[key]) || settings[key].some(n => !Number.isInteger(n) || n < min || n > max)) fail();
    }
    return data;
  }
  function createBackup(current) {
    // An explicit allowlist excludes device tokens, subscriptions and sync revisions.
    const data = JSON.parse(JSON.stringify({
      characters: current.characters, timers: current.timers, servers: current.servers,
      levelRules: current.levelRules, sortMode: current.sortMode,
      notificationSettings: { days: current.notificationSettings.days, hours: current.notificationSettings.hours }
    }));
    return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data: validate(data) };
  }
  function parse(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) fail();
    let backup;
    try { backup = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail(); }
    if (!object(backup) || backup.format !== FORMAT || backup.version !== 1) {
      throw Error('対応するARK Managerの引き継ぎファイルを選んでください。');
    }
    validate(backup.data);
    return backup;
  }
  const signature = rule => JSON.stringify([rule.name, bossIds.has(rule.id) ? 'boss' : rule.type || 'normal', Number(rule.points)]);
  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(36);
  }
  function plan(current, backup) {
    validate(createBackup(current).data); validate(backup.data);
    const incoming = backup.data, rules = current.levelRules.map(r => ({ ...r })), ruleMap = new Map();
    for (const rule of incoming.levelRules) {
      let target = rules.find(r => r.id === rule.id);
      if (target && signature(target) !== signature(rule)) {
        // Keep both definitions and remap ONLY imported characters' references.
        let suffix = 0;
        const base = 'import_' + hash(rule.id + signature(rule));
        let nextId = base;
        while ((target = rules.find(r => r.id === nextId)) && signature(target) !== signature(rule)) nextId = base + '_' + ++suffix;
        const mapped = { ...rule, id: nextId, type: bossIds.has(rule.id) ? 'boss' : rule.type || 'normal' };
        if (!target) rules.push(mapped);
        ruleMap.set(rule.id, nextId);
      } else {
        if (!target) rules.push({ ...rule });
        ruleMap.set(rule.id, rule.id);
      }
    }
    const remap = c => ({ ...c,
      ...(c.levelUnlocks ? { levelUnlocks: c.levelUnlocks.map(key => ruleMap.get(key) || key) } : {}),
      ...(c.levelBossTiers ? { levelBossTiers: Object.fromEntries(Object.entries(c.levelBossTiers).map(([key, value]) => [ruleMap.get(key) || key, value])) } : {})
    });
    function additions(existing, values, transform = item => ({ ...item })) {
      const ids = new Set(existing.map(item => item.id));
      const nextOrder = existing.reduce((max, item) => Math.max(max, Number(item.sortOrder ?? item.createdAt) || 0), -1) + 1;
      return values.filter(item => !ids.has(item.id)).map((item, i) => ({ ...transform(item),
        sortOrder: existing.length ? nextOrder + i : item.sortOrder ?? i }));
    }
    const characters = additions(current.characters, incoming.characters, remap);
    const timers = additions(current.timers, incoming.timers);
    const servers = current.servers.slice(), serverIds = new Set(servers.map(s => JSON.stringify([s.map,s.serverNo])));
    for (const server of incoming.servers) if (!serverIds.has(JSON.stringify([server.map,server.serverNo]))) servers.push({ ...server });
    return {
      characters, timers,
      data: { characters: [...current.characters,...characters], timers: [...current.timers,...timers],
        servers, levelRules: rules, sortMode: current.timers.length ? current.sortMode : incoming.sortMode,
        notificationSettings: current.hasNotificationSettings ? current.notificationSettings : { enabled: false, ...incoming.notificationSettings } },
      counts: { characters: characters.length, timers: timers.length,
        skipped: incoming.characters.length + incoming.timers.length - characters.length - timers.length }
    };
  }
  async function persist(plan, { storage, database }) {
    const updates = new Map([
      [KEYS.timers, JSON.stringify(plan.data.timers)], [KEYS.servers, JSON.stringify(plan.data.servers)],
      [KEYS.levelRules, JSON.stringify(plan.data.levelRules)], [KEYS.sortMode, plan.data.sortMode],
      [KEYS.notifications, JSON.stringify(plan.data.notificationSettings)]
    ]);
    if (!database) updates.set(KEYS.characters, JSON.stringify(plan.data.characters));
    const previous = new Map(), written = new Map();
    const rollback = () => {
      for (const [key, value] of [...written].reverse()) if (storage.getItem(key) === value) {
        const old = previous.get(key);
        if (old === null) storage.removeItem(key); else storage.setItem(key, old);
      }
    };
    try {
      for (const [key, value] of updates) {
        const old = storage.getItem(key);
        if (old === value) continue;
        previous.set(key, old); storage.setItem(key, value); written.set(key, value);
      }
      if (database && plan.characters.length) await new Promise((resolve, reject) => {
        const tx = database.transaction('characters', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || Error('キャラ情報を保存できませんでした。'));
        try { for (const character of plan.characters) tx.objectStore('characters').add(character); }
        catch (error) { tx.abort(); reject(error); }
      });
    } catch (error) {
      try { rollback(); } catch { throw Error('読み込みに失敗しました。空き容量を確認し、画面を開き直してください。'); }
      throw Error('読み込みを完了できませんでした。既存データは保持しています。端末の空き容量を確認してください。');
    }
  }
  function init({ getCurrent, apply, openDialog, closeDialog, openNotifications }) {
    const $ = id => document.getElementById(id), dialog = $('dataTransferDialog');
    let selected = null, busy = false;
    const status = text => { $('dataTransferStatus').textContent = text; };
    const reset = () => { selected = null; $('dataTransferPreview').classList.add('hidden'); $('transferNotificationHint').classList.add('hidden'); $('dataTransferFile').value = ''; };
    const task = async action => {
      if (busy) return;
      busy = true;
      dialog.setAttribute('aria-busy', 'true');
      for (const id of ['exportData','selectTransferFile','confirmDataImport','cancelDataImport','closeDataTransfer']) $(id).disabled = true;
      try { await action(); } catch (error) { status(error.message || '処理を完了できませんでした。'); }
      finally {
        busy = false; dialog.removeAttribute('aria-busy');
        for (const id of ['exportData','selectTransferFile','confirmDataImport','cancelDataImport','closeDataTransfer']) $(id).disabled = false;
      }
    };
    for (const button of document.querySelectorAll('[data-open-transfer]')) button.addEventListener('click', () => {
      reset(); status(''); $('transferNotificationHint').classList.add('hidden'); openDialog(dialog);
    });
    $('closeDataTransfer').addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    $('exportData').addEventListener('click', () => task(async () => {
      status('書き出しています…');
      const backup = createBackup(await getCurrent());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      if (blob.size > MAX_BYTES) throw Error('データが100MBを超えるため書き出せません。');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'ARK-Manager-' + new Date().toISOString().slice(0,10) + '.json';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status('');
    }));
    $('selectTransferFile').addEventListener('click', () => { if (!busy) $('dataTransferFile').click(); });
    $('dataTransferFile').addEventListener('change', () => task(async () => {
      const file = $('dataTransferFile').files[0]; reset(); status('');
      if (!file) return;
      if (file.size > MAX_BYTES) throw Error('100MB以下の引き継ぎファイルを選んでください。');
      const backup = parse(await file.text());
      const preview = plan(await getCurrent(), backup);
      selected = backup;
      $('dataTransferSummary').textContent = 'キャラ ' + preview.counts.characters + '人、タイマー ' + preview.counts.timers +
        '件を追加します。' + (preview.counts.skipped ? ' 重複 ' + preview.counts.skipped + '件は追加しません。' : '');
      $('dataTransferPreview').classList.remove('hidden');
    }));
    $('cancelDataImport').addEventListener('click', () => { reset(); status(''); });
    $('confirmDataImport').addEventListener('click', () => task(async () => {
      if (!selected) return;
      status('読み込んでいます…');
      const next = plan(await getCurrent(), selected);
      await apply(next);
      reset();
      status('引き継ぎが完了しました。キャラ ' + next.counts.characters + '人、タイマー ' + next.counts.timers + '件を追加しました。');
      $('transferNotificationHint').classList.remove('hidden');
    }));
    $('transferOpenNotifications').addEventListener('click', () => { closeDialog(dialog); openNotifications(); });
  }
  window.ARKTransfer = { createBackup, parse, plan, persist, init, KEYS };
})();
