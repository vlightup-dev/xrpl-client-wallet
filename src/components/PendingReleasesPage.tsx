import { useState, useCallback, useEffect } from 'react';
import { decode, multisign, Wallet } from 'xrpl';
import type { Transaction } from 'xrpl';
import { computeLocationSignature } from '../geohashLocationHash';
import { getSbtCredentials } from '../trustauthyStorage';
import { ChevronLeftIcon } from './icons';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string)?.trim() ||
  (import.meta.env.VITE_API_SERVER_URL as string)?.trim() ||
  '';

type PendingItem = {
  pending_id: string;
  condition: string;
  owner: string;
  destination: string;
  amount_drops: string;
  signer_addresses: string[];
};

type PendingReleasesPageProps = {
  orgAccount: string;
  wallet: Wallet | null;
  onBack: () => void;
};

export function PendingReleasesPage({ orgAccount, wallet, onBack }: PendingReleasesPageProps) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!API_BASE_URL) {
      setError('API base URL is not configured.');
      setLoading(false);
      return;
    }
    const creds = await getSbtCredentials();
    if (!creds?.access_token) {
      setError('Register SBT first and sign in.');
      setLoading(false);
      return;
    }
    const base = API_BASE_URL.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.access_token}`,
      ...(creds.api_key ? { 'X-API-KEY': creds.api_key } : {}),
    };
    try {
      const res = await fetch(`${base}/api/v1/xrpl/escrow/pending-releases?account=${encodeURIComponent(orgAccount)}`, { headers });
      const data = (await res.json().catch(() => ({}))) as { pending?: PendingItem[]; error?: string };
      if (!res.ok) {
        setError(data.error || `Failed to load: ${res.status}`);
        setPending([]);
        return;
      }
      setPending(data.pending ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [orgAccount]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const completeRelease = useCallback(
    async (pendingId: string) => {
      if (!wallet || !API_BASE_URL) {
        setError(wallet ? 'API base URL is not configured.' : 'Wallet not available.');
        return;
      }
      const creds = await getSbtCredentials();
      if (!creds?.access_token) {
        setError('Register SBT first and sign in.');
        return;
      }
      setCompletingId(pendingId);
      setError(null);
      setStepMessage('Fetching the escrow transaction…');

      const base = API_BASE_URL.replace(/\/$/, '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.access_token}`,
        ...(creds.api_key ? { 'X-API-KEY': creds.api_key } : {}),
      };

      const coords = { latitude: 35.6895, longitude: 139.6917 };
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
      const locationSignature = await computeLocationSignature(
        creds.geoauth_secret,
        creds.digital_secret,
        coords.latitude,
        coords.longitude
      );

      try {
        const getBundleRes = await fetch(`${base}/api/v1/xrpl/escrow/get-bundle-for-signing`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pending_id: pendingId,
            condition: pendingId,
            digital_id: String(creds.digital_id),
            timestamp,
            nonce,
            location_signature: locationSignature,
            signer_address: wallet.address,
          }),
        });
        const bundleData = (await getBundleRes.json().catch(() => ({}))) as {
          escrow_create_tx_json?: Record<string, unknown>;
          escrow_finish_tx_json?: Record<string, unknown>;
          error?: string;
        };
        if (!getBundleRes.ok) {
          setError(bundleData.error || `Get bundle failed: ${getBundleRes.status}`);
          return;
        }
        const createTx = bundleData.escrow_create_tx_json;
        const finishTx = bundleData.escrow_finish_tx_json;
        if (!createTx || !finishTx) {
          setError('Missing transaction data from server.');
          return;
        }

        setStepMessage('Signing escrow…');

        const createWithoutSigners = { ...createTx };
        delete (createWithoutSigners as Record<string, unknown>).Signers;
        const finishWithoutSigners = { ...finishTx };
        delete (finishWithoutSigners as Record<string, unknown>).Signers;

        const ourSignedCreate = wallet.sign(createWithoutSigners as Parameters<Wallet['sign']>[0], orgAccount);
        const ourSignedFinish = wallet.sign(finishWithoutSigners as Parameters<Wallet['sign']>[0], orgAccount);
        const ourCreateJson = decode(ourSignedCreate.tx_blob) as Record<string, unknown>;
        const ourFinishJson = decode(ourSignedFinish.tx_blob) as Record<string, unknown>;

        const combinedCreateBlob = multisign([createTx as Transaction, ourCreateJson as Transaction]);
        const combinedFinishBlob = multisign([finishTx as Transaction, ourFinishJson as Transaction]);
        const combinedCreateJson = decode(combinedCreateBlob) as Record<string, unknown>;
        const combinedFinishJson = decode(combinedFinishBlob) as Record<string, unknown>;

        setStepMessage('Completing release…');

        const completeRes = await fetch(`${base}/api/v1/xrpl/escrow/complete-release`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pending_id: pendingId,
            condition: pendingId,
            digital_id: String(creds.digital_id),
            timestamp,
            nonce,
            location_signature: locationSignature,
            escrow_create_tx_json: combinedCreateJson,
            escrow_finish_tx_json: combinedFinishJson,
          }),
        });
        const completeData = (await completeRes.json().catch(() => ({}))) as {
          released?: boolean;
          tx_hash_create?: string;
          tx_hash_finish?: string;
          error?: string;
        };
        if (!completeRes.ok) {
          setError(completeData.error || `Complete release failed: ${completeRes.status}`);
          return;
        }
        setStepMessage('Release complete.');
        await fetchPending();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setCompletingId(null);
        setStepMessage(null);
      }
    },
    [orgAccount, wallet, fetchPending]
  );

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
        <h1 className="text-lg font-semibold text-white">Pending releases</h1>
        <span className="w-8" />
      </header>

      <p className="text-xs text-gray-400">
        Escrows awaiting your signature (org: {orgAccount.slice(0, 8)}…)
      </p>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {stepMessage && (
        <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
          {stepMessage}
        </p>
      )}

      {!loading && pending.length === 0 && !error && (
        <p className="text-sm text-gray-500">No pending releases.</p>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pending.map((item) => (
            <li
              key={item.pending_id}
              className="p-3 rounded-lg bg-gray-800 border border-gray-700 flex flex-col gap-1"
            >
              <span className="font-mono text-xs text-gray-300 truncate" title={item.pending_id}>
                {item.pending_id.slice(0, 16)}…
              </span>
              <span className="text-xs text-gray-400">
                To: {item.destination.slice(0, 12)}… · {(Number(item.amount_drops) / 1_000_000).toFixed(2)} XRP
              </span>
              <button
                type="button"
                onClick={() => completeRelease(item.pending_id)}
                disabled={completingId != null}
                className="mt-1 py-2 px-3 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white"
              >
                {completingId === item.pending_id ? 'Completing…' : 'Sign & complete'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => fetchPending()}
        disabled={loading}
        className="text-xs text-sky-400 hover:underline disabled:opacity-50"
      >
        {loading ? 'Refreshing…' : 'Refresh list'}
      </button>
    </div>
  );
}
