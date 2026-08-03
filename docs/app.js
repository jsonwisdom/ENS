(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const connectButton = $('connect');
  const validateButton = $('validate');
  const signButton = $('sign');
  const downloadButton = $('download');
  const payloadBox = $('payload');
  const walletBox = $('wallet');
  const validationBox = $('validation');
  const resultBox = $('result');
  const fileInput = $('file');
  const loadTemplateButton = $('loadTemplate');

  let account = null;
  let validatedTypedData = null;
  let signatureReceipt = null;

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

  function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
  }

  function isAddress(value) {
    return /^0x[0-9a-fA-F]{40}$/.test(value || '');
  }

  function isBytes32(value) {
    return /^0x[0-9a-fA-F]{64}$/.test(value || '');
  }

  function setStatus(element, message, ok = false) {
    element.textContent = message;
    element.classList.toggle('ok', ok);
  }

  async function connectWallet() {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      throw new Error('No injected Ethereum wallet found. Open this page in MetaMask or a browser with MetaMask enabled.');
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('MetaMask returned no account.');
    }
    account = accounts[0];
    setStatus(walletBox, `Connected account:\n${account}`, true);
    refreshSignGate();
  }

  function parseAndValidate() {
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
    if (!Number.isSafeInteger(Number(domain.chainId)) || Number(domain.chainId) <= 0) {
      throw new Error('domain.chainId must be a positive integer.');
    }

    if (message.anchorIdentity !== 'jaywisdom.eth') throw new Error('anchorIdentity must equal jaywisdom.eth.');
    if (message.promotionAction !== 'CANONICAL_COMMIT') throw new Error('promotionAction must equal CANONICAL_COMMIT.');
    if (message.protocolDomain !== 'AARS_v1_SRAP_v0.2.2') throw new Error('protocolDomain must equal AARS_v1_SRAP_v0.2.2.');
    if (!isAddress(message.signerAddress)) throw new Error('signerAddress must be a 20-byte EVM address.');

    for (const field of BYTES32_FIELDS) {
      if (!isBytes32(message[field])) throw new Error(`${field} must be a 32-byte 0x-prefixed hexadecimal value.`);
    }

    if (!Number.isSafeInteger(Number(message.timestamp)) || Number(message.timestamp) <= 0) {
      throw new Error('timestamp must be a positive integer Unix time.');
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

    if (declaredFields.length !== requiredFields.length || declaredFields.some((field, index) => field !== requiredFields[index])) {
      throw new Error('PromotionMessage field order or types differ from the locked v1.0.0 structure.');
    }

    validatedTypedData = typedData;
    signatureReceipt = null;
    downloadButton.disabled = true;
    setStatus(validationBox, 'VALID: exact field order, types, domains, address shape, and digest lengths passed.\nCryptographic artifact and ENS authorization verification still occur in the independent harness.', true);
    refreshSignGate();
  }

  function refreshSignGate() {
    const signerMatches = account && validatedTypedData &&
      normalizeAddress(account) === normalizeAddress(validatedTypedData.message.signerAddress);
    signButton.disabled = !signerMatches;

    if (account && validatedTypedData && !signerMatches) {
      setStatus(resultBox, `BLOCKED: connected account ${account} does not equal declared signer ${validatedTypedData.message.signerAddress}.`);
    } else if (signerMatches) {
      setStatus(resultBox, 'READY: MetaMask account matches the declared signer. Review the MetaMask structured-data screen before signing.', true);
    }
  }

  async function signPromotion() {
    if (!account || !validatedTypedData) throw new Error('Connect MetaMask and validate the payload first.');
    if (normalizeAddress(account) !== normalizeAddress(validatedTypedData.message.signerAddress)) {
      throw new Error('Connected account is not the declared signer.');
    }

    const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' });
    const currentChainId = Number.parseInt(currentChainHex, 16);
    const expectedChainId = Number(validatedTypedData.domain.chainId);
    if (currentChainId !== expectedChainId) {
      throw new Error(`Wrong network. MetaMask chainId=${currentChainId}; payload chainId=${expectedChainId}.`);
    }

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
      signedAtClientUnixMs: Date.now(),
      warning: 'This receipt is not CANONICAL_COMMITTED until the independent AARS harness verifies the EIP-712 signer, exact artifact digests, ENS resolution evidence, and nonce consumption.'
    };

    setStatus(resultBox, `SIGNATURE CAPTURED\nSigner: ${account}\nStatus: PENDING_INDEPENDENT_VERIFICATION\nNo transaction or token approval was requested.`, true);
    downloadButton.disabled = false;
  }

  function downloadReceipt() {
    if (!signatureReceipt) return;
    const blob = new Blob([JSON.stringify(signatureReceipt, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aars-promotion-signature-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  connectButton.addEventListener('click', () => connectWallet().catch((error) => setStatus(walletBox, `BLOCKED: ${error.message}`)));
  validateButton.addEventListener('click', () => {
    try { parseAndValidate(); } catch (error) {
      validatedTypedData = null;
      signButton.disabled = true;
      setStatus(validationBox, `REJECTED: ${error.message}`);
    }
  });
  signButton.addEventListener('click', () => signPromotion().catch((error) => setStatus(resultBox, `SIGNING REJECTED: ${error.message}`)));
  downloadButton.addEventListener('click', downloadReceipt);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    payloadBox.value = await file.text();
    validatedTypedData = null;
    signButton.disabled = true;
    setStatus(validationBox, 'JSON loaded. Press Validate payload.');
  });

  loadTemplateButton.addEventListener('click', async () => {
    try {
      const response = await fetch('promotion-message.template.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payloadBox.value = JSON.stringify(await response.json(), null, 2);
      validatedTypedData = null;
      signButton.disabled = true;
      setStatus(validationBox, 'Template loaded. Replace every REPLACE_* value with independently verified canonical data before validation.');
    } catch (error) {
      setStatus(validationBox, `Template load failed: ${error.message}`);
    }
  });

  if (window.ethereum && typeof window.ethereum.on === 'function') {
    window.ethereum.on('accountsChanged', (accounts) => {
      account = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
      setStatus(walletBox, account ? `Connected account:\n${account}` : 'Not connected.', Boolean(account));
      refreshSignGate();
    });
    window.ethereum.on('chainChanged', () => {
      signatureReceipt = null;
      downloadButton.disabled = true;
      setStatus(resultBox, 'Network changed. Revalidate conditions before signing.');
    });
  }
})();
