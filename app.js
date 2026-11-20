(() => {
'use strict';
const { ethers } = window;
const A = { locker: '0xE930dca16D6ce36D3666AC48DD51db5AAd713590', rnd: '0xcF1FbF18bE9202865bcf88E6349B9D207F75942d', usdt: '0x55d398326f99059fF775485246999027B3197955', pair: '0xd6f291a4dbefa0ff99b07d247aa73ff7c20e9991' };
const ro = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/', 56, { staticNetwork: true });
const BAL = ['function balanceOf(address) view returns(uint256)'];
const L = new ethers.Contract(A.locker, ['function nextLockId() view returns(uint256)', 'function getUserLockIds(address) view returns(uint256[])', 'function getLock(uint256) view returns((address user,uint256 lpAmount,uint256 lockedAt,uint256 unlockAt,uint256 usdtSideValue,uint256 rndSideValue,uint256 totalUsdValue,uint256 rewardAmount,bool lpReleased,bool rewardRequested,bool rewardPaid,bytes32 rewardPaymentTxHash))', 'function owner() view returns(address)'], ro);
const T = { u: new ethers.Contract(A.usdt, BAL, ro), r: new ethers.Contract(A.rnd, BAL, ro), p: new ethers.Contract(A.pair, BAL, ro) };
const $ = id => document.getElementById(id);
const f = (v, n = 2) => Number(ethers.formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: n });
const short = x => x.slice(0, 6) + '…' + x.slice(-4);
const day = ts => new Date(Number(ts) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
const scan = 'https://bscscan.com/address/' + A.locker + '#events';
let locks = [], showAll = false, flag = false;

function put(id, txt) { const e = $(id); if (!e || e.textContent === txt) return; e.textContent = txt; e.animate([{ opacity: .3, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 350 }); }
function status(p) {
  if (p.lpReleased) return ['COMPLETED', 'done'];
  return Date.now() / 1000 >= Number(p.unlockAt) ? ['UNLOCKED', ''] : ['ACTIVE', 'active'];
}
function chart(id, pts, pre = '') {
  const e = $(id); if (pts.length < 1) { e.innerHTML = '<div class="none">No on-chain data yet.</div>'; return; }
  const W = 600, H = 150, m = Math.max(...pts, 1), n = Math.max(pts.length - 1, 1);
  const xy = pts.map((v, i) => [pts.length === 1 ? W / 2 : i / n * W, H - 10 - v / m * (H - 30)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  e.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8b94a" stop-opacity=".5"/><stop offset="1" stop-color="#e8b94a" stop-opacity="0"/></linearGradient></defs><path d="${d}L${xy.at(-1)[0]} ${H}L${xy[0][0]} ${H}Z" fill="url(#g${id})"/><path d="${d}" fill="none" stroke="#ffd97a" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><small class="hint">Max: ${pre}${m.toLocaleString('en-US', { maximumFractionDigits: 0 })}</small>`;
}
function actCard(p, id) {
  const [st, c] = status(p), dur = Math.round((Number(p.unlockAt) - Number(p.lockedAt)) / 86400);
  return `<article class="act"><div class="ph"><b>LP LOCK #${String(id).padStart(3, '0')}</b><span class="status ${c}">${st}</span></div><div class="ag"><div class="amt"><small>LP VALUE</small><b>$${f(p.totalUsdValue)}</b></div><div><small>WALLET</small><b>${short(p.user)}</b></div><div><small>PAIR</small><b>RND/USDT</b></div><div><small>LP TOKENS</small><b>${f(p.lpAmount, 8)}</b></div><div><small>DURATION</small><b>${dur} DAYS</b></div><div><small>DATE</small><b>${day(p.lockedAt)}</b></div><div><small>UNLOCK</small><b>${day(p.unlockAt)}</b></div></div><div class="pa"><a class="btn line sm" target="_blank" rel="noopener" href="${scan}">VIEW ON BSCSCAN</a></div></article>`;
}
function render(user) {
  const act = [...locks].sort((a, b) => Number(b.p.lockedAt) - Number(a.p.lockedAt));
  $('actList').innerHTML = act.length ? act.slice(0, showAll ? 500 : 5).map(x => actCard(x.p, x.id)).join('') : '<div class="empty">No LP locks confirmed by the contract yet.</div>';
  $('viewAll').textContent = showAll ? 'SHOW LATEST' : 'VIEW ALL LP ACTIVITY';
  const live = locks.filter(x => !x.p.lpReleased), sum = k => live.reduce((s, x) => s + x.p[k], 0n);
  const wallets = new Set(locks.map(x => x.p.user.toLowerCase()));
  const paid = locks.filter(x => x.p.rewardPaid).reduce((s, x) => s + x.p.rewardAmount, 0n);
  put('gLp', f(sum('lpAmount'), 6) + ' LP'); put('gLocks', String(locks.length)); put('gWallets', String(wallets.size));
  put('gPaid', f(paid) + ' RND'); put('gVal', '$' + f(sum('totalUsdValue')));
  put('cWallets', String(wallets.size)); put('cLp', f(sum('lpAmount'), 6) + ' LP');
  const asc = [...locks].sort((a, b) => Number(a.p.lockedAt) - Number(b.p.lockedAt)); let cum = 0, seen = new Set(), cw = [];
  chart('chart1', asc.map(x => (cum += Number(ethers.formatUnits(x.p.totalUsdValue, 18)))), '$');
  asc.forEach(x => { seen.add(x.p.user.toLowerCase()); cw.push(seen.size); }); chart('chart2', cw);
  const cut = Date.now() / 1000 - 30 * 86400, rec = locks.filter(x => Number(x.p.lockedAt) >= cut).reduce((s, x) => s + x.p.totalUsdValue, 0n);
  put('cGrow', '+$' + f(rec));
  $('cRecent').innerHTML = act.slice(0, 5).map(x => `<div class="row"><span>${short(x.p.user)}</span><b>$${f(x.p.totalUsdValue)}</b><span>${day(x.p.lockedAt)}</span></div>`).join('') || '<div class="empty">No participants yet.</div>';
  $('admList').innerHTML = act.map(x => `<div class="row"><span>#${x.id}</span><span>${short(x.p.user)}</span><span>$${f(x.p.totalUsdValue)}</span><span>${status(x.p)[0]}${x.p.rewardPaid ? ' · PAID' : x.p.rewardRequested ? ' · REQUESTED' : ''}</span></div>`).join('');
  if (!user) return;
  const mine = locks.filter(x => x.p.user.toLowerCase() === user.toLowerCase()), ml = mine.filter(x => !x.p.lpReleased);
  const ms = k => ml.reduce((s, x) => s + x.p[k], 0n), now = Date.now() / 1000;
  put('myLp', f(ms('lpAmount'), 6)); put('myVal', '$' + f(ms('totalUsdValue'))); put('myRew', f(ms('rewardAmount')) + ' RND'); put('myCount', String(ml.length));
  const next = ml.map(x => Number(x.p.unlockAt)).filter(t => t > now).sort((a, b) => a - b)[0];
  put('myDays', next ? Math.ceil((next - now) / 86400) + ' days' : ml.length ? 'Unlocked' : '—');
  put('rwVal', '$' + f(ms('totalUsdValue'))); put('rwEst', f(ms('rewardAmount')) + ' RND');
  $('rwList').innerHTML = mine.length ? mine.map(x => `<div class="row"><span>Lock #${x.id}</span><b>${f(x.p.rewardAmount)} RND</b><span>${x.p.rewardPaid ? 'PAID' : x.p.rewardRequested ? 'REQUESTED' : Date.now() / 1000 >= Number(x.p.unlockAt) ? 'ELIGIBLE TO REQUEST' : 'LOCKED'}</span>${x.p.rewardPaymentTxHash !== ethers.ZeroHash ? `<a target="_blank" rel="noopener" href="https://bscscan.com/tx/${x.p.rewardPaymentTxHash}">Payment TX</a>` : ''}</div>`).join('') : '<div class="empty">No locks for this wallet yet.</div>';
  const el = mine.filter(x => !x.p.rewardRequested && !x.p.rewardPaid && !x.p.lpReleased && now >= Number(x.p.unlockAt)), sel = $('wdLock'), cur = sel.value;
  eligible = el;
  sel.innerHTML = el.length ? el.map(x => `<option value="${x.id}">Lock #${x.id} — ${f(x.p.rewardAmount)} RND</option>`).join('') : '<option value="">कोई eligible reward नहीं</option>';
  if (el.some(x => String(x.id) === cur)) sel.value = cur;
  wdFill();
}
let eligible = [];
const wdFill = () => { const x = eligible.find(y => String(y.id) === $('wdLock').value); $('wdAmt').value = x ? ethers.formatUnits(x.p.rewardAmount, 18) : ''; };
const toast = (s, err, hash) => {
  const t = $('toast'); t.className = 'toast show' + (err ? ' error' : ''); t.textContent = s;
  if (hash) { const a = document.createElement('a'); a.href = 'https://bscscan.com/tx/' + hash; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'BscScan'; t.append(a); }
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 8000);
};
async function wdSend() {
  if (!window.ethereum) throw Error('पहले Wallet Connect करें।');
  const id = $('wdLock').value, x = eligible.find(y => String(y.id) === id), addr = $('wdAddr').value.trim();
  if (!x) throw Error('कोई eligible reward उपलब्ध नहीं है।');
  if (!ethers.isAddress(addr)) throw Error('सही BSC address डालें (0x…)।');
  const bp = new ethers.BrowserProvider(window.ethereum);
  if ((await bp.getNetwork()).chainId !== 56n) throw Error('BNB Smart Chain पर switch करें।');
  const s = await bp.getSigner();
  if ((await s.getAddress()).toLowerCase() !== x.p.user.toLowerCase()) throw Error('यह lock आपके connected wallet का नहीं है।');
  toast('Wallet में confirm करें…');
  const tx = await new ethers.Contract(A.locker, ['function requestRewardWithdrawal(uint256)'], s).requestRewardWithdrawal(BigInt(id));
  toast('Transaction भेजा गया…', false, tx.hash); await tx.wait();
  const txt = `Reward withdrawal request | Lock #${id} | ${ethers.formatUnits(x.p.rewardAmount, 18)} RND | Pay to: ${addr} | Request TX: ${tx.hash}`;
  $('wdInfo').textContent = 'Request दर्ज हो गई। Admin को यह details भेजें: ' + txt;
  try { await navigator.clipboard.writeText(txt); } catch {}
  toast('Request सफल। Details copy हो गईं।', false, tx.hash); load();
}
$('wdLock').onchange = wdFill;
$('wdSelf').onclick = async () => { try { $('wdAddr').value = (await window.ethereum.request({ method: 'eth_accounts' }))[0] || ''; } catch {} };
$('wdBtn').onclick = async e => {
  const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.classList.add('busy');
  try { await wdSend(); } catch (err) { toast(err?.code === 'ACTION_REJECTED' ? 'आपने transaction reject कर दिया।' : (err?.shortMessage || err?.message || 'विफल'), true); }
  finally { b.disabled = false; b.classList.remove('busy'); }
};
async function load() {
  let user = null;
  try { const a = await window.ethereum?.request({ method: 'eth_accounts' }); user = a?.[0] || null; } catch {}
  try {
    const n = Number(await L.nextLockId());
    const res = await Promise.allSettled(Array.from({ length: n + 1 }, (_, i) => L.getLock(i)));
    locks = res.map((r, i) => r.status === 'fulfilled' && r.value.user !== ethers.ZeroAddress ? { id: i, p: r.value } : null).filter(Boolean);
    render(user);
  } catch (e) { console.warn(e); $('actList').innerHTML = '<div class="empty">Could not read locks from the contract. Retrying…</div>'; }
  if (user) try {
    const [u, r, l] = await Promise.all([T.u.balanceOf(user), T.r.balanceOf(user), T.p.balanceOf(user)]);
    put('balU', f(u, 4)); put('balR', f(r, 4)); put('balLP', f(l, 8));
  } catch {}
}
let deb; const later = () => { clearTimeout(deb); deb = setTimeout(load, 1500); };

$('heroConnect').onclick = () => $('connect').click();
$('viewAll').onclick = () => { showAll = !showAll; load(); };
new MutationObserver(later).observe($('positions'), { childList: true });
$('refresh').addEventListener('click', later);

/* Confirmation screen before the final lock transaction */
$('lockLP').addEventListener('click', e => {
  if (flag) return;
  e.stopImmediatePropagation(); e.preventDefault();
  $('mAmt').textContent = $('lpAmount').value || '0'; $('modal').classList.remove('hidden');
}, true);
$('mNo').onclick = () => $('modal').classList.add('hidden');
$('mYes').onclick = () => { $('modal').classList.add('hidden'); flag = true; $('lockLP').click(); flag = false; };

/* Bottom nav active state */
const links = [...document.querySelectorAll('.bnav a')];
const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) links.forEach(a => a.classList.toggle('on', a.dataset.s === en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
['top', 'add', 'dashboard', 'positions-wrap', 'activity'].forEach(id => io.observe($(id)));

load(); setInterval(load, 45000);
if (window.ethereum?.on) window.ethereum.on('accountsChanged', later);
})();
