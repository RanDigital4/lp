(() => {
'use strict';
const { ethers } = window;
const A = {
  locker: '0xE930dca16D6ce36D3666AC48DD51db5AAd713590',
  rnd: '0xcF1FbF18bE9202865bcf88E6349B9D207F75942d',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
  pair: '0xd6f291a4dbefa0ff99b07d247aa73ff7c20e9991',
  router: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
};
const RPC = 'https://bsc-dataseed.binance.org/';
const ERC = ['function decimals() view returns(uint8)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
const PAIR = [...ERC, 'function getReserves() view returns(uint112,uint112,uint32)', 'function token0() view returns(address)'];
const ROUTER = ['function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns(uint256,uint256,uint256)'];
const LOCK = ['function owner() view returns(address)', 'function nextLockId() view returns(uint256)', 'function totalLPLocked() view returns(uint256)', 'function observationCount() view returns(uint256)', 'function previewLP(uint256) view returns(uint256,uint256,uint256,uint256)', 'function lockLP(uint256) returns(uint256)', 'function getUserLockIds(address) view returns(uint256[])', 'function getLock(uint256) view returns((address user,uint256 lpAmount,uint256 lockedAt,uint256 unlockAt,uint256 usdtSideValue,uint256 rndSideValue,uint256 totalUsdValue,uint256 rewardAmount,bool lpReleased,bool rewardRequested,bool rewardPaid,bytes32 rewardPaymentTxHash))', 'function requestRewardWithdrawal(uint256)', 'function releaseLP(uint256)', 'function updatePriceObservation()', 'function markRewardPaid(uint256,bytes32)'];

const $ = id => document.getElementById(id);
const short = x => x ? x.slice(0, 6) + '…' + x.slice(-4) : '—';
const fmt = (x, n = 4) => Number(x).toLocaleString('en-US', { maximumFractionDigits: n });
const fu = (v, d = 18, n = 4) => fmt(ethers.formatUnits(v, d), n);
const reason = e => e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || 'Transaction विफल हुआ';
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

const ro = new ethers.JsonRpcProvider(RPC, 56, { staticNetwork: true });
const R = {
  locker: new ethers.Contract(A.locker, LOCK, ro), pair: new ethers.Contract(A.pair, PAIR, ro),
  usdt: new ethers.Contract(A.usdt, ERC, ro), rnd: new ethers.Contract(A.rnd, ERC, ro)
};
let provider, signer, user, W = {}, dec = { u: 18, r: 18 }, pool = null, quoteTimer, quoteSeq = 0;

function toast(s, error = false, hash) {
  const t = $('toast');
  t.className = 'toast show' + (error ? ' error' : '');
  t.textContent = s;
  if (hash) { const a = document.createElement('a'); a.href = 'https://bscscan.com/tx/' + hash; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'BscScan'; t.append(a); }
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 7000);
}

/* ---------- Wallet ---------- */
async function ensureChain() {
  const eth = window.ethereum;
  if (!eth?.request) throw Error('Wallet provider नहीं मिला। MetaMask/Wallet DApp Browser खोलें।');
  const current = BigInt(await eth.request({ method: 'eth_chainId' }));
  if (current === 56n) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
  } catch (e) {
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code !== 4902) throw e;
    await eth.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: '0x38', chainName: 'BNB Smart Chain',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: [RPC], blockExplorerUrls: ['https://bscscan.com']
    }] });
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
  }
  const confirmed = BigInt(await eth.request({ method: 'eth_chainId' }));
  if (confirmed !== 56n) throw Error('Wallet अभी BNB Smart Chain पर नहीं आया।');
}
function setNet(ok) {
  const p = $('netPill'); p.className = 'chip ' + (ok ? 'ok' : 'bad');
  p.lastElementChild.textContent = ok ? 'BSC Mainnet' : 'गलत Network';
}
async function connect(silent = false) {
  const eth = window.ethereum;
  if (!eth?.request) throw Error('MetaMask या BNB Chain compatible wallet के DApp Browser में वेबसाइट खोलें।');
  if (!silent) {
    await eth.request({ method: 'eth_requestAccounts' });
    await ensureChain();
  }
  provider = new ethers.BrowserProvider(eth);
  const net = await provider.getNetwork();
  setNet(net.chainId === 56n);
  if (net.chainId !== 56n) {
    signer = null; user = null; W = {};
    $('connect').textContent = 'Switch to BSC';
    throw Error('यह वेबसाइट केवल BNB Smart Chain Mainnet पर काम करती है।');
  }
  signer = await provider.getSigner(); user = await signer.getAddress();
  W = {
    locker: new ethers.Contract(A.locker, LOCK, signer), rnd: new ethers.Contract(A.rnd, ERC, signer),
    usdt: new ethers.Contract(A.usdt, ERC, signer), pair: new ethers.Contract(A.pair, PAIR, signer),
    router: new ethers.Contract(A.router, ROUTER, signer)
  };
  $('connect').textContent = short(user);
  $('walletAddr').textContent = user; $('copyAddr').classList.remove('hidden');
  await refresh();
  if (!silent) toast('Wallet connect हो गया।');
}
function need() {
  if (!signer || !user) throw Error('पहले BNB Smart Chain wallet connect करें।');
  if (!window.ethereum?.request) throw Error('Wallet provider disconnect हो गया।');
}

/* ---------- Transactions ---------- */
async function send(label, fn) {
  toast(label + ' — wallet में confirm करें…');
  const tx = await fn();
  toast('Transaction भेजा गया, confirmation का इंतज़ार…', false, tx.hash);
  await tx.wait();
  toast(label + ' सफल हुआ।', false, tx.hash);
  await refresh();
  return tx;
}
async function ensureAllowance(token, spender, amount, label) {
  if (await token.allowance(user, spender) >= amount) return;
  await send(label, () => token.approve(spender, amount));
}

/* ---------- Data ---------- */
async function loadPool() {
  const [t0, res] = await Promise.all([R.pair.token0(), R.pair.getReserves()]);
  const u0 = same(t0, A.usdt);
  if (!u0 && !same(t0, A.rnd)) throw Error('Configured LP Pair में RND/USDT tokens match नहीं कर रहे।');
  const ru = BigInt(u0 ? res[0] : res[1]), rr = BigInt(u0 ? res[1] : res[0]);
  if (!ru || !rr) throw Error('Pool में अभी reserves नहीं हैं; live quote उपलब्ध नहीं।');
  pool = { ru, rr };
  return pool;
}
async function loadStats() {
  try {
    const [total, next, obs, owner] = await Promise.all([R.locker.totalLPLocked(), R.locker.nextLockId(), R.locker.observationCount(), R.locker.owner()]);
    $('total').textContent = fu(total, 18, 6) + ' LP'; $('next').textContent = next.toString();
    $('obs').textContent = $('oracleCount').textContent = obs + ' / 24'; $('owner').textContent = short(owner);
    if (user) $('admin').classList.toggle('hidden', !same(owner, user));
  } catch (e) { console.warn(e); }
}
async function loadBalances() {
  if (!user) return;
  const [u, r, lp] = await Promise.all([R.usdt.balanceOf(user), R.rnd.balanceOf(user), R.pair.balanceOf(user)]);
  W.bal = { u, r, lp };
}
async function refresh() {
  need();
  await Promise.all([loadStats(), loadBalances()]);
  await positions();
}

/* ---------- Positions ---------- */
function left(ts) {
  const s = ts - Date.now() / 1000; if (s <= 0) return '';
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  return d + ' दिन ' + h + ' घंटे बाकी';
}
async function positions() {
  const root = $('positions'), ids = await W.locker.getUserLockIds(user);
  if (!ids.length) { root.innerHTML = '<div class="empty">इस wallet का अभी कोई LP lock नहीं है। ऊपर Step 1 से शुरू करें।</div>'; return; }
  const items = await Promise.all(ids.map(async id => [id, await W.locker.getLock(id)]));
  root.innerHTML = '';
  for (const [id, p] of items.reverse()) {
    const unlocked = Date.now() / 1000 >= Number(p.unlockAt);
    const [st, cls] = p.lpReleased ? ['LP वापस मिल गया', 'done'] : p.rewardPaid ? ['Reward Paid', ''] : unlocked ? ['Unlock हो गया', ''] : ['Locked', 'lock'];
    const canReq = unlocked && !p.rewardRequested && !p.rewardPaid && !p.lpReleased, canRel = unlocked && !p.lpReleased;
    const el = document.createElement('article'); el.className = 'position';
    el.innerHTML = `<div class="ph"><b>Lock #${id}</b><span class="status ${cls}">${st}</span></div>
<div class="pg"><div><small>LP मात्रा</small><b>${fu(p.lpAmount, 18, 8)}</b></div><div><small>Lock के समय value</small><b>$${fu(p.totalUsdValue, 18, 2)}</b></div><div><small>Reward</small><b>${fu(p.rewardAmount, 18, 4)} RND</b></div><div><small>Lock तारीख</small><b>${new Date(Number(p.lockedAt) * 1000).toLocaleString()}</b></div><div><small>Unlock तारीख</small><b>${new Date(Number(p.unlockAt) * 1000).toLocaleString()}</b></div><div><small>Reward स्थिति</small><b>${p.rewardPaid ? 'Paid' : p.rewardRequested ? 'Request हो चुका' : 'Request नहीं हुआ'}</b></div></div>
<div class="pa">${!unlocked ? `<span class="hint">${left(Number(p.unlockAt))}</span>` : ''}${canReq ? `<button class="btn soft" data-a="request" data-id="${id}">Reward Request करें</button>` : ''}${canRel ? `<button class="btn gold" data-a="release" data-id="${id}">LP वापस लें</button>` : ''}${p.rewardPaymentTxHash !== ethers.ZeroHash ? `<a class="btn line" target="_blank" rel="noopener" href="https://bscscan.com/tx/${p.rewardPaymentTxHash}">Reward TX</a>` : ''}</div>`;
    root.append(el);
  }
}

/* ---------- Quote ---------- */
function parseAmt(s, d) { s = (s || '').trim(); if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null; try { const v = ethers.parseUnits(s.endsWith('.') ? s.slice(0, -1) : s, d); return v > 0n ? v : null; } catch { return null; } }
async function updateQuote() {
  const out = $('rndAmount'), st = $('quoteStatus'), seq = ++quoteSeq, raw = $('usdtAmount').value;
  const ua = parseAmt(raw, dec.u);
  if (!ua) { out.value = ''; st.textContent = raw ? 'सही USDT मात्रा डालें।' : 'USDT मात्रा डालें।'; return; }
  try {
    const p = await loadPool(); if (seq !== quoteSeq) return;
    const ra = ua * p.rr / p.ru;
    out.value = ethers.formatUnits(ra, dec.r);
    $('poolPrice').textContent = '1 USDT ≈ ' + fmt(Number(ethers.formatUnits(p.rr * 10n ** BigInt(dec.u) / p.ru, dec.r)), 6) + ' RND';
    st.textContent = 'Live pool ratio से quote। Execution पर राशि थोड़ी बदल सकती है; slippage लागू होगा।';
  } catch (e) { out.value = ''; st.textContent = reason(e); }
}

/* ---------- Actions ---------- */
async function addLiquidity() {
  need();
  const ua = parseAmt($('usdtAmount').value, dec.u);
  if (!ua) throw Error('सही USDT मात्रा डालें।');
  const p = await loadPool(), ra = ua * p.rr / p.ru;
  if (ra === 0n) throw Error('मात्रा बहुत कम है।');
  const routerCode = await ro.getCode(A.router);
  if (routerCode === '0x') throw Error('PancakeSwap V2 Router address पर contract code नहीं मिला।');
  const pairCode = await ro.getCode(A.pair);
  if (pairCode === '0x') throw Error('RND/USDT V2 LP Pair address पर contract code नहीं मिला।');
  const [ub, rb] = await Promise.all([R.usdt.balanceOf(user), R.rnd.balanceOf(user)]);
  if (ub < ua) throw Error('पर्याप्त USDT नहीं है। उपलब्ध: ' + fu(ub, dec.u, 6));
  if (rb < ra) throw Error('पर्याप्त RND नहीं है। ज़रूरत: ' + fu(ra, dec.r, 6) + ' RND');
  const lpBefore = await R.pair.balanceOf(user);
  await ensureAllowance(W.usdt, A.router, ua, 'USDT Approve');
  await ensureAllowance(W.rnd, A.router, ra, 'RND Approve');
  const bps = BigInt($('slippage').value), minU = ua * (10000n - bps) / 10000n, minR = ra * (10000n - bps) / 10000n;
  await send('Liquidity जोड़ना', () => W.router.addLiquidity(A.rnd, A.usdt, ra, ua, minR, minU, user, Math.floor(Date.now() / 1000) + 1200));
  const minted = (await R.pair.balanceOf(user)) - lpBefore;
  if (minted > 0n) { $('lpAmount').value = ethers.formatUnits(minted, 18); toast('Liquidity जुड़ गई। नया LP amount Step 2 में भर दिया गया है।'); document.getElementById('lock').scrollIntoView(); }
}
function lpAmt() { const v = parseAmt($('lpAmount').value, 18); if (!v) throw Error('सही LP Token मात्रा डालें।'); return v; }
async function preview() {
  need(); const r = await W.locker.previewLP(lpAmt());
  $('previewResult').innerHTML = `USDT side: <b>$${fu(r[0], 18, 4)}</b><br>RND side: <b>$${fu(r[1], 18, 4)}</b><br>कुल eligible value: <b>$${fu(r[2], 18, 4)}</b><br>अनुमानित reward: <b>${fu(r[3], 18, 4)} RND</b>`;
}
async function approveLP() {
  need(); const a = lpAmt();
  if ((await R.pair.balanceOf(user)) < a) throw Error('Wallet में इतना LP नहीं है।');
  await ensureAllowance(W.pair, A.locker, a, 'LP Approve'); toast('LP approve हो गया। अब "180 दिन Lock करें" दबाएँ।');
}
async function lockLP() {
  need(); const a = lpAmt();
  if ((await R.pair.balanceOf(user)) < a) throw Error('Wallet में इतना LP नहीं है।');
  if ((await R.pair.allowance(user, A.locker)) < a) throw Error('पहले "LP Approve करें" दबाएँ।');
  await send('LP को 180 दिन Lock करना', () => W.locker.lockLP(a));
  $('lpAmount').value = ''; document.getElementById('positions-wrap').scrollIntoView();
}
async function oracle() { need(); await send('Price observation update', () => W.locker.updatePriceObservation()); }
async function markPaid() {
  need(); const id = parseAmt($('adminId').value, 0), h = $('paymentHash').value.trim();
  if (!id || !/^0x[0-9a-fA-F]{64}$/.test(h)) throw Error('सही Lock ID और 0x + 64 hex transaction hash डालें।');
  await send('Reward payment दर्ज करना', () => W.locker.markRewardPaid(id, h));
}

/* ---------- Wiring ---------- */
function act(id, fn) {
  const b = $(id);
  b.addEventListener('click', async () => {
    if (b.disabled) return; b.disabled = true; b.classList.add('busy');
    try { await fn(); } catch (e) { console.error(e); toast(e?.code === 'ACTION_REJECTED' ? 'आपने transaction reject कर दिया।' : reason(e), true); }
    finally { b.disabled = false; b.classList.remove('busy'); }
  });
}
act('connect', () => connect()); act('refresh', refresh); act('addLiquidity', addLiquidity);
act('preview', preview); act('approveLP', approveLP); act('lockLP', lockLP); act('updateOracle', oracle); act('markPaid', markPaid);

$('usdtAmount').addEventListener('input', () => { clearTimeout(quoteTimer); quoteTimer = setTimeout(updateQuote, 300); });
$('maxUsdt').onclick = () => { if (!W.bal) return toast('पहले Wallet Connect करें।', true); $('usdtAmount').value = ethers.formatUnits(W.bal.u, dec.u); updateQuote(); };
$('maxLp').onclick = () => { if (!W.bal) return toast('पहले Wallet Connect करें।', true); $('lpAmount').value = ethers.formatUnits(W.bal.lp, 18); };
$('share').onclick = async () => { const d = { title: 'RND LP Rewards', text: 'RND/USDT LP लगाइए, 180 दिन lock करके RND reward और PancakeSwap trading fees पाइए।', url: location.href }; try { if (navigator.share) await navigator.share(d); else { await navigator.clipboard.writeText(d.url); toast('Link copy हो गया। अब दूसरों को भेजें।'); } } catch {} };
$('copyAddr').onclick = () => navigator.clipboard?.writeText(user).then(() => toast('Address copy हो गया।'));
$('positions').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
  const id = BigInt(b.dataset.id), req = b.dataset.a === 'request';
  b.disabled = true; b.classList.add('busy');
  send(req ? 'Reward Request' : 'LP वापस लेना', () => req ? W.locker.requestRewardWithdrawal(id) : W.locker.releaseLP(id))
    .catch(err => toast(err?.code === 'ACTION_REJECTED' ? 'आपने transaction reject कर दिया।' : reason(err), true))
    .finally(() => { b.disabled = false; b.classList.remove('busy'); });
});

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', () => location.reload());
  window.ethereum.on?.('chainChanged', () => location.reload());
  window.ethereum.on?.('disconnect', () => {
    signer = null; user = null; W = {};
    setNet(false);
    $('connect').textContent = 'Connect Wallet';
    $('walletAddr').textContent = 'Not connected';
  });
}
(async () => {
  try { dec = { u: Number(await R.usdt.decimals()), r: Number(await R.rnd.decimals()) }; } catch (e) { console.warn(e); }
  loadStats(); loadPool().then(() => $('poolPrice').textContent = '1 USDT ≈ ' + fmt(Number(ethers.formatUnits(pool.rr * 10n ** BigInt(dec.u) / pool.ru, dec.r)), 6) + ' RND').catch(() => {});
  if (window.ethereum) {
    try { const acc = await window.ethereum.request({ method: 'eth_accounts' }); if (acc.length) await connect(true); else setNet(true); } catch (e) { console.warn(e); }
  }
  setInterval(() => { if (user) refresh().catch(() => {}); else loadStats(); }, 30000);
})();
})();
