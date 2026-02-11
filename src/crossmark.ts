/**
 * Crossmark Wallet Integration
 * Documentation: https://docs.crossmark.io/
 * 
 * Note: This uses the window.crossmark API injected by the Crossmark browser extension.
 * No SDK package needed - types defined below for TypeScript support.
 */

declare global {
  interface Window {
    crossmark?: {
      signAndSubmitAndWait: (payload: any) => Promise<any>;
      signAndSubmit: (payload: any) => Promise<any>;
      sign: (payload: any) => Promise<any>;
      getAddress: () => Promise<{ address: string }>;
    };
  }
}

export interface CrossmarkWalletInfo {
  address: string;
  type: 'crossmark';
}

/**
 * Check if Crossmark extension is installed
 * Simply checks if window.crossmark exists (injected by the extension)
 */
export function isCrossmarkInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.crossmark !== 'undefined';
}

/**
 * Connect to Crossmark wallet and get user's address
 */
export async function connectCrossmark(): Promise<CrossmarkWalletInfo> {
  if (!isCrossmarkInstalled()) {
    throw new Error('Crossmark wallet is not installed. Please install it from crossmark.io');
  }

  try {
    const result = await window.crossmark!.getAddress();
    return {
      address: result.address,
      type: 'crossmark',
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to connect to Crossmark: ${error.message}`);
    }
    throw new Error('Failed to connect to Crossmark wallet');
  }
}

/**
 * Sign and submit a transaction using Crossmark
 */
export async function signAndSubmitWithCrossmark(transaction: any): Promise<any> {
  if (!isCrossmarkInstalled()) {
    throw new Error('Crossmark wallet is not installed');
  }

  try {
    const result = await window.crossmark!.signAndSubmitAndWait(transaction);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
    throw new Error('Transaction failed');
  }
}

/**
 * Sign a transaction without submitting (for multisig scenarios)
 */
export async function signWithCrossmark(transaction: any): Promise<any> {
  if (!isCrossmarkInstalled()) {
    throw new Error('Crossmark wallet is not installed');
  }

  try {
    const result = await window.crossmark!.sign(transaction);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Signing failed: ${error.message}`);
    }
    throw new Error('Signing failed');
  }
}
