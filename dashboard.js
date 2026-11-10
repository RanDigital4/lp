
import {
  auth,
  db,
  ref,
  set,
  push,
  onValue,
  serverTimestamp,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "./firebase.js";

import { APP_CONFIG, rewardFor } from "./app-config.js";

const $ = id => document.getElementById(id);

let currentUser = null;
let submissions = {};
let reviews = {};
let ledger = {};
let withdrawals = {};
let withdrawalAdmin = {};

let submitting = false;
let withdrawalSubmitting = false;

const NETWORK_NAME = "BNB Smart Chain";
const APPROVAL_HOURS = Number(APP_CONFIG.approvalTargetHours || 24);

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
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const formatDate = value => {
  if (!value) return "अभी उपलब्ध नहीं";

  const date = new Date(Number(value));

  return Number.isNaN(date.getTime())
    ? "अभी उपलब्ध नहीं"
    : date.toLocaleString("en-IN");
};

const formatRND = value =>
  `${Number(value || 0).toLocaleString("en-IN")} RND`;

function showMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function statusLabel(status) {
  const labels = {
    pending: "PENDING ADMIN APPROVAL",
    approved: "APPROVED",
    locked: "LOCKED",
    unlocked: "UNLOCKED",
    rejected: "REJECTED",
    forfeited: "FORFEITED",
    paid: "PAID"
  };

  return labels[status] || String(status || "PENDING").toUpperCase();
}

function statusClass(status) {
  const allowed = [
    "pending",
    "approved",
    "locked",
    "unlocked",
    "rejected",
    "forfeited",
    "paid"
  ];

  return allowed.includes(status) ? status : "pending";
}

/*
  Reward options app-config.js से बनेंगे।
  इससे HTML में पुराने या गलत reward tiers होने पर भी
  Dashboard सही configured tiers दिखाएगा।
*/
function loadRewardOptions() {
  const amountSelect = $("amount");

  if (!amountSelect) return;

  amountSelect.innerHTML =
    '<option value="">Select LP value</option>';

  APP_CONFIG.rewardTiers.forEach(tier => {
    const option = document.createElement("option");

    option.value = String(tier.amountUsd);
    option.textContent =
      `$${Number(tier.amountUsd).toLocaleString("en-IN")}`;

    amountSelect.appendChild(option);
  });

  updateRewardPreview();
}

function updateRewardPreview() {
  const amount = Number($("amount")?.value || 0);
  const reward = rewardFor(amount);
  const preview = $("rewardPreview");

  if (!preview) return;

  if (!reward) {
    preview.textContent =
      "LP value चुनें, आपका प्रस्तावित RND reward यहाँ दिखाई देगा।";
    return;
  }

  preview.textContent =
    `आपका प्रस्तावित Reward: ${formatRND(reward)} · Admin verification के बाद ही Approved होगा।`;
}

function getSubmissionStatus(id, submission) {
  const review = reviews[id] || {};
  const itemLedger = ledger[id] || {};

  if (itemLedger.status === "paid") return "paid";
  if (itemLedger.status === "forfeited") return "forfeited";
  if (itemLedger.status === "unlocked") return "unlocked";
  if (itemLedger.status === "locked") return "locked";

  if (review.status) return review.status;

  return submission.status || "pending";
}

function renderRecords() {
  const root = $("records");

  if (!root) return;

  const ids = Object.keys(submissions);

  if (!ids.length) {
    root.innerHTML =
      '<p class="muted">अभी कोई LP आवेदन जमा नहीं हुआ है।</p>';
  } else {
    const sortedIds = ids.sort((a, b) => {
      const dateA = Number(submissions[a]?.createdAt || 0);
      const dateB = Number(submissions[b]?.createdAt || 0);
      return dateB - dateA;
    });

    root.innerHTML = sortedIds.map(id => {
      const submission = submissions[id] || {};
      const review = reviews[id] || {};
      const itemLedger = ledger[id] || {};

      const status = getSubmissionStatus(id, submission);

      const proposedReward = Number(
        submission.proposedRewardRND ??
        rewardFor(submission.amountUsd) ??
        0
      );

      const approvedReward = Number(
        itemLedger.rewardRND ??
        review.rewardRND ??
        0
      );

      const txHash = String(submission.txHash || "");

      const txLink = validBscHash(txHash)
        ? `<a href="https://bscscan.com/tx/${encodeURIComponent(txHash)}"
             target="_blank"
             rel="noopener noreferrer">BscScan पर Transaction देखें ↗</a>`
        : "Transaction उपलब्ध नहीं";

      const positionUrl = safeHttpUrl(submission.lpUrl || "");

      const positionLink = positionUrl
        ? `<p>Position URL:
             <a href="${esc(positionUrl)}"
                target="_blank"
                rel="noopener noreferrer">Evidence देखें ↗</a>
           </p>`
        : "";

      const lockEnd = itemLedger.lockEndsAt || review.lockEndsAt;

      const isApproved = [
        "approved",
        "locked",
        "unlocked",
        "paid"
      ].includes(status);

      const verification = isApproved
        ? `<p class="verification-success">
             ✓ <b>Admin Verified — Approved</b>
           </p>`
        : "";

      let rewardDetails = `
        <p>Proposed Reward:
          <b>${formatRND(proposedReward)}</b>
        </p>
      `;

      if (isApproved) {
        rewardDetails += `
          <p>Approved Reward:
            <b>${formatRND(approvedReward)}</b>
          </p>
          <p>Lock Start:
            ${formatDate(itemLedger.lockStartAt || review.lockStartAt)}
          </p>
          <p>Lock Ends:
            <b>${formatDate(lockEnd)}</b>
          </p>
        `;
      }

      if (status === "pending") {
        rewardDetails += `
          <p class="pending-note">
            आपका LP आवेदन प्राप्त हो गया है।
            सामान्यतः ${APPROVAL_HOURS} घंटे के अंदर Admin
            BNB Smart Chain पर इसकी जाँच करेगा।
            जाँच पूरी होने तक Reward Pending रहेगा।
          </p>
        `;
      }

      if (status === "rejected") {
        rewardDetails += `
          <p class="form-message error">
            आपका आवेदन अप्रूव नहीं हुआ।
            ${esc(review.reason || "कृपया Admin से संपर्क करें।")}
          </p>
        `;
      }

      if (status === "locked") {
        rewardDetails += `
          <p class="pending-note">
            आपका Reward Approved है और छह महीने के Lock में है।
            Lock पूरा होने पर Admin अंतिम जाँच करेगा।
          </p>
        `;
      }

      if (status === "unlocked") {
        rewardDetails += `
          <p class="verification-success">
            ✓ Lock अवधि पूरी। Withdrawal Request उपलब्ध है।
          </p>
        `;
      }

      if (status === "paid") {
        rewardDetails += `
          <p class="verification-success">
            ✓ Reward भुगतान पूरा हो गया है।
          </p>
        `;
      }

      if (review.reason && status !== "rejected") {
        rewardDetails += `
          <p>Admin Note: ${esc(review.reason)}</p>
        `;
      }

      const date = formatDate(submission.createdAt);

      return `
        <article class="record-card">
          <div class="record-top">
            <strong>
              ${esc(submission.dex || "LP Application")}
              · $${esc(submission.amountUsd)}
            </strong>
            <span class="tag ${statusClass(status)}">
              ${statusLabel(status)}
            </span>
          </div>

          ${verification}

          <p>Network: ${NETWORK_NAME}</p>
          <p>Transaction: ${txLink}</p>
          <p>LP Wallet: ${esc(submission.walletAddress || "—")}</p>

          ${submission.positionId
            ? `<p>Position ID: ${esc(submission.positionId)}</p>`
            : ""}

          ${positionLink}

          <p>Submitted: ${date}</p>

          ${rewardDetails}
        </article>
      `;
    }).join("");
  }

  renderRewardSummary();
  renderWithdrawalOptions();
  renderWithdrawalHistory();
}

function renderRewardSummary() {
  let approved = 0;
  let locked = 0;
  let available = 0;

  Object.entries(ledger).forEach(([id, item]) => {
    if (!item || item.status === "forfeited") return;

    const amount = Number(item.rewardRND || 0);

    if (["locked", "unlocked", "paid"].includes(item.status)) {
      approved += amount;
    }

    if (item.status === "locked") {
      locked += amount;
    }

    if (
      item.status === "unlocked" &&
      !withdrawals[id] &&
      withdrawalAdmin[id]?.status !== "paid"
    ) {
      available += amount;
    }
  });

  if ($("approvedReward")) {
    $("approvedReward").textContent = formatRND(approved);
  }

  if ($("lockedReward")) {
    $("lockedReward").textContent = formatRND(locked);
  }

  if ($("availableReward")) {
    $("availableReward").textContent = formatRND(available);
  }
}

function renderWithdrawalOptions() {
  const select = $("withdrawRecord");

  if (!select) return;

  select.innerHTML = "";

  const options = Object.entries(ledger).filter(([id, item]) =>
    item &&
    item.status === "unlocked" &&
    !withdrawals[id] &&
    withdrawalAdmin[id]?.status !== "paid"
  );

  if (!options.length) {
    select.innerHTML =
      '<option value="">No unlocked rewards</option>';
    return;
  }

  select.innerHTML =
    '<option value="">Select unlocked reward</option>';

  options.forEach(([id, item]) => {
    const option = document.createElement("option");

    option.value = id;
    option.textContent =
      `${formatRND(item.rewardRND)} · ${id.slice(0, 9)}`;

    select.appendChild(option);
  });
}

function renderWithdrawalHistory() {
  const root = $("withdrawalRecords");

  if (!root) return;

  const combined = {
    ...withdrawals,
    ...withdrawalAdmin
  };

  const entries = Object.entries(combined);

  if (!entries.length) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = entries.map(([id, item]) => {
    const status = item.status || "pending";

    const tx = validBscHash(item.txHash || "")
      ? `<p>Transfer TX:
           <a href="https://bscscan.com/tx/${encodeURIComponent(item.txHash)}"
              target="_blank"
              rel="noopener noreferrer">BscScan पर देखें ↗</a>
         </p>`
      : "";

    return `
      <article class="record-card">
        <div class="record-top">
          <strong>Withdrawal · ${formatRND(item.amountRND)}</strong>
          <span class="tag ${statusClass(status)}">
            ${statusLabel(status)}
          </span>
        </div>
        <p>Receiving Wallet: ${esc(item.walletAddress || "—")}</p>
        ${tx}
        <p>Record ID: ${esc(id)}</p>
      </article>
    `;
  }).join("");
}

/*
  LP Application Submit
*/
$("amount")?.addEventListener("change", updateRewardPreview);

$("lpForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (submitting) return;

  const message = $("formMessage");

  if (!currentUser) {
    showMessage(message, "कृपया पहले लॉगिन करें।", "error");
    return;
  }

  if (!currentUser.emailVerified) {
    showMessage(
      message,
      "LP आवेदन से पहले अपना Email Verify करें।",
      "error"
    );
    return;
  }

  const dex = $("dex").value;
  const amount = Number($("amount").value);
  const reward = rewardFor(amount);

  const txHash = $("txHash").value.trim();
  const walletAddress = $("wallet").value.trim();

  const positionId = $("positionId")?.value.trim() || "";
  const lpUrlInput = $("lpUrl")?.value.trim() || "";
  const lpUrl = lpUrlInput ? safeHttpUrl(lpUrlInput) : "";
  const notes = $("notes")?.value.trim() || "";

  if (
    ![
      "PancakeSwap V2 BNB Smart Chain",
      "Uniswap V4 BNB Smart Chain"
    ].includes(dex)
  ) {
    showMessage(
      message,
      "PancakeSwap V2 या Uniswap V4 चुनें।",
      "error"
    );
    return;
  }

  if (!reward || !APP_CONFIG.rewardTiers.some(
    tier => Number(tier.amountUsd) === amount
  )) {
    showMessage(
      message,
      "कृपया उपलब्ध सही LP Reward Tier चुनें।",
      "error"
    );
    return;
  }

  if (!validBscHash(txHash)) {
    showMessage(
      message,
      "सही BNB Smart Chain Transaction Hash डालें।",
      "error"
    );
    return;
  }

  if (!validWallet(walletAddress)) {
    showMessage(
      message,
      "सही BNB Smart Chain LP Wallet Address डालें।",
      "error"
    );
    return;
  }

  if (lpUrlInput && !lpUrl) {
    showMessage(
      message,
      "Position URL सही http या https लिंक होना चाहिए।",
      "error"
    );
    return;
  }

  submitting = true;

  const submitButton = $("lpForm").querySelector(
    'button[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
  }

  showMessage(message, "आपका LP आवेदन Firebase में सेव हो रहा है...");

  try {
    const submissionRef = push(
      ref(db, `submissions/${currentUser.uid}`)
    );

    const submissionId = submissionRef.key;

    const now = Date.now();

    const record = {
      uid: currentUser.uid,
      email: currentUser.email || "",

      dex,
      network: NETWORK_NAME,
      chainId: 56,

      protocolVersion: dex.startsWith("PancakeSwap")
        ? "V2"
        : "V4",

      amountUsd: amount,
      proposedRewardRND: reward,

      txHash,
      walletAddress,

      positionId,
      lpUrl,

      notes,

      status: "pending",
      verificationStatus: "pending",

      approvalTargetHours: APPROVAL_HOURS,

      createdAt: serverTimestamp(),
      submittedAt: now,
      updatedAt: serverTimestamp()
    };

    /*
      Application Firebase में save होगा।
      Reward अभी केवल proposed है, approved नहीं।
    */
    await set(submissionRef, record);

    /*
      Save सफल होने के बाद तुरंत UI में रिकॉर्ड दिखाएँ।
      Firebase listener भी इसी रिकॉर्ड को real-time update करेगा।
    */
    submissions[submissionId] = {
      ...record,
      createdAt: now
    };

    renderRecords();

    $("lpForm").reset();
    updateRewardPreview();

    showMessage(
      message,
      `आपका LP आवेदन सफलतापूर्वक जमा हो गया है। आपका प्रस्तावित Reward ${formatRND(reward)} है। Status: Pending Admin Approval. सामान्यतः ${APPROVAL_HOURS} घंटे के अंदर BNB Smart Chain पर जाँच की जाएगी। अभी टोकन ट्रांसफर नहीं हुए हैं।`,
      "success"
    );

  } catch (error) {
    console.error("LP submission error:", error);

    showMessage(
      message,
      "आवेदन Firebase में सेव नहीं हो पाया: " +
        (error?.message || "Unknown error"),
      "error"
    );

  } finally {
    submitting = false;

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Submit LP for verification";
    }
  }
});

/*
  Withdrawal Request
  केवल Admin द्वारा unlocked record पर ही request बनेगी।
*/
$("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (withdrawalSubmitting) return;

  const message = $("withdrawMessage");

  if (!currentUser) {
    showMessage(message, "कृपया लॉगिन करें।", "error");
    return;
  }

  const id = $("withdrawRecord").value;
  const walletAddress = $("withdrawWallet").value.trim();

  if (!id) {
    showMessage(
      message,
      "अभी कोई Withdrawal-ready Reward उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  if (!validWallet(walletAddress)) {
    showMessage(
      message,
      "सही BNB Smart Chain Receiving Wallet Address डालें।",
      "error"
    );
    return;
  }

  const item = ledger[id];

  if (!item || item.status !== "unlocked") {
    showMessage(
      message,
      "यह Reward अभी Admin द्वारा Unlock नहीं किया गया है।",
      "error"
    );
    return;
  }

  if (withdrawals[id] || withdrawalAdmin[id]?.status === "paid") {
    showMessage(
      message,
      "इस Reward के लिए Withdrawal Request पहले से मौजूद है।",
      "error"
    );
    return;
  }

  withdrawalSubmitting = true;

  const button = $("withdrawForm").querySelector(
    'button[type="submit"]'
  );

  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }

  showMessage(message, "Withdrawal Request सेव हो रही है...");

  try {
    const requestRef = ref(
      db,
      `withdrawalRequests/${currentUser.uid}/${id}`
    );

    const request = {
      submissionId: id,
      amountRND: Number(item.rewardRND || 0),
      walletAddress,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await set(requestRef, request);

    withdrawals[id] = {
      ...request,
      createdAt: Date.now()
    };

    renderRecords();

    showMessage(
      message,
      "Withdrawal Request सफलतापूर्वक जमा हो गई है। Admin मैनुअल जाँच और वास्तविक RND ट्रांसफर करेगा।",
      "success"
    );

  } catch (error) {
    console.error("Withdrawal request error:", error);

    showMessage(
      message,
      "Withdrawal Request सेव नहीं हो पाई: " +
        (error?.message || "Unknown error"),
      "error"
    );

  } finally {
    withdrawalSubmitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Request RND withdrawal";
    }
  }
});

/*
  Logout
*/
$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    location.href = "index.html";
  } catch (error) {
    alert(error.message);
  }
});

/*
  Firebase Authentication and Real-time Database listeners
*/
loadRewardOptions();

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;

  $("welcome").textContent = `Welcome, ${user.email || "Member"}`;

  $("accountStatus").textContent = user.emailVerified
    ? "Email verified"
    : "Verify email";

  $("verifyNotice").hidden = !!user.emailVerified;

  if (
    user.email &&
    user.email.toLowerCase() ===
      String(APP_CONFIG.adminEmail || "").toLowerCase()
  ) {
    $("adminLink").hidden = false;
  }

  if (!user.emailVerified) {
    $("verifyNotice").innerHTML = `
      Please verify your email before submitting LP proof.
      <button id="resendVerify"
              class="btn-small btn-neutral"
              type="button">
        Resend verification email
      </button>
    `;

    $("resendVerify")?.addEventListener("click", async () => {
      try {
        await sendEmailVerification(user);
        alert("Verification email sent.");
      } catch (error) {
        alert(error.message);
      }
    });
  }

  /*
    User's own LP submissions
  */
  onValue(
    ref(db, `submissions/${user.uid}`),
    snapshot => {
      submissions = snapshot.val() || {};
      renderRecords();
    },
    error => {
      console.error("Submissions listener:", error);
    }
  );

  /*
    Admin review results
  */
  onValue(
    ref(db, `adminReview/${user.uid}`),
    snapshot => {
      reviews = snapshot.val() || {};
      renderRecords();
    },
    error => {
      console.error("Admin review listener:", error);
    }
  );

  /*
    Reward ledger
  */
  onValue(
    ref(db, `rewardLedger/${user.uid}`),
    snapshot => {
      ledger = snapshot.val() || {};
      renderRecords();
    },
    error => {
      console.error("Reward ledger listener:", error);
    }
  );

  /*
    Withdrawal requests
  */
  onValue(
    ref(db, `withdrawalRequests/${user.uid}`),
    snapshot => {
      withdrawals = snapshot.val() || {};
      renderRecords();
    },
    error => {
      console.error("Withdrawal listener:", error);
    }
  );

  /*
    Admin payment / withdrawal status
  */
  onValue(
    ref(db, `withdrawalAdmin/${user.uid}`),
    snapshot => {
      withdrawalAdmin = snapshot.val() || {};
      renderRecords();
    },
    error => {
      console.error("Withdrawal admin listener:", error);
    }
  );
});
