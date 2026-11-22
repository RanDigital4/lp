/* RND Wallet Selector — MetaMask, Trust Wallet, TokenPocket, SafePal and other injected EVM wallets.
   No private keys or seed phrases are ever requested or handled by this file. */
(() => {
  'use strict';
  if (window.RNDWallet) return;

  const state = { provider: null, found: [], announced: [], modal: null, resolve: null, reject: null };
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = (tag, attrs = {}, text = '') => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (k === 'class') e.className = v; else e.setAttribute(k, v); });
    if (text) e.textContent = text;
    return e;
  };

  // Kaun sa wallet hai? (Trust/TokenPocket bhi isMetaMask=true dikhate hain, isliye pehle unhe check karte hain)
  function kindOf(p, name) {
    const n = String(name || '').toLowerCase();
    if (p.isTrust || p.isTrustWallet || /trust/.test(n)) return 'trust';
    if (p.isTokenPocket || /token.?pocket/.test(n)) return 'tokenpocket';
    if (p.isSafePal || /safe.?pal/.test(n)) return 'safepal';
    if (/meta.?mask/.test(n) || p.isMetaMask) return 'metamask';
    return 'other';
  }
  const LABEL = { metamask: 'MetaMask', trust: 'Trust Wallet', tokenpocket: 'TokenPocket', safepal: 'SafePal', other: 'Browser Wallet' };
  const ICON = { metamask: '🦊', trust: '🛡️', tokenpocket: '👛', safepal: '🔐', other: '🌐' };

  function discover() {
    const found = [];
    const add = (p, name) => {
      if (!p || typeof p.request !== 'function' || found.some(x => x.provider === p)) return;
      found.push({ provider: p, name: name || '', kind: kindOf(p, name) });
    };
    state.announced.forEach(x => add(x.provider, x.info && x.info.name));
    const eth = window.ethereum;
    if (eth && Array.isArray(eth.providers) && eth.providers.length) eth.providers.forEach(p => add(p, ''));
    else if (eth) add(eth, '');
    state.found = found;
    return found;
  }

  // EIP-6963 wallet discovery
  try {
    window.addEventListener('eip6963:announceProvider', event => {
      const d = event.detail || {};
      if (d.provider && !state.announced.some(x => x.provider === d.provider)) { state.announced.push(d); discover(); }
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch (_) {}

  // Wallet ke in-app browser me provider thodi der baad inject hota hai — thoda wait karte hain.
  async function waitForProviders() {
    discover();
    if (state.found.length) return state.found;
    try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (_) {}
    for (let i = 0; i < 8 && !state.found.length; i++) { await sleep(120); discover(); }
    return state.found;
  }

  function styleModal() {
    if (document.getElementById('rnd-wallet-style')) return;
    const css = `
      #rnd-wallet-overlay{position:fixed;inset:0;z-index:1000000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,7,18,.78);backdrop-filter:blur(8px)}
      #rnd-wallet-dialog{width:min(430px,100%);max-height:92vh;overflow:auto;padding:24px;border:1px solid rgba(91,173,235,.35);border-radius:20px;background:linear-gradient(145deg,#102344,#071326);color:#edf5ff;box-shadow:0 24px 80px #0009;font-family:system-ui,sans-serif}
      #rnd-wallet-dialog h3{margin:0 0 6px;font-size:21px}#rnd-wallet-dialog p{margin:0 0 18px;color:#a9bdd9;font-size:13px;line-height:1.5}
      .rnd-wallet-option{display:flex;width:100%;align-items:center;gap:13px;margin:9px 0;padding:13px;border:1px solid rgba(133,173,224,.22);border-radius:13px;background:#0a1930;color:#f5f8ff;text-align:left;cursor:pointer;font-size:14px;font-weight:700}
      .rnd-wallet-option:hover{border-color:#42c9ee;background:#102849}.rnd-wallet-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#142c4d;font-size:20px}
      .rnd-wallet-option small{display:block;color:#9db1cf;font-size:11px;font-weight:400;margin-top:3px}
      #rnd-wallet-close{float:right;border:0;background:transparent;color:#c6d7ef;font-size:24px;cursor:pointer}
      #rnd-wallet-help{margin-top:14px;font-size:11px;color:#8fa6c7;line-height:1.5}
    `;
    document.head.appendChild(el('style', { id: 'rnd-wallet-style' }, css));
  }

  function ensureModal() {
    if (state.modal) return state.modal;
    styleModal();
    const overlay = el('div', { id: 'rnd-wallet-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rnd-wallet-title' });
    const dialog = el('div', { id: 'rnd-wallet-dialog' });
    const close = el('button', { id: 'rnd-wallet-close', type: 'button', 'aria-label': 'Close wallet selector' }, '×');
    close.addEventListener('click', () => finish(new Error('Wallet selection cancelled.')));
    const title = el('h3', { id: 'rnd-wallet-title' }, 'Connect a wallet');
    const desc = el('p', {}, 'Apna wallet chunein. Aapka wallet connection approve karne ko puchhega.');
    const options = el('div', { id: 'rnd-wallet-options' });
    const help = el('div', { id: 'rnd-wallet-help' }, 'Mobile tip: Agar ye link WhatsApp se Chrome/Safari me khula hai, to apna wallet chunein — website us wallet ke DApp browser me khul jayegi aur wahan khud connect ho jayegi. Na khule to "Copy website link" dabakar link wallet ke DApp browser me paste karein.');
    dialog.append(close, title, desc, options, help);
    overlay.append(dialog);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(new Error('Wallet selection cancelled.')); });
    document.body.append(overlay);
    state.modal = overlay;
    return overlay;
  }

  function finish(error, provider) {
    if (state.modal) state.modal.style.display = 'none';
    const resolve = state.resolve, reject = state.reject;
    state.resolve = state.reject = null;
    if (error) reject && reject(error);
    else resolve && resolve(provider);
  }

  function pageUrl() {
    const u = new URL(location.href);
    u.searchParams.set('rndwc', '1'); // wallet browser me khulte hi auto-connect ke liye
    return u;
  }

  function openWalletApp(kind) {
    const u = pageUrl();
    if (kind === 'metamask') { location.href = `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}${u.hash}`; return; }
    if (kind === 'trust') { location.href = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(u.href)}`; return; }
    if (kind === 'tokenpocket') { location.href = `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url: u.href, chain: 'BSC', source: 'RND' }))}`; return; }
    if (kind === 'safepal') { location.href = `https://link.safepal.io/open_url?url=${encodeURIComponent(u.href)}`; return; }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    try {
      const t = el('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch (_) { return false; }
  }

  async function authorize(provider) {
    if (!provider) throw new Error('Selected wallet provider was not found. Open the website inside that wallet app and try again.');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('Wallet did not return an account. Please approve the connection.');
    state.provider = provider;
    window.dispatchEvent(new CustomEvent('rndwallet:connected', { detail: { provider, account: accounts[0] } }));
    return provider;
  }

  function openSelector() {
    const overlay = ensureModal();
    const options = overlay.querySelector('#rnd-wallet-options');
    options.innerHTML = '';
    const detected = discover();

    const makeOption = (icon, title, subtitle, action) => {
      const btn = el('button', { class: 'rnd-wallet-option', type: 'button' });
      const badge = el('span', { class: 'rnd-wallet-icon' }, icon);
      const label = el('span');
      label.append(el('span', {}, title), el('small', {}, subtitle));
      btn.append(badge, label);
      btn.addEventListener('click', () => action(label.querySelector('small')));
      options.append(btn);
    };

    const used = new Set();
    ['metamask', 'trust', 'tokenpocket', 'safepal'].forEach(kind => {
      const d = detected.find(x => x.kind === kind);
      if (d) used.add(d);
      makeOption(ICON[kind], LABEL[kind], d ? 'Detected — tap to connect' : (isMobile ? `Open in ${LABEL[kind]} app` : `${LABEL[kind]} extension/app not detected`), async () => {
        if (d) { try { await authorize(d.provider); finish(null, d.provider); } catch (e) { finish(e); } return; }
        if (isMobile) {
          const err = new Error(`${LABEL[kind]} app khul raha hai…`); err.rndRedirect = true;
          finish(err); openWalletApp(kind);
        } else {
          finish(new Error(`${LABEL[kind]} detect nahi hua. Extension install/unlock karke page refresh karein.`));
        }
      });
    });
    detected.filter(x => !used.has(x)).forEach(x => {
      makeOption(ICON.other, x.name || LABEL.other, 'Use the wallet detected by this browser', async () => {
        try { await authorize(x.provider); finish(null, x.provider); } catch (e) { finish(e); }
      });
    });
    makeOption('📋', 'Copy website link', 'Wallet ke DApp browser me paste karke kholein', async small => {
      const ok = await copyText(pageUrl().href);
      if (small) small.textContent = ok ? 'Link copied ✔ — ab wallet ke DApp/Browser me paste karein' : 'Copy fail — address bar se link copy karein';
    });
    overlay.style.display = 'flex';
  }

  async function connect() {
    if (state.provider) {
      try {
        const accounts = await state.provider.request({ method: 'eth_accounts' });
        if (accounts && accounts.length) return state.provider;
      } catch (_) {}
      state.provider = null;
    }
    const found = await waitForProviders();
    // Mobile par wallet ke apne DApp browser me sirf ek hi provider hota hai — seedha connect.
    if (isMobile && found.length === 1) return authorize(found[0].provider);
    return new Promise((resolve, reject) => {
      if (state.reject) state.reject(new Error('Wallet selection cancelled.'));
      state.resolve = resolve;
      state.reject = reject;
      openSelector();
    });
  }

  window.RNDWallet = {
    connect,
    getProvider: () => state.provider,
    reset: () => { state.provider = null; },
    open: openSelector
  };
})();
