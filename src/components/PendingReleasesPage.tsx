import { useState, useCallback, useEffect } from 'react';
import { decode, multisign, Wallet } from 'xrpl';
import type { Transaction } from 'xrpl';
import { getCoords } from '../coords';
import { fetchWithAuth } from '../authRefresh';
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

type ReviewBundle = {
  pendingId: string;
  createTx: Record<string, unknown>;
  finishTx: Record<string, unknown>;
  item: PendingItem;
};

type PendingReleasesPageProps = {
  wallet: Wallet | null;
  onBack: () => void;
};

function formatTxField(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

export function PendingReleasesPage({ wallet, onBack }: PendingReleasesPageProps) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [needsLink, setNeedsLink] = useState(false);
  /** When set, show transaction detail view before signing. */
  const [reviewBundle, setReviewBundle] = useState<ReviewBundle | null>(null);
  const [fetchingBundle, setFetchingBundle] = useState<string | null>(null);
  /** Success message with EscrowCreate and EscrowFinish hashes after completing a release. */
  const [completeSuccess, setCompleteSuccess] = useState<string | null>(null);

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
    try {
      const res = await fetchWithAuth(base, '/api/v1/xrpl/escrow/pending-releases', { method: 'GET' });
      const data = (await res.json().catch(() => ({}))) as { pending?: PendingItem[]; error?: string };
      if (!res.ok) {
        const msg =
          res.status === 401
            ? (data.error || 'Sign-in required or session expired. Register SBT and sign in again, then tap Refresh list.')
            : (data.error || `Failed to load: ${res.status}`);
        setError(msg);
        setPending([]);
        return;
      }
      setPending(data.pending ?? []);
      setNeedsLink(data.error === 'no_wallet_linked');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  /** Fetch bundle and show detail view (EscrowCreate + EscrowFinish) before signing. */
  const openDetailView = useCallback(
    async (pendingId: string) => {
      setCompleteSuccess(null);
      if (!API_BASE_URL) {
        setError('API base URL is not configured.');
        return;
      }
      const creds = await getSbtCredentials();
      if (!creds?.access_token) {
        setError('Register SBT first and sign in.');
        return;
      }
      const item = pending.find((p) => p.pending_id === pendingId);
      if (!item) return;
      setFetchingBundle(pendingId);
      setError(null);
      const base = API_BASE_URL.replace(/\/$/, '');
      const coords = await getCoords();
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
      const locationSignature = await computeLocationSignature(
        creds.geoauth_secret,
        creds.digital_secret,
        coords.latitude,
        coords.longitude
      );
      try {
        const getBundleRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/get-bundle-for-signing', {
          method: 'POST',
          body: JSON.stringify({
            pending_id: pendingId,
            condition: pendingId,
            digital_id: String(creds.digital_id),
            timestamp,
            nonce,
            location_signature: locationSignature,
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
        setReviewBundle({ pendingId, createTx, finishTx, item });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setFetchingBundle(null);
      }
    },
    [pending]
  );

  const completeRelease = useCallback(
    async (pendingId: string, preFetched?: { createTx: Record<string, unknown>; finishTx: Record<string, unknown> }) => {
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

      const base = API_BASE_URL.replace(/\/$/, '');
      const coords = await getCoords();

      let createTx: Record<string, unknown>;
      let finishTx: Record<string, unknown>;

      try {
        if (preFetched) {
          createTx = preFetched.createTx;
          finishTx = preFetched.finishTx;
        } else {
          setStepMessage('Fetching the escrow transaction…');
          const timestamp = Math.floor(Date.now() / 1000);
          const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
          const locationSignature = await computeLocationSignature(
            creds.geoauth_secret,
            creds.digital_secret,
            coords.latitude,
            coords.longitude
          );
          const getBundleRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/get-bundle-for-signing', {
            method: 'POST',
            body: JSON.stringify({
              pending_id: pendingId,
              condition: pendingId,
              digital_id: String(creds.digital_id),
              timestamp,
              nonce,
              location_signature: locationSignature,
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
          createTx = bundleData.escrow_create_tx_json!;
          finishTx = bundleData.escrow_finish_tx_json!;
          if (!createTx || !finishTx) {
            setError('Missing transaction data from server.');
            return;
          }
        }

        // Both EscrowCreate and EscrowFinish must be multi-signed by signer1 and signer2 (2-of-2).
        setStepMessage('Signing escrow…');

        const createWithoutSigners = { ...createTx };
        delete (createWithoutSigners as Record<string, unknown>).Signers;
        const finishWithoutSigners = { ...finishTx };
        delete (finishWithoutSigners as Record<string, unknown>).Signers;

        const item = pending.find((p) => p.pending_id === pendingId);
        if (!item?.owner) {
          setError('Could not determine org account for this pending release.');
          return;
        }
        // Sign as Signer 2: pass this wallet's address (the account we're adding a signature for)
        const signerAddress = wallet.classicAddress;
        const ourSignedCreate = wallet.sign(createWithoutSigners as Parameters<Wallet['sign']>[0], signerAddress);
        const ourSignedFinish = wallet.sign(finishWithoutSigners as Parameters<Wallet['sign']>[0], signerAddress);
        const ourCreateJson = decode(ourSignedCreate.tx_blob) as Record<string, unknown>;
        const ourFinishJson = decode(ourSignedFinish.tx_blob) as Record<string, unknown>;

        const combinedCreateBlob = multisign([createTx as Transaction, ourCreateJson as Transaction]);
        const combinedFinishBlob = multisign([finishTx as Transaction, ourFinishJson as Transaction]);
        const combinedCreateJson = decode(combinedCreateBlob) as Record<string, unknown>;
        const combinedFinishJson = decode(combinedFinishBlob) as Record<string, unknown>;

        setStepMessage('Completing release…');

        const timestampComplete = Math.floor(Date.now() / 1000);
        const nonceComplete = crypto.randomUUID?.() ?? `${timestampComplete}-${Math.random().toString(36).slice(2)}`;
        const locationSignatureComplete = await computeLocationSignature(
          creds.geoauth_secret,
          creds.digital_secret,
          coords.latitude,
          coords.longitude
        );
        const completeRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/complete-release', {
          method: 'POST',
          body: JSON.stringify({
            pending_id: pendingId,
            condition: pendingId,
            digital_id: String(creds.digital_id),
            timestamp: timestampComplete,
            nonce: nonceComplete,
            location_signature: locationSignatureComplete,
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
        const createHash = completeData.tx_hash_create ?? '—';
        const finishHash = completeData.tx_hash_finish ?? '—';
        setCompleteSuccess(
          `Release complete.\nEscrowCreate: ${createHash}\nEscrowFinish: ${finishHash}`
        );
        setReviewBundle(null);
        await fetchPending();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setCompletingId(null);
        setStepMessage(null);
      }
    },
    [wallet, pending, fetchPending]
  );

  // —— Transaction detail view (before signing) ——
  if (reviewBundle) {
    const { pendingId, createTx, finishTx, item } = reviewBundle;
    const signersCreate = (createTx.Signers as unknown[])?.length ?? 0;
    const signersFinish = (finishTx.Signers as unknown[])?.length ?? 0;
    return (
      <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
        <header className="flex items-center justify-between pb-2 border-b border-gray-700">
          <button
            type="button"
            onClick={() => setReviewBundle(null)}
            className="p-1 rounded text-gray-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-white">Transaction details</h1>
          <span className="w-8" />
        </header>
        <p className="text-xs text-gray-400">
          Review EscrowCreate and EscrowFinish before signing. Pending ID: {pendingId.slice(0, 16)}…
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {stepMessage && (
          <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
            {stepMessage}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-300">EscrowCreate</h2>
          <div className="p-3 rounded-lg bg-gray-800 border border-gray-700 text-xs space-y-1 font-mono">
            <p><span className="text-gray-500">Account:</span> {formatTxField(createTx.Account)}</p>
            <p><span className="text-gray-500">Amount:</span> {formatTxField(createTx.Amount)} drops</p>
            <p><span className="text-gray-500">Destination:</span> {formatTxField(createTx.Destination)}</p>
            <p><span className="text-gray-500">Condition:</span> {(String(createTx.Condition ?? '')).slice(0, 24)}…</p>
            <p><span className="text-gray-500">Signers:</span> {signersCreate}</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-300">EscrowFinish</h2>
          <div className="p-3 rounded-lg bg-gray-800 border border-gray-700 text-xs space-y-1 font-mono">
            <p><span className="text-gray-500">Owner:</span> {formatTxField(finishTx.Owner)}</p>
            <p><span className="text-gray-500">OfferSequence:</span> {formatTxField(finishTx.OfferSequence)}</p>
            <p><span className="text-gray-500">Condition:</span> {(String(finishTx.Condition ?? '')).slice(0, 24)}…</p>
            <p><span className="text-gray-500">Fulfillment:</span> {(String(finishTx.Fulfillment ?? '')).slice(0, 24)}…</p>
            <p><span className="text-gray-500">Signers:</span> {signersFinish}</p>
          </div>
        </section>

        <p className="text-xs text-gray-500">
          To: {item.destination.slice(0, 16)}… · {(Number(item.amount_drops) / 1_000_000).toFixed(2)} XRP
        </p>

        <div className="flex flex-col gap-2 mt-auto">
          <button
            type="button"
            onClick={() => completeRelease(pendingId, { createTx, finishTx })}
            disabled={completingId != null}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white"
          >
            {completingId === pendingId ? 'Signing…' : 'Sign & complete'}
          </button>
          <button
            type="button"
            onClick={() => setReviewBundle(null)}
            className="w-full py-2 px-3 rounded-lg text-sm text-gray-400 hover:text-white border border-gray-600"
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
      <header className="flex items-center justify-between pb-2 border-b border-gray-700">
        <button
          type="button"
          onClick={() => {
            setCompleteSuccess(null);
            onBack();
          }}
          className="p-1 rounded text-gray-400 hover:text-white transition-colors"
          aria-label="Back"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-white">Pending releases</h1>
        <span className="w-8" />
      </header>

      <p className="text-xs text-gray-400">
        Releases where your linked wallet is an awaiting signer.
      </p>

      {needsLink && (
        <p className="text-xs text-amber-400">
          Register SBT with your XRPL wallet to see pending releases here.
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {stepMessage && (
        <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
          {stepMessage}
        </p>
      )}
      {completeSuccess && (
        <p className="text-xs text-green-400 whitespace-pre-line">{completeSuccess}</p>
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
                onClick={() => openDetailView(item.pending_id)}
                disabled={fetchingBundle != null || completingId != null}
                className="mt-1 py-2 px-3 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white"
              >
                {fetchingBundle === item.pending_id ? 'Loading…' : 'View details'}
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
