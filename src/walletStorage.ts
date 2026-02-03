const STORAGE_KEYS = {
  WALLET_EXISTS: 'walletExists',
  ADDRESS: 'walletAddress',
  SALT: 'walletSalt',
  ENCRYPTED_SEED: 'walletEncryptedSeed',
} as const;

const PBKDF2_ITERATIONS = 310000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

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
    ['deriveBits', 'deriveKey']
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
    ['encrypt', 'decrypt']
  );
}

export async function getWalletExists(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.WALLET_EXISTS);
  return result[STORAGE_KEYS.WALLET_EXISTS] === true;
}

export async function getStoredAddress(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ADDRESS);
  return (result[STORAGE_KEYS.ADDRESS] as string) ?? null;
}

/**
 * Encrypt and store the wallet seed. Call after generating a new wallet with the user's password.
 */
export async function setWalletCreated(
  password: string,
  seed: string,
  address: string
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt.buffer);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    key,
    enc.encode(seed)
  );

  const payload = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);

  await chrome.storage.local.set({
    [STORAGE_KEYS.WALLET_EXISTS]: true,
    [STORAGE_KEYS.ADDRESS]: address,
    [STORAGE_KEYS.SALT]: bufferToBase64(salt.buffer),
    [STORAGE_KEYS.ENCRYPTED_SEED]: bufferToBase64(payload.buffer),
  });
}

/**
 * Decrypt and return the wallet seed if the password is correct. Returns null on failure.
 */
export async function getDecryptedSeed(password: string): Promise<string | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.SALT,
    STORAGE_KEYS.ENCRYPTED_SEED,
  ]);
  const saltB64 = result[STORAGE_KEYS.SALT] as string | undefined;
  const encryptedB64 = result[STORAGE_KEYS.ENCRYPTED_SEED] as string | undefined;
  if (!saltB64 || !encryptedB64) return null;

  try {
    const salt = base64ToBuffer(saltB64);
    const payload = new Uint8Array(base64ToBuffer(encryptedB64));
    const iv = payload.slice(0, IV_LENGTH);
    const ciphertext = payload.slice(IV_LENGTH);

    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
      },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.WALLET_EXISTS,
    STORAGE_KEYS.ADDRESS,
    STORAGE_KEYS.SALT,
    STORAGE_KEYS.ENCRYPTED_SEED,
  ]);
}
