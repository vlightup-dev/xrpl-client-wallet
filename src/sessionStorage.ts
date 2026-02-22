/**
 * Temporary wallet session for "Keep me logged in for 30 minutes".
 * Uses chrome.storage.session (cleared when browser/extension is closed).
 */

const SESSION_KEY = 'walletSession';

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export type WalletSession = {
  address: string;
  publicKey: string;
  privateKey: string;
  signer1?: { publicKey: string; privateKey: string };
  expiresAt: number;
};

export function getSessionExpiresAt(): number {
  return Date.now() + SESSION_DURATION_MS;
}

export async function setWalletSession(
  address: string,
  publicKey: string,
  privateKey: string,
  signer1?: { publicKey: string; privateKey: string }
): Promise<void> {
  const session: WalletSession = {
    address,
    publicKey,
    privateKey,
    ...(signer1 && { signer1 }),
    expiresAt: getSessionExpiresAt(),
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

export async function getWalletSession(): Promise<WalletSession | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const raw = result[SESSION_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as WalletSession;
  if (
    !session.address ||
    !session.publicKey ||
    !session.privateKey ||
    typeof session.expiresAt !== 'number'
  ) {
    await clearWalletSession();
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    await clearWalletSession();
    return null;
  }
  return session;
}

export async function clearWalletSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}
