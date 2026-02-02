import { useState, useCallback, useEffect } from 'react';
import { isInstalled, getAddress, getNetwork, on } from '@gemwallet/api';

const XRPL_TESTNET = 'Testnet';

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [websocket, setWebsocket] = useState<string | null>(null);
  const [gemInstalled, setGemInstalled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checkInstalled = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await isInstalled();
      setGemInstalled(res.result?.isInstalled ?? false);
      if (!res.result?.isInstalled) {
        setAddress(null);
        setNetwork(null);
        setWebsocket(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check GemWallet');
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const installed = await isInstalled();
      if (!installed.result?.isInstalled) {
        setGemInstalled(false);
        setError('GemWallet extension is not installed.');
        return;
      }
      setGemInstalled(true);

      const [addrRes, netRes] = await Promise.all([
        getAddress(),
        getNetwork(),
      ]);

      if (addrRes.type === 'response' && addrRes.result?.address) {
        setAddress(addrRes.result.address);
      } else {
        setAddress(null);
      }

      if (netRes.type === 'response' && netRes.result) {
        setNetwork(netRes.result.network);
        setWebsocket(netRes.result.websocket);
      } else {
        setNetwork(null);
        setWebsocket(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setAddress(null);
      setNetwork(null);
      setWebsocket(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for wallet/network changes from GemWallet extension
  useEffect(() => {
    on('walletChanged', () => connect());
    on('networkChanged', () => connect());
  }, [connect]);

  const isTestnet = network === XRPL_TESTNET;

  return (
    <div className="flex flex-col gap-4 max-w-[360px]">
      <header className="text-center pb-2 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">XRPL Testnet</h1>
        <p className="mt-1 text-xs text-gray-500">GemWallet integration</p>
      </header>

      <section className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="flex-1 min-w-[120px] py-2.5 px-4 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          onClick={checkInstalled}
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Check GemWallet'}
        </button>
        <button
          type="button"
          className="flex-1 min-w-[120px] py-2.5 px-4 text-sm font-medium rounded-lg bg-[#006097] text-white hover:bg-[#004d78] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          onClick={connect}
          disabled={loading}
        >
          {loading ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </section>

      {error && (
        <div
          className="p-2.5 px-3 rounded-lg text-[13px] leading-snug bg-red-50 text-red-700 border border-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {gemInstalled === false && !error && (
        <div className="p-2.5 px-3 rounded-lg text-[13px] leading-snug bg-amber-50 text-amber-800 border border-amber-200">
          Install the{' '}
          <a
            href="https://chromewebstore.google.com/detail/gem-wallet/mlbiliclbknfnaefhmhdkfcfahfddpkp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#006097] hover:underline"
          >
            GemWallet
          </a>{' '}
          extension, then switch its network to <strong>Testnet</strong> in settings.
        </div>
      )}

      {address && (
        <section className="p-3 rounded-lg bg-gray-50 border border-gray-200">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Wallet
          </h2>
          <p className="font-mono text-xs break-all text-gray-900" title={address}>
            {address}
          </p>
        </section>
      )}

      {network && (
        <section className="p-3 rounded-lg bg-gray-50 border border-gray-200">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Network
          </h2>
          <p className="flex items-center gap-2 mb-1.5">
            <span className="font-medium">{network}</span>
            {isTestnet ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800">
                Testnet
              </span>
            ) : (
              <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
                Not testnet
              </span>
            )}
          </p>
          {websocket && (
            <p
              className="font-mono text-[11px] text-gray-500 break-all"
              title={websocket}
            >
              {websocket}
            </p>
          )}
          {!isTestnet && (
            <p className="mt-2 text-xs text-gray-500">
              Switch to Testnet in GemWallet: Settings → Network → Testnet
            </p>
          )}
        </section>
      )}

      <footer className="mt-auto pt-3 border-t border-gray-200 text-center">
        <a
          href="https://gemwallet.app/docs/api/gemwallet-api-reference"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#006097] hover:underline"
        >
          API Reference
        </a>
      </footer>
    </div>
  );
}
