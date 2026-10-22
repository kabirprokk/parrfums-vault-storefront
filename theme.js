/* Run before stylesheets so the first paint uses the visitor's chosen theme. */
(() => {
  const key = 'pv-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let choice;
  let activeTransition, fallbackTimer;
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
  const apply = (animate = false) => {
    const theme = choice === 'dark' || choice === 'light' ? choice : (system.matches ? 'dark' : 'light');
    const root = document.documentElement;
    const update = () => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181512' : '#fcfaf6');
      sync();
    };
    // Finish interrupted fades before taking the next snapshot on rapid clicks.
    activeTransition?.skipTransition();
    clearTimeout(fallbackTimer);
    root.classList.remove('theme-changing');
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body) { update(); return; }
    if (document.startViewTransition) {
      const transition = document.startViewTransition(update);
      activeTransition = transition;
      transition.ready.catch(() => {}); // A rapid second toggle may cancel the snapshot.
      const finish = () => { if (activeTransition === transition) activeTransition = null; };
      transition.finished.then(finish, finish);
    } else {
      // Smooth colour interpolation for browsers without snapshot transitions.
      root.classList.add('theme-changing');
      void document.body.offsetWidth;
      update();
      fallbackTimer = setTimeout(() => root.classList.remove('theme-changing'), 500);
    }
  };
  window.PVTheme = { sync, icon };
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    const current = choice === 'dark' || choice === 'light' ? choice : document.documentElement.dataset.theme;
    choice = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, choice); } catch {}
    apply(true);
  });
  system.addEventListener('change', () => { if (choice !== 'dark' && choice !== 'light') apply(true); });
  window.addEventListener('storage', event => { if (event.key === key) { choice = event.newValue; apply(true); } });
  document.addEventListener('DOMContentLoaded', sync);
  apply();
})();
