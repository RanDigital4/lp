(() => {
'use strict';
const announced = [];
let selected = null;

function chooseProvider() {
  const injected = window.ethereum;
  if (injected) {
    const list = Array.isArray(injected.providers) ? injected.providers : [injected];
    return list.find(p => p && p.isMetaMask) || list.find(Boolean) || injected;
  }
  const preferred = announced.find(x => /metamask|trust|binance|okx|bitget|safepal|tokenpocket/i.test(x.info?.name || ''));
  return preferred?.provider || announced[0]?.provider || window.BinanceChain || window.trustwallet || null;
}
function expose(provider) {
  if (!provider || selected === provider) return;
  selected = provider;
  // Do not install a getter that reads window.ethereum again (that caused recursion).
  try {
    Object.defineProperty(window, 'ethereum', {
      configurable: true, enumerable: true, writable: true, value: provider
    });
  } catch (_) {
    try { window.ethereum = provider; } catch (_) {}
  }
}
window.addEventListener('eip6963:announceProvider', event => {
  if (event.detail?.provider) {
    announced.push(event.detail);
    if (!window.ethereum) expose(chooseProvider());
  }
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
if (window.ethereum) expose(chooseProvider());

const show = message => {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = 'toast show error';
  toast.textContent = message;
  clearTimeout(show.timer);
  show.timer = setTimeout(() => toast.classList.remove('show'), 9000);
};
window.addEventListener('error', event => show('Error: ' + (event.message || 'unknown')));
document.addEventListener('DOMContentLoaded', () => {
  if (!window.ethers) show('Ethers library load नहीं हुई। Internet connection जाँचकर page refresh करें।');
  if (!window.ethereum) {
    const target = location.origin + location.pathname + location.search;
    const modal = document.createElement('div');
    modal.className = 'modal hidden';
    modal.innerHTML = `<div class="glass mbox"><h3>Wallet नहीं मिला</h3>
      <p class="hint">इस browser में wallet उपलब्ध नहीं है। इस पेज को wallet app के DApp Browser में खोलें।</p>
      <div class="rows">
        <a class="btn gold" href="https://metamask.app.link/dapp/${location.host}${location.pathname}${location.search}">MetaMask में खोलें</a>
        <a class="btn soft" href="https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(target)}">Trust Wallet में खोलें</a>
        <button class="btn line" type="button">बंद करें</button>
      </div></div>`;
    document.body.append(modal);
    modal.querySelector('button').addEventListener('click', () => modal.classList.add('hidden'));
    document.addEventListener('click', event => {
      if (!event.target.closest('#connect,#heroConnect') || window.ethereum) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      modal.classList.remove('hidden');
    }, true);
  }
});
})();
