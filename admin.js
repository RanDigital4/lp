import {auth,db,ref,get,update,signOut,onAuthStateChanged,serverTimestamp} from "./firebase.js";
import {APP_CONFIG,rewardFor} from "./app-config.js";

const $ = id => document.getElementById(id);
let admin = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const plusMonths = (date, months) => { const d = new Date(date); const day = d.getDate(); d.setMonth(d.getMonth() + months); if (d.getDate() < day) d.setDate(0); return d.getTime(); };
const validBscHash = value => /^0x[a-fA-F0-9]{64}$/.test(String(value || ""));
const validWallet = value => /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
const safeHttpUrl = value => { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; } catch { return ""; } };

async function load() {
  if (!admin) return;
  $("adminQueue").textContent = "Loading…";
  const [submissionsSnapshot, reviewsSnapshot, withdrawalsSnapshot] = await Promise.all([
    get(ref(db, "submissions")), get(ref(db, "adminReview")), get(ref(db, "withdrawalRequests"))
  ]);
  const submissions = submissionsSnapshot.val() || {};
  const reviews = reviewsSnapshot.val() || {};
  const requests = withdrawalsSnapshot.val() || {};
  let html = "";

  for (const [uid, userSubmissions] of Object.entries(submissions)) {
    for (const [id, submission] of Object.entries(userSubmissions || {})) {
      const review = reviews?.[uid]?.[id] || {};
      const status = review.status || submission.status || "pending";
      const txHash = String(submission.txHash || "");
      const txLink = validBscHash(txHash)
        ? `<a href="https://bscscan.com/tx/${encodeURIComponent(txHash)}" target="_blank" rel="noopener noreferrer">Open on BscScan ↗</a>`
        : "Not a valid BNB transaction hash";
      const positionUrl = safeHttpUrl(submission.lpUrl || "");
      const positionLink = positionUrl
        ? `<p>Optional position URL: <a href="${esc(positionUrl)}" target="_blank" rel="noopener noreferrer">Open position ↗</a></p>` : "";
      const positionId = submission.positionId ? `<p>Position ID: ${esc(submission.positionId)}</p>` : "<p>Position ID: —</p>";
      const walletOk = validWallet(submission.walletAddress);
      html += `<article class="record-card">
        <div class="record-top"><strong>${esc(submission.dex || "DEX not specified")} · $${esc(submission.amountUsd)} · ${Number(rewardFor(submission.amountUsd) || 0)} RND proposed</strong><span class="tag ${esc(status)}">${esc(status.toUpperCase())}</span></div>
        <p>User UID: ${esc(uid)} · Submission: ${esc(id)}</p>
        <p>Network: ${esc(submission.network || "BNB Smart Chain")} · Protocol: ${esc(submission.protocolVersion || "Not specified")}</p>
        <p>Transaction: ${txLink}</p>
        ${positionId}
        <p>LP wallet: ${esc(submission.walletAddress || "—")} ${walletOk ? "" : "· Invalid/missing address"}</p>
        ${positionLink}
        <p>Notes: ${esc(submission.notes || "—")}</p>
        ${status === "pending" ? `<div class="admin-actions"><button class="btn-small btn-approve" data-action="approve" data-uid="${esc(uid)}" data-id="${esc(id)}">Approve &amp; start 6 months</button><button class="btn-small btn-reject" data-action="reject" data-uid="${esc(uid)}" data-id="${esc(id)}">Reject</button></div>` : `<p>Admin status: ${esc(status)} ${review.lockEndsAt ? `· Lock ends ${new Date(review.lockEndsAt).toLocaleString()}` : ""}</p>${status === "approved" || status === "locked" ? `<div class="admin-actions"><button class="btn-small btn-neutral" data-action="unlock" data-uid="${esc(uid)}" data-id="${esc(id)}">Confirm LP maintained &amp; unlock</button><button class="btn-small btn-reject" data-action="forfeit" data-uid="${esc(uid)}" data-id="${esc(id)}">Mark forfeited</button></div>` : ""}`}
      </article>`;
    }
  }
  $("adminQueue").innerHTML = html || '<p class="muted">No submissions.</p>';

  let withdrawalHtml = "";
  for (const [uid, items] of Object.entries(requests)) {
    for (const [id, withdrawal] of Object.entries(items || {})) {
      const adminRecord = (await get(ref(db, `withdrawalAdmin/${uid}/${id}`))).val() || {};
      const status = adminRecord.status || withdrawal.status || "pending";
      withdrawalHtml += `<article class="record-card">
        <div class="record-top"><strong>${Number(withdrawal.amountRND || 0)} RND withdrawal</strong><span class="tag ${esc(status)}">${esc(status.toUpperCase())}</span></div>
        <p>UID: ${esc(uid)} · Submission: ${esc(id)}</p>
        <p>Wallet: ${esc(withdrawal.walletAddress || "—")}</p>
        ${status === "paid" ? `<p>TX: ${esc(adminRecord.txHash || "—")}</p>` : `<div class="admin-actions"><input id="tx-${esc(uid)}-${esc(id)}" placeholder="Actual transfer TX hash" aria-label="Actual transfer transaction hash"><button class="btn-small btn-approve" data-action="paid" data-uid="${esc(uid)}" data-id="${esc(id)}">Mark paid</button></div>`}
      </article>`;
    }
  }
  $("adminWithdrawals").innerHTML = withdrawalHtml || '<p class="muted">No withdrawal requests.</p>';
}

$("adminQueue").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const {action, uid, id} = button.dataset;
  try {
    const updates = {};
    if (action === "approve") {
      const submission = (await get(ref(db, `submissions/${uid}/${id}`))).val();
      if (!submission) throw new Error("Submission not found.");
      if (!validBscHash(submission.txHash)) throw new Error("Cannot approve: valid BNB transaction hash is missing.");
      if (!validWallet(submission.walletAddress)) throw new Error("Cannot approve: valid LP wallet address is missing.");
      const reward = rewardFor(submission.amountUsd);
      if (!reward) throw new Error("No configured reward tier for this amount.");
      const start = Date.now();
      const end = plusMonths(start, APP_CONFIG.lockMonths);
      updates[`adminReview/${uid}/${id}`] = {status:"approved", rewardRND:reward, lockStartAt:start, lockEndsAt:end, reviewedAt:serverTimestamp()};
      updates[`rewardLedger/${uid}/${id}`] = {status:"locked", rewardRND:reward, lockStartAt:start, lockEndsAt:end, updatedAt:serverTimestamp()};
    } else if (action === "reject") {
      updates[`adminReview/${uid}/${id}`] = {status:"rejected", reason:"Rejected after manual review.", reviewedAt:serverTimestamp()};
    } else if (action === "unlock") {
      const item = (await get(ref(db, `rewardLedger/${uid}/${id}`))).val();
      if (!item || Date.now() < Number(item.lockEndsAt)) throw new Error("Six-month period is not complete yet.");
      updates[`adminReview/${uid}/${id}/status`] = "unlocked";
      updates[`adminReview/${uid}/${id}/unlockedAt`] = serverTimestamp();
      updates[`rewardLedger/${uid}/${id}/status`] = "unlocked";
      updates[`rewardLedger/${uid}/${id}/updatedAt`] = serverTimestamp();
    } else if (action === "forfeit") {
      updates[`adminReview/${uid}/${id}/status`] = "forfeited";
      updates[`rewardLedger/${uid}/${id}/status`] = "forfeited";
      updates[`adminReview/${uid}/${id}/reason`] = "LP position ended before qualification completed.";
      updates[`rewardLedger/${uid}/${id}/updatedAt`] = serverTimestamp();
    }
    await update(ref(db), updates);
    await load();
  } catch (error) { alert(error.message); }
});

$("adminWithdrawals").addEventListener("click", async event => {
  const button = event.target.closest('button[data-action="paid"]');
  if (!button) return;
  const {uid, id} = button.dataset;
  const input = $(`tx-${uid}-${id}`);
  const txHash = input?.value.trim() || "";
  if (!validBscHash(txHash)) { alert("Enter a valid actual BNB Smart Chain transfer transaction hash."); return; }
  if (!confirm("Confirm that the RND transfer was actually sent and this transaction hash is correct?")) return;
  try {
    await update(ref(db), {
      [`withdrawalAdmin/${uid}/${id}`]: {status:"paid", txHash, paidAt:Date.now()},
      [`rewardLedger/${uid}/${id}/status`]: "paid"
    });
    await load();
  } catch (error) { alert(error.message); }
});

$("refreshBtn").addEventListener("click", load);
$("logoutBtn").addEventListener("click", () => signOut(auth).then(() => location.href = "index.html"));
onAuthStateChanged(auth, user => {
  if (!user) { location.href = "login.html"; return; }
  if (user.email !== APP_CONFIG.adminEmail || !user.emailVerified) {
    document.body.innerHTML = '<main class="dash-wrap"><h1>Access denied</h1><p>This account is not configured as the authorized LP admin.</p><a href="dashboard.html">Return to dashboard</a></main>';
    return;
  }
  admin = true;
  $("adminIdentity").textContent = `Signed in as ${user.email}`;
  load().catch(error => { $("adminQueue").textContent = `Could not load submissions: ${error.message}`; });
});
