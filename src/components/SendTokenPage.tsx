import { useState, useCallback, useEffect } from 'react';
import { Client } from 'xrpl';
import { getSbtCredentials } from '../trustauthyStorage';
import { ChevronLeftIcon } from './icons';

const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string)?.trim() ||
  (import.meta.env.VITE_API_SERVER_URL as string)?.trim() ||
  '';

const XRP_TO_DROPS = 1_000_000;

function amountToDrops(amountXrp: string): string {
  const n = parseFloat(amountXrp.replace(/,/g, ''));
  if (Number.isNaN(n) || n <= 0) return '0';
  return Math.round(n * XRP_TO_DROPS).toString();
}

type SendTokenPageProps = {
  address: string;
  onBack: () => void;
};

export function SendTokenPage({ address, onBack }: SendTokenPageProps) {
  const [balanceXrp, setBalanceXrp] = useState<string>('0');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [destinationTag, setDestinationTag] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = new Client(TESTNET_WS);
    client.connect().then(() =>
      client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
    ).then((res) => {
      if (cancelled) return;
      const result = res.result as { account_data?: { Balance?: string }; error?: string };
      if (result.error === 'actNotFound') setBalanceXrp('0');
      else {
        const bal = result.account_data?.Balance;
        if (bal !== undefined) setBalanceXrp((Number(bal) / 1_000_000).toFixed(2));
      }
    }).catch(() => {
      if (!cancelled) setBalanceXrp('0');
    }).finally(() => client.disconnect());
    return () => { cancelled = true; };
  }, [address]);

  const canSubmit =
    recipient.trim().length > 0 &&
    amount.trim().length > 0 &&
    parseFloat(amount.replace(/,/g, '')) > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (!API_BASE_URL) {
        setError('API base URL is not configured (VITE_API_BASE_URL).');
        return;
      }

      const creds = await getSbtCredentials();
      if (!creds?.access_token) {
        setError('Register SBT first and sign in to send payments.');
        return;
      }

      const base = API_BASE_URL.replace(/\/$/, '');
      const drops = amountToDrops(amount);
      if (drops === '0') {
        setError('Enter a valid amount.');
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.access_token}`,
        ...(creds.api_key ? { 'X-API-KEY': creds.api_key } : {}),
      };

      // 1) Create escrow
      const createRes = await fetch(`${base}/api/v1/xrpl/escrow`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          destination: recipient.trim(),
          amount_drops: drops,
        }),
      });
      const createData = (await createRes.json().catch(() => ({}))) as {
        tx_hash?: string;
        offer_sequence?: string;
        condition?: string;
        fulfillment?: string;
        owner?: string;
        error?: string;
      };
      if (!createRes.ok) {
        setError(
          createData.error ||
            (createRes.status === 404
              ? 'Create escrow failed: 404 — API not found. Is the platform running with escrow routes? Use VITE_API_BASE_URL=http://localhost:8000 for local dev.'
              : `Create escrow failed: ${createRes.status}`)
        );
        return;
      }
      if (createData.error || !createData.fulfillment || !createData.owner || !createData.offer_sequence || !createData.condition) {
        setError(createData.error || 'Invalid create escrow response.');
        return;
      }

      // 2) Verify first location (required before release)
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
      const locationSignature = creds.location_hash ?? '';
      const verifyRes = await fetch(`${base}/verify-first-location`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          digital_id: creds.digital_id,
          timestamp,
          nonce,
          location_signature: locationSignature,
        }),
      });
      if (!verifyRes.ok) {
        const verifyErr = (await verifyRes.json().catch(() => ({}))) as { message?: string };
        setError(verifyErr.message || 'Location verification failed. Complete SBT registration with location.');
        return;
      }

      // 3) Release escrow (finish)
      const finishRes = await fetch(`${base}/api/v1/xrpl/escrow/finish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner: createData.owner,
          offer_sequence: createData.offer_sequence,
          condition: createData.condition,
          fulfillment: createData.fulfillment,
        }),
      });
      const finishData = (await finishRes.json().catch(() => ({}))) as { tx_hash?: string; error?: string };
      if (!finishRes.ok) {
        setError(finishData.error || `Release escrow failed: ${finishRes.status}`);
        return;
      }

      setSuccess(
        `Payment sent. Escrow created: ${createData.tx_hash ?? '—'}. Released: ${finishData.tx_hash ?? '—'}.`
      );
      setRecipient('');
      setAmount('');
      setDestinationTag('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit]);

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
        <h1 className="text-lg font-semibold text-white">Send Payment</h1>
        <span className="w-8" />
      </header>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="send-recipient">
          Recipient&apos;s address
        </label>
        <input
          id="send-recipient"
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient's address"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400">Token</label>
        <div className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-sm text-gray-300">
          XRP – Available: {balanceXrp} XRP
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="send-amount">
          Amount
        </label>
        <input
          id="send-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="send-dest-tag">
          Destination Tag (optional, numeric)
        </label>
        <input
          id="send-dest-tag"
          type="text"
          inputMode="numeric"
          value={destinationTag}
          onChange={(e) => setDestinationTag(e.target.value)}
          placeholder="Destination Tag (optional, numeric)"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500">
          If you are sending funds to an exchange, you may need to provide a destination tag.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="send-notes">
          Notes (optional)
        </label>
        <input
          id="send-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-auto uppercase"
      >
        {submitting ? 'Sending…' : 'Send Payment'}
      </button>
    </div>
  );
}
