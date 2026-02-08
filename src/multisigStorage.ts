/**
 * Persist multisig account (2-of-2 or 2-of-3 XRPL address) for Send flow (Signer 1).
 */

const MULTISIG_ACCOUNT_KEY = 'multisig_org_account';

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
