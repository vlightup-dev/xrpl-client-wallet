type Size = 'sm' | 'md';

const sizeClasses = {
  sm: { container: 'w-12 h-12 mb-3', icon: 'w-6 h-6', title: 'text-lg', tagline: 'text-xs mt-0.5' },
  md: { container: 'w-14 h-14 mb-4', icon: 'w-8 h-8', title: 'text-xl', tagline: 'text-sm mt-1' },
};

type WalletLogoProps = {
  size?: Size;
  className?: string;
};

export function WalletLogo({ size = 'md', className = '' }: WalletLogoProps) {
  const s = sizeClasses[size];
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`${s.container} rounded-full bg-sky-500/20 flex items-center justify-center`}>
        <svg className={`${s.icon} text-sky-400`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <h1 className={`${s.title} font-semibold text-white`}>TRUSTAUTHY Wallet</h1>
      <p className={`${s.tagline} text-gray-400`}>Your gateway to the XRPL</p>
    </div>
  );
}
