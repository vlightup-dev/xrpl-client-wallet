import { useState } from 'react';
import { ChevronLeftIcon } from './icons';

type BackupSeedProps = {
  seed: string;
  onBack: () => void;
  onContinue: () => void;
};

export function BackupSeed({ seed, onBack, onContinue }: BackupSeedProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(seed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col min-h-[400px] max-w-[360px] bg-gray-900 text-white px-6 py-6">
      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeftIcon className="w-5 h-5" />
          Back
        </button>
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden />
          <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden />
          <span className="w-2 h-2 rounded-full bg-gray-600" aria-hidden />
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-1">Back up your seed</h2>
      <p className="text-sm text-gray-400 mb-6">
        Write down this seed phrase and store it in a safe place. You will need it to recover your wallet.
      </p>

      <div className="relative">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
          <p className="text-sm text-amber-400 font-medium mb-2">Secret Recovery Seed</p>
          <p className="text-white font-mono text-sm break-all select-all">{seed}</p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-6">
        <p className="text-sm text-red-300">
          <strong>Warning:</strong> Never share your seed with anyone. Anyone with this seed can access your funds.
        </p>
      </div>

      <label className="flex items-start gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-gray-900"
        />
        <span className="text-sm text-gray-300">
          I have saved my seed phrase in a secure location
        </span>
      </label>

      <button
        type="button"
        onClick={onContinue}
        disabled={!confirmed}
        className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wide mt-auto"
      >
        Continue
      </button>
    </div>
  );
}
