import { useState, useEffect, useCallback } from 'react';
import { Client } from 'xrpl';

const TESTNET_FAUCET_URL = 'https://faucet.altnet.rippletest.net/';
const TESTNET_EXPLORER_ACCOUNT_URL = 'https://testnet.xrpl.org/accounts/';
const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';

type UnlockedDashboardProps = {
  address: string | null;
  onLogout: () => void;
};

export function UnlockedDashboard({ address, onLogout }: UnlockedDashboardProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setLoadingBalance(true);
    setBalanceError(null);
    try {
      const client = new Client(TESTNET_WS);
      await client.connect();
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated',
      });
      await client.disconnect();
      const result = response.result as {
        account_data?: { Balance?: string };
        error?: string;
      };
      if (result.error === 'actNotFound') {
        setBalance('0');
        setBalanceError(null);
      } else {
        const bal = result.account_data?.Balance;
        if (bal !== undefined) {
          const xrp = Number(bal) / 1_000_000;
          setBalance(xrp.toFixed(2));
        } else {
          setBalance('0');
        }
        setBalanceError(null);
      }
    } catch (e: unknown) {
      const err = e as { data?: { error?: string }; message?: string };
      if (err?.data?.error === 'actNotFound' || String(e).includes('actNotFound')) {
        setBalance('0');
        setBalanceError(null);
      } else {
        setBalanceError(e instanceof Error ? e.message : 'Could not fetch balance');
        setBalance(null);
      }
    } finally {
      setLoadingBalance(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) fetchBalance();
  }, [address, fetchBalance]);

  if (!address) {
    return null;
  }

  const explorerUrl = `${TESTNET_EXPLORER_ACCOUNT_URL}${address}`;

  return (
    <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
      <header className="flex items-center justify-between pb-2 border-b border-gray-700">
        <div>
          <h1 className="text-lg font-semibold text-white">XRPL Testnet</h1>
          <p className="mt-0.5 text-xs text-gray-400">Your XRPL wallet</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Log out
        </button>
      </header>

      <section className="p-3 rounded-lg bg-gray-800 border border-gray-700">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Your address
        </h2>
        <p className="font-mono text-xs break-all text-gray-200 mb-2" title={address}>
          {address}
        </p>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 hover:underline"
        >
          View on Testnet Explorer →
        </a>
      </section>

      <section className="p-3 rounded-lg bg-gray-800 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Balance
          </h2>
          <button
            type="button"
            onClick={fetchBalance}
            disabled={loadingBalance}
            className="text-xs text-sky-400 hover:underline disabled:opacity-50"
          >
            {loadingBalance ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {loadingBalance && balance === null && !balanceError && (
          <p className="text-sm text-gray-400">Loading…</p>
        )}
        {balanceError && (
          <p className="text-sm text-amber-400">{balanceError}</p>
        )}
        {balance !== null && !balanceError && (
          <p className="text-lg font-semibold text-white">{balance} XRP</p>
        )}
      </section>

      <section className="p-4 rounded-lg bg-sky-900/30 border border-sky-700">
        <h2 className="mb-2 text-sm font-semibold text-white">Fund your wallet</h2>
        <p className="text-xs text-gray-300 mb-3">
          Get test XRP from the XRPL Testnet faucet to use your wallet. Test tokens have no real value.
        </p>
        <a
          href={TESTNET_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 transition-colors"
        >
          Open Testnet Faucet
        </a>
        <p className="mt-2 text-[11px] text-gray-400">
          Paste your address above into the faucet to receive test XRP.
        </p>
      </section>

      <footer className="mt-auto pt-3 border-t border-gray-700 text-center">
        <a
          href="https://xrpl.org/docs/tutorials/javascript/build-apps/get-started"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 hover:underline"
        >
          XRPL.js Get Started
        </a>
      </footer>
    </div>
  );
}
