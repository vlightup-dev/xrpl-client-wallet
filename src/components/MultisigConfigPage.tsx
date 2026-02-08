import { useState, useCallback } from 'react';
import { Client, Wallet } from 'xrpl';
import { setMultisigAccount } from '../multisigStorage';
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
};

export function MultisigConfigPage({ address, wallet, onBack, onSaved }: MultisigConfigPageProps) {
  const [signer2, setSigner2] = useState('');
  const [signer3, setSigner3] = useState('');
  const [signer4, setSigner4] = useState('');
  const [mode, setMode] = useState<MultisigMode>('2-of-2');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    const client = new Client(TESTNET_WS);
    try {
      await client.connect();
      const entries: { SignerEntry: { Account: string; SignerWeight: number } }[] = [
        { SignerEntry: { Account: signer2Trim, SignerWeight: 1 } },
        { SignerEntry: { Account: signer3Trim, SignerWeight: 1 } },
      ];
      if (needThirdSigner) {
        if (!signer4Trim) {
          setError(`For ${mode} add a third signer address.`);
          await client.disconnect();
          setSubmitting(false);
          return;
        }
        entries.push({ SignerEntry: { Account: signer4Trim, SignerWeight: 1 } });
      }
      const tx = {
        TransactionType: 'SignerListSet' as const,
        Account: address,
        SignerQuorum: quorum,
        SignerEntries: entries,
      };
      const filled = await client.autofill(tx as Parameters<Client['autofill']>[0]);
      const signed = wallet.sign(filled);
      const result = await client.submitAndWait(signed.tx_blob);
      const txHash = (result.result as { hash?: string }).hash;
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
      onSaved?.();
      setSuccess(`Multi-sig configured. Tx: ${txHash ?? '—'}. This wallet is now the multi-sig account.`);
      setSigner2('');
      setSigner3('');
      setSigner4('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up multi-sig');
    } finally {
      client.disconnect();
      setSubmitting(false);
    }
  }, [address, wallet, mode, needThirdSigner, quorum, signer2Trim, signer3Trim, signer4Trim, canSave, onSaved]);

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
          Signer 2 address
        </label>
        <input
          id="ms-signer2"
          type="text"
          value={signer2}
          onChange={(e) => setSigner2(e.target.value)}
          placeholder="rOtherSigner..."
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs font-mono placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="ms-signer3">
          Signer 3 address {needThirdSigner ? '(required for 2-of-3 and 3-of-3)' : '(required for 2-of-2)'}
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
            Signer 4 address (required for 2-of-3 and 3-of-3)
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
