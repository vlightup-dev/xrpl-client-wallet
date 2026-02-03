import { WalletLogo } from './WalletLogo';
import { PasswordInput } from './PasswordInput';

type HomeUnlockProps = {
  password: string;
  onPasswordChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  keepLoggedIn: boolean;
  onKeepLoggedInChange: (value: boolean) => void;
  unlockError: string | null;
  onUnlock: () => void;
  onResetPassword: () => void;
  unlocking?: boolean;
};

export function HomeUnlock({
  password,
  onPasswordChange,
  showPassword,
  onToggleShowPassword,
  keepLoggedIn,
  onKeepLoggedInChange,
  unlockError,
  onUnlock,
  onResetPassword,
  unlocking = false,
}: HomeUnlockProps) {
  return (
    <div className="flex flex-col min-h-[400px] max-w-[360px] bg-gray-900 text-white px-6 py-6">
      <WalletLogo size="sm" className="mb-6" />

      <div className="flex flex-col gap-4 flex-1">
        <PasswordInput
          id="unlock-password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Enter your password"
          showPassword={showPassword}
          onToggleShow={onToggleShowPassword}
          autoComplete="current-password"
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={keepLoggedIn}
            onChange={(e) => onKeepLoggedInChange(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-sky-500 focus:ring-sky-500"
          />
          <span className="text-sm text-gray-300">Keep me logged in for 30 minutes</span>
        </label>

        {unlockError && (
          <p className="text-sm text-red-400" role="alert">
            {unlockError}
          </p>
        )}

        <button
          type="button"
          onClick={onUnlock}
          disabled={!password.trim() || unlocking}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wide"
        >
          {unlocking ? 'Unlocking…' : 'Unlock'}
        </button>

        <button
          type="button"
          onClick={onResetPassword}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Reset Password
        </button>
      </div>
    </div>
  );
}
