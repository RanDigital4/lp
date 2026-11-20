(() => {
'use strict';
const found = [];
addEventListener('eip6963:announceProvider', e => found.push(e.detail));
dispatchEvent(new Event('eip6963:requestProvider'));
const pick = () => {
  const w = window.ethereum;
  if (w) return w.providers?.find(p => p.isMetaMask) || w;
  return found.find(x => /metamask|trust|binance|okx|bitget|safepal|tokenpocket/i.test(x.info?.name || ''))?.provider || found[0]?.provider || window.BinanceChain || window.trustwallet || null;
};
/* अगर wallet बाद में inject हो या EIP-6963 से मिले, तब भी app.js को window.ethereum मिले */
if (!window.ethereum) {
  Object.defineProperty(window, 'ethereum', { configurable: true, get: pick, set(v) { Object.defineProperty(window, 'ethereum', { value: v, writable: true, configurable: true }); } });
}
const show = m => {
  const t = document.getElementById('toast'); if (!t) return;
  t.className = 'toast show error'; t.textContent = m;
  clearTimeout(show.t); show.t = setTimeout(() => t.className = 'toast', 9000);
};
addEventListener('error', e => show('Error: ' + (e.message || 'unknown')));
addEventListener('DOMContentLoaded', () => { if (!window.ethers) show('Ethers library load नहीं हुई। Internet/VPN बदलकर page refresh करें।'); });

/* Wallet न होने पर (सामान्य mobile browser) wallet app में खोलने के links */
const url = location.host + location.pathname;
const m = document.createElement('div');
m.className = 'modal hidden';
m.innerHTML = `<div class="glass mbox"><h3>Wallet नहीं मिला</h3><p class="hint">इस browser में कोई wallet नहीं है। इस page को अपने wallet app के browser में खोलें:</p>
<div class="rows"><a class="btn gold" href="https://metamask.app.link/dapp/${url}">MetaMask में खोलें</a><a class="btn soft" href="https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(location.origin + location.pathname)}">Trust Wallet में खोलें</a><button class="btn line" type="button">बंद करें</button></div></div>`;
document.addEventListener('DOMContentLoaded', () => document.body.append(m));
m.querySelector('button').onclick = () => m.classList.add('hidden');
document.addEventListener('click', e => {
  if (!e.target.closest('#connect,#heroConnect') || pick()) return;
  e.stopImmediatePropagation(); e.preventDefault(); m.classList.remove('hidden');
}, true);
})();
