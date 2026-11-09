// RND LP Provider landing page interactions.
// IMPORTANT: This is an informational front-end only. It does not connect wallets,
// lock LP tokens, verify on-chain positions, enroll users or distribute rewards.
(() => {
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  const year = document.getElementById('year');

  if (year) year.textContent = new Date().getFullYear();

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
      });
    });
  }

  // Accessible FAQ behavior is provided by native <details>/<summary>.
  // Do not add wallet or reward-claim functionality until the verified
  // pool addresses, audited lock contract and final program rules are ready.
})();
