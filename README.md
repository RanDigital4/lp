# RND LP Provider website

A responsive static landing page for the proposed Ran Digital (RND) Community Liquidity Provider program.

## Files
- `index.html` — page structure and content
- `styles.css` — responsive visual design
- `script.js` — mobile navigation and small page interactions

## Important launch status
This is an informational website only. It does NOT:
- connect wallets or request token approvals;
- lock LP positions or prevent withdrawals;
- verify PancakeSwap/Uniswap positions;
- enroll participants or distribute RND rewards.

The six-month holding requirement and proposed reward tiers are not enforceable until the project deploys and independently reviews an appropriate on-chain lock/verification and reward-claim system. Do not advertise rewards as guaranteed before the final terms and mechanism are live.

## Before publishing
1. Verify the official RND token contract address.
2. Verify the exact PancakeSwap RND/WBNB pool address and version.
3. Verify the exact Uniswap V4 RND/USDT pool identity, including fee and hook configuration.
4. Confirm the legal/compliance position for the program and publish complete terms.
5. Finalize valuation rules, eligibility, partial withdrawals, range/out-of-range handling, reward caps, reserve exhaustion and claim timing.
6. Deploy and independently review the lock/verification and reward contracts.
7. Update the page copy and DEX links to point to the verified pools.

## GitHub Pages
1. Create a new GitHub repository, e.g. `rnd-lp-provider`.
2. Upload `index.html`, `styles.css`, `script.js`, and this README to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then Save.
6. Wait for GitHub Pages to publish the site. The URL will look like `https://YOUR-USERNAME.github.io/rnd-lp-provider/`.

Use a custom domain only after configuring its DNS and GitHub Pages settings correctly.


## PancakeSwap direct link
The PancakeSwap V3 button opens the supplied direct BNB Smart Chain liquidity-create URL with USDT and RND preselected. This is an RND/USDT pair, not the RND/WBNB pair shown in the earlier PancakeSwap position screenshot. Users must verify the intended pool, fee tier and price range before submitting a transaction; the URL itself does not prove that an existing pool is selected.
