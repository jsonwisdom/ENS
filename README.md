# ENS / Chain Voice

`jsonwisdom/ENS` is the public development surface for Jason's wallet-control aperture.

## Canonical split

- **GitHub:** source, test gate, GitHub Pages deployment
- **Base:** wallet transaction and immutable transaction history
- **EAS:** human-readable on-chain attestation receipt
- **Identity bridge:** `jaywisdom.base.eth` / `jaywisdom.eth`

## Live flow

```text
VOICE OR TAP
  → CONNECT EXPECTED COINBASE WALLET
  → SWITCH TO BASE MAINNET
  → WALLET CONFIRMS ONE EAS TRANSACTION
  → BASE CONFIRMS
  → EAS UID + HUMAN-READABLE LINKS
```

Open the deployed control surface at:

https://jsonwisdom.github.io/ENS/control-proof.html

The main action creates an EAS self-attestation on Base. The signature-only action remains available as a safe dry run. Neither path requests a seed phrase, private key, token approval, or token transfer. No downloaded JSON is required.

## Locked network bindings

- Base chain ID: `8453`
- Base EAS: `0x4200000000000000000000000000000000000021`
- EAS schema #7 (`string message`): `0x3969bb076acfb992af54d51274c5c868641ca5344e1aacd0b1f5e4f80ac0822f`
- Expected controller: `0xa380552a27b0a5a2874ea7aa52cac09f542002e8`

The schema is revocable, so the controller can later revoke the attestation; revocation does not erase the Base transaction or its historical receipt. The record asserts wallet control only and explicitly sets `authority_created=false`.

## Verification boundary

Code deployment does not create an on-chain record. A record exists only after Coinbase Wallet confirms the transaction and Base returns a successful receipt plus EAS UID.
