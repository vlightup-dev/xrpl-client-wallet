import { useState, useCallback, useEffect } from 'react';
import { Wallet } from 'xrpl';
import {
  getWalletExists,
  setWalletCreated,
  getDecryptedSeed,
  clearWallet,
} from './walletStorage';
import {
  HomeNoWallet,
  HomeUnlock,
  CreatePassword,
  BackupSeed,
  UnlockedDashboard,
} from './components';

const MIN_PASSWORD_LENGTH = 8;

type View = 'home' | 'create-password' | 'backup-seed' | 'unlocked';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

  // Create password flow
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Unlock flow
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Unlocked: XRPL wallet (address from decrypted wallet)
  const [address, setAddress] = useState<string | null>(null);

  // Temporary seed storage for backup display (cleared after user confirms backup)
  const [tempSeed, setTempSeed] = useState<string | null>(null);

  useEffect(() => {
    getWalletExists().then((exists) => {
      setWalletExists(exists);
      if (exists) setView('home');
    });
  }, []);

  const goToCreatePassword = useCallback(() => {
    setView('create-password');
    setPassword('');
    setConfirmPassword('');
    setCreateError(null);
  }, []);

  const handleCreateNext = useCallback(async () => {
    setCreateError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setCreateError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setCreateError('Passwords do not match');
      return;
    }
    setCreating(true);
    try {
      const wallet = Wallet.generate();
      await setWalletCreated(password, wallet.seed!, wallet.address);
      setWalletExists(true);
      setAddress(wallet.address);
      setTempSeed(wallet.seed!);
      setPassword('');
      setConfirmPassword('');
      setView('backup-seed');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create wallet');
    } finally {
      setCreating(false);
    }
  }, [password, confirmPassword]);

  const handleBackupBack = useCallback(() => {
    setView('create-password');
  }, []);

  const handleBackupContinue = useCallback(() => {
    setTempSeed(null); // Clear seed from memory after user confirms backup
    setView('unlocked');
  }, []);

  const handleCreateBack = useCallback(() => {
    setView('home');
    setPassword('');
    setConfirmPassword('');
    setCreateError(null);
  }, []);

  const handleUnlock = useCallback(async () => {
    setUnlockError(null);
    setUnlocking(true);
    try {
      const seed = await getDecryptedSeed(unlockPassword);
      if (!seed) {
        setUnlockError('Incorrect password');
        return;
      }
      const wallet = Wallet.fromSeed(seed);
      setAddress(wallet.address);
      setUnlockPassword('');
      setView('unlocked');
    } catch {
      setUnlockError('Incorrect password');
    } finally {
      setUnlocking(false);
    }
  }, [unlockPassword]);

  const handleResetPassword = useCallback(async () => {
    if (
      !window.confirm(
        'This will remove your wallet. You will need to create a new one. Continue?'
      )
    )
      return;
    await clearWallet();
    setWalletExists(false);
    setAddress(null);
    setUnlockPassword('');
    setUnlockError(null);
    setView('home');
  }, []);

  const handleLogout = useCallback(() => {
    setView('home');
    setAddress(null);
  }, []);

  const onImportWallet = useCallback(() => {
    // TODO: implement import flow
  }, []);

  if (walletExists === null) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-gray-900">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (view === 'home' && !walletExists) {
    return (
      <HomeNoWallet
        onCreateWallet={goToCreatePassword}
        onImportWallet={onImportWallet}
      />
    );
  }

  if (view === 'home' && walletExists) {
    return (
      <HomeUnlock
        password={unlockPassword}
        onPasswordChange={setUnlockPassword}
        showPassword={showUnlockPassword}
        onToggleShowPassword={() => setShowUnlockPassword((s) => !s)}
        keepLoggedIn={keepLoggedIn}
        onKeepLoggedInChange={setKeepLoggedIn}
        unlockError={unlockError}
        onUnlock={handleUnlock}
        onResetPassword={handleResetPassword}
        unlocking={unlocking}
      />
    );
  }

  if (view === 'create-password') {
    return (
      <CreatePassword
        password={password}
        onPasswordChange={setPassword}
        confirmPassword={confirmPassword}
        onConfirmPasswordChange={setConfirmPassword}
        showPassword={showPassword}
        onToggleShowPassword={() => setShowPassword((s) => !s)}
        showConfirmPassword={showConfirmPassword}
        onToggleShowConfirmPassword={() => setShowConfirmPassword((s) => !s)}
        error={createError}
        onBack={handleCreateBack}
        onNext={handleCreateNext}
        creating={creating}
      />
    );
  }

  if (view === 'backup-seed' && tempSeed) {
    return (
      <BackupSeed
        seed={tempSeed}
        onBack={handleBackupBack}
        onContinue={handleBackupContinue}
      />
    );
  }

  return (
    <UnlockedDashboard
      address={address}
      onLogout={handleLogout}
    />
  );
}
