import { EyeIcon, EyeOffIcon } from './icons';

type PasswordInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showPassword: boolean;
  onToggleShow: () => void;
  label?: string;
  autoComplete?: string;
};

const inputClassName =
  'w-full py-3 px-4 pr-10 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm';

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = 'Password',
  showPassword,
  onToggleShow,
  label = 'Password',
  autoComplete = 'off',
}: PasswordInputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOffIcon className="w-5 h-5" />
          ) : (
            <EyeIcon className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
