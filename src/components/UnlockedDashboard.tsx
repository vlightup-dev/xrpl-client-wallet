import { useState, useEffect, useCallback } from 'react';
import { Client, Wallet } from 'xrpl';

const TESTNET_FAUCET_URL = 'https://faucet.altnet.rippletest.net/';
const TESTNET_EXPLORER_ACCOUNT_URL = 'https://testnet.xrpl.org/accounts/';
const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';

/** Platform SBT MPT issuance ID; when set, "Get Test XRP" also submits MPTokenAuthorize so the wallet can receive SBT. */
const MPT_ISSUANCE_ID = (import.meta.env.VITE_XRPL_MPT_ISSUANCE_ID as string)?.trim() || '';

type UnlockedDashboardProps = {
  address: string | null;
  wallet: Wallet | null;
  onLogout: () => void;
};

export function UnlockedDashboard({ address, wallet, onLogout }: UnlockedDashboardProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);

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

  const fundWallet = useCallback(async () => {
    if (!address) return;
    setFunding(true);
    setFundError(null);
    setFundSuccess(null);
    try {
      const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: address }),
      });
      if (!response.ok) {
        throw new Error(`Faucet error: ${response.status}`);
      }
      const result = await response.json();
      const amount = result.amount ? (Number(result.amount) / 1_000_000).toFixed(0) : '1000';
      let successMsg = `Received ${amount} XRP!`;

      // If platform MPT issuance ID is configured and we have the wallet, submit MPTokenAuthorize
      // so this account can receive the SBT from the platform without tecNO_AUTH.
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
            { wallet },
          );
          successMsg += ' SBT token authorized.';
        } catch (mptErr) {
          const mptMsg = mptErr instanceof Error ? mptErr.message : String(mptErr);
          successMsg += ` (MPT authorize failed: ${mptMsg})`;
        } finally {
          await client.disconnect();
        }
      } else {
        throw new Error('MPT issuance ID is not configured');
      }

      setFundSuccess(successMsg);
      // Refresh balance after funding
      setTimeout(() => fetchBalance(), 2000);
    } catch (e) {
      setFundError(e instanceof Error ? e.message : 'Failed to fund wallet');
    } finally {
      setFunding(false);
    }
  }, [address, wallet, fetchBalance]);

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
          Get test XRP from the XRPL Testnet faucet. Test tokens have no real value.
        </p>
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
