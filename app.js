(() => {
  'use strict';
  const C = window.RND_CONFIG;
  const $ = id => document.getElementById(id);
  const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmt = (v, digits = 4) => Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });
  const short = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
  const zero = ethers.ZeroAddress;
  const E18 = 10n ** 18n;
  const sameAddr = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
  // Address ko hamesha valid checksum form me badalta hai (mixed-case checksum error se bachata hai)
  const normAddr = a => { try { return ethers.getAddress(String(a || '').trim().toLowerCase()); } catch (e) { return null; } };
  const A = {};
  ['locker', 'rnd', 'usdt', 'lpPair'].forEach(k => { A[k] = normAddr(C[k]); });
  const PAIR_ABI = ['function token0() view returns(address)', 'function totalSupply() view returns(uint256)', 'function getReserves() view returns(uint112,uint112,uint32)'];

  let browserProvider = null, signer = null, account = null, locker = null, readProvider = null, readLocker = null;
  let toastTimer, quoteSeq = 0, quoteTimer, referralFromUrl = zero, connecting = false, lastPending = 0, lastClaimed = 0, rewardCfg = null;
  const tokenContracts = {};

  const toast = msg => { const el = $('toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4300); };
  const status = (id, msg, link) => {
    const el = $(id); if (!el) return;
    el.textContent = msg;
    if (link) { el.append(' '); const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View on BscScan ↗'; el.append(a); }
    if (id === 'liquidityStatus') updateBusy(msg, link);
  };

  // ---- Full-screen "please wait" overlay ----
  let busyEl = null;
  function ensureBusy() {
    if (busyEl) return busyEl;
    busyEl = document.createElement('div');
    busyEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(3,8,20,.82);backdrop-filter:blur(6px);padding:20px';
    busyEl.innerHTML = '<div style="max-width:460px;width:100%;text-align:center;background:#0e1b33;border:1px solid #c9a24a;border-radius:20px;padding:32px 26px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6)"><div style="width:54px;height:54px;margin:0 auto 18px;border:5px solid rgba(255,255,255,.15);border-top-color:#f1c75b;border-radius:50%;animation:busyspin 1s linear infinite"></div><div id="busyTitle" style="font-size:1.35rem;font-weight:700;margin-bottom:10px"></div><div id="busyMsg" style="font-size:1rem;line-height:1.5;opacity:.9"></div><div style="margin-top:16px;font-size:.85rem;color:#f1c75b">⚠ Please wait. Page ko band ya refresh na karein.</div></div>';
    const st = document.createElement('style'); st.textContent = '@keyframes busyspin{to{transform:rotate(360deg)}}';
    document.head.append(st); document.body.append(busyEl);
    return busyEl;
  }
  function showBusy(title, msg) { const e = ensureBusy(); e.querySelector('#busyTitle').textContent = title; e.querySelector('#busyMsg').textContent = msg || ''; e.style.display = 'flex'; }
  function updateBusy(msg, link) {
    if (!busyEl || busyEl.style.display === 'none') return;
    const m = busyEl.querySelector('#busyMsg'); m.textContent = msg || '';
    if (link) { m.append(' '); const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.style.color = '#5ad1ff'; a.textContent = 'View on BscScan ↗'; m.append(a); }
  }
  function hideBusy() { if (busyEl) busyEl.style.display = 'none'; }
  const isBusy = () => !!busyEl && busyEl.style.display !== 'none';

  const txUrl = hash => `${C.explorer}/tx/${hash}`;
  const addrUrl = address => `${C.explorer}/address/${address}`;
  const parseErr = e => {
    if (!e) return 'Transaction failed or was rejected.';
    if (e.code === 4001 || e.code === 'ACTION_REJECTED') return 'Aapne wallet me transaction cancel kar di.';
    const r = e.revert && e.revert.args && e.revert.args[0];
    return (typeof r === 'string' && r) || e.reason || e.shortMessage || (e.info && e.info.error && e.info.error.message) || e.message || 'Transaction failed or was rejected.';
  };
  const units = (v, dec = 18) => ethers.parseUnits(String(v), dec);
  const human = (v, dec = 18, d = 4) => fmt(Number(ethers.formatUnits(v, dec)), d);
  const cleanAmount = raw => {
    raw = String(raw || '').trim().replace(',', '.');
    if (!/^[0-9]*\.?[0-9]*$/.test(raw) || raw === '' || raw === '.') return null;
    let [i, f = ''] = raw.split('.');
    f = f.slice(0, 18);
    const s = (i || '0') + (f ? '.' + f : '');
    return Number(s) > 0 ? s : null;
  };

  function checkConfig() {
    for (const k of ['locker', 'rnd', 'usdt', 'lpPair']) {
      if (!A[k]) throw new Error(`config.js me "${k}" address galat/adhura hai (0x ke baad poore 40 akshar chahiye). BscScan se poora address paste karein.`);
    }
  }

  // ---- Reward Reserve: sirf website par dikhane ke liye (contract se nahi padha jata) ----
  function showReserve() {
    const t = `${fmt(C.displayRewardReserve != null ? C.displayRewardReserve : 2000, 0)} RND`;
    setText('reserve', t); setText('reserveDetail', t);
  }

  // ---- UI helpers created dynamically (index.html me badlav ki zarurat nahi) ----
  function rewardBox() {
    let b = $('rewardPreview');
    if (!b) {
      b = document.createElement('div'); b.id = 'rewardPreview';
      b.style.cssText = 'display:none;margin:10px 0;padding:12px 14px;border:1px solid #c9a24a;border-radius:12px;background:rgba(241,199,91,.10);color:#f1c75b;font-weight:700;line-height:1.5';
      const note = $('quoteNote');
      if (note) note.insertAdjacentElement('beforebegin', b);
      else if ($('rndAmount')) $('rndAmount').insertAdjacentElement('afterend', b);
    }
    return b;
  }
  function showRewardBanner(text) {
    let b = $('rewardBanner');
    if (!b) {
      b = document.createElement('div'); b.id = 'rewardBanner';
      b.style.cssText = 'margin:12px 0;padding:14px 16px;border:1px solid #f1c75b;border-radius:14px;background:linear-gradient(135deg,rgba(241,199,91,.18),rgba(90,209,255,.10));color:#fff;font-weight:700;line-height:1.5';
      const btn = $('addLiquidityBtn');
      if (btn) btn.insertAdjacentElement('afterend', b);
    }
    b.textContent = text; b.style.display = 'block';
  }
  function renderRegisterBox(registered) {
    const input = $('referralLink'); if (!input) return;
    let box = $('registerBox');
    if (!box) { box = document.createElement('div'); box.id = 'registerBox'; box.style.cssText = 'margin-top:8px;font-size:.85rem;line-height:1.5'; input.insertAdjacentElement('afterend', box); }
    box.innerHTML = '';
    if (registered === null || !account) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (registered) { box.textContent = '✅ Aapka referral link active hai.'; return; }
    const t = document.createElement('div');
    t.textContent = '⚠ Referral link kaam kare iske liye wallet locker me register hona chahiye (ek baar, sirf gas fee).';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline'; b.style.marginTop = '6px'; b.textContent = 'Activate referral link'; b.onclick = registerWallet;
    box.append(t, b);
  }
  function renderPending(pending, claimed) {
    lastPending = pending; lastClaimed = claimed;
    setText('myPending', `${fmt(pending, 3)} RND`);
    const big = $('rewardPendingBig'); if (big) big.innerHTML = `${fmt(pending, 3)} <small>RND</small>`;
    setText('claimedTotal', `${fmt(claimed, 3)} RND`);
  }

  function setConnectedUI() {
    setText('connectBtn', account ? short(account) : 'Connect Wallet');
    setText('networkBadge', account ? '● BNB Chain connected' : '● Not connected');
    const nb = $('networkBadge'); if (nb) nb.classList.toggle('good', !!account);
    const rl = $('referralLink'); if (rl) rl.value = account ? `${location.origin}${location.pathname}?ref=${account}` : 'Connect wallet to generate your link';
    const refNote = referralFromUrl !== zero ? ` Referral applied: ${short(referralFromUrl)}` : '';
    status('liquidityStatus', account ? '' : `Connect your wallet to begin.${refNote}`);
    if (!account) renderRegisterBox(null);
  }

  async function ensureRead() {
    if (readLocker) return;
    checkConfig();
    let lastErr;
    for (const rpc of C.rpcUrls) {
      try {
        const p = new ethers.JsonRpcProvider(rpc, 56, { staticNetwork: true });
        const c = new ethers.Contract(A.locker, C.lockerAbi, p);
        await c.totalLPLocked();
        readProvider = p; readLocker = c;
        try {
          const [r, u] = await Promise.all([c.RND(), c.USDT()]);
          if (!sameAddr(r, A.rnd) || !sameAddr(u, A.usdt)) toast('Warning: config.js ke RND/USDT address contract se match nahi karte.');
        } catch (e) {}
        return;
      } catch (e) { lastErr = e; }
    }
    readProvider = null; readLocker = null;
    throw new Error('BNB Chain RPC se locker contract read nahi ho paya. Locker address aur network check karein.');
  }
  function connectedLocker() { if (!locker || !account) throw new Error('Connect your wallet first.'); return locker; }

  async function ensureBsc() {
    checkConfig();
    if (!window.RNDWallet) throw new Error('Wallet connector load nahi hua. index.html me wallet.js ko app.js se pehle load karein.');
    const injectedProvider = await window.RNDWallet.connect();
    browserProvider = new ethers.BrowserProvider(injectedProvider);
    await browserProvider.send('eth_requestAccounts', []);
    let net = await browserProvider.getNetwork();
    if (Number(net.chainId) !== 56) {
      try { await injectedProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: C.chainHex }] }); }
      catch (e) {
        if (e && e.code === 4902) { await injectedProvider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: C.chainHex, chainName: C.chainName, nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: C.rpcUrls, blockExplorerUrls: [C.explorer] }] }); }
        else throw new Error('Please switch your wallet to BNB Smart Chain (Chain ID 56).');
      }
      browserProvider = new ethers.BrowserProvider(injectedProvider); net = await browserProvider.getNetwork();
    }
    if (Number(net.chainId) !== 56) throw new Error('Wallet is not connected to BNB Smart Chain.');
    signer = await browserProvider.getSigner(); account = await signer.getAddress();
    locker = new ethers.Contract(A.locker, C.lockerAbi, signer);
    tokenContracts.usdt = new ethers.Contract(A.usdt, C.erc20Abi, signer);
    tokenContracts.rnd = new ethers.Contract(A.rnd, C.erc20Abi, signer);
    bindWalletEvents(injectedProvider);
    setConnectedUI(); await loadAll(); toast('Wallet connected to BNB Smart Chain.');
    if ($('usdtAmount') && $('usdtAmount').value) quoteRNDFromUSDT();
  }
  async function connect() {
    if (connecting) return;
    connecting = true;
    try { await ensureBsc(); }
    catch (e) { if (e && e.rndRedirect) toast(e.message); else toast(parseErr(e)); }
    finally { connecting = false; }
  }

  async function getPoolShare(lp) {
    const pair = new ethers.Contract(A.lpPair, PAIR_ABI, readProvider);
    const [t0, supply, res] = await Promise.all([pair.token0(), pair.totalSupply(), pair.getReserves()]);
    if (supply === 0n) throw new Error('empty pool');
    const rndIs0 = sameAddr(t0, A.rnd);
    const reserveRnd = BigInt(rndIs0 ? res[0] : res[1]); const reserveUsdt = BigInt(rndIs0 ? res[1] : res[0]);
    return { usdtWei: lp * reserveUsdt / supply, rndWei: lp * reserveRnd / supply, reserveRnd, reserveUsdt, supply };
  }
  async function renderLpBreakdown(lp) {
    const big = $('totalLp'); if (!big) return;
    let box = $('lpBreakdown');
    if (!box) { box = document.createElement('div'); box.id = 'lpBreakdown'; box.style.cssText = 'margin-top:6px;font-size:.9rem;line-height:1.6;opacity:.9'; big.insertAdjacentElement('afterend', box); }
    try {
      const s = await getPoolShare(lp);
      const usdtN = Number(ethers.formatUnits(s.usdtWei, 18));
      big.textContent = `$${fmt(usdtN * 2, 2)}`;
      box.innerHTML = '';
      const l1 = document.createElement('div'); l1.textContent = `${fmt(usdtN, 4)} USDT + ${human(s.rndWei, 18, 4)} RND`;
      const l2 = document.createElement('div'); l2.textContent = `LP tokens: ${human(lp, 18, 4)}`;
      box.append(l1, l2);
    } catch (e) { big.textContent = human(lp, 18, 4); box.textContent = 'LP tokens (USDT/RND breakdown unavailable)'; }
  }
  async function loadStats() {
    await ensureRead();
    const [lp, out, users] = await Promise.all([readLocker.totalLPLocked(), readLocker.totalOutstandingRewards(), readLocker.totalRegisteredUsers()]);
    await renderLpBreakdown(lp);
    setText('outstanding', `${human(out, 18, 2)} RND`); setText('registered', fmt(Number(users), 0));
    showReserve();
  }

  async function loadAccount(expectId) {
    if (!account) return [];
    await ensureRead();
    const [info, ids, refCount, refUsers, refRecordsCount] = await Promise.all([readLocker.getUserInfo(account), readLocker.getUserPositionIds(account), readLocker.getReferralCount(account), readLocker.getReferredUsers(account), readLocker.getReferralRewardCount(account)]);
    // Nayi position abhi RPC par nahi dikhi to purana data dikhakar UI ko peeche na karein
    if (expectId != null && !ids.some(x => BigInt(x) === BigInt(expectId))) return ids;
    setText('positionCount', fmt(ids.length, 0));
    setText('myReferrer', info.registered ? (info.referrer === zero ? 'Direct / no referrer' : short(info.referrer)) : 'Not registered');
    setText('directCount', fmt(Number(refCount), 0)); setText('refRecordCount', fmt(Number(refRecordsCount), 0));
    renderRegisterBox(!!info.registered);

    const refList = $('referredList');
    if (refList) {
      refList.innerHTML = '';
      if (!refUsers.length) refList.textContent = 'No direct referrals recorded on-chain yet.';
      else refUsers.forEach((a, i) => { const row = document.createElement('div'); row.className = 'list-row'; const n = document.createElement('span'); n.textContent = `${i + 1}. ${short(a)}`; const link = document.createElement('a'); link.href = addrUrl(a); link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'BscScan ↗'; row.append(n, link); refList.append(row); });
    }

    // Referral reward records (parallel)
    const nRec = Number(refRecordsCount);
    const recs = await Promise.all(Array.from({ length: nRec }, (_, i) => readLocker.getReferralRewardRecord(account, i).catch(() => null)));
    let pending = 0, claimed = 0;
    const ledger = $('referralLedger'); if (ledger) ledger.innerHTML = '';
    [...recs].reverse().forEach(r => {
      if (!r) return;
      const amount = Number(ethers.formatUnits(r.amount, 18));
      if (r.claimed) claimed += amount; else pending += amount;
      if (ledger) { const row = document.createElement('div'); row.className = 'list-row'; const left = document.createElement('span'); left.textContent = `#${r.positionId} · ${short(r.referredUser)}`; const right = document.createElement('b'); right.textContent = `${fmt(amount, 3)} RND · ${r.claimed ? 'Claimed' : 'Pending'}`; row.append(left, right); ledger.append(row); }
    });
    if (ledger && !nRec) ledger.textContent = 'No referral reward records found for this wallet.';
    setText('refPending', `${fmt(pending, 3)} RND`); setText('refClaimed', `${fmt(claimed, 3)} RND`);

    // Positions (parallel, newest first)
    let userPending = 0, userClaimed = 0;
    const list = $('positionsList'); if (list) list.innerHTML = '';
    if (list && !ids.length) list.textContent = 'No LP positions have been recorded for this wallet yet.';
    const items = await Promise.all([...ids].reverse().map(id => readLocker.getPosition(id).then(p => ({ id, p })).catch(() => null)));
    const nowSec = Date.now() / 1000;
    for (const it of items) {
      if (!it) continue;
      const { id, p } = it;
      const unlock = Number(p.unlockAt); const mature = nowSec >= unlock; const lpWithdrawn = p.lpWithdrawn; const rewardsClaimed = p.rewardsClaimed;
      const rw = Number(ethers.formatUnits(p.rewardAmount, 18));
      if (!rewardsClaimed) userPending += rw; else userClaimed += rw;
      if (!list) continue;
      const card = document.createElement('article'); card.className = 'position-card';
      const head = document.createElement('div'); head.className = 'position-head';
      const title = document.createElement('b'); title.textContent = `LP Position #${id}`;
      const pill = document.createElement('span'); pill.className = `status-pill ${mature ? '' : 'locked'}`; pill.textContent = lpWithdrawn ? 'LP Withdrawn' : mature ? 'Matured' : 'Locked';
      head.append(title, pill); card.append(head);
      const grid = document.createElement('div'); grid.className = 'position-grid';
      const daysLeft = Math.max(0, Math.ceil((unlock - nowSec) / 86400));
      const vals = [['USDT added', `${human(p.usdtAdded)} USDT`], ['RND added', `${human(p.rndAdded)} RND`], ['LP tokens', human(p.lpAmount, 18, 6)], ['Unlock date', new Date(unlock * 1000).toLocaleString()], ['Time left', mature ? 'Unlocked' : `${daysLeft} days`], ['User reward', `${human(p.rewardAmount)} RND`], ['Referral reward', `${human(p.referralRewardAmount)} RND`], ['Referrer', p.referrer === zero ? 'None' : short(p.referrer)], ['Rewards', rewardsClaimed ? 'Claimed' : 'Pending']];
      vals.forEach(([k, v]) => { const d = document.createElement('div'); const s = document.createElement('span'); s.textContent = k; const b = document.createElement('b'); b.textContent = v; d.append(s, b); grid.append(d); });
      card.append(grid);
      const actions = document.createElement('div'); actions.className = 'position-actions';
      const claim = document.createElement('button'); claim.className = 'btn btn-gold';
      const noRew = p.rewardAmount === 0n && p.referralRewardAmount === 0n;
      claim.textContent = rewardsClaimed ? 'Rewards claimed' : noRew ? 'No reward' : mature ? 'Claim rewards' : 'Rewards locked';
      claim.disabled = rewardsClaimed || noRew || !mature; claim.onclick = () => claimPosition(id);
      const withdraw = document.createElement('button'); withdraw.className = 'btn btn-outline';
      withdraw.textContent = lpWithdrawn ? 'LP withdrawn' : mature ? 'Withdraw LP' : 'Withdraw locked LP';
      withdraw.disabled = lpWithdrawn || !mature; withdraw.onclick = () => withdrawPosition(id);
      actions.append(claim, withdraw); card.append(actions); list.append(card);
    }
    renderPending(userPending, userClaimed);
    return ids;
  }

  async function loadWalletBalances() {
    if (!account || !tokenContracts.usdt) return;
    try {
      const [u, r] = await Promise.all([tokenContracts.usdt.balanceOf(account), tokenContracts.rnd.balanceOf(account)]);
      setText('usdtBalance', `Wallet: ${human(u, 18, 4)} USDT`); setText('rndBalance', `Wallet: ${human(r, 18, 4)} RND`);
    } catch (e) { setText('usdtBalance', 'Wallet balance unavailable'); setText('rndBalance', 'Wallet balance unavailable'); }
  }
  async function loadAll(silent) {
    try {
      await Promise.all([loadStats(), account ? loadAccount() : Promise.resolve(), account ? loadWalletBalances() : Promise.resolve()]);
    } catch (e) { if (!silent) toast(parseErr(e)); }
  }
  // Transaction ke baad: RPC sync hone tak retry, taaki reward/position turant dikhe
  async function refreshAfterTx(positionId) {
    for (let i = 0; i < 10; i++) {
      try {
        await ensureRead();
        const ids = await loadAccount(positionId);
        if (positionId == null || ids.some(x => BigInt(x) === BigInt(positionId))) break;
      } catch (e) {}
      await sleep(1500);
    }
    await loadStats().catch(() => {});
    await loadWalletBalances();
  }

  // ---- Live quote + reward preview ----
  async function getRewardCfg() {
    if (rewardCfg) return rewardCfg;
    const [step, per] = await Promise.all([readLocker.MIN_REWARD_STEP_USDT(), readLocker.REWARD_PER_STEP()]);
    rewardCfg = { step, per }; return rewardCfg;
  }
  async function quoteRNDFromUSDT() {
    const seq = ++quoteSeq;
    const clean = cleanAmount($('usdtAmount') && $('usdtAmount').value);
    const box = rewardBox();
    const idle = 'Enter USDT amount. RND will be calculated automatically using the live on-chain RND/USDT price.';
    if (!clean) { if ($('rndAmount')) $('rndAmount').value = ''; box.style.display = 'none'; setText('quoteNote', idle); return; }
    try {
      await ensureRead();
      const priceWei = await readLocker.getSpotPriceRNDInUSDT();
      if (priceWei <= 0n) throw new Error('Live RND price is unavailable.');
      let usdtWei = units(clean, 18);
      let rndWei = usdtWei * E18 / priceWei;
      let cfg = null, pr = null, bumped = false;
      try {
        cfg = await getRewardCfg();
        pr = await readLocker.previewReward(usdtWei, rndWei);
        // Contract floor() karta hai: rounding se ek step kat sakta hai (50 -> 49.9999). Tab 0.01 USDT badha dete hain.
        if (cfg.step > 0n && pr.userReward < (usdtWei / cfg.step) * cfg.per) {
          usdtWei += 10n ** 16n; rndWei = usdtWei * E18 / priceWei;
          pr = await readLocker.previewReward(usdtWei, rndWei); bumped = true;
        }
      } catch (e) {}
      if (seq !== quoteSeq) return;
      if (rndWei <= 0n) throw new Error('Amount is too small to quote.');
      if (bumped) $('usdtAmount').value = ethers.formatUnits(usdtWei, 18);
      $('rndAmount').value = ethers.formatUnits(rndWei, 18);

      let userReward = null, refReward = 0n;
      if (pr) { userReward = pr.userReward; refReward = pr.referralReward; }
      else if (cfg && cfg.step > 0n) { userReward = ((rndWei * priceWei / E18) / cfg.step) * cfg.per; }

      let note = `Live on-chain price: ${fmt(Number(ethers.formatUnits(priceWei, 18)), 8)} USDT per RND. Final amounts may adjust slightly to pool ratio and slippage.`;
      if (bumped) note += ' (Rounding ki wajah se reward na kate, isliye USDT me 0.01 add kiya gaya.)';
      if (userReward !== null && userReward > 0n) {
        box.textContent = `🎁 Aapko milega: ${fmt(Number(ethers.formatUnits(userReward, 18)), 4)} RND reward (180 din ke lock ke baad claim)`;
        box.style.display = 'block';
        if (refReward > 0n) note += ` Referral reward (referrer ko): ${fmt(Number(ethers.formatUnits(refReward, 18)), 4)} RND.`;
      } else if (userReward !== null) {
        box.textContent = '⚠ Is amount par reward nahi milega.'; box.style.display = 'block';
        if (cfg) note += ` Reward ke liye kam se kam ${fmt(Number(ethers.formatUnits(cfg.step, 18)), 2)} USDT matched value chahiye. Liquidity phir bhi add ho sakti hai, par reward 0 rahega.`;
      } else { box.style.display = 'none'; }
      setText('quoteNote', note);
    } catch (e) {
      if (seq === quoteSeq) {
        if ($('rndAmount')) $('rndAmount').value = '';
        box.style.display = 'none';
        setText('quoteNote', /config\.js/.test(parseErr(e)) ? parseErr(e) : 'Live RND price could not be read from the locker contract. Please check BNB Chain connection and contract status.');
      }
    }
  }

  async function calculateMinimums(usdtDesired, rndDesired) {
    const pair = new ethers.Contract(A.lpPair, PAIR_ABI, readProvider || browserProvider);
    const [t0, res] = await Promise.all([pair.token0(), pair.getReserves()]);
    const r0 = BigInt(res[0]), r1 = BigInt(res[1]); if (r0 === 0n || r1 === 0n) return [0n, 0n];
    const rndIs0 = sameAddr(t0, A.rnd); const reserveRnd = rndIs0 ? r0 : r1; const reserveUsdt = rndIs0 ? r1 : r0;
    const usdtOptimal = rndDesired * reserveUsdt / reserveRnd; let useUsdt, useRnd;
    if (usdtOptimal <= usdtDesired) { useUsdt = usdtOptimal; useRnd = rndDesired; } else { useUsdt = usdtDesired; useRnd = usdtDesired * reserveRnd / reserveUsdt; }
    return [useUsdt * 995n / 1000n, useRnd * 995n / 1000n];
  }
  async function ensureTokenApproval(which, needed) {
    const token = which === 'usdt' ? tokenContracts.usdt : tokenContracts.rnd;
    const allowance = await token.allowance(account, A.locker);
    if (allowance >= needed) return;
    const label = which.toUpperCase();
    status('liquidityStatus', `Please approve ${label} in your wallet (sirf pehli baar; agli baar nahi puchhega).`);
    const tx = await token.approve(A.locker, ethers.MaxUint256);
    status('liquidityStatus', `${label} approval submitted. Waiting for confirmation…`, txUrl(tx.hash));
    await tx.wait();
  }

  async function addLiquidity() {
    const btn = $('addLiquidityBtn');
    try {
      if (!account) { await ensureBsc(); }
      const c = connectedLocker();
      await ensureRead();
      await quoteRNDFromUSDT(); // RND amount live price se fresh
      const u = cleanAmount($('usdtAmount').value), r = cleanAmount($('rndAmount').value);
      if (!u || !r) throw new Error('USDT amount daalein; RND live price se auto-calculate hoga.');
      btn.disabled = true; btn.textContent = 'Checking…';
      const [uDec, rDec] = await Promise.all([tokenContracts.usdt.decimals(), tokenContracts.rnd.decimals()]);
      if (Number(uDec) !== 18 || Number(rDec) !== 18) throw new Error('Unexpected token decimals. This interface expects 18-decimal USDT and RND.');
      const ua = units(u, 18), rq = units(r, 18);
      const [ub, rb] = await Promise.all([tokenContracts.usdt.balanceOf(account), tokenContracts.rnd.balanceOf(account)]);
      if (ub < ua) throw new Error(`USDT balance kam hai. Zaroorat ${u} USDT, wallet me ${human(ub)} USDT.`);
      if (rb < rq) throw new Error(`RND balance kam hai. Zaroorat ${r} RND, wallet me ${human(rb)} RND.`);
      // 0.5% buffer (kam pade to wallet balance tak); extra RND contract wapas refund kar deta hai
      const raBuf = rq * 1005n / 1000n; const ra = raBuf <= rb ? raBuf : rb;

      // Referral
      const existing = await c.getUserInfo(account);
      let ref = zero;
      if (existing.registered) ref = existing.referrer;
      else if (referralFromUrl !== zero && !sameAddr(referralFromUrl, account)) {
        const refInfo = await c.getUserInfo(referralFromUrl);
        if (refInfo.registered) ref = referralFromUrl;
        else if (!confirm('Is referral link wale wallet ne abhi tak register nahi kiya hai, isliye referral jud nahi paayega.\n\nBina referral ke aage badhein?')) throw new Error('Cancelled: transaction nahi bheji gayi.');
      }

      // Reward preview (0 ho to user se confirm)
      let expectedReward = null;
      try {
        const pr = await readLocker.previewReward(ua, rq);
        expectedReward = pr.userReward;
        if (pr.userReward === 0n && !confirm('Is amount par reward calculate nahi ho raha (minimum value se kam).\n\nLiquidity add ho jayegi lekin reward nahi milega. Phir bhi continue karein?')) throw new Error('Cancelled: transaction nahi bheji gayi.');
      } catch (e) { if (/^Cancelled/.test(e.message)) throw e; }

      showBusy('Processing…', 'Aapke wallet me confirmation maanga ja raha hai. Wallet kholkar Confirm dabayein aur wait karein.');
      btn.textContent = 'Approving tokens…';
      await ensureTokenApproval('usdt', ua); await ensureTokenApproval('rnd', ra);
      const [uMin, rMin] = await calculateMinimums(ua, ra);
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // Pehle simulate: agar revert hoga to asli wajah yahin dikh jayegi
      try { await c.addLiquidityAndLock.staticCall(ua, ra, uMin, rMin, ref, deadline); }
      catch (e) { throw new Error(`Transaction fail hogi: ${parseErr(e)}`); }

      btn.textContent = 'Confirm in wallet…'; status('liquidityStatus', 'Please confirm Add Liquidity & Lock in your wallet.');
      const tx = await c.addLiquidityAndLock(ua, ra, uMin, rMin, ref, deadline);
      btn.textContent = 'Waiting for confirmation…';
      status('liquidityStatus', 'Transaction submitted. Waiting for BNB Chain confirmation…', txUrl(tx.hash));
      const receipt = await tx.wait();

      // Event se position + reward nikaal kar turant dikhate hain
      let detail = '', positionId = null, rewardNum = null;
      try {
        for (const log of receipt.logs) {
          if (!sameAddr(log.address, A.locker)) continue;
          let parsed = null; try { parsed = c.interface.parseLog(log); } catch (e) {}
          if (parsed && parsed.name === 'LiquidityAddedAndLocked') {
            const a = parsed.args; positionId = a.positionId; rewardNum = Number(ethers.formatUnits(a.userReward, 18));
            detail = ` Position #${a.positionId} · ${human(a.usdtUsed)} USDT + ${human(a.rndUsed)} RND locked · Reward: ${human(a.userReward)} RND.`;
            break;
          }
        }
      } catch (e) {}
      if (rewardNum === null && expectedReward !== null) rewardNum = Number(ethers.formatUnits(expectedReward, 18));
      status('liquidityStatus', 'Liquidity added and 180-day position recorded on-chain.' + detail, txUrl(tx.hash));
      if (rewardNum !== null && rewardNum > 0) {
        showRewardBanner(`🎉 Liquidity lock ho gayi! Aapko ${fmt(rewardNum, 4)} RND reward mil gaya (Pending Rewards me dikh raha hai). 180 din baad claim kar sakenge.`);
        renderPending(lastPending + rewardNum, lastClaimed); // turant UI update
      } else {
        showRewardBanner('✅ Liquidity lock ho gayi! (Is amount par reward nahi tha.)');
      }
      toast('LP position created successfully.');
      $('usdtAmount').value = ''; $('rndAmount').value = ''; rewardBox().style.display = 'none';
      setText('quoteNote', 'Enter USDT amount. RND will be calculated automatically using the live on-chain RND/USDT price.');
      hideBusy();
      await refreshAfterTx(positionId);
    } catch (e) { status('liquidityStatus', parseErr(e)); toast(parseErr(e)); }
    finally { hideBusy(); if (btn) { btn.disabled = false; btn.textContent = 'Add Liquidity & Lock'; } }
  }

  async function registerWallet() {
    try {
      const c = connectedLocker();
      const info = await c.getUserInfo(account);
      if (info.registered) { toast('Wallet pehle se registered hai.'); await loadAccount(); return; }
      let ref = referralFromUrl;
      if (sameAddr(ref, account)) ref = zero;
      if (ref !== zero) { const ri = await c.getUserInfo(ref); if (!ri.registered) ref = zero; }
      showBusy('Registering…', 'Wallet me confirm karein aur wait karein.');
      const tx = await c.register(ref);
      updateBusy('Registration submitted. Waiting for confirmation…', txUrl(tx.hash));
      await tx.wait();
      toast('Wallet registered. Referral link active.');
      hideBusy();
      await sleep(1200); await loadAll();
    } catch (e) { toast(parseErr(e)); } finally { hideBusy(); }
  }

  async function claimPosition(id) {
    try {
      const c = connectedLocker();
      await ensureRead();
      const p = await readLocker.getPosition(id);
      const need = p.rewardAmount + p.referralRewardAmount;
      if (need === 0n) { toast('Is position par reward 0 hai.'); return; }
      const bal = await readLocker.rewardReserveBalance();
      if (bal < need) { toast(`Contract ke reward reserve me abhi itna RND nahi hai (zaroorat ${human(need)} RND). Reward funding ke baad claim karein.`); return; }
      if (!confirm(`Claim rewards for LP position #${id}? This pays the recorded user and referrer, if any.`)) return;
      showBusy('Claiming rewards…', 'Wallet me confirm karein aur wait karein.');
      const tx = await c.claimRewards(id);
      updateBusy('Claim submitted. Waiting for confirmation…', txUrl(tx.hash));
      await tx.wait(); toast('Reward claim confirmed.'); hideBusy();
      await sleep(1200); await loadAll();
    } catch (e) { toast(parseErr(e)); } finally { hideBusy(); }
  }

  async function withdrawPosition(id) {
    try {
      const c = connectedLocker();
      if (!confirm(`Withdraw LP position #${id}? The contract will remove liquidity and send the returned USDT and RND to your wallet.`)) return;
      await ensureRead();
      const p = await readLocker.getPosition(id);
      const s = await getPoolShare(p.lpAmount);
      const minU = s.usdtWei * 98n / 100n, minR = s.rndWei * 98n / 100n; // 2% slippage protection
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      showBusy('Withdrawing LP…', 'Wallet me confirm karein aur wait karein.');
      const tx = await c.withdrawLP(id, minU, minR, deadline);
      updateBusy('Withdrawal submitted. Waiting for confirmation…', txUrl(tx.hash));
      await tx.wait(); toast('LP withdrawal confirmed.'); hideBusy();
      await sleep(1200); await loadAll();
    } catch (e) { toast(parseErr(e)); } finally { hideBusy(); }
  }

  async function loadHistory() {
    try {
      await ensureRead(); if (!account) throw new Error('Connect wallet first.');
      const end = await readProvider.getBlockNumber(); const from = Math.max(Number(C.deploymentBlock) || 0, end - 50000);
      const F = readLocker.filters;
      const filters = [F.LiquidityAddedAndLocked(null, account, null), F.LiquidityAddedAndLocked(null, null, account), F.LPWithdrawn(null, account), F.RewardsClaimed(null, account), F.RewardsClaimed(null, null, account), F.UserRegistered(account), F.ReferralRewardAccrued(account), F.ReferralRewardAccrued(null, account)];
      let all = [];
      for (const f of filters) { try { all.push(...await readLocker.queryFilter(f, from, end)); } catch (e) {} }
      const uniq = [...new Map(all.map(x => [x.transactionHash + String(x.index), x])).values()].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 40);
      const box = $('historyList'); if (!box) return; box.innerHTML = '';
      if (!uniq.length) { box.textContent = `No matching events found in the scanned block range (${from.toLocaleString()}–${end.toLocaleString()}). Set deploymentBlock in config.js to your contract deployment block for a complete history scan.`; return; }
      for (const ev of uniq) {
        const row = document.createElement('div'); row.className = 'history-row';
        const n = document.createElement('b'); n.textContent = (ev.fragment && ev.fragment.name) || ev.eventName || 'Contract event';
        const block = document.createElement('span'); block.textContent = `Block ${ev.blockNumber}`;
        const time = document.createElement('span'); time.textContent = 'On-chain event';
        const a = document.createElement('a'); a.href = txUrl(ev.transactionHash); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View tx ↗';
        row.append(n, block, time, a); box.append(row);
      }
    } catch (e) { setText('historyList', parseErr(e)); }
  }

  async function copyReferral() {
    if (!account) { toast('Connect your wallet first.'); return; }
    const inp = $('referralLink'); const v = inp.value;
    try { await navigator.clipboard.writeText(v); }
    catch (e) { inp.select(); document.execCommand('copy'); }
    toast('Referral link copied.');
  }

  function initReferral() {
    const q = new URLSearchParams(location.search).get('ref');
    const ref = normAddr(q);
    if (ref && ref !== zero) {
      referralFromUrl = ref;
      try { localStorage.setItem('rnd_ref', ref); } catch (e) {}
    } else {
      try { const s = normAddr(localStorage.getItem('rnd_ref')); if (s && s !== zero) referralFromUrl = s; } catch (e) {}
    }
  }

  // ---- Wallet events ----
  let boundWalletProvider = null;
  function clearWalletSession(message) {
    account = null; signer = null; locker = null; browserProvider = null;
    tokenContracts.usdt = null; tokenContracts.rnd = null;
    setConnectedUI();
    setText('usdtBalance', 'Wallet balance: Connect wallet'); setText('rndBalance', 'Wallet balance: Connect wallet');
    setText('positionsList', message || 'Wallet disconnected. Connect again.');
    setText('myPending', '—'); const big = $('rewardPendingBig'); if (big) big.innerHTML = '— <small>RND</small>';
    lastPending = 0; lastClaimed = 0;
    if (window.RNDWallet) window.RNDWallet.reset();
  }
  function bindWalletEvents(provider) {
    if (!provider || boundWalletProvider === provider) return;
    boundWalletProvider = provider;
    if (!provider.on) return;
    provider.on('accountsChanged', accs => {
      if (!accs || !accs.length) { clearWalletSession(); return; }
      clearWalletSession('Wallet account changed. Updating account data…');
      connect();
    });
    provider.on('chainChanged', () => location.reload());
    provider.on('disconnect', () => clearWalletSession());
  }
  window.addEventListener('rndwallet:connected', e => bindWalletEvents(e.detail && e.detail.provider));

  // ---- Init ----
  on('connectBtn', 'click', connect);
  on('addLiquidityBtn', 'click', addLiquidity);
  on('copyReferralBtn', 'click', copyReferral);
  on('refreshBtn', 'click', () => loadAll());
  on('historyBtn', 'click', loadHistory);
  on('usdtAmount', 'input', () => { clearTimeout(quoteTimer); quoteTimer = setTimeout(quoteRNDFromUSDT, 300); });
  setText('year', new Date().getFullYear());
  on('menuToggle', 'click', () => $('mainNav').classList.toggle('open'));
  document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => $('mainNav').classList.remove('open')));

  initReferral(); showReserve(); setConnectedUI();
  loadStats().catch(e => { setText('totalLp', 'Unavailable'); toast(parseErr(e)); });

  // Wallet app ke DApp browser me khulte hi auto-connect (wallet.js ne ?rndwc=1 jodi thi)
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('rndwc') === '1') {
      params.delete('rndwc');
      const clean = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
      history.replaceState(null, '', clean);
      setTimeout(connect, 700);
    }
  } catch (e) {}

  // Auto refresh: referrer ko naye referral reward bina reload ke dikhte hain
  setInterval(() => { if (account && !document.hidden && !isBusy()) loadAll(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && account && !isBusy()) loadAll(true); });
})();
