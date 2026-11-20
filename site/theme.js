/* Applies the saved appearance (light or dark) before the page paints. No saved choice = follow the device. */
(function () {
  try {
    var t = localStorage.getItem('afg-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage may be blocked */ }
})();
