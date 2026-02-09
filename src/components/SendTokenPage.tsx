import { useState, useCallback, useEffect } from 'react';
import { Client, decode, Wallet } from 'xrpl';
import { fetchWithAuth } from '../authRefresh';
import { computeLocationSignature } from '../geohashLocationHash';
import { getMultisigAccount } from '../multisigStorage';
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

const MULTISIG_FEE_DROPS = '30'; // 2 signers: (N+1)*10 drops

type SendTokenPageProps = {
  address: string;
  wallet: Wallet | null;
  onBack: () => void;
  multisigAccount?: string | null;
  /** First signer wallet when main account is multisig (saved in Multisig config). Used to sign escrows. */
  signerWallet?: Wallet | null;
};

export function SendTokenPage({ address, wallet, onBack, multisigAccount: multisigAccountProp, signerWallet }: SendTokenPageProps) {
  const [balanceXrp, setBalanceXrp] = useState<string>('0');
  const [multisigAccount, setMultisigAccount] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [destinationTag, setDestinationTag] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (multisigAccountProp !== undefined) {
      setMultisigAccount(multisigAccountProp ?? null);
      return;
    }
    getMultisigAccount().then(setMultisigAccount);
  }, [multisigAccountProp]);

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
    if (!wallet) {
      setError('Wallet not available. Unlock the wallet to send.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    setStepMessage('Step 1: Preparing escrow…');

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

      // 1) Prepare escrow: get condition + params (server stores fulfillment; client will create tx)
      const prepareRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/prepare', {
        method: 'POST',
        body: JSON.stringify({
          destination: recipient.trim(),
          amount_drops: drops,
        }),
      });
      const prepareData = (await prepareRes.json().catch(() => ({}))) as {
        condition?: string;
        cancel_after?: number;
        finish_after?: number;
        destination?: string;
        amount_drops?: string;
        error?: string;
      };
      if (!prepareRes.ok) {
        setError(
          prepareData.error ||
            (prepareRes.status === 404
              ? 'Prepare escrow failed: 404 — API not found. Use VITE_API_BASE_URL=http://localhost:8000 for local dev.'
              : `Prepare escrow failed: ${prepareRes.status}`)
        );
        return;
      }
      if (prepareData.error || !prepareData.condition || prepareData.cancel_after == null) {
        setError(prepareData.error || 'Invalid prepare escrow response.');
        return;
      }

      const coords = { latitude: 35.6895, longitude: 139.6917 };
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
      const locationSignature = await computeLocationSignature(
        creds.geoauth_secret,
        creds.digital_secret,
        coords.latitude,
        coords.longitude
      );

      if (multisigAccount) {
        const isMainAccount = address.trim().toLowerCase() === multisigAccount.trim().toLowerCase();
        // Only the multisig account can initiate; first signature must be from signer1 (created in multisig config).
        // Signer2 completes the escrow via Pending releases.
        if (!isMainAccount) {
          setError(
            'Only the multisig account can initiate a transfer (using signer 1). To complete an escrow as signer 2, go to Pending releases.'
          );
          return;
        }
        if (!signerWallet) {
          setError(
            'The multisig account cannot sign. Go to Configure multi-sig, use "Create signer wallet" for signer 1, then initiate transfers here. Signer 2 completes from Pending releases.'
          );
          return;
        }
        // ——— Multi-sig: signer1 (saved in config) signs after request-release → submit-first-signatures; awaiting signer = signer2 only ———
        setStepMessage('Step 1: Prepared. Step 2: Requesting release…');

        const client = new Client(TESTNET_WS);
        await client.connect();
        try {
          const accountRes = await client.request({
            command: 'account_info',
            account: multisigAccount,
            ledger_index: 'validated',
          });
          const accResult = accountRes.result as { account_data?: { Sequence?: number }; error?: string };
          if (accResult.error === 'actNotFound') {
            setError('Multisig account not found on ledger.');
            return;
          }
          const nextSequence = accResult.account_data?.Sequence ?? 0;

          const requestReleaseRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/request-release', {
            method: 'POST',
            body: JSON.stringify({
              owner: multisigAccount,
              offer_sequence: String(nextSequence),
              condition: prepareData.condition,
              digital_id: String(creds.digital_id),
              timestamp,
              nonce,
              location_signature: locationSignature,
            }),
          });
          const requestReleaseData = (await requestReleaseRes.json().catch(() => ({}))) as {
            fulfillment?: string;
            destination?: string;
            error?: string;
          };
          if (!requestReleaseRes.ok) {
            setError(requestReleaseData.error || `Request release failed: ${requestReleaseRes.status}`);
            return;
          }
          if (!requestReleaseData.fulfillment) {
            setError(requestReleaseData.error || 'Missing fulfillment from request-release.');
            return;
          }

          setStepMessage('Step 2: Release authorized. Step 3: Creating and signing escrow…');

          const destTag = destinationTag.trim();
          const createTx: Record<string, unknown> = {
            TransactionType: 'EscrowCreate',
            Account: multisigAccount,
            Amount: drops,
            Destination: recipient.trim(),
            Condition: prepareData.condition,
            CancelAfter: prepareData.cancel_after,
            Sequence: nextSequence,
            Fee: MULTISIG_FEE_DROPS,
          };
          if (prepareData.finish_after != null) (createTx as Record<string, unknown>).FinishAfter = prepareData.finish_after;
          if (destTag && !Number.isNaN(Number(destTag))) (createTx as Record<string, unknown>).DestinationTag = Number(destTag);

          const finishTx: Record<string, unknown> = {
            TransactionType: 'EscrowFinish',
            Account: multisigAccount,
            Owner: multisigAccount,
            OfferSequence: nextSequence,
            Condition: prepareData.condition,
            Fulfillment: requestReleaseData.fulfillment,
            Fee: MULTISIG_FEE_DROPS,
          };

          // Second param is the signer's address (for multisign: Signer.Account + encoding). Must be signer1 so server gets signer_1_address = signer1 and awaiting = [signer2].
          const signer1Address = signerWallet.address;
          const signedCreate = signerWallet.sign(createTx as Parameters<Wallet['sign']>[0], signer1Address);
          const signedFinish = signerWallet.sign(finishTx as Parameters<Wallet['sign']>[0], signer1Address);
          const escrowCreateTxJson = decode(signedCreate.tx_blob) as Record<string, unknown>;
          const escrowFinishTxJson = decode(signedFinish.tx_blob) as Record<string, unknown>;
          // Ensure plain JSON-serializable objects for the API
          const createPayload = JSON.parse(JSON.stringify(escrowCreateTxJson)) as Record<string, unknown>;
          const finishPayload = JSON.parse(JSON.stringify(escrowFinishTxJson)) as Record<string, unknown>;

          setStepMessage('Step 3: Submitting first signatures…');

          const submitFirstRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/submit-first-signatures', {
            method: 'POST',
            body: JSON.stringify({
              condition: prepareData.condition,
              escrow_create_tx_json: createPayload,
              escrow_finish_tx_json: finishPayload,
            }),
          });
          const submitFirstData = (await submitFirstRes.json().catch(() => ({}))) as { pending_id?: string; error?: string };
          if (!submitFirstRes.ok) {
            setError(submitFirstData.error || `Submit first signatures failed: ${submitFirstRes.status}`);
            return;
          }

          setStepMessage('Awaiting second signer. You can close this; the other signer can complete the release from Pending releases.');
          setSuccess(
            `Escrow prepared. Pending ID: ${submitFirstData.pending_id ?? prepareData.condition}. A second signer must complete the release.`
          );
          setRecipient('');
          setAmount('');
          setDestinationTag('');
          setNotes('');
        } finally {
          client.disconnect();
        }
        return;
      }

      // ——— Single-sig: build, sign, submit EscrowCreate then finish via server ———
      setStepMessage('Step 1: Prepared. Step 2: Creating escrow…');

      const client = new Client(TESTNET_WS);
      await client.connect();
      try {
        const escrowTx: Record<string, unknown> = {
          TransactionType: 'EscrowCreate',
          Account: address,
          Amount: drops,
          Destination: recipient.trim(),
          Condition: prepareData.condition,
          CancelAfter: prepareData.cancel_after,
        };
        if (prepareData.finish_after != null) {
          escrowTx.FinishAfter = prepareData.finish_after;
        }
        const destTag = destinationTag.trim();
        if (destTag && !Number.isNaN(Number(destTag))) {
          escrowTx.DestinationTag = Number(destTag);
        }
        const filled = await client.autofill(escrowTx as Parameters<Client['autofill']>[0]);
        const signed = wallet.sign(filled);
        const submitResult = await client.submitAndWait(signed.tx_blob);
        const createTxHash = (submitResult.result as { hash?: string }).hash ?? '';
        const offerSequence = (submitResult.result as { tx_json?: { Sequence?: number } }).tx_json?.Sequence;
        if (offerSequence == null) {
          setError('Could not read escrow sequence from ledger.');
          return;
        }

        setStepMessage('Step 2: Created. Step 3: Releasing escrow…');

        const finishRes = await fetchWithAuth(base, '/api/v1/xrpl/escrow/finish', {
          method: 'POST',
          body: JSON.stringify({
            owner: address,
            offer_sequence: String(offerSequence),
            condition: prepareData.condition,
            digital_id: String(creds.digital_id),
            timestamp,
            nonce,
            location_signature: locationSignature,
          }),
        });
        const finishData = (await finishRes.json().catch(() => ({}))) as { tx_hash?: string; error?: string };
        if (!finishRes.ok) {
          setError(finishData.error || `Release escrow failed: ${finishRes.status}`);
          return;
        }

        setStepMessage('Step 3: Released.');
        setSuccess(
          `Payment sent. Escrow created: ${createTxHash || '—'}. Released: ${finishData.tx_hash ?? '—'}.`
        );
        setRecipient('');
        setAmount('');
        setDestinationTag('');
        setNotes('');
      } finally {
        client.disconnect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
      setStepMessage(null);
    }
  }, [canSubmit, address, wallet, signerWallet, amount, recipient, destinationTag, multisigAccount]);

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
      {stepMessage && (
        <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
          {stepMessage}
        </p>
      )}
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
