// Telegram's script (telegram-web-app.js, a pinned copy of https://telegram.org/js/telegram-web-app.js) runs only for a page
// Telegram opened: everyone else gets no foreign code. It parses the fragment, so it runs before the app rewrites the address.
// The app drops the fragment from the address, so after a reload the sign is what Telegram's script kept for this tab.
var opened = /[#&]tgWebAppVersion=/.test(location.hash);
try { opened = opened || !!sessionStorage.getItem("__telegram__initParams"); } catch (e) { /* storage refused: the fragment alone decides */ }
if (opened) document.write('<script src="/telegram-web-app.js"><\/script>');
