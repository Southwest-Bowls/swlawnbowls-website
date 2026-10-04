/* ============================================================
   pwa.js — lets people add the site to their phone like an app.

   It adds the app icon and manifest to the page, switches on the
   offline helper (sw.js), and on the home page offers a small
   "Add to your phone" button:
     - Android / desktop Chrome: the button opens the install prompt.
     - iPhone / iPad: the button goes to /get-the-app, which explains
       Share → Add to Home Screen (Apple has no install prompt).
   The button is hidden once the app is installed or dismissed.

   site-nav.js loads this automatically; site-home.html loads it
   directly. Pages embedded in Squarespace skip it.
   ============================================================ */
(function () {
  'use strict';

  try { if (window.self !== window.top) return; } catch (e) { return; }
  if (window.__swdPwa) return;
  window.__swdPwa = true;

  // ---- head tags --------------------------------------------------
  function addTag(tag, attrs) {
    var sel = tag + Object.keys(attrs).filter(function (k) { return k === 'rel' || k === 'name'; })
      .map(function (k) { return '[' + k + '="' + attrs[k] + '"]'; }).join('');
    if (document.head.querySelector(sel)) return;
    var el = document.createElement(tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    document.head.appendChild(el);
  }
  addTag('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  addTag('link', { rel: 'apple-touch-icon', href: '/assets/icons/apple-touch-icon.png' });
  addTag('link', { rel: 'icon', href: '/assets/icons/favicon-32.png', type: 'image/png' });
  addTag('meta', { name: 'theme-color', content: '#1a365d' });
  addTag('meta', { name: 'apple-mobile-web-app-title', content: 'SW Bowls' });
  addTag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  addTag('meta', { name: 'mobile-web-app-capable', content: 'yes' });

  // ---- offline helper ---------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // ---- "Add to your phone" button ---------------------------------
  var KEY = 'swd-install-dismissed';
  var standalone = window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true;

  // The installed app starts at /app. Phones that installed it before
  // the app existed open on the home page; send them to the app.
  if (standalone && (location.pathname === '/' || location.pathname === '/home-v2')) {
    location.replace('/app');
    return;
  }
  var path = location.pathname.replace(/\/$/, '') || '/';
  var onHome = path === '/' || path === '/home-v2' || path === '/site-home';
  var dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (standalone || dismissed || !onHome) return;

  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferred = null;

  function showChip(onClick) {
    if (document.getElementById('swd-install')) return;
    var css = document.createElement('style');
    css.textContent =
      '#swd-install{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;' +
      'display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px);padding:8px 8px 8px 10px;' +
      'background:#1a365d;color:#fff;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);' +
      'font:600 15px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#swd-install img{width:32px;height:32px;border-radius:8px;background:#fff}' +
      '#swd-install button{font:inherit;border:0;cursor:pointer;border-radius:999px}' +
      '#swd-install .go{background:#d4af37;color:#172033;padding:8px 14px}' +
      '#swd-install .x{background:transparent;color:#fff;padding:6px 10px;font-size:18px;line-height:1}';
    document.head.appendChild(css);
    var chip = document.createElement('div');
    chip.id = 'swd-install';
    chip.setAttribute('role', 'region');
    chip.setAttribute('aria-label', 'Add Southwest Bowls to your phone');
    chip.innerHTML = '<img src="/assets/icons/icon-192.png" alt="">' +
      '<button type="button" class="go">Add SW Bowls to your phone</button>' +
      '<button type="button" class="x" aria-label="No thanks">×</button>';
    chip.querySelector('.go').addEventListener('click', onClick);
    chip.querySelector('.x').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      chip.remove();
    });
    document.body.appendChild(chip);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showChip(function () {
      deferred.prompt();
      deferred.userChoice.then(function () {
        var c = document.getElementById('swd-install');
        if (c) c.remove();
      });
    });
  });

  window.addEventListener('appinstalled', function () {
    var c = document.getElementById('swd-install');
    if (c) c.remove();
  });

  if (isIOS) {
    var show = function () { showChip(function () { location.href = '/get-the-app'; }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  }
})();
