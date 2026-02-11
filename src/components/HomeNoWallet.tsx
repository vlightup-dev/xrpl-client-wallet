import { WalletLogo } from './WalletLogo';

type HomeNoWalletProps = {
  onCreateWallet: () => void;
  onImportWallet: () => void;
  onConnectCrossmark: () => void;
  isCrossmarkInstalled: boolean;
};

export function HomeNoWallet({ 
  onCreateWallet, 
  onImportWallet, 
  onConnectCrossmark,
  isCrossmarkInstalled 
}: HomeNoWalletProps) {
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
        
        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-gray-700"></div>
          <span className="text-xs text-gray-400 uppercase tracking-wider">Or</span>
          <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        {/* Crossmark Connect */}
        <button
          type="button"
          onClick={onConnectCrossmark}
          disabled={!isCrossmarkInstalled}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-colors uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          title={!isCrossmarkInstalled ? 'Please install Crossmark wallet extension' : 'Connect with Crossmark wallet'}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9V5h2v4h4v2h-4v4H9v-4H5V9h4z"/>
          </svg>
          Connect Crossmark Wallet
        </button>
        
        {!isCrossmarkInstalled && (
          <a
            href="https://crossmark.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-center text-sky-400 hover:text-sky-300 underline"
          >
            Install Crossmark Extension
          </a>
        )}
      </div>
    </div>
  );
}
