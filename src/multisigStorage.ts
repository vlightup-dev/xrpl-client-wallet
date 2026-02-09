/**
 * Persist multisig account and optional first signer key pair (for escrow after reopen).
 * Signer1 seed is never stored; only encrypted publicKey+privateKey when user opts in.
 */

const MULTISIG_ACCOUNT_KEY = 'multisig_org_account';
const SIGNER1_SALT_KEY = 'multisig_signer1_salt';
const SIGNER1_ENCRYPTED_KEYS_KEY = 'multisig_signer1_encrypted_keys';

const PBKDF2_ITERATIONS = 310000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export type Signer1Credentials = { publicKey: string; privateKey: string };

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function getMultisigAccount(): Promise<string | null> {
  const result = await chrome.storage.local.get([MULTISIG_ACCOUNT_KEY]);
  const value = result[MULTISIG_ACCOUNT_KEY] as string | undefined;
  return value && value.trim() ? value.trim() : null;
}

export async function setMultisigAccount(account: string | null): Promise<void> {
  if (account === null || (account && !account.trim())) {
    await chrome.storage.local.remove([MULTISIG_ACCOUNT_KEY]);
    return;
  }
  await chrome.storage.local.set({ [MULTISIG_ACCOUNT_KEY]: account.trim() });
}

export async function isMultisigMode(): Promise<boolean> {
  const account = await getMultisigAccount();
  return account != null;
}

/** Encrypt and store signer1 key pair (same password as main wallet). Enables escrow signing after reopen. */
export async function setMultisigSigner1(
  password: string,
  publicKey: string,
  privateKey: string,
): Promise<void> {
  const credentials: Signer1Credentials = { publicKey, privateKey };
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt.buffer);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    enc.encode(JSON.stringify(credentials)),
  );
  const payload = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  await chrome.storage.local.set({
    [SIGNER1_SALT_KEY]: bufferToBase64(salt.buffer),
    [SIGNER1_ENCRYPTED_KEYS_KEY]: bufferToBase64(payload.buffer),
  });
}

/** Decrypt signer1 credentials for escrow signing. Returns null if not set or wrong password. */
export async function getMultisigSigner1Credentials(
  password: string,
): Promise<Signer1Credentials | null> {
  const result = await chrome.storage.local.get([
    SIGNER1_SALT_KEY,
    SIGNER1_ENCRYPTED_KEYS_KEY,
  ]);
  const saltB64 = result[SIGNER1_SALT_KEY] as string | undefined;
  const encryptedB64 = result[SIGNER1_ENCRYPTED_KEYS_KEY] as string | undefined;
  if (!saltB64 || !encryptedB64) return null;
  try {
    const salt = base64ToBuffer(saltB64);
    const payload = new Uint8Array(base64ToBuffer(encryptedB64));
    const iv = payload.slice(0, IV_LENGTH);
    const ciphertext = payload.slice(IV_LENGTH);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      ciphertext,
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Signer1Credentials;
    if (parsed?.publicKey && parsed?.privateKey) return parsed;
  } catch {
    // wrong password or corrupted
  }
  return null;
}

export async function clearMultisigSigner1(): Promise<void> {
  await chrome.storage.local.remove([SIGNER1_SALT_KEY, SIGNER1_ENCRYPTED_KEYS_KEY]);
}
