(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const connectButton = $('connect');
  const prepareButton = $('prepare');
  const validateButton = $('validate');
  const signButton = $('sign');
  const downloadButton = $('download');
  const payloadBox = $('payload');
  const walletBox = $('wallet');
  const preparationBox = $('preparation');
  const validationBox = $('validation');
  const resultBox = $('result');
  const fileInput = $('file');
  const loadTemplateButton = $('loadTemplate');

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
  const EXPECTED_STATIC = Object.freeze({
    aarsSpecDigest: '0xc3dc10a20f47ace56550c5a7ec93fc614a7b40aa74361efd2e3d247deca0ebc5',
    aarsSchemaDigest: '0x5cd52c970352562e201bab00684ff5789fe38596ec6e4e8d7ee0506833eed7a1',
    srapProfileDigest: '0xcaec0341683f8bbbb9e7c85e878cc71ff421e24845a120da9723e476c3a963aa',
    vectorSuiteDigest: '0x3f08c618dd5153facc7ccd649a5fad3a64851acaee10a6f12b53d7c3172797eb',
    parentStateRoot: '0x401f102254ea44127f21bde1f2e53248155fcdc8d9723e663e2f1875d550b72b',
    proposedStateRoot: '0x15456a5410e054987bf484245340c8198baf832d630c39addb3cc67d338ff688'
  });

  const BYTES32_FIELDS = [
    'aarsSpecDigest',
    'aarsSchemaDigest',
    'srapProfileDigest',
    'vectorSuiteDigest',
    'parentStateRoot',
    'proposedStateRoot',
    'ensResolutionEvidenceDigest',
    'nonce'
  ];

  let account = null;
  let validatedTypedData = null;
  let preparationBundle = null;
  let signatureReceipt = null;

  function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
  }

  function isAddress(value) {
    return /^0x[0-9a-fA-F]{40}$/.test(value || '');
  }

  function isBytes32(value) {
    return /^0x[0-9a-fA-F]{64}$/.test(value || '');
  }

  function bytesToHex(bytes) {
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  function concatBytes(...arrays) {
    const length = arrays.reduce((sum, array) => sum + array.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const array of arrays) {
      result.set(array, offset);
      offset += array.length;
    }
    return result;
  }

  async function sha256Bytes(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }

  function canonicalize(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ).join(',')}}`;
  }

  function setStatus(element, message, ok = false) {
    element.textContent = message;
    element.classList.toggle('ok', ok);
  }

  async function getChainId() {
    const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
    return Number.parseInt(chainHex, 16);
  }

  async function loadTemplate() {
    const response = await fetch('promotion-message.template.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Template HTTP ${response.status}`);
    const typedData = await response.json();
    payloadBox.value = JSON.stringify(typedData, null, 2);
    validatedTypedData = null;
    preparationBundle = null;
    signatureReceipt = null;
    signButton.disabled = true;
    downloadButton.disabled = true;
    setStatus(preparationBox, 'Template loaded. Connect MetaMask, then press Prepare exact payload.');
    setStatus(validationBox, 'No prepared payload validated.');
    setStatus(resultBox, 'Awaiting preparation and validation.');
    return typedData;
  }

  async function connectWallet() {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      throw new Error('No injected Ethereum wallet found. Open this page inside MetaMask or a browser with MetaMask enabled.');
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('MetaMask returned no account.');
    }
    account = accounts[0];
    const chainId = await getChainId();
    setStatus(walletBox, `Connected account:\n${account}\nChain ID: ${chainId}`, chainId === 1);
    prepareButton.disabled = false;
    validatedTypedData = null;
    signButton.disabled = true;
  }

  async function preparePayload() {
    if (!account) throw new Error('Connect MetaMask first.');
    const chainId = await getChainId();
    if (chainId !== 1) {
      throw new Error(`Switch MetaMask to Ethereum Mainnet. Current chain ID is ${chainId}.`);
    }

    let typedData;
    try {
      typedData = JSON.parse(payloadBox.value);
    } catch {
      typedData = await loadTemplate();
    }

    const rawNonce = crypto.getRandomValues(new Uint8Array(32));
    const encoder = new TextEncoder();
    const derivedNonce = await sha256Bytes(concatBytes(
      encoder.encode('jaywisdom.eth'),
      rawNonce,
      encoder.encode('AARS_v1_SRAP_v0.2.2')
    ));
    const timestamp = Math.floor(Date.now() / 1000);

    const ensResolutionEvidence = {
      anchorIdentity: 'jaywisdom.eth',
      chainId: 1,
      claimedResolvedAddress: account,
      evidenceType: 'ENS_SIGNER_CLAIM_V1',
      observedAt: timestamp,
      providerMethod: 'CONNECTED_EIP1193_ACCOUNT',
      verificationStatus: 'PENDING_INDEPENDENT_ONCHAIN_RESOLUTION'
    };
    const evidenceCanonicalJson = canonicalize(ensResolutionEvidence);
    const evidenceDigest = await sha256Bytes(encoder.encode(evidenceCanonicalJson));

    typedData.message.signerAddress = account;
    typedData.message.ensResolutionEvidenceDigest = bytesToHex(evidenceDigest);
    typedData.message.nonce = bytesToHex(derivedNonce);
    typedData.message.timestamp = timestamp;

    preparationBundle = {
      nonceDerivation: 'SHA256(UTF8("jaywisdom.eth") || rawNonce32 || UTF8("AARS_v1_SRAP_v0.2.2"))',
      rawNonceHex: bytesToHex(rawNonce),
      ensResolutionEvidence,
      ensResolutionEvidenceCanonicalJson: evidenceCanonicalJson,
      ensResolutionEvidenceDigest: bytesToHex(evidenceDigest),
      preparedAtUnix: timestamp
    };

    payloadBox.value = JSON.stringify(typedData, null, 2);
    validatedTypedData = null;
    signatureReceipt = null;
    signButton.disabled = true;
    downloadButton.disabled = true;
    setStatus(
      preparationBox,
      `PREPARED\nSigner: ${account}\nNonce: ${typedData.message.nonce}\nENS evidence: ${typedData.message.ensResolutionEvidenceDigest}\nENS address authorization remains pending independent on-chain verification.`,
      true
    );
    setStatus(validationBox, 'Prepared payload must now pass the locked validation gate.');
  }

  function parseAndValidate() {
    if (!preparationBundle) {
      throw new Error('Payload must be prepared by this page so nonce and ENS evidence remain bound to the receipt.');
    }

    let typedData;
    try {
      typedData = JSON.parse(payloadBox.value);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }

    if (!typedData || typeof typedData !== 'object') throw new Error('Typed data must be an object.');
    if (typedData.primaryType !== 'PromotionMessage') throw new Error('primaryType must equal PromotionMessage.');
    if (!typedData.domain || typeof typedData.domain !== 'object') throw new Error('domain is required.');
    if (!typedData.types || !Array.isArray(typedData.types.PromotionMessage)) throw new Error('types.PromotionMessage is required.');
    if (!typedData.message || typeof typedData.message !== 'object') throw new Error('message is required.');

    const domain = typedData.domain;
    const message = typedData.message;

    if (domain.name !== 'AARS Promotion') throw new Error('domain.name must equal AARS Promotion.');
    if (domain.version !== '1.0.0') throw new Error('domain.version must equal 1.0.0.');
    if (Number(domain.chainId) !== 1) throw new Error('domain.chainId must equal Ethereum Mainnet chain ID 1.');
    if (normalizeAddress(domain.verifyingContract) !== ZERO_ADDRESS) {
      throw new Error('verifyingContract must be the locked zero address for this off-chain promotion domain.');
    }

    if (message.anchorIdentity !== 'jaywisdom.eth') throw new Error('anchorIdentity must equal jaywisdom.eth.');
    if (message.promotionAction !== 'CANONICAL_COMMIT') throw new Error('promotionAction must equal CANONICAL_COMMIT.');
    if (message.protocolDomain !== 'AARS_v1_SRAP_v0.2.2') throw new Error('protocolDomain must equal AARS_v1_SRAP_v0.2.2.');
    if (!isAddress(message.signerAddress) || normalizeAddress(message.signerAddress) === ZERO_ADDRESS) {
      throw new Error('signerAddress must be a non-zero EVM address.');
    }

    for (const field of BYTES32_FIELDS) {
      if (!isBytes32(message[field])) throw new Error(`${field} must be a 32-byte 0x-prefixed hexadecimal value.`);
      if (message[field].toLowerCase() === ZERO_BYTES32) throw new Error(`${field} must not be zero.`);
    }

    for (const [field, expected] of Object.entries(EXPECTED_STATIC)) {
      if (message[field].toLowerCase() !== expected) {
        throw new Error(`${field} differs from the repository-bound canonical value.`);
      }
    }

    const timestamp = Number(message.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
      throw new Error('timestamp must be a positive integer Unix time.');
    }
    if (timestamp > now + 60 || now - timestamp > 900) {
      throw new Error('timestamp must be within the 15-minute signing window.');
    }

    if (!account || normalizeAddress(account) !== normalizeAddress(message.signerAddress)) {
      throw new Error('Connected MetaMask account does not equal signerAddress.');
    }
    if (message.ensResolutionEvidenceDigest.toLowerCase() !== preparationBundle.ensResolutionEvidenceDigest.toLowerCase()) {
      throw new Error('ENS evidence digest does not match the prepared evidence bundle.');
    }

    const declaredFields = typedData.types.PromotionMessage.map((field) => `${field.name}:${field.type}`);
    const requiredFields = [
      'anchorIdentity:string',
      'aarsSpecDigest:bytes32',
      'aarsSchemaDigest:bytes32',
      'srapProfileDigest:bytes32',
      'vectorSuiteDigest:bytes32',
      'parentStateRoot:bytes32',
      'proposedStateRoot:bytes32',
      'promotionAction:string',
      'protocolDomain:string',
      'signerAddress:address',
      'ensResolutionEvidenceDigest:bytes32',
      'nonce:bytes32',
      'timestamp:uint256'
    ];
    if (declaredFields.length !== requiredFields.length ||
        declaredFields.some((field, index) => field !== requiredFields[index])) {
      throw new Error('PromotionMessage field order or types differ from the locked v1.0.0 structure.');
    }

    validatedTypedData = typedData;
    signatureReceipt = null;
    downloadButton.disabled = true;
    signButton.disabled = false;
    setStatus(
      validationBox,
      'VALID: canonical artifact digests, state roots, field order, types, signer binding, nonce, evidence digest, and timestamp window passed.\nENS ownership is still independently checked after signing.',
      true
    );
    setStatus(resultBox, 'READY: review every field in MetaMask before signing.', true);
  }

  async function signPromotion() {
    if (!account || !validatedTypedData || !preparationBundle) {
      throw new Error('Connect, prepare, and validate first.');
    }
    if (normalizeAddress(account) !== normalizeAddress(validatedTypedData.message.signerAddress)) {
      throw new Error('Connected account is not the declared signer.');
    }
    const currentChainId = await getChainId();
    if (currentChainId !== 1) throw new Error(`Wrong network. Expected chain ID 1; got ${currentChainId}.`);

    const signature = await window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [account, JSON.stringify(validatedTypedData)]
    });

    signatureReceipt = {
      receiptType: 'AARS_PROMOTION_SIGNATURE_RECEIPT',
      receiptVersion: '1.0.0',
      anchorIdentity: 'jaywisdom.eth',
      stateBeforeVerification: 'READY_FOR_HUMAN_PROMOTION',
      promotionStatus: 'PENDING_INDEPENDENT_VERIFICATION',
      signerAddress: account,
      signature,
      signedTypedData: validatedTypedData,
      preparationBundle,
      repositoryBindings: {
        aarsSpec: 'AARS_FORMAL_SPEC_v1.0.0.md',
        aarsSchema: 'aars-update-receipt.schema.json',
        srapProfile: 'srap-profile.v0.2.2.json',
        vectorSuite: 'srap-vectors.v0.2.2.json',
        stateRoots: 'aars-state-roots.v1.json'
      },
      signedAtClientUnixMs: Date.now(),
      warning: 'This receipt is not CANONICAL_COMMITTED until the independent AARS harness verifies the EIP-712 signer, repository artifact bytes, ENS forward resolution, nonce consumption, and trajectory law.'
    };

    setStatus(
      resultBox,
      `SIGNATURE CAPTURED\nSigner: ${account}\nStatus: PENDING_INDEPENDENT_VERIFICATION\nNo transaction, ETH transfer, or token approval was requested.`,
      true
    );
    downloadButton.disabled = false;
  }

  function downloadReceipt() {
    if (!signatureReceipt) return;
    const blob = new Blob([`${JSON.stringify(signatureReceipt, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aars-promotion-signature-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  connectButton.addEventListener('click', () =>
    connectWallet().catch((error) => setStatus(walletBox, `BLOCKED: ${error.message}`))
  );
  prepareButton.addEventListener('click', () =>
    preparePayload().catch((error) => setStatus(preparationBox, `PREPARATION BLOCKED: ${error.message}`))
  );
  validateButton.addEventListener('click', () => {
    try {
      parseAndValidate();
    } catch (error) {
      validatedTypedData = null;
      signButton.disabled = true;
      setStatus(validationBox, `REJECTED: ${error.message}`);
    }
  });
  signButton.addEventListener('click', () =>
    signPromotion().catch((error) => setStatus(resultBox, `SIGNING REJECTED: ${error.message}`))
  );
  downloadButton.addEventListener('click', downloadReceipt);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    payloadBox.value = await file.text();
    validatedTypedData = null;
    preparationBundle = null;
    signButton.disabled = true;
    setStatus(preparationBox, 'External JSON loaded. Press Prepare exact payload to bind the current MetaMask account, nonce, and evidence bundle.');
    setStatus(validationBox, 'No prepared payload validated.');
  });

  loadTemplateButton.addEventListener('click', () =>
    loadTemplate().catch((error) => setStatus(preparationBox, `Template load failed: ${error.message}`))
  );

  if (window.ethereum && typeof window.ethereum.on === 'function') {
    window.ethereum.on('accountsChanged', (accounts) => {
      account = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
      validatedTypedData = null;
      preparationBundle = null;
      signatureReceipt = null;
      signButton.disabled = true;
      downloadButton.disabled = true;
      prepareButton.disabled = !account;
      setStatus(walletBox, account ? `Connected account:\n${account}` : 'Not connected.', Boolean(account));
      setStatus(preparationBox, 'Account changed. Prepare a new payload.');
    });
    window.ethereum.on('chainChanged', () => {
      validatedTypedData = null;
      preparationBundle = null;
      signatureReceipt = null;
      signButton.disabled = true;
      downloadButton.disabled = true;
      setStatus(resultBox, 'Network changed. Prepare and validate a fresh payload.');
    });
  }

  loadTemplate().catch((error) => setStatus(preparationBox, `Template load failed: ${error.message}`));
})();
