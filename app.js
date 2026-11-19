(() => {
'use strict';
const {ethers}=window;
const A={locker:'0xE930dca16D6ce36D3666AC48DD51db5AAd713590',rnd:'0xcF1FbF18bE9202865bcf88E6349B9D207F75942d',usdt:'0x55d398326f99059fF775485246999027B3197955',pair:'0xd6f291a4dbefa0ff99b07d247aa73ff7c20e9991',router:'0x10ED43C718714eb63d5aA57B78B54704E256024E'};
const ERC=['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
const PAIR=[...ERC,'function totalSupply() view returns(uint256)','function getReserves() view returns(uint112,uint112,uint32)','function token0() view returns(address)','function token1() view returns(address)'];
const ROUTER=['function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns(uint256,uint256,uint256)'];
const LOCK=['function owner() view returns(address)','function nextLockId() view returns(uint256)','function totalLPLocked() view returns(uint256)','function observationCount() view returns(uint256)','function previewLP(uint256) view returns(uint256,uint256,uint256,uint256)','function lockLP(uint256) returns(uint256)','function getUserLockIds(address) view returns(uint256[])','function getLock(uint256) view returns((address user,uint256 lpAmount,uint256 lockedAt,uint256 unlockAt,uint256 usdtSideValue,uint256 rndSideValue,uint256 totalUsdValue,uint256 rewardAmount,bool lpReleased,bool rewardRequested,bool rewardPaid,bytes32 rewardPaymentTxHash))','function requestRewardWithdrawal(uint256)','function releaseLP(uint256)','function updatePriceObservation()','function markRewardPaid(uint256,bytes32)'];
let provider,signer,user,locker,rnd,usdt,pair,router,quoteTimer;
const $=id=>document.getElementById(id),short=x=>x?x.slice(0,6)+'…'+x.slice(-4):'—',fmt=(x,n=5)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:n});
function message(s,error=false){const t=$('toast');t.textContent=s;t.className='toast show'+(error?' error':'');clearTimeout(message.timer);message.timer=setTimeout(()=>t.className='toast',6500)}
function reason(e){return e?.shortMessage||e?.reason||e?.info?.error?.message||e?.message||'Transaction failed'}
async function network(){let n=await provider.getNetwork();if(n.chainId!==56n){try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]})}catch(e){if(e.code!==4902)throw e;await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x38',chainName:'BNB Smart Chain',nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:['https://bsc-dataseed.binance.org/'],blockExplorerUrls:['https://bscscan.com']}]})}}}
async function connect(){if(!window.ethereum)throw Error('MetaMask या compatible wallet install करें।');provider=new ethers.BrowserProvider(window.ethereum);await provider.send('eth_requestAccounts',[]);await network();signer=await provider.getSigner();user=await signer.getAddress();locker=new ethers.Contract(A.locker,LOCK,signer);rnd=new ethers.Contract(A.rnd,ERC,signer);usdt=new ethers.Contract(A.usdt,ERC,signer);pair=new ethers.Contract(A.pair,PAIR,signer);router=new ethers.Contract(A.router,ROUTER,signer);$('connect').textContent=short(user);$('walletText').textContent='Connected: '+user;await refresh();await updateRNDQuote();message('Wallet connected.')}
async function send(label,fn){message(label+' — wallet में confirm करें…');const tx=await fn();message('Transaction submitted: '+tx.hash);await tx.wait();message(label+' सफल हुआ।');await refresh();return tx}
function need(){if(!signer)throw Error('पहले Connect Wallet करें।')}
async function approve(token,spender,amount,label){const al=await token.allowance(user,spender);if(al<amount)await send(label,()=>token.approve(spender,ethers.MaxUint256))}
async function refresh(){need();const [total,next,obs,owner,lpbal]=await Promise.all([locker.totalLPLocked(),locker.nextLockId(),locker.observationCount(),locker.owner(),pair.balanceOf(user)]);$('total').textContent=fmt(ethers.formatUnits(total,18),7)+' LP';$('next').textContent=next.toString();$('obs').textContent=obs+' / 24';$('oracleCount').textContent=obs+' / 24';$('owner').textContent=short(owner);$('lpBalance').textContent=fmt(ethers.formatUnits(lpbal,18),8)+' LP';$('admin').classList.toggle('hidden',owner.toLowerCase()!==user.toLowerCase());await positions()}
async function positions(){const ids=await locker.getUserLockIds(user),root=$('positions');root.innerHTML='';if(!ids.length){root.innerHTML='<div class="empty">इस wallet की अभी कोई LP lock position नहीं है।</div>';return}for(const id of ids){const p=await locker.getLock(id),unlocked=Date.now()/1000>=Number(p.unlockAt),status=p.lpReleased?'LP Released':p.rewardPaid?'Reward Paid':unlocked?'Unlocked':'Locked';const el=document.createElement('article');el.className='position';el.innerHTML=`<div class="position-head"><b>Lock #${id}</b><span class="status">${status}</span></div><div class="position-grid"><div><small>LP Amount</small><b>${fmt(ethers.formatUnits(p.lpAmount,18),8)}</b></div><div><small>LP Value at Lock</small><b>$${fmt(ethers.formatUnits(p.totalUsdValue,18),2)}</b></div><div><small>Reward</small><b>${fmt(ethers.formatUnits(p.rewardAmount,18),4)} RND</b></div><div><small>Locked At</small><b>${new Date(Number(p.lockedAt)*1000).toLocaleString()}</b></div><div><small>Unlock At</small><b>${new Date(Number(p.unlockAt)*1000).toLocaleString()}</b></div><div><small>Reward Status</small><b>${p.rewardPaid?'Paid':p.rewardRequested?'Requested':'Not requested'}</b></div></div><div class="position-actions">${unlocked&&!p.rewardRequested&&!p.rewardPaid&&!p.lpReleased?`<button class="btn secondary" data-a="request" data-id="${id}">Request Reward</button>`:''}${unlocked&&!p.lpReleased?`<button class="btn primary" data-a="release" data-id="${id}">Release LP</button>`:''}${p.rewardPaymentTxHash!==ethers.ZeroHash?`<a class="btn ghost" target="_blank" href="https://bscscan.com/tx/${p.rewardPaymentTxHash}">Reward TX</a>`:''}</div>`;root.append(el)}root.querySelectorAll('button[data-a]').forEach(b=>b.onclick=async()=>{try{const id=BigInt(b.dataset.id);await send(b.dataset.a==='request'?'Reward request':'LP release',()=>b.dataset.a==='request'?locker.requestRewardWithdrawal(id):locker.releaseLP(id))}catch(e){message(reason(e),true)}})}
async function updateRNDQuote(){
  const input=$('usdtAmount'),out=$('rndAmount'),status=$('quoteStatus');
  if(!input||!out)return;
  const amount=Number(input.value);
  if(!(amount>0)){out.value='';$('poolPrice').textContent='—';status.textContent='USDT amount डालें; RND मात्रा live V2 pool ratio से निकलेगी।';return}
  try{
    const read=provider||new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const p=new ethers.Contract(A.pair,PAIR,read);
    const readUSDT=new ethers.Contract(A.usdt,ERC,read),readRND=new ethers.Contract(A.rnd,ERC,read);
    const [t0,t1,res,ud,rd]=await Promise.all([p.token0(),p.token1(),p.getReserves(),readUSDT.decimals(),readRND.decimals()]);
    const a0=t0.toLowerCase(),a1=t1.toLowerCase();
    if(!((a0===A.usdt.toLowerCase()&&a1===A.rnd.toLowerCase())||(a0===A.rnd.toLowerCase()&&a1===A.usdt.toLowerCase())))throw Error('Configured LP Pair में RND/USDT tokens match नहीं कर रहे।');
    const reserve0=BigInt(res[0]),reserve1=BigInt(res[1]);
    const ru= a0===A.usdt.toLowerCase()?reserve0:reserve1;
    const rr= a0===A.rnd.toLowerCase()?reserve0:reserve1;
    if(ru===0n||rr===0n)throw Error('V2 Pool में अभी reserves नहीं हैं; live RND quote उपलब्ध नहीं।');
    const usdtPerRnd=Number(ethers.formatUnits(ru,ud))/Number(ethers.formatUnits(rr,rd));
    const rndPerUsdt=1/usdtPerRnd;
    const q=amount*rndPerUsdt;
    out.value=Number.isFinite(q)?q.toFixed(8):'';
    $('poolPrice').textContent='1 USDT ≈ '+fmt(rndPerUsdt,8)+' RND';
    status.textContent='Live V2 reserve ratio quote. Final amount PancakeSwap Router पर execution के समय बदल सकता है; slippage लागू होगा।';
  }catch(e){out.value='';$('poolPrice').textContent='—';status.textContent=reason(e);console.warn(e)}
}
async function addLiquidity(){
  need();await network();
  const u=Number($('usdtAmount').value),r=Number($('rndAmount').value);
  if(!(u>0&&r>0))throw Error('USDT amount डालें और live RND quote आने तक प्रतीक्षा करें।');
  await updateRNDQuote();
  const quotedR=Number($('rndAmount').value);
  if(!(quotedR>0))throw Error('V2 Pool से RND quote नहीं मिला; अभी transaction नहीं भेजा गया।');
  const [ud,rd]=await Promise.all([usdt.decimals(),rnd.decimals()]);
  const ua=ethers.parseUnits(String(u),ud),ra=ethers.parseUnits(String(quotedR),rd);
  const [ub,rb]=await Promise.all([usdt.balanceOf(user),rnd.balanceOf(user)]);
  if(ub<ua)throw Error('Wallet में पर्याप्त USDT नहीं है। उपलब्ध: '+fmt(ethers.formatUnits(ub,ud),6)+' USDT');
  if(rb<ra)throw Error('Wallet में पर्याप्त RND नहीं है। आवश्यक: '+fmt(quotedR,8)+' RND');
  const lpBefore=await pair.balanceOf(user);
  await approve(usdt,A.router,ua,'Approve USDT');
  await approve(rnd,A.router,ra,'Approve RND');
  const bps=BigInt($('slippage').value),minU=ua*(10000n-bps)/10000n,minR=ra*(10000n-bps)/10000n,deadline=Math.floor(Date.now()/1000)+1200;
  await send('Add PancakeSwap V2 liquidity',()=>router.addLiquidity(A.rnd,A.usdt,ra,ua,minR,minU,user,deadline));
  const lpAfter=await pair.balanceOf(user),minted=lpAfter-lpBefore;
  if(minted>0n){$('lpAmount').value=ethers.formatUnits(minted,18);message('Liquidity added. नया LP Token amount अपने-आप Lock सेक्शन में भर दिया गया है। अब Preview, Approve LP और Lock अलग-अलग confirm करें।')}
}
async function getLP(){const v=$('lpAmount').value;if(!(Number(v)>0))throw Error('LP Token amount डालें।');return ethers.parseUnits(v,18)}
async function preview(){need();const p=await locker.previewLP(await getLP());$('previewResult').innerHTML=`USDT side: <b>$${fmt(ethers.formatUnits(p[0],18),4)}</b><br>RND side: <b>$${fmt(ethers.formatUnits(p[1],18),4)}</b><br>Total eligible value: <b>$${fmt(ethers.formatUnits(p[2],18),4)}</b><br>Estimated reward: <b>${fmt(ethers.formatUnits(p[3],18),4)} RND</b>`}
async function approveLP(){need();await approve(pair,A.locker,await getLP(),'Approve LP for locker');message('LP approval complete. अब Lock LP दबाएँ।')}
async function lockLP(){need();const amount=await getLP();await send('Lock LP for 180 days',()=>locker.lockLP(amount))}
async function oracle(){need();await send('Update price observation',()=>locker.updatePriceObservation())}
async function markPaid(){need();const id=BigInt($('adminId').value||0),h=$('paymentHash').value.trim();if(id<=0n||!/^0x[0-9a-fA-F]{64}$/.test(h))throw Error('सही Lock ID और 0x + 64 hex transaction hash डालें।');await send('Record reward payment',()=>locker.markRewardPaid(id,h))}
const bind=(id,fn)=>$(id).addEventListener('click',()=>fn().catch(e=>{console.error(e);message(reason(e),true)}));$('usdtAmount').addEventListener('input',()=>{clearTimeout(quoteTimer);quoteTimer=setTimeout(()=>updateRNDQuote(),350)});
bind('connect',connect);bind('refresh',refresh);bind('addLiquidity',addLiquidity);bind('preview',preview);bind('approveLP',approveLP);bind('lockLP',lockLP);bind('updateOracle',oracle);bind('markPaid',markPaid);if(window.ethereum){ethereum.on?.('accountsChanged',()=>location.reload());ethereum.on?.('chainChanged',()=>location.reload())}
})();
