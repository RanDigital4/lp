// Public site settings. Replace adminEmail with the exact Firebase Authentication email
// that will review LP submissions. This is NOT a password or secret.
export const APP_CONFIG = {
  adminEmail: "REPLACE_WITH_ADMIN_EMAIL",
  minimumLpUsd: 100,
  maximumLpUsd: 1000,
  lockMonths: 6,
  rewardTiers: [
    { amount: 100, reward: 20 },
    { amount: 200, reward: 40 },
    { amount: 300, reward: 60 },
    { amount: 400, reward: 70 },
    { amount: 500, reward: 80 },
    { amount: 600, reward: 100 },
    { amount: 700, reward: 120 },
    { amount: 800, reward: 140 },
    { amount: 900, reward: 160 },
    { amount: 1000, reward: 180 }
  ]
};

export function rewardFor(amount) {
  const tier = APP_CONFIG.rewardTiers.find(item => item.amount === Number(amount));
  return tier ? tier.reward : 0;
}
