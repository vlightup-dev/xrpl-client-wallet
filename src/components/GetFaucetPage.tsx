import { useState, useCallback } from 'react';
import { Client, Wallet } from 'xrpl';

const TESTNET_FAUCET_URL = 'https://faucet.altnet.rippletest.net/';
const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';
const MPT_ISSUANCE_ID =
  (import.meta.env.VITE_XRPL_MPT_ISSUANCE_ID as string)?.trim() || '';

type GetFaucetPageProps = {
  address: string;
  wallet: Wallet | null;
  onContinue: () => void;
};

export function GetFaucetPage({
  address,
  wallet,
  onContinue,
}: GetFaucetPageProps) {
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);

  const fundWallet = useCallback(async () => {
    setFunding(true);
    setFundError(null);
    setFundSuccess(null);
    try {
      const response = await fetch(
        'https://faucet.altnet.rippletest.net/accounts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: address }),
        }
      );
      if (!response.ok) {
        throw new Error(`Faucet error: ${response.status}`);
      }
      const result = await response.json();
      const amountXrp = result.amount
        ? (Number(result.amount) / 1_000_000).toFixed(0)
        : '1000';
      let successMsg = `Received ${amountXrp} XRP!`;

      if (MPT_ISSUANCE_ID && wallet) {
        const client = new Client(TESTNET_WS);
        try {
          await client.connect();
          await client.submitAndWait(
            {
              TransactionType: 'MPTokenAuthorize',
              Account: wallet.address,
              MPTokenIssuanceID: MPT_ISSUANCE_ID,
            },
            { wallet }
          );
          successMsg += ' SBT token authorized.';
        } catch (mptErr) {
          const mptMsg =
            mptErr instanceof Error ? mptErr.message : String(mptErr);
          successMsg += ` (MPT authorize failed: ${mptMsg})`;
        } finally {
          await client.disconnect();
        }
      }

      setFundSuccess(successMsg);
    } catch (e) {
      setFundError(
        e instanceof Error ? e.message : 'Failed to fund wallet'
      );
    } finally {
      setFunding(false);
    }
  }, [address, wallet]);

  return (
    <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden />
      </div>

      <h2 className="text-lg font-semibold text-white">Get test XRP</h2>
      <p className="text-sm text-gray-400">
        Fund your new wallet with test XRP from the XRPL Testnet faucet. Test
        tokens have no real value.
      </p>

      <section className="p-4 rounded-lg bg-sky-900/30 border border-sky-700">
        <button
          type="button"
          onClick={fundWallet}
          disabled={funding}
          className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {funding ? 'Requesting XRP…' : 'Get Test XRP'}
        </button>
        {fundError && (
          <p className="mt-2 text-xs text-red-400">{fundError}</p>
        )}
        {fundSuccess && (
          <p className="mt-2 text-xs text-green-400">{fundSuccess}</p>
        )}
        <a
          href={TESTNET_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-[11px] text-gray-400 hover:text-sky-400"
        >
          Or open faucet manually →
        </a>
      </section>

      <button
        type="button"
        onClick={onContinue}
        className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 transition-colors uppercase tracking-wide mt-auto"
      >
        Continue to register SBT
      </button>
    </div>
  );
}
