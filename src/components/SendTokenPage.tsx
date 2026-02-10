import { useState, useCallback, useEffect } from 'react';
import { Client, decode, Wallet } from 'xrpl';
import { fetchWithAuth } from '../authRefresh';
import { computeLocationSignature } from '../geohashLocationHash';
import { getMultisigAccount, getMultisigSignerCount } from '../multisigStorage';
import { getCoords } from '../coords';
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

/** Fee for EscrowCreate (multisig only): 2 signers -> 60, 3 signers -> 90. */
function getMultisigFeeDrops(signerCount: 2 | 3 | null): string {
  return signerCount === 3 ? '90' : '60';
}

/** EscrowFinish with Fulfillment has a much higher minimum: 10 × (33 + fulfillment_size/16). For 32-byte preimage = 350; use 400 for safety. */
const ESCROW_FINISH_FEE_DROPS = '400';

type SendTokenPageProps = {
  address: string;
  wallet: Wallet | null;
  onBack: () => void;
  multisigAccount?: string | null;
  /** First signer wallet when main account is multisig (saved in Multisig config). Used to sign escrows. */
  signerWallet?: Wallet | null;
};


export function SendTokenPage({ address, wallet, onBack, multisigAccount: multisigAccountProp, signerWallet }: SendTokenPageProps) {
  const [step, setStep] = useState<'form' | 'confirm'>('form');
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
  const [txJudgment, setTxJudgment] = useState<'allow' | 'review' | 'block' | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [reviewRiskConfirmed, setReviewRiskConfirmed] = useState(false);

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

  const goToConfirm = useCallback(() => {
    setError(null);
    setTxJudgment(null);
    setTxError(null);
    setReviewRiskConfirmed(false);
    setStep('confirm');
  }, []);

  const goBackToForm = useCallback(() => {
    setStep('form');
    setTxJudgment(null);
    setTxError(null);
    setReviewRiskConfirmed(false);
  }, []);

  useEffect(() => {
    if (step !== 'confirm' || !canSubmit || !API_BASE_URL) return;
    let cancelled = false;
    setTxLoading(true);
    setTxError(null);
    setTxJudgment(null);
    const base = API_BASE_URL.replace(/\/$/, '');
    const amountNum = parseFloat(amount.replace(/,/g, '')) || 0;
    Promise.all([getSbtCredentials(), getCoords()]).then(([creds, coords]) => {
      if (cancelled) return;
      if (!creds?.user_id || !creds?.access_token) {
        setTxError('Register SBT first and sign in to send payments.');
        setTxLoading(false);
        return;
      }
      fetchWithAuth(base, '/user-transactions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: creds.user_id,
          amount: amountNum,
          currency: 'XRP',
          transaction_id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          transaction_type: 'send',
          latitude: coords.latitude,
          longitude: coords.longitude,
          address_from: address,
          address_to: recipient.trim(),
        }),
      })
        .then(async (res) => {
          if (cancelled) return;
          const data = (await res.json().catch(() => ({}))) as {
            data?: { judgment?: string };
            error?: string;
          };
          if (!res.ok) {
            setTxError(data.error || `Risk check failed: ${res.status}`);
            setTxJudgment(null);
            return;
          }
          const judgment = data.data?.judgment as 'allow' | 'review' | 'block' | undefined;
          setTxJudgment(judgment ?? 'allow');
          setTxError(null);
        })
        .catch((err) => {
          if (!cancelled) {
            setTxError(err instanceof Error ? err.message : 'Failed to check risk');
            setTxJudgment(null);
          }
        })
        .finally(() => {
          if (!cancelled) setTxLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, [step, canSubmit, API_BASE_URL, address, amount, recipient]);

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

      if (txJudgment === 'block') {
        setError('This transfer is blocked due to risk.');
        return;
      }

      const coords = await getCoords();

      // Prepare escrow: get condition + params (server stores fulfillment; client will create tx)
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
        setStepMessage('Step 1: Prepared. Step 2: Requesting release with current geolocation…');

        const signerCount = await getMultisigSignerCount();
        const multisigFeeDrops = getMultisigFeeDrops(signerCount);

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
            Fee: multisigFeeDrops,
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
            Sequence: nextSequence + 1,
            Fee: ESCROW_FINISH_FEE_DROPS,
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
          setStep('form');
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
        const finishHash = finishData.tx_hash ?? '—';
        setSuccess(
          `Payment sent successfully.\nEscrowCreate: ${createTxHash || '—'}\nEscrowFinish: ${finishHash}`
        );
        setRecipient('');
        setAmount('');
        setDestinationTag('');
        setNotes('');
        setStep('form');
      } finally {
        client.disconnect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
      setStepMessage(null);
    }
  }, [canSubmit, address, wallet, signerWallet, amount, recipient, destinationTag, multisigAccount, txJudgment]);

  if (step === 'confirm') {
    return (
      <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
        <header className="flex items-center justify-between pb-2 border-b border-gray-700">
          <button
            type="button"
            onClick={goBackToForm}
            className="p-1 rounded text-gray-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-white">Confirm Payment</h1>
          <span className="w-8" />
        </header>

        <section className="p-3 rounded-lg bg-gray-800 border border-gray-700">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Transaction details</h2>
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-gray-500">Recipient</dt>
              <dd className="font-mono text-xs break-all text-gray-200">{recipient.trim()}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Amount</dt>
              <dd className="text-white">{amount.trim()} XRP</dd>
            </div>
            <div>
              <dt className="text-gray-500">Token</dt>
              <dd className="text-gray-200">XRP</dd>
            </div>
            {destinationTag.trim() && (
              <div>
                <dt className="text-gray-500">Destination Tag</dt>
                <dd className="text-gray-200">{destinationTag.trim()}</dd>
              </div>
            )}
            {notes.trim() && (
              <div>
                <dt className="text-gray-500">Notes</dt>
                <dd className="text-gray-200">{notes.trim()}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="p-3 rounded-lg bg-gray-800 border border-gray-700">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Transfer risk assessment</h2>
          {txLoading && (
            <p className="text-sm text-gray-400">Checking risk…</p>
          )}
          {txError && !txLoading && (
            <p className="text-sm text-amber-400">{txError}</p>
          )}
          {txJudgment && !txLoading && (
            <>
              {txJudgment === 'block' && (
                <div className="p-3 rounded-lg bg-red-900/40 border border-red-700">
                  <p className="text-sm font-medium text-red-200">This transfer is blocked due to risk.</p>
                  <p className="text-xs text-red-300/90 mt-1">You cannot proceed with this payment.</p>
                </div>
              )}
              {txJudgment === 'review' && (
                <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-600">
                  <p className="text-sm font-medium text-amber-200">This transfer requires review — elevated risk.</p>
                  <p className="text-xs text-amber-200/90 mt-1">You may proceed at your own risk.</p>
                  <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reviewRiskConfirmed}
                      onChange={(e) => setReviewRiskConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-amber-600 bg-gray-800 text-amber-500"
                    />
                    <span className="text-xs text-amber-200">I understand the risk and want to proceed</span>
                  </label>
                </div>
              )}
              {txJudgment === 'allow' && (
                <div className="p-3 rounded-lg bg-green-900/30 border border-green-700">
                  <p className="text-sm font-medium text-green-200">Risk assessment: Approved</p>
                </div>
              )}
            </>
          )}
        </section>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {stepMessage && (
          <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
            {stepMessage}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-400 whitespace-pre-line">{success}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <button
            type="button"
            onClick={goBackToForm}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-center text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors uppercase"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !canSubmit ||
              txLoading ||
              txJudgment == null ||
              txJudgment === 'block' ||
              (txJudgment === 'review' && !reviewRiskConfirmed)
            }
            className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase"
          >
            {submitting ? 'Sending…' : 'Confirm and Send'}
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


      {error && <p className="text-xs text-red-400">{error}</p>}
      {stepMessage && (
        <p className="text-xs text-sky-300 whitespace-pre-line" aria-live="polite">
          {stepMessage}
        </p>
      )}
      {success && (
        <p className="text-xs text-green-400 whitespace-pre-line">{success}</p>
      )}

      <button
        type="button"
        onClick={goToConfirm}
        disabled={!canSubmit}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-auto uppercase"
      >
        Review
      </button>
    </div>
  );
}
