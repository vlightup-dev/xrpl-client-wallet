import { useState, useCallback, useEffect } from 'react';
import { Wallet } from 'xrpl';
import { getMultisigOrgAccount } from './multisigStorage';
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
  RegisterSbtPage,
  SendTokenPage,
  PendingReleasesPage,
  MultisigConfigPage,
  ChevronLeftIcon,
} from './components';

const MIN_PASSWORD_LENGTH = 8;

type View = 'home' | 'create-password' | 'backup-seed' | 'unlocked' | 'register-sbt' | 'send-token' | 'pending-releases' | 'multisig-config';

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

  // Unlocked: XRPL wallet (address and wallet for signing, e.g. MPTokenAuthorize)
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<InstanceType<typeof Wallet> | null>(null);
  const [orgAccount, setOrgAccount] = useState<string | null>(null);

  // Temporary seed storage for backup display (cleared after user confirms backup)
  const [tempSeed, setTempSeed] = useState<string | null>(null);

  // Load org account when wallet exists and when entering unlocked/send/pending so dashboard can fetch pending immediately after login
  useEffect(() => {
    if (walletExists) {
      getMultisigOrgAccount().then(setOrgAccount);
    } else {
      setOrgAccount(null);
    }
  }, [walletExists, view]);

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
      const newWallet = Wallet.generate();
      await setWalletCreated(password, newWallet.seed!, newWallet.address);
      setWalletExists(true);
      setAddress(newWallet.address);
      setTempSeed(newWallet.seed!);
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
    if (tempSeed) {
      const w = Wallet.fromSeed(tempSeed);
      setWallet(w);
      setAddress(w.address);
    }
    setTempSeed(null); // Clear seed from memory after user confirms backup
    setView('unlocked');
  }, [tempSeed]);

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
      const w = Wallet.fromSeed(seed);
      setWallet(w);
      setAddress(w.address);
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
    setWallet(null);
    setUnlockPassword('');
    setUnlockError(null);
    setView('home');
  }, []);

  const handleLogout = useCallback(() => {
    setView('home');
    setAddress(null);
    setWallet(null);
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

  if (view === 'register-sbt' && address) {
    return (
      <RegisterSbtPage
        address={address}
        onBack={() => setView('unlocked')}
      />
    );
  }

  if (view === 'send-token' && address) {
    return (
      <SendTokenPage
        address={address}
        wallet={wallet}
        onBack={() => setView('unlocked')}
        orgAccount={orgAccount}
      />
    );
  }

  if (view === 'pending-releases' && wallet) {
    if (orgAccount) {
      return (
        <PendingReleasesPage
          orgAccount={orgAccount}
          wallet={wallet}
          onBack={() => setView('unlocked')}
        />
      );
    }
    return (
      <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
        <header className="flex items-center justify-between pb-2 border-b border-gray-700">
          <button type="button" onClick={() => setView('unlocked')} className="p-1 rounded text-gray-400 hover:text-white">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">Pending releases</h1>
          <span className="w-8" />
        </header>
        <p className="text-sm text-gray-400">Configure multi-sig first to see pending releases.</p>
      </div>
    );
  }

  if (view === 'multisig-config' && address && wallet) {
    return (
      <MultisigConfigPage
        address={address}
        wallet={wallet}
        onBack={() => setView('unlocked')}
        onSaved={() => getMultisigOrgAccount().then(setOrgAccount)}
      />
    );
  }

  return (
    <UnlockedDashboard
      address={address}
      wallet={wallet}
      onLogout={handleLogout}
      onRegisterSbt={() => setView('register-sbt')}
      onSendPayment={() => setView('send-token')}
      onPendingReleases={() => setView('pending-releases')}
      onConfigureMultisig={() => setView('multisig-config')}
      orgAccount={orgAccount}
    />
  );
}
