
export const APP_CONFIG = {
  // Admin का वही ईमेल डालें जिससे आप Admin Panel में लॉगिन करते हैं।
  adminEmail: "randigital4@gmail.com",

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
    { amountUsd: 100, rewardRND: 20 },
    { amountUsd: 200, rewardRND: 40 },
    { amountUsd: 300, rewardRND: 60 },
    { amountUsd: 400, rewardRND: 70 },
    { amountUsd: 500, rewardRND: 80 },
    { amountUsd: 600, rewardRND: 100 },
    { amountUsd: 700, rewardRND: 120 },
    { amountUsd: 800, rewardRND: 140 },
    { amountUsd: 900, rewardRND: 160 },
    { amountUsd: 1000, rewardRND: 180 }
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
