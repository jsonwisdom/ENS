import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../docs/control-proof.html', import.meta.url), 'utf8');

const required = [
  "const BASE_CHAIN_ID = 8453;",
  "const BASE_CHAIN_HEX = '0x2105';",
  "const EAS = '0x4200000000000000000000000000000000000021';",
  "const SCHEMA_UID = '0x3969bb076acfb992af54d51274c5c868641ca5344e1aacd0b1f5e4f80ac0822f';",
  "const EXPECTED = '0xa380552a27b0a5a2874ea7aa52cac09f542002e8';",
  'SIGNATURE_ONLY_DRY_RUN',
  'EAS_ONCHAIN_SELF_ATTESTATION',
  'authority_created: false',
  'No download is required.'
];

for (const invariant of required) {
  assert.ok(html.includes(invariant), `Missing chain-voice invariant: ${invariant}`);
}

assert.ok(!html.includes('Download JSON'), 'The on-chain flow must not end in a JSON download.');
assert.ok(!html.includes('downloadRecord'), 'Legacy file-receipt code must not return.');
assert.match(html, /revocable:\s*true/, 'Schema #7 requires revocable=true.');
assert.match(html, /recipient:\s*account/, 'The record must be a self-attestation to the connected controller.');

console.log('CHAIN_VOICE_STATIC_GATE=PASS');
