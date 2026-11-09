// Public site settings. 
// IMPORTANT: Replace adminEmail with the exact email address you will use to 
// log into the new Firebase Console (lpdigital-71c32) to review LP submissions. 
// This is NOT a password or secret.

export const APP_CONFIG = {
  // Example: "yourname@gmail.com" (वह ईमेल जो आपने नए फायरबेस प्रोजेक्ट में रजिस्टर किया है)
  adminEmail: "randigital4@gmail.com", 
  
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
