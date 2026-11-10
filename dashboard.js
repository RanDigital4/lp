
import {
  auth,
  db,
  ref,
  set,
  get,
  push,
  onValue,
  serverTimestamp,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "./firebase.js";

import {
  APP_CONFIG,
  rewardFor
} from "./app-config.js";

const $ = id => document.getElementById(id);

let currentUser = null;

let submissions = {};
let reviews = {};
let ledger = {};
let withdrawals = {};
let withdrawalAdmin = {};

let listenersStarted = false;

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

    return url.protocol === "https:" ||
      url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
};

const formatDate = value => {
  if (!value) return "Not set";

  const date = new Date(Number(value));

  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleString();
};

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = type
    ? `form-message ${type}`
    : "form-message";
}

function getWithdrawalStatus(id) {
  return withdrawalAdmin[id]?.status ||
    withdrawals[id]?.status ||
    "pending";
}

function renderRecords() {
  const root = $("records");

  if (!currentUser) return;

  const ids = Object.keys(submissions);

  if (!ids.length) {
    root.innerHTML =
      '<p class="muted">No LP submissions yet.</p>';
  } else {
    root.innerHTML = ids.reverse().map(id => {
      const submission = submissions[id] || {};
      const review = reviews[id] || {};
      const itemLedger = ledger[id] || {};

      const status =
        review.status ||
        submission.status ||
        "pending";

      const proposedReward =
        Number(rewardFor(submission.amountUsd) || 0);

      const approvedReward =
        Number(
          itemLedger.rewardRND ||
          review.rewardRND ||
          0
        );

      const verified =
        review.status === "approved" ||
        review.status === "unlocked" ||
        itemLedger.status === "locked" ||
        itemLedger.status === "unlocked" ||
        itemLedger.status === "paid";

      const txHash = String(submission.txHash || "");

      const txLink = validBscHash(txHash)
        ? `<a href="https://bscscan.com/tx/${encodeURIComponent(txHash)}"
             target="_blank"
             rel="noopener noreferrer">
             View transaction on BscScan ↗
           </a>`
        : "Transaction hash not available";

      const positionUrl = safeHttpUrl(
        submission.lpUrl || ""
      );

      const positionLink = positionUrl
        ? `<p>
             LP position:
             <a href="${esc(positionUrl)}"
                target="_blank"
                rel="noopener noreferrer">
                Open position ↗
             </a>
           </p>`
        : "";

      const lockStart =
        itemLedger.lockStartAt ||
        review.lockStartAt;

      const lockEnd =
        itemLedger.lockEndsAt ||
        review.lockEndsAt;

      const lockDetails = lockStart || lockEnd
        ? `
          <p>Lock started: ${formatDate(lockStart)}</p>
          <p>Lock ends: ${formatDate(lockEnd)}</p>
        `
        : "";

      const withdrawalStatus = getWithdrawalStatus(id);

      const withdrawalInfo = withdrawals[id]
        ? `
          <p>
            Withdrawal status:
            <b>${esc(withdrawalStatus.toUpperCase())}</b>
          </p>
          ${
            withdrawalAdmin[id]?.txHash
              ? `<p>Transfer TX: ${esc(withdrawalAdmin[id].txHash)}</p>`
              : ""
          }
        `
        : "";

      return `
        <article class="record-card">

          <div class="record-top">

            <strong>
              ${esc(submission.dex || "DEX")}
              · $${esc(submission.amountUsd)}
            </strong>

            <span class="tag ${esc(status)}">
              ${verified ? "✓ VERIFIED · " : ""}
              ${esc(status.toUpperCase())}
            </span>

          </div>

          <p>
            Network:
            ${esc(submission.network || "BNB Smart Chain")}
          </p>

          <p>
            Transaction:
            ${txLink}
          </p>

          <p>
            LP wallet:
            ${esc(submission.walletAddress || "—")}
          </p>

          ${
            submission.positionId
              ? `<p>Position ID: ${esc(submission.positionId)}</p>`
              : ""
          }

          ${positionLink}

          <p>
            Submitted:
            ${formatDate(submission.submittedAt || submission.createdAt)}
          </p>

          <p>
            Proposed reward:
            <b>${proposedReward} RND</b>
          </p>

          ${
            verified
              ? `
                <p>
                  Approved reward:
                  <b>${approvedReward} RND</b>
                </p>
              `
              : ""
          }

          ${lockDetails}

          ${
            status === "pending"
              ? `<p>Your application is waiting for admin verification. Target review time: 24 hours.</p>`
              : ""
          }

          ${
            status === "rejected"
              ? `<p>Application rejected. ${esc(review.reason || "")}</p>`
              : ""
          }

          ${
            status === "forfeited"
              ? `<p>Reward forfeited. ${esc(review.reason || "")}</p>`
              : ""
          }

          ${withdrawalInfo}

          ${
            itemLedger.status === "paid"
              ? `<p><b>RND transfer recorded as completed.</b></p>`
              : ""
          }

        </article>
      `;
    }).join("");
  }

  // Withdrawal options

  const unlocked = Object.entries(ledger).filter(
    ([id, item]) =>
      item.status === "unlocked" &&
      !withdrawals[id]
  );

  $("withdrawRecord").innerHTML = unlocked.length
    ? unlocked.map(([id, item]) => `
        <option value="${esc(id)}">
          ${Number(item.rewardRND || 0)} RND · ${esc(id.slice(0, 9))}
        </option>
      `).join("")
    : '<option value="">No unlocked rewards</option>';

  // Reward totals

  let approved = 0;
  let locked = 0;
  let available = 0;

  Object.entries(ledger).forEach(([id, item]) => {
    if (
      item.status === "forfeited" ||
      item.status === "paid"
    ) {
      return;
    }

    const amount = Number(item.rewardRND || 0);

    approved += amount;

    if (item.status === "locked") {
      locked += amount;
    }

    if (
      item.status === "unlocked" &&
      !withdrawals[id]
    ) {
      available += amount;
    }
  });

  $("approvedReward").textContent = `${approved} RND`;
  $("lockedReward").textContent = `${locked} RND`;
  $("availableReward").textContent = `${available} RND`;

  // Withdrawal history

  const withdrawalItems = Object.entries(withdrawals);

  $("withdrawalRecords").innerHTML =
    withdrawalItems.length
      ? withdrawalItems.map(([id, item]) => {
          const adminItem = withdrawalAdmin[id] || {};

          const status =
            adminItem.status ||
            item.status ||
            "pending";

          return `
            <article class="record-card">

              <div class="record-top">
                <strong>
                  Withdrawal · ${Number(item.amountRND || 0)} RND
                </strong>

                <span class="tag ${esc(status)}">
                  ${esc(status.toUpperCase())}
                </span>
              </div>

              <p>Wallet: ${esc(item.walletAddress || "—")}</p>

              ${
                adminItem.txHash
                  ? `<p>Transfer TX: ${esc(adminItem.txHash)}</p>`
                  : ""
              }

              <p>
                Request date:
                ${formatDate(item.createdAt)}
              </p>

            </article>
          `;
        }).join("")
      : "";
}

// Reward preview

$("amount").addEventListener("change", () => {
  const reward = rewardFor($("amount").value);

  $("rewardPreview").textContent = reward
    ? `Proposed reward: ${reward} RND · Pending admin verification.`
    : "Choose a valid tier.";
});

// LP application submission

$("lpForm").addEventListener("submit", async event => {
  event.preventDefault();

  const message = $("formMessage");

  if (!currentUser?.emailVerified) {
    showMessage(
      message,
      "Verify your email before submitting.",
      "error"
    );
    return;
  }

  const dex = $("dex").value;
  const amount = Number($("amount").value);
  const reward = rewardFor(amount);

  const txHash = $("txHash").value.trim();
  const walletAddress = $("wallet").value.trim();

  const positionId =
    $("positionId").value.trim();

  const lpUrlInput =
    $("lpUrl").value.trim();

  const lpUrl = lpUrlInput
    ? safeHttpUrl(lpUrlInput)
    : "";

  if (!dex) {
    showMessage(
      message,
      "Choose PancakeSwap V2 or Uniswap V4 on BNB Smart Chain.",
      "error"
    );
    return;
  }

  if (!reward) {
    showMessage(
      message,
      "Select one of the configured reward tiers.",
      "error"
    );
    return;
  }

  if (!validBscHash(txHash)) {
    showMessage(
      message,
      "Enter a valid BNB Smart Chain transaction hash.",
      "error"
    );
    return;
  }

  if (!validWallet(walletAddress)) {
    showMessage(
      message,
      "Enter a valid BNB Smart Chain wallet address.",
      "error"
    );
    return;
  }

  if (lpUrlInput && !lpUrl) {
    showMessage(
      message,
      "Position URL must begin with http:// or https://.",
      "error"
    );
    return;
  }

  const submitButton =
    $("lpForm").querySelector('button[type="submit"]');

  submitButton.disabled = true;

  showMessage(message, "Submitting LP application…");

  try {
    const itemRef = push(
      ref(db, `submissions/${currentUser.uid}`)
    );

    await set(itemRef, {
      uid: currentUser.uid,
      email: currentUser.email || "",
      dex,
      network: "BNB Smart Chain",
      chainId: 56,
      protocolVersion: dex.startsWith("PancakeSwap")
        ? "V2"
        : "V4",
      amountUsd: amount,
      proposedRewardRND: reward,
      txHash,
      walletAddress,
      positionId: positionId || "",
      lpUrl: lpUrl || "",
      notes: $("notes").value.trim(),
      status: "pending",
      approvalTargetHours: APP_CONFIG.approvalTargetHours || 24,
      createdAt: serverTimestamp(),
      submittedAt: Date.now()
    });

    $("lpForm").reset();

    $("rewardPreview").textContent =
      "Choose a tier to view the proposed RND reward.";

    showMessage(
      message,
      `Application submitted successfully.\nProposed reward: ${reward} RND.\nStatus: Pending admin verification.\nThis is a proposed reward, not an actual token transfer.`,
      "success"
    );

  } catch (error) {
    showMessage(
      message,
      "Could not submit: " + error.message,
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
});

// Withdrawal request

$("withdrawForm").addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("withdrawRecord").value;
  const walletAddress = $("withdrawWallet").value.trim();
  const message = $("withdrawMessage");

  if (!currentUser) {
    showMessage(message, "Please sign in again.", "error");
    return;
  }

  if (!id) {
    showMessage(
      message,
      "No withdrawal-ready reward record.",
      "error"
    );
    return;
  }

  if (!validWallet(walletAddress)) {
    showMessage(
      message,
      "Enter a valid BNB Smart Chain receiving wallet address.",
      "error"
    );
    return;
  }

  const item = ledger[id];

  if (!item || item.status !== "unlocked") {
    showMessage(
      message,
      "This reward has not been unlocked by admin.",
      "error"
    );
    return;
  }

  if (withdrawals[id]) {
    showMessage(
      message,
      "A withdrawal request already exists for this reward.",
      "error"
    );
    return;
  }

  showMessage(message, "Submitting withdrawal request…");

  const submitButton =
    $("withdrawForm").querySelector('button[type="submit"]');

  submitButton.disabled = true;

  try {
    await set(
      ref(db, `withdrawalRequests/${currentUser.uid}/${id}`),
      {
        submissionId: id,
        amountRND: Number(item.rewardRND),
        walletAddress,
        status: "pending",
        createdAt: serverTimestamp()
      }
    );

    showMessage(
      message,
      "Withdrawal request submitted for admin processing. This does not transfer tokens automatically.",
      "success"
    );

  } catch (error) {
    showMessage(
      message,
      "Withdrawal request failed: " + error.message,
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
});

// Logout

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    location.href = "index.html";
  } catch (error) {
    alert(error.message);
  }
});

// Firebase listeners

function startListeners(user) {
  if (listenersStarted) return;

  listenersStarted = true;

  onValue(
    ref(db, `submissions/${user.uid}`),
    snapshot => {
      submissions = snapshot.val() || {};
      renderRecords();
    }
  );

  onValue(
    ref(db, `adminReview/${user.uid}`),
    snapshot => {
      reviews = snapshot.val() || {};
      renderRecords();
    }
  );

  onValue(
    ref(db, `rewardLedger/${user.uid}`),
    snapshot => {
      ledger = snapshot.val() || {};
      renderRecords();
    }
  );

  onValue(
    ref(db, `withdrawalRequests/${user.uid}`),
    snapshot => {
      withdrawals = snapshot.val() || {};
      renderRecords();
    }
  );

  onValue(
    ref(db, `withdrawalAdmin/${user.uid}`),
    snapshot => {
      withdrawalAdmin = snapshot.val() || {};
      renderRecords();
    }
  );
}

// Authentication

onAuthStateChanged(auth, user => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;

  $("welcome").textContent =
    `Welcome, ${user.email}`;

  $("accountStatus").textContent =
    user.emailVerified
      ? "Email verified"
      : "Verify email";

  $("verifyNotice").hidden =
    !!user.emailVerified;

  if (user.email === APP_CONFIG.adminEmail) {
    $("adminLink").hidden = false;
  }

  if (!user.emailVerified) {
    $("verifyNotice").innerHTML = `
      Please verify your email before submitting LP proof.
      <button
        id="resendVerify"
        class="btn-small btn-neutral"
        type="button">
        Resend verification email
      </button>
    `;

    $("resendVerify").addEventListener("click", async () => {
      try {
        await sendEmailVerification(user);
        alert("Verification email sent.");
      } catch (error) {
        alert(error.message);
      }
    });
  }

  startListeners(user);
});
