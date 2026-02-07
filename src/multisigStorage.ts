/**
 * Persist multi-sig org account (2-of-3 XRPL address) for enterprise flows.
 * When set, Send uses multi-sig flow (Signer 1); Pending releases for Signer 2.
 */

const MULTISIG_ORG_ACCOUNT_KEY = 'multisig_org_account';

export async function getMultisigOrgAccount(): Promise<string | null> {
  const result = await chrome.storage.local.get([MULTISIG_ORG_ACCOUNT_KEY]);
  const value = result[MULTISIG_ORG_ACCOUNT_KEY] as string | undefined;
  return value && value.trim() ? value.trim() : null;
}

export async function setMultisigOrgAccount(account: string | null): Promise<void> {
  if (account === null || (account && !account.trim())) {
    await chrome.storage.local.remove([MULTISIG_ORG_ACCOUNT_KEY]);
    return;
  }
  await chrome.storage.local.set({ [MULTISIG_ORG_ACCOUNT_KEY]: account.trim() });
}

export async function isMultisigMode(): Promise<boolean> {
  const account = await getMultisigOrgAccount();
  return account != null;
}
