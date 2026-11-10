import {auth,db,ref,set,get,push,onValue,serverTimestamp,signOut,onAuthStateChanged,sendEmailVerification} from "./firebase.js";
import {APP_CONFIG,rewardFor} from "./app-config.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let submissions = {}, reviews = {}, ledger = {}, withdrawals = {};

const fmtDate = value => value ? new Date(Number(value)).toLocaleString() : "Not set";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const validBscHash = value => /^0x[a-fA-F0-9]{64}$/.test(value);
const validWallet = value => /^0x[a-fA-F0-9]{40}$/.test(value);
const safeHttpUrl = value => {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; }
  catch { return ""; }
};

function renderRecords() {
  const root = $("records");
  const ids = Object.keys(submissions);
  if (!ids.length) {
    root.innerHTML = '<p class="muted">No LP submissions yet.</p>';
  } else {
    root.innerHTML = ids.reverse().map(id => {
      const submission = submissions[id] || {};
      const review = reviews[id] || {};
      const itemLedger = ledger[id] || {};
      const status = review.status || submission.status || "pending";
      const txLink = validBscHash(String(submission.txHash || ""))
        ? `<a href="https://bscscan.com/tx/${encodeURIComponent(submission.txHash)}" target="_blank" rel="noopener noreferrer">View transaction on BscScan ↗</a>`
        : "Transaction hash not available";
      const positionUrl = safeHttpUrl(submission.lpUrl || "");
      const positionLink = positionUrl
        ? `<p>Position URL: <a href="${esc(positionUrl)}" target="_blank" rel="noopener noreferrer">Open evidence ↗</a></p>` : "";
      return `<article class="record-card">
        <div class="record-top"><strong>${esc(submission.dex)} · $${esc(submission.amountUsd)}</strong><span class="tag ${esc(status)}">${esc(status.toUpperCase())}</span></div>
        <p>Transaction: ${txLink}</p>
        <p>LP wallet: ${esc(submission.walletAddress || "—")}</p>
        ${submission.positionId ? `<p>Position ID: ${esc(submission.positionId)}</p>` : ""}
        ${positionLink}
        <p>Submitted: ${fmtDate(submission.createdAt)} · Proposed reward: ${Number(rewardFor(submission.amountUsd) || 0)} RND</p>
        ${review.status === "approved" ? `<p>Approved reward: <b>${Number(itemLedger.rewardRND || review.rewardRND || 0)} RND</b> · Lock ends: ${fmtDate(itemLedger.lockEndsAt || review.lockEndsAt)}</p>` : ""}
        ${review.reason ? `<p>Admin note: ${esc(review.reason)}</p>` : ""}
      </article>`;
    }).join("");
  }

  const unlocked = Object.entries(ledger).filter(([id, item]) => item.status === "unlocked" && !withdrawals[id]);
  $("withdrawRecord").innerHTML = unlocked.length
    ? unlocked.map(([id, item]) => `<option value="${esc(id)}">${Number(item.rewardRND || 0)} RND · ${esc(id.slice(0, 9))}</option>`).join("")
    : '<option value="">No unlocked rewards</option>';

  let approved = 0, locked = 0, available = 0;
  Object.entries(ledger).forEach(([id, item]) => {
    if (item.status === "forfeited") return;
    const amount = Number(item.rewardRND || 0);
    approved += amount;
    if (item.status === "locked") locked += amount;
    if (item.status === "unlocked" && !withdrawals[id]) available += amount;
  });
  $("approvedReward").textContent = `${approved} RND`;
  $("lockedReward").textContent = `${locked} RND`;
  $("availableReward").textContent = `${available} RND`;

  const withdrawalItems = Object.entries(withdrawals);
  $("withdrawalRecords").innerHTML = withdrawalItems.length ? withdrawalItems.map(([id, item]) =>
    `<article class="record-card"><div class="record-top"><strong>Withdrawal · ${Number(item.amountRND || 0)} RND</strong><span class="tag ${esc(item.status || "pending")}">${esc((item.status || "pending").toUpperCase())}</span></div><p>Wallet: ${esc(item.walletAddress)}</p>${item.txHash ? `<p>Transfer TX: ${esc(item.txHash)}</p>` : ""}</article>`
  ).join("") : "";
}

$("amount").addEventListener("change", () => {
  const reward = rewardFor($("amount").value);
  $("rewardPreview").textContent = reward ? `Proposed reward: ${reward} RND · pending admin verification.` : "Choose a valid tier.";
});

$("lpForm").addEventListener("submit", async event => {
  event.preventDefault();
  const message = $("formMessage");
  if (!currentUser?.emailVerified) {
    message.textContent = "Verify your email before submitting.";
    message.className = "form-message error";
    return;
  }

  const dex = $("dex").value;
  const amount = Number($("amount").value);
  const reward = rewardFor(amount);
  const txHash = $("txHash").value.trim();
  const walletAddress = $("wallet").value.trim();
  const positionId = $("positionId").value.trim();
  const lpUrlInput = $("lpUrl").value.trim();
  const lpUrl = lpUrlInput ? safeHttpUrl(lpUrlInput) : "";

  if (!dex) {
    message.textContent = "Choose PancakeSwap V2 or Uniswap V4 on BNB Smart Chain.";
    message.className = "form-message error";
    return;
  }
  if (!reward) {
    message.textContent = "Select one of the listed exact reward tiers.";
    message.className = "form-message error";
    return;
  }
  if (!validBscHash(txHash)) {
    message.textContent = "Enter a valid BNB Smart Chain transaction hash (0x followed by 64 hexadecimal characters).";
    message.className = "form-message error";
    return;
  }
  if (!validWallet(walletAddress)) {
    message.textContent = "Enter a valid BNB Smart Chain wallet address (0x followed by 40 hexadecimal characters).";
    message.className = "form-message error";
    return;
  }
  if (lpUrlInput && !lpUrl) {
    message.textContent = "If you provide a position URL, it must begin with http:// or https://.";
    message.className = "form-message error";
    return;
  }

  message.textContent = "Submitting…";
  message.className = "form-message";
  try {
    const itemRef = push(ref(db, `submissions/${currentUser.uid}`));
    await set(itemRef, {
      dex,
      network: "BNB Smart Chain",
      protocolVersion: dex.startsWith("PancakeSwap") ? "V2" : "V4",
      amountUsd: amount,
      txHash,
      walletAddress,
      positionId: positionId || "",
      lpUrl: lpUrl || "",
      notes: $("notes").value.trim(),
      status: "pending",
      createdAt: serverTimestamp()
    });
    $("lpForm").reset();
    $("rewardPreview").textContent = "Choose a tier to view the proposed RND reward.";
    message.textContent = "Submitted successfully. Status: Pending admin verification.";
    message.className = "form-message success";
  } catch (error) {
    message.textContent = "Could not submit: " + error.message;
    message.className = "form-message error";
  }
});

$("withdrawForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("withdrawRecord").value;
  const walletAddress = $("withdrawWallet").value.trim();
  const message = $("withdrawMessage");
  if (!id) {
    message.textContent = "No withdrawal-ready reward record.";
    message.className = "form-message error";
    return;
  }
  if (!validWallet(walletAddress)) {
    message.textContent = "Enter a valid BNB Smart Chain receiving wallet address.";
    message.className = "form-message error";
    return;
  }
  const item = ledger[id];
  if (!item || item.status !== "unlocked") {
    message.textContent = "This reward has not been unlocked by admin.";
    message.className = "form-message error";
    return;
  }
  message.textContent = "Submitting request…";
  message.className = "form-message";
  try {
    await set(ref(db, `withdrawalRequests/${currentUser.uid}/${id}`), {
      submissionId: id,
      amountRND: Number(item.rewardRND),
      walletAddress,
      status: "pending",
      createdAt: serverTimestamp()
    });
    message.textContent = "Withdrawal request submitted for admin processing. This does not transfer tokens automatically.";
    message.className = "form-message success";
  } catch (error) {
    message.textContent = error.message;
    message.className = "form-message error";
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth).then(() => location.href = "index.html"));

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "login.html"; return; }
  currentUser = user;
  $("welcome").textContent = `Welcome, ${user.email}`;
  $("accountStatus").textContent = user.emailVerified ? "Email verified" : "Verify email";
  $("verifyNotice").hidden = !!user.emailVerified;
  if (user.email === APP_CONFIG.adminEmail) $("adminLink").hidden = false;
  if (!user.emailVerified) {
    $("verifyNotice").innerHTML = 'Please verify your email before submitting LP proof. <button id="resendVerify" class="btn-small btn-neutral" type="button">Resend verification email</button>';
    $("resendVerify").addEventListener("click", () => sendEmailVerification(user).then(() => alert("Verification email sent.")).catch(error => alert(error.message)));
  }
  onValue(ref(db, `submissions/${user.uid}`), snapshot => { submissions = snapshot.val() || {}; renderRecords(); });
  onValue(ref(db, `adminReview/${user.uid}`), snapshot => { reviews = snapshot.val() || {}; renderRecords(); });
  onValue(ref(db, `rewardLedger/${user.uid}`), snapshot => { ledger = snapshot.val() || {}; renderRecords(); });
  onValue(ref(db, `withdrawalRequests/${user.uid}`), snapshot => { withdrawals = snapshot.val() || {}; renderRecords(); });
  onValue(ref(db, `withdrawalAdmin/${user.uid}`), snapshot => {
    const adminItems = snapshot.val() || {};
    Object.entries(adminItems).forEach(([id, item]) => {
      if (withdrawals[id]) withdrawals[id] = { ...withdrawals[id], ...item };
    });
    renderRecords();
  });
});
