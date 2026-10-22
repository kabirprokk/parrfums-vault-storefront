/* Run before stylesheets so the first paint uses the visitor's chosen theme. */
(() => {
  const key = 'pv-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let choice;
  try { choice = localStorage.getItem(key); } catch {}
  const icon = () => document.documentElement.dataset.theme === 'dark'
    ? '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
    : '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 13.1A9 9 0 0 1 10.9 3.2a9 9 0 1 0 9.9 9.9Z"/></svg>';
  const sync = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
      button.innerHTML = icon();
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(dark));
    });
  };
  const apply = () => {
    const theme = choice === 'dark' || choice === 'light' ? choice : (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181512' : '#fcfaf6');
    sync();
  };
  window.PVTheme = { sync, icon };
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, choice); } catch {}
    apply();
  });
  system.addEventListener('change', () => { if (choice !== 'dark' && choice !== 'light') apply(); });
  window.addEventListener('storage', event => { if (event.key === key) { choice = event.newValue; apply(); } });
  document.addEventListener('DOMContentLoaded', sync);
  apply();
})();
