import { WalletLogo } from './WalletLogo';

type HomeNoWalletProps = {
  onCreateWallet: () => void;
  onImportWallet: () => void;
};

export function HomeNoWallet({ onCreateWallet, onImportWallet }: HomeNoWalletProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] max-w-[360px] bg-gray-900 text-white px-6 py-8">
      <WalletLogo size="md" className="mb-8" />

      <div className="w-full flex flex-col gap-3">
        <button
          type="button"
          onClick={onCreateWallet}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 transition-colors uppercase tracking-wide"
        >
          Create a new wallet
        </button>
        <button
          type="button"
          onClick={onImportWallet}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 transition-colors uppercase tracking-wide"
        >
          Import a wallet
        </button>
      </div>
    </div>
  );
}
