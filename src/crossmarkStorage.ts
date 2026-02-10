// Storage utilities for Crossmark wallet connection

const CROSSMARK_KEY = 'crossmark_wallet';

interface CrossmarkWalletData {
  address: string;
  connectedAt: number;
}

/**
 * Save Crossmark wallet connection
 */
export async function saveCrossmarkWallet(address: string): Promise<void> {
  const data: CrossmarkWalletData = {
    address,
    connectedAt: Date.now()
  };
  
  await chrome.storage.local.set({ [CROSSMARK_KEY]: data });
}

/**
 * Get saved Crossmark wallet connection
 */
export async function getCrossmarkWallet(): Promise<string | null> {
  const result = await chrome.storage.local.get(CROSSMARK_KEY);
  const data = result[CROSSMARK_KEY] as CrossmarkWalletData | undefined;
  
  if (!data) {
    return null;
  }
  
  // Optional: expire after 30 days
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - data.connectedAt > thirtyDays) {
    await clearCrossmarkWallet();
    return null;
  }
  
  return data.address;
}

/**
 * Clear Crossmark wallet connection
 */
export async function clearCrossmarkWallet(): Promise<void> {
  await chrome.storage.local.remove(CROSSMARK_KEY);
}
