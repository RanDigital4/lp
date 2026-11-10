
import {
  auth,
  db,
  ref,
  get,
  update,
  signOut,
  onAuthStateChanged,
  serverTimestamp
} from "./firebase.js";

import { APP_CONFIG, rewardFor } from "./app-config.js";

const $ = id => document.getElementById(id);

let admin = false;

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const validBscHash = value =>
  /^0x[a-fA-F0-9]{64}$/.test(String(value || "").trim());

const validWallet = value =>
  /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());

const safeHttpUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
};

const plusMonths = (timestamp, months) => {
  const date = new Date(timestamp);
  const originalDay = date.getDate();

  date.setMonth(date.getMonth() + months);

  if (date.getDate() < originalDay) {
    date.setDate(0);
  }

  return date.getTime();
};

const formatDate = value => {
  if (!value) return "—";

  const date = new Date(Number(value));

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
};

function requireAdmin() {
  if (!admin) {
    throw new Error("Admin authorization required.");
  }
}

async function load() {
  requireAdmin();

  $("adminQueue").textContent = "Loading submissions…";

  const [
    submissionsSnapshot,
    reviewsSnapshot,
    requestsSnapshot,
    ledgerSnapshot,
    withdrawalAdminSnapshot
  ] = await Promise.all([
    get(ref(db, "submissions")),
    get(ref(db, "adminReview")),
    get(ref(db, "withdrawalRequests")),
    get(ref(db, "rewardLedger")),
    get(ref(db, "withdrawalAdmin"))
  ]);

  const submissions = submissionsSnapshot.val() || {};
  const reviews = reviewsSnapshot.val() || {};
  const requests = requestsSnapshot.val() || {};
  const ledger = ledgerSnapshot.val() || {};
  const withdrawalAdmin = withdrawalAdminSnapshot.val() || {};

  let html = "";

  for (const [uid, userSubmissions] of Object.entries(submissions)) {
    for (const [id, submission] of Object.entries(userSubmissions || {})) {

      const review = reviews?.[uid]?.[id] || {};
      const rewardItem = ledger?.[uid]?.[id] || {};

      const status =
        review.status ||
        submission.status ||
        "pending";

      const reward = rewardFor(submission.amountUsd);

      const txHash = String(submission.txHash || "").trim();

      const txLink = validBscHash(txHash)
        ? `<a href="https://bscscan.com/tx/${encodeURIComponent(txHash)}"
             target="_blank"
             rel="noopener noreferrer">Open transaction on BscScan ↗</a>`
        : "Invalid or missing transaction hash";

      const walletOk = validWallet(submission.walletAddress);

      const positionUrl = safeHttpUrl(submission.lpUrl || "");

      const positionLink = positionUrl
        ? `<p>LP position URL:
             <a href="${esc(positionUrl)}"
                target="_blank"
                rel="noopener noreferrer">Open position ↗</a>
           </p>`
        : "";

      const canApprove =
        status === "pending" &&
        !review.status;

      const canUnlock =
        rewardItem.status === "locked" &&
        Number(rewardItem.lockEndsAt) > 0 &&
        Date.now() >= Number(rewardItem.lockEndsAt);

      const lockText = rewardItem.lockEndsAt
        ? `Lock ends: ${formatDate(rewardItem.lockEndsAt)}`
        : "Lock not started";

      html += `
        <article class="record-card">

          <div class="record-top">
            <strong>
              ${esc(submission.dex || "DEX not specified")}
              · $${esc(submission.amountUsd)}
              · ${Number(reward || 0)} RND reward
            </strong>

            <span class="tag ${esc(status)}">
              ${esc(status.toUpperCase())}
            </span>
          </div>

          <p>User UID: ${esc(uid)}</p>
          <p>Submission ID: ${esc(id)}</p>

          <p>
            Network:
            ${esc(submission.network || "BNB Smart Chain")}
          </p>

          <p>
            Chain ID:
            ${esc(submission.chainId || 56)}
          </p>

          <p>
            Protocol:
            ${esc(submission.protocolVersion || "Not specified")}
          </p>

          <p>Transaction: ${txLink}</p>

          <p>
            LP Wallet:
            ${esc(submission.walletAddress || "—")}
            ${walletOk ? "" : " · Invalid/missing address"}
          </p>

          <p>
            Position ID:
            ${esc(submission.positionId || "—")}
          </p>

          ${positionLink}

          <p>Notes: ${esc(submission.notes || "—")}</p>

          <p>
            Submitted:
            ${formatDate(submission.submittedAt)}
          </p>

          <p>
            Configured reward:
            ${Number(reward || 0)} RND
          </p>

          ${
            review.rewardRND !== undefined
              ? `<p>Approved reward: ${Number(review.rewardRND)} RND</p>`
              : ""
          }

          ${
            rewardItem.status
              ? `<p>Reward ledger: ${esc(rewardItem.status)}</p>`
              : ""
          }

          <p>${lockText}</p>

          ${
            canApprove
              ? `
                <div class="admin-actions">
                  <button
                    class="btn-small btn-approve"
                    data-action="approve"
                    data-uid="${esc(uid)}"
                    data-id="${esc(id)}">
                    Approve & Start 6 Months
                  </button>

                  <button
                    class="btn-small btn-reject"
                    data-action="reject"
                    data-uid="${esc(uid)}"
                    data-id="${esc(id)}">
                    Reject
                  </button>
                </div>
              `
              : ""
          }

          ${
            status === "approved" || rewardItem.status === "locked"
              ? `
                <div class="admin-actions">

                  <button
                    class="btn-small btn-neutral"
                    data-action="unlock"
                    data-uid="${esc(uid)}"
                    data-id="${esc(id)}"
                    ${canUnlock ? "" : "disabled"}>
                    ${canUnlock
                      ? "Confirm LP & Unlock"
                      : "6-Month Lock Active"}
                  </button>

                  <button
                    class="btn-small btn-reject"
                    data-action="forfeit"
                    data-uid="${esc(uid)}"
                    data-id="${esc(id)}">
                    Mark Forfeited
                  </button>

                </div>
              `
              : ""
          }

          ${
            rewardItem.lockStartAt
              ? `<p>Lock started: ${formatDate(rewardItem.lockStartAt)}</p>`
              : ""
          }

          ${
            review.reason
              ? `<p>Admin note: ${esc(review.reason)}</p>`
              : ""
          }

        </article>
      `;
    }
  }

  $("adminQueue").innerHTML =
    html || '<p class="muted">No submissions found.</p>';

  // Withdrawal requests

  let withdrawalHtml = "";

  for (const [uid, items] of Object.entries(requests)) {
    for (const [id, withdrawal] of Object.entries(items || {})) {

      const adminRecord =
        withdrawalAdmin?.[uid]?.[id] || {};

      const rewardItem =
        ledger?.[uid]?.[id] || {};

      const status =
        adminRecord.status ||
        withdrawal.status ||
        "pending";

      const amount = Number(withdrawal.amountRND || 0);

      const wallet = withdrawal.walletAddress || "—";

      const canPay =
        status !== "paid" &&
        rewardItem.status === "unlocked" &&
        amount > 0 &&
        validWallet(wallet);

      withdrawalHtml += `
        <article class="record-card">

          <div class="record-top">
            <strong>${amount} RND withdrawal</strong>

            <span class="tag ${esc(status)}">
              ${esc(status.toUpperCase())}
            </span>
          </div>

          <p>User UID: ${esc(uid)}</p>
          <p>Submission ID: ${esc(id)}</p>
          <p>Wallet: ${esc(wallet)}</p>

          <p>
            Request date:
            ${formatDate(withdrawal.createdAt)}
          </p>

          <p>
            Reward status:
            ${esc(rewardItem.status || "Not found")}
          </p>

          ${
            status === "paid"
              ? `
                <p>
                  Actual transfer TX:
                  ${
                    validBscHash(adminRecord.txHash)
                      ? `<a href="https://bscscan.com/tx/${encodeURIComponent(adminRecord.txHash)}"
                           target="_blank"
                           rel="noopener noreferrer">
                           Open on BscScan ↗
                         </a>`
                      : esc(adminRecord.txHash || "—")
                  }
                </p>

                <p>Paid date: ${formatDate(adminRecord.paidAt)}</p>
              `
              : canPay
                ? `
                  <div class="admin-actions">

                    <input
                      id="tx-${esc(uid)}-${esc(id)}"
                      placeholder="Actual RND transfer TX hash"
                      aria-label="Actual transfer transaction hash">

                    <button
                      class="btn-small btn-approve"
                      data-action="paid"
                      data-uid="${esc(uid)}"
                      data-id="${esc(id)}">
                      Confirm RND Paid
                    </button>

                  </div>
                `
                : `
                  <p class="muted">
                    Payment is unavailable. Check unlocked reward,
                    amount and wallet address.
                  </p>
                `
          }

        </article>
      `;
    }
  }

  $("adminWithdrawals").innerHTML =
    withdrawalHtml || '<p class="muted">No withdrawal requests.</p>';
}

// Submission actions

$("adminQueue").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button || button.disabled) return;

  requireAdmin();

  const { action, uid, id } = button.dataset;

  if (!uid || !id) return;

  button.disabled = true;

  try {
    const submissionRef = ref(db, `submissions/${uid}/${id}`);
    const reviewRef = ref(db, `adminReview/${uid}/${id}`);
    const ledgerRef = ref(db, `rewardLedger/${uid}/${id}`);

    const [submissionSnapshot, reviewSnapshot, ledgerSnapshot] =
      await Promise.all([
        get(submissionRef),
        get(reviewRef),
        get(ledgerRef)
      ]);

    const submission = submissionSnapshot.val();
    const existingReview = reviewSnapshot.val();
    const existingLedger = ledgerSnapshot.val();

    if (!submission) {
      throw new Error("Submission not found.");
    }

    const updates = {};

    if (action === "approve") {

      if (existingReview || existingLedger) {
        throw new Error("This submission has already been reviewed.");
      }

      if (submission.status !== "pending") {
        throw new Error("Submission is not pending.");
      }

      if (!validBscHash(submission.txHash)) {
        throw new Error("Valid BNB transaction hash is required.");
      }

      if (!validWallet(submission.walletAddress)) {
        throw new Error("Valid LP wallet address is required.");
      }

      if (Number(submission.chainId || 56) !== 56) {
        throw new Error("This submission is not on BNB Smart Chain.");
      }

      const reward = rewardFor(submission.amountUsd);

      if (!reward) {
        throw new Error("No configured reward for this amount.");
      }

      const start = Date.now();
      const end = plusMonths(start, APP_CONFIG.lockMonths || 6);

      if (!confirm(
        `Confirm manual LP verification?\n\n` +
        `Amount: $${submission.amountUsd}\n` +
        `Reward: ${reward} RND\n` +
        `Lock ends: ${formatDate(end)}\n\n` +
        `Approve only after checking the actual LP position on-chain.`
      )) {
        return;
      }

      updates[`adminReview/${uid}/${id}`] = {
        status: "approved",
        rewardRND: reward,
        lockStartAt: start,
        lockEndsAt: end,
        reviewedAt: serverTimestamp()
      };

      updates[`rewardLedger/${uid}/${id}`] = {
        status: "locked",
        rewardRND: reward,
        lockStartAt: start,
        lockEndsAt: end,
        updatedAt: serverTimestamp()
      };

    } else if (action === "reject") {

      if (existingReview || existingLedger) {
        throw new Error("This submission has already been reviewed.");
      }

      const reason = prompt(
        "Enter the reason for rejecting this LP application:"
      );

      if (reason === null) return;

      updates[`adminReview/${uid}/${id}`] = {
        status: "rejected",
        reason: reason.trim() || "Rejected after manual review.",
        reviewedAt: serverTimestamp()
      };

    } else if (action === "unlock") {

      if (!existingLedger || existingLedger.status !== "locked") {
        throw new Error("This reward is not currently locked.");
      }

      if (Date.now() < Number(existingLedger.lockEndsAt)) {
        throw new Error("The six-month lock period is not complete.");
      }

      if (!confirm(
        "Have you checked that the LP position was maintained for the required period?\n\nUnlock this reward?"
      )) {
        return;
      }

      updates[`adminReview/${uid}/${id}/status`] = "unlocked";
      updates[`adminReview/${uid}/${id}/unlockedAt`] =
        serverTimestamp();

      updates[`rewardLedger/${uid}/${id}/status`] = "unlocked";
      updates[`rewardLedger/${uid}/${id}/updatedAt`] =
        serverTimestamp();

    } else if (action === "forfeit") {

      if (!existingLedger || existingLedger.status !== "locked") {
        throw new Error("Only a locked reward can be forfeited.");
      }

      const reason = prompt(
        "Confirm why this LP reward is being forfeited:"
      );

      if (reason === null) return;

      updates[`adminReview/${uid}/${id}/status`] = "forfeited";
      updates[`adminReview/${uid}/${id}/reason`] =
        reason.trim() || "LP qualification not maintained.";

      updates[`rewardLedger/${uid}/${id}/status`] = "forfeited";
      updates[`rewardLedger/${uid}/${id}/updatedAt`] =
        serverTimestamp();

    } else {
      throw new Error("Unknown admin action.");
    }

    await update(ref(db), updates);

    alert("Admin action saved successfully.");
    await load();

  } catch (error) {
    alert(error.message || "Action failed.");
    button.disabled = false;
  }
});

// Withdrawal payment confirmation

$("adminWithdrawals").addEventListener("click", async event => {
  const button = event.target.closest(
    'button[data-action="paid"]'
  );

  if (!button || button.disabled) return;

  requireAdmin();

  const { uid, id } = button.dataset;

  if (!uid || !id) return;

  button.disabled = true;

  try {
    const [requestSnapshot, ledgerSnapshot, adminSnapshot] =
      await Promise.all([
        get(ref(db, `withdrawalRequests/${uid}/${id}`)),
        get(ref(db, `rewardLedger/${uid}/${id}`)),
        get(ref(db, `withdrawalAdmin/${uid}/${id}`))
      ]);

    const withdrawal = requestSnapshot.val();
    const rewardItem = ledgerSnapshot.val();
    const previousAdmin = adminSnapshot.val();

    if (!withdrawal) {
      throw new Error("Withdrawal request not found.");
    }

    if (previousAdmin?.status === "paid") {
      throw new Error("This withdrawal is already marked paid.");
    }

    if (!rewardItem || rewardItem.status !== "unlocked") {
      throw new Error("Reward is not unlocked.");
    }

    if (!validWallet(withdrawal.walletAddress)) {
      throw new Error("Invalid receiving wallet address.");
    }

    const amount = Number(withdrawal.amountRND || 0);

    if (
      amount <= 0 ||
      amount !== Number(rewardItem.rewardRND)
    ) {
      throw new Error("Withdrawal amount does not match the reward ledger.");
    }

    const input = $(`tx-${uid}-${id}`);
    const txHash = input?.value.trim() || "";

    if (!validBscHash(txHash)) {
      throw new Error("Enter a valid BNB Smart Chain transfer TX hash.");
    }

    if (!confirm(
      `Have you actually sent ${amount} RND to:\n${withdrawal.walletAddress}\n\n` +
      `Confirm only after the transfer is completed on-chain.`
    )) {
      return;
    }

    await update(ref(db), {
      [`withdrawalAdmin/${uid}/${id}`]: {
        status: "paid",
        txHash,
        paidAt: Date.now(),
        updatedAt: serverTimestamp()
      },

      [`rewardLedger/${uid}/${id}/status`]: "paid",

      [`rewardLedger/${uid}/${id}/updatedAt`]:
        serverTimestamp()
    });

    alert("Payment record saved.");
    await load();

  } catch (error) {
    alert(error.message || "Payment update failed.");
    button.disabled = false;
  }
});

// Refresh and logout

$("refreshBtn").addEventListener("click", () => {
  load().catch(error => {
    $("adminQueue").textContent =
      "Could not load data: " + error.message;
  });
});

$("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    location.href = "index.html";
  }).catch(error => alert(error.message));
});

// Admin authentication

onAuthStateChanged(auth, user => {

  if (!user) {
    location.href = "login.html";
    return;
  }

  if (
    !APP_CONFIG.adminEmail ||
    APP_CONFIG.adminEmail === "YOUR_ADMIN_EMAIL@example.com" ||
    user.email !== APP_CONFIG.adminEmail ||
    !user.emailVerified
  ) {
    document.body.innerHTML = `
      <main class="dash-wrap">
        <h1>Access denied</h1>
        <p>
          This account is not configured as the authorized
          LP program administrator.
        </p>
        <a href="dashboard.html">Return to dashboard</a>
      </main>
    `;

    return;
  }

  admin = true;

  $("adminIdentity").textContent =
    `Signed in as ${user.email}`;

  load().catch(error => {
    $("adminQueue").textContent =
      "Could not load submissions: " + error.message;
  });

});
