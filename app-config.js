
export const APP_CONFIG = {
  // Admin का वही ईमेल डालें जिससे आप Admin Panel में लॉगिन करते हैं।
  adminEmail: "YOUR_ADMIN_EMAIL@example.com",

  // RND Token का नेटवर्क
  networkName: "BNB Smart Chain",
  chainId: 56,
  currencySymbol: "BNB",
  explorerUrl: "https://bscscan.com",

  // LP Reward की लॉक अवधि
  lockMonths: 6,

  // आवेदन की जाँच का लक्ष्य समय
  approvalTargetHours: 24,

  // प्रोग्राम की प्रस्तावित कुल Reward Reserve
  rewardReserveRND: 1000,

  // केवल ये LP Amount Reward के लिए मान्य होंगे
  rewardTiers: [
    { amountUsd: 100, rewardRND: 4 },
    { amountUsd: 250, rewardRND: 9 },
    { amountUsd: 500, rewardRND: 18 },
    { amountUsd: 1000, rewardRND: 36 },
    { amountUsd: 2500, rewardRND: 91 },
    { amountUsd: 5000, rewardRND: 182 }
  ],

  // LP आवेदन की शुरुआती स्थिति
  submissionStatus: "pending",

  // केवल Admin की जाँच के बाद Approved होगा
  approvedStatus: "approved",

  // छह महीने पूरे होने के बाद Admin Unlock करेगा
  unlockedStatus: "unlocked"
};

// दिए गए LP Amount के अनुसार Reward निकालें।
export function rewardFor(amountUsd) {
  const amount = Number(amountUsd);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  const tier = APP_CONFIG.rewardTiers.find(
    item => item.amountUsd === amount
  );

  return tier ? tier.rewardRND : 0;
}
