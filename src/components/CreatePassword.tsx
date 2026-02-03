import { ChevronLeftIcon } from './icons';
import { PasswordInput } from './PasswordInput';

type CreatePasswordProps = {
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  showConfirmPassword: boolean;
  onToggleShowConfirmPassword: () => void;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
  creating?: boolean;
};

export function CreatePassword({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  showPassword,
  onToggleShowPassword,
  showConfirmPassword,
  onToggleShowConfirmPassword,
  error,
  onBack,
  onNext,
  creating = false,
}: CreatePasswordProps) {
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
          <span className="w-2 h-2 rounded-full bg-gray-600" aria-hidden />
          <span className="w-2 h-2 rounded-full bg-gray-600" aria-hidden />
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-1">Create a password</h2>
      <p className="text-sm text-gray-400 mb-6">
        You will use this password to unlock your wallet
      </p>

      <div className="flex flex-col gap-4">
        <PasswordInput
          id="create-password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Password"
          showPassword={showPassword}
          onToggleShow={onToggleShowPassword}
          autoComplete="new-password"
        />

        <PasswordInput
          id="confirm-password"
          value={confirmPassword}
          onChange={onConfirmPasswordChange}
          placeholder="Confirm Password"
          label="Confirm Password"
          showPassword={showConfirmPassword}
          onToggleShow={onToggleShowConfirmPassword}
          autoComplete="new-password"
        />

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={creating}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wide mt-2"
        >
          {creating ? 'Creating wallet…' : 'Next'}
        </button>
      </div>
    </div>
  );
}
