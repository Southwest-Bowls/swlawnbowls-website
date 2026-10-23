/* Southwest Bowls Division site footer. Loaded on swlawnbowls.org through
   Squarespace Code Injection (Footer). Edit links here and push; no Squarespace edit needed. */
(function () {
  if (window.top !== window.self || document.getElementById('swd-site-footer')) return;
  var yr = new Date().getFullYear();
  var css = '#swd-site-footer{background:#231120;color:rgba(255,255,255,.85);font:15px/1.6 "Plus Jakarta Sans",-apple-system,Helvetica,Arial,sans-serif;padding:36px 20px 28px;margin-top:0}' +
    '#swd-site-footer .in{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:28px 48px;justify-content:space-between}' +
    '#swd-site-footer h3{margin:0 0 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#fbb040}' +
    '#swd-site-footer p{margin:0;max-width:34ch}' +
    '#swd-site-footer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}' +
    '#swd-site-footer a{color:#fff;text-decoration:none}#swd-site-footer a:hover{text-decoration:underline}' +
    '#swd-site-footer .legal{max-width:1100px;margin:28px auto 0;padding-top:18px;border-top:1px solid rgba(255,255,255,.18);font-size:13px;color:rgba(255,255,255,.65);display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  var f = document.createElement('footer'); f.id = 'swd-site-footer';
  f.innerHTML =
    '<div class="in">' +
    '<div><h3>Southwest Bowls Division</h3><p>Lawn bowling across Southern California, from Cambria to San Diego. A division of Bowls USA.</p></div>' +
    '<div><h3>Explore</h3><ul><li><a href="/">Home</a></li><li><a href="/2026-season-agenda">2026 season agenda</a></li><li><a href="/welcome">New to the sport</a></li><li><a href="/contact-us">Contact us</a></li></ul></div>' +
    '<div><h3>The app</h3><ul><li><a href="https://swlawnbowls-website.vercel.app/app">SW Bowls app</a></li><li><a href="https://swlawnbowls-website.vercel.app/privacy">App privacy policy</a></li><li><a href="https://swlawnbowls-website.vercel.app/delete-account">Delete your account</a></li></ul></div>' +
    '<div><h3>Follow</h3><ul><li><a href="https://www.facebook.com/profile.php?id=61574126130618" rel="noopener">Facebook</a></li><li><a href="https://www.youtube.com/@SouthwestLawnBowls" rel="noopener">YouTube</a></li></ul></div>' +
    '</div>' +
    '<div class="legal"><span>&copy; ' + yr + ' Southwest Bowls Division</span>' +
    '<span><a href="/privacy-policy">Privacy Policy</a> &middot; <a href="/disclaimer">Disclaimer</a> &middot; <a href="/disclaimer-1">Copyright</a></span></div>';
  document.body.appendChild(f);
})();
