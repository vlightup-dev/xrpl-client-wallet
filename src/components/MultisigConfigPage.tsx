import { useState, useCallback } from 'react';
import { Client, Wallet } from 'xrpl';
import { setMultisigAccount, setMultisigSigner1 } from '../multisigStorage';
import { getSbtCredentials } from '../trustauthyStorage';
import { ChevronLeftIcon } from './icons';

const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string)?.trim() ||
  (import.meta.env.VITE_API_SERVER_URL as string)?.trim() ||
  '';

type MultisigMode = '2-of-2' | '2-of-3' | '3-of-3';

type MultisigConfigPageProps = {
  address: string;
  wallet: Wallet | null;
  onBack: () => void;
  onSaved?: () => void;
  /** Called when the user confirms they saved the signer seed; app keeps the wallet in memory for this session only. */
  onSigner1Saved?: (signerWallet: Wallet) => void;
};

export function MultisigConfigPage({ address, wallet, onBack, onSaved, onSigner1Saved }: MultisigConfigPageProps) {
  const [signer2, setSigner2] = useState('');
  const [signer3, setSigner3] = useState('');
  const [signer4, setSigner4] = useState('');
  const [mode, setMode] = useState<MultisigMode>('2-of-2');
  const [submitting, setSubmitting] = useState(false);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** When true, show password form before creating signer (so we can save for reuse). */
  const [showPasswordForSigner1, setShowPasswordForSigner1] = useState(false);
  const [signer1Password, setSigner1Password] = useState('');
  const [creatingSigner1, setCreatingSigner1] = useState(false);
  const [signer1CreateError, setSigner1CreateError] = useState<string | null>(null);
  /** After create, show the seed once; hold until user confirms they saved it. */
  const [pendingSignerWallet, setPendingSignerWallet] = useState<{ seed: string; address: string } | null>(null);
  const [seedRevealed, setSeedRevealed] = useState(false);

  const signer2Trim = signer2.trim();
  const signer3Trim = signer3.trim();
  const signer4Trim = signer4.trim();
  const needThirdSigner = mode === '2-of-3' || mode === '3-of-3';
  const quorum = mode === '3-of-3' ? 3 : 2;
  const notSelf = (s: string) => s.length > 0 && s !== address;
  const canSave =
    (mode === '2-of-2' &&
      notSelf(signer2Trim) &&
      notSelf(signer3Trim) &&
      signer2Trim !== signer3Trim) ||
    (needThirdSigner &&
      notSelf(signer2Trim) &&
      notSelf(signer3Trim) &&
      notSelf(signer4Trim) &&
      new Set([signer2Trim, signer3Trim, signer4Trim]).size === 3);

  const handleSave = useCallback(async () => {
    if (!wallet || !canSave) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setStepMessage('Step 1: Connecting to ledger…');
    const client = new Client(TESTNET_WS);
    try {
      await client.connect();
      setStepMessage('Step 2: Submitting SignerListSet…');
      const entries: { SignerEntry: { Account: string; SignerWeight: number } }[] = [
        { SignerEntry: { Account: signer2Trim, SignerWeight: 1 } },
        { SignerEntry: { Account: signer3Trim, SignerWeight: 1 } },
      ];
      if (needThirdSigner) {
        if (!signer4Trim) {
          setError(`For ${mode} add a third signer address.`);
          setStepMessage(null);
          await client.disconnect();
          setSubmitting(false);
          return;
        }
        entries.push({ SignerEntry: { Account: signer4Trim, SignerWeight: 1 } });
      }
      const ledgerIndexSignerList = await client.getLedgerIndex();
      const tx = {
        TransactionType: 'SignerListSet' as const,
        Account: address,
        SignerQuorum: quorum,
        SignerEntries: entries,
      };
      const filled = await client.autofill(tx as Parameters<Client['autofill']>[0]);
      (filled as Record<string, unknown>).LastLedgerSequence = ledgerIndexSignerList + 20;
      const signed = wallet.sign(filled);
      const result = await client.submitAndWait(signed.tx_blob);
      const txHash = (result.result as { hash?: string }).hash;
      setStepMessage('Step 3: Disabling master key…');
      // Disable master key so only multisig signers can authorize (SetFlag 4 = asfDisableMaster)
      const ledgerIndex = await client.getLedgerIndex();
      const disableMasterTx = {
        TransactionType: 'AccountSet' as const,
        Account: address,
        SetFlag: 4,
      };
      const filledDisable = await client.autofill(disableMasterTx as Parameters<Client['autofill']>[0]);
      (filledDisable as Record<string, unknown>).LastLedgerSequence = ledgerIndex + 20;
      const signedDisable = wallet.sign(filledDisable);
      await client.submitAndWait(signedDisable.tx_blob);
      setStepMessage('Step 4: Registering with server…');
      await setMultisigAccount(address);
      const registerBody: Record<string, string> = {
        signer1_wallet_address: signer2Trim,
        signer2_wallet_address: signer3Trim,
      };
      if (needThirdSigner && signer4Trim) registerBody.signer3_wallet_address = signer4Trim;
      if (API_BASE_URL) {
        const creds = await getSbtCredentials();
        if (creds?.access_token) {
          const base = API_BASE_URL.replace(/\/$/, '');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${creds.access_token}`,
            ...(creds.api_key ? { 'X-API-KEY': creds.api_key } : {}),
          };
          let registerRes: Response;
          try {
            registerRes = await fetch(`${base}/api/v1/xrpl/escrow/register-multisig`, {
              method: 'POST',
              headers,
              body: JSON.stringify(registerBody),
            });
          } catch (networkErr) {
            setError(networkErr instanceof Error ? networkErr.message : 'Register multisig: network error');
            return;
          }
          if (!registerRes.ok) {
            const errData = (await registerRes.json().catch(() => ({}))) as { error?: string };
            setError(errData?.error ?? `Register multisig failed (${registerRes.status})`);
            return;
          }
        }
      }
      setStepMessage(null);
      onSaved?.();
      setSuccess(
        `Multi-sig configured. SignerListSet: ${txHash ?? '—'}. Master key disabled. This wallet is now the multi-sig account; use a signer wallet to initiate escrows.`
      );
      setSigner2('');
      setSigner3('');
      setSigner4('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to set up multi-sig';
      if (
        msg.includes('tefMASTER_DISABLED') ||
        msg.includes('LastLedgerSequence') ||
        msg.includes('ledger sequence')
      ) {
        if (msg.includes('tefMASTER_DISABLED')) {
          setError(
            "This account's master key is already disabled. Multisig is already configured. Use a signer wallet to initiate escrows."
          );
        } else {
          setError(
            'Transaction expired (ledger closed). Please try again; the second step will now use a longer validity window.'
          );
        }
      } else {
        setError(msg);
      }
    } finally {
      setStepMessage(null);
      client.disconnect();
      setSubmitting(false);
    }
  }, [address, wallet, mode, needThirdSigner, quorum, signer2Trim, signer3Trim, signer4Trim, canSave, onSaved]);

  const handleCreateSignerWalletClick = useCallback(() => {
    setError(null);
    setSigner1CreateError(null);
    setSigner1Password('');
    setShowPasswordForSigner1(true);
  }, []);

  const handleCreateSignerWalletWithPassword = useCallback(async () => {
    const password = signer1Password.trim();
    if (!password) {
      setSigner1CreateError('Enter your wallet password to create and save this signer.');
      return;
    }
    setCreatingSigner1(true);
    setSigner1CreateError(null);
    try {
      const newWallet = Wallet.generate();
      if (!newWallet.seed) {
        setSigner1CreateError('Failed to generate wallet.');
        return;
      }
      await setMultisigSigner1(password, newWallet.publicKey, newWallet.privateKey);
      setSigner2(newWallet.address);
      setPendingSignerWallet({ seed: newWallet.seed, address: newWallet.address });
      setSeedRevealed(false);
      setShowPasswordForSigner1(false);
      setSigner1Password('');
      onSigner1Saved?.(Wallet.fromSeed(newWallet.seed));
      setSuccess('Signer created and saved. It will be used for escrow when you reopen the wallet. Back up the seed below—it is shown only once.');
    } catch (e) {
      setSigner1CreateError(e instanceof Error ? e.message : 'Failed to create or save signer');
    } finally {
      setCreatingSigner1(false);
    }
  }, [signer1Password, onSigner1Saved]);

  const handleRevealSeed = useCallback(() => {
    setSeedRevealed(true);
  }, []);

  const handleConfirmSigner1Saved = useCallback(() => {
    if (!pendingSignerWallet) return;
    const signerWallet = Wallet.fromSeed(pendingSignerWallet.seed);
    onSigner1Saved?.(signerWallet);
    setPendingSignerWallet(null);
    setSeedRevealed(false);
  }, [pendingSignerWallet, onSigner1Saved]);

  return (
    <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
      <header className="flex items-center justify-between pb-2 border-b border-gray-700">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded text-gray-400 hover:text-white transition-colors"
          aria-label="Back"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-white">Configure multi-sig</h1>
        <span className="w-8" />
      </header>

      <p className="text-xs text-gray-400">
        This wallet will become the multi-sig account. Choose 2-of-2, 2-of-3, or 3-of-3 and add the other signer addresses. XRPL does not allow the multi-sig account itself in the list; to sign as yourself, use a different address (e.g. another wallet or a regular key).
      </p>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400">Multi-sig account (this wallet)</label>
        <p className="font-mono text-xs text-gray-300 break-all">{address}</p>
        <p className="text-[11px] text-gray-500">This account cannot be in the signer list (XRPL rule).</p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="ms-mode">
          Multi-sig type
        </label>
        <select
          id="ms-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as MultisigMode)}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:border-sky-500 focus:outline-none"
        >
          <option value="2-of-2">2-of-2 (2 signers, quorum 2)</option>
          <option value="2-of-3">2-of-3 (3 signers, quorum 2)</option>
          <option value="3-of-3">3-of-3 (3 signers, quorum 3)</option>
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="ms-signer2">
          Signer 1 address
        </label>
        <div className="flex gap-2">
          <input
            id="ms-signer2"
            type="text"
            value={signer2}
            onChange={(e) => setSigner2(e.target.value)}
            placeholder="rOtherSigner..."
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs font-mono placeholder-gray-500 focus:border-sky-500 focus:outline-none"
          />
          {!showPasswordForSigner1 && !pendingSignerWallet && (
            <button
              type="button"
              onClick={handleCreateSignerWalletClick}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            >
              Create signer wallet
            </button>
          )}
        </div>
        {showPasswordForSigner1 && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-gray-800 border border-gray-600">
            <p className="text-xs text-gray-300">
              Enter your wallet password to create and save this signer so it can be reused when you reopen the wallet.
            </p>
            <input
              type="password"
              value={signer1Password}
              onChange={(e) => setSigner1Password(e.target.value)}
              placeholder="Wallet password"
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-xs placeholder-gray-500 focus:border-sky-500 focus:outline-none"
            />
            {signer1CreateError && <p className="text-xs text-red-400">{signer1CreateError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateSignerWalletWithPassword}
                disabled={creatingSigner1 || !signer1Password.trim()}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {creatingSigner1 ? 'Creating…' : 'Create signer wallet'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForSigner1(false);
                  setSigner1Password('');
                  setSigner1CreateError(null);
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {pendingSignerWallet && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-gray-800 border border-amber-600/50">
            <p className="text-xs text-amber-200">
              Save this seed securely. It is not stored anywhere and will only be shown once.
            </p>
            {!seedRevealed ? (
              <button
                type="button"
                onClick={handleRevealSeed}
                className="w-full py-2 rounded-lg text-xs font-medium bg-amber-600/80 text-white hover:bg-amber-600"
              >
                Show signer seed (only once)
              </button>
            ) : (
              <>
                <p className="font-mono text-xs text-gray-200 break-all select-all bg-gray-900/50 p-2 rounded border border-gray-600">
                  {pendingSignerWallet.seed}
                </p>
                <p className="text-[11px] text-gray-500">
                  Copy it now. It will not be shown again and is not saved in this app.
                </p>
                <button
                  type="button"
                  onClick={handleConfirmSigner1Saved}
                  className="w-full py-2 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-500"
                >
                  I've saved it
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="ms-signer3">
          Signer 2 address {needThirdSigner ? '(required for 2-of-3 and 3-of-3)' : '(required for 2-of-2)'}
        </label>
        <input
          id="ms-signer3"
          type="text"
          value={signer3}
          onChange={(e) => setSigner3(e.target.value)}
          placeholder="rOtherSigner..."
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs font-mono placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      {needThirdSigner && (
        <section className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-400" htmlFor="ms-signer4">
            Signer 3 address (required for 2-of-3 and 3-of-3)
          </label>
          <input
            id="ms-signer4"
            type="text"
            value={signer4}
            onChange={(e) => setSigner4(e.target.value)}
            placeholder="rOtherSigner..."
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs font-mono placeholder-gray-500 focus:border-sky-500 focus:outline-none"
          />
        </section>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}
      {submitting && stepMessage && (
        <p className="text-xs text-sky-300" role="status">
          {stepMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={submitting || !canSave}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase"
      >
        {submitting ? 'Submitting…' : 'Save & set up multi-sig'}
      </button>
    </div>
  );
}
