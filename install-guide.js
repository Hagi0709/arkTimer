/* Safari installation guidance is local to this browser and never changes app data. */
(() => {
  const KEY = 'arkManager_install_guide_dismissed_v1';
  const dialog = document.getElementById('homeScreenGuide');
  if (!dialog) return;
  let previousOverflow = '';
  function open() {
    if (dialog.open || typeof dialog.showModal !== 'function') return;
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { document.body.style.overflow = previousOverflow; });
  document.getElementById('closeHomeScreenGuide').addEventListener('click', close);
  document.getElementById('homeScreenGuideLater').addEventListener('click', close);
  document.getElementById('homeScreenGuideNever').addEventListener('click', () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    close();
  });
  window.ARKInstallGuide = { open };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Version\/[\d.]+.*Safari\//.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(navigator.userAgent);
  const standalone = navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch {}
  if (ios && safari && !standalone && !dismissed) open();
})();
