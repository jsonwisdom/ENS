# Anchor 001 — ENS Boundary

## Current State

Anchor 001 does **not** use ENS for verification.

ENS is deferred.

## Why Deferred

Basename text records on `jaywisdom.base.eth` were not editable through the observed Basename manager UI.

Rather than force an unverifiable ENS claim, Anchor 001 uses a dual-anchor model:

| Layer | Status | Value |
|---|---|---|
| GitHub | ACTIVE | Commit `13004719dd0c34f765ca95dfe8566b6feb2bf6cf` |
| EAS (Base) | ACTIVE | Attestation `0x18b5b00c62c648df2ccf4a746645493fa2a0b0dcda6697052d8c3a3d1586c142` |
| ENS | DEFERRED | `jaywisdom.base.eth` text records not editable through observed UI |

## Trust Path — Current

```text
Git commit → JCS canonical bytes → SHA-256 → Keccak-256 → EAS attestation on Base
```

ENS is an optional discovery layer.

ENS is not required for verification.

## Canonical Anchor 001

| Field | Value |
|---|---|
| Source Repo | `jsonwisdom/Welcome-to-JSONWISDOM` |
| Git Commit | `13004719dd0c34f765ca95dfe8566b6feb2bf6cf` |
| Merkle Root (SHA-256) | `ff55160908ff41d23f7af0df8873ef7a0dcf8163d1a308f58941e87b5a95bad9` |
| Leaf Keccak-256 | `0xb7e55f9e1f4f27cd96f38d74e6510e184a14772ef3f9f628d5acc68531dd185d` |
| EAS Schema UID | `0x3bab210b4da3faff084e146075caf9168efb5c9c87f18509bca2c07d7f2e49c` |
| EAS Attestation UID | `0x18b5b00c62c648df2ccf4a746645493fa2a0b0dcda6697052d8c3a3d1586c142` |
| Chain | Base |

## Future ENS Records

When ENS text records become configurable and independently verifiable on `jaywisdom.base.eth`, candidate keys may include:

| Key | Value |
|---|---|
| `alms.root.sha256` | `ff55160908ff41d23f7af0df8873ef7a0dcf8163d1a308f58941e87b5a95bad9` |
| `alms.anchor.eas` | `0x18b5b00c62c648df2ccf4a746645493fa2a0b0dcda6697052d8c3a3d1586c142` |
| `alms.anchor.commit` | `13004719dd0c34f765ca95dfe8566b6feb2bf6cf` |

Those keys are proposed future records only.

They are not claimed as active ENS records until visible and independently verifiable.

## Boundary Rule

Until a verified ENS text-record receipt exists, ENS is not part of the Anchor 001 verification path.

Rule: no ghost ENS anchor.
