import { useState, useCallback } from 'react';
import { Client, Wallet } from 'xrpl';
import { setMultisigOrgAccount } from '../multisigStorage';
import { ChevronLeftIcon } from './icons';

const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';

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
  const [threshold, setThreshold] = useState<2 | 3>(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const signer2Trim = signer2.trim();
  const signer3Trim = signer3.trim();
  const signer4Trim = signer4.trim();
  const needThird = threshold === 3;
  const notSelf = (s: string) => s.length > 0 && s !== address;
  const canSave =
    (threshold === 2 &&
      notSelf(signer2Trim) &&
      notSelf(signer3Trim) &&
      signer2Trim !== signer3Trim) ||
    (threshold === 3 &&
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
      if (threshold === 3) {
        if (!signer4Trim) {
          setError('For 3-of-3 add a third signer address.');
          await client.disconnect();
          setSubmitting(false);
          return;
        }
        entries.push({ SignerEntry: { Account: signer4Trim, SignerWeight: 1 } });
      }
      // Use chosen threshold as quorum (we require enough signers above)
      const tx = {
        TransactionType: 'SignerListSet' as const,
        Account: address,
        SignerQuorum: threshold,
        SignerEntries: entries,
      };
      const filled = await client.autofill(tx as Parameters<Client['autofill']>[0]);
      const signed = wallet.sign(filled);
      const result = await client.submitAndWait(signed.tx_blob);
      const txHash = (result.result as { hash?: string }).hash;
      await setMultisigOrgAccount(address);
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
  }, [address, wallet, threshold, signer2Trim, signer3Trim, signer4Trim, canSave, onSaved]);

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
        This wallet will become the multi-sig account. Add 2 other signers for 2-of-2, or 3 for 3-of-3. XRPL does not allow the multi-sig account itself in the list; to sign as yourself, use a different address (e.g. another wallet or a regular key).
      </p>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400">Multi-sig account (this wallet)</label>
        <p className="font-mono text-xs text-gray-300 break-all">{address}</p>
        <p className="text-[11px] text-gray-500">This account cannot be in the signer list (XRPL rule).</p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="ms-threshold">
          Threshold
        </label>
        <select
          id="ms-threshold"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value === '3' ? 3 : 2)}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:border-sky-500 focus:outline-none"
        >
          <option value={2}>2 (2-of-2)</option>
          <option value={3}>3 (3-of-3)</option>
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
          Signer 3 address (required for 2-of-2 and 3-of-3)
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

      {needThird && (
        <section className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-400" htmlFor="ms-signer4">
            Signer 4 address (required for 3-of-3)
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
