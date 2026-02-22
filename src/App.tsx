import { useState, useCallback, useEffect } from 'react';
import { Wallet } from 'xrpl';
import {
  getMultisigAccount,
  getMultisigSigner1Credentials,
  setMultisigAccount as persistMultisigAccount,
  clearMultisigSigner1,
} from './multisigStorage';
import {
  getWalletExists,
  setWalletCreated,
  getDecryptedCredentials,
  clearWallet,
} from './walletStorage';
import {
  getWalletSession,
  setWalletSession,
  clearWalletSession,
  getSessionExpiresAt,
} from './sessionStorage';
import {
  HomeNoWallet,
  HomeUnlock,
  CreatePassword,
  BackupSeed,
  GetFaucetPage,
  UnlockedDashboard,
  RegisterSbtPage,
  SendTokenPage,
  PendingReleasesPage,
  MultisigConfigPage,
} from './components';

const MIN_PASSWORD_LENGTH = 8;

type View = 'home' | 'create-password' | 'backup-seed' | 'get-faucet' | 'unlocked' | 'register-sbt' | 'send-token' | 'pending-releases' | 'multisig-config';

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
  const [multisigAccount, setMultisigAccount] = useState<string | null>(null);
  /** First signer wallet for escrow when main account is multisig (decrypted on unlock if stored). */
  const [signerWallet, setSignerWallet] = useState<InstanceType<typeof Wallet> | null>(null);

  /** When set, we have a 30-min session; logout and clear session when this time is reached. */
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  // Temporary seed storage for backup display (cleared after user confirms backup)
  const [tempSeed, setTempSeed] = useState<string | null>(null);

  useEffect(() => {
    if (walletExists) {
      getMultisigAccount().then(setMultisigAccount);
    } else {
      setMultisigAccount(null);
    }
  }, [walletExists, view]);

  // On load: restore from session if "keep logged in" was used and session still valid
  useEffect(() => {
    getWalletExists().then(async (exists) => {
      setWalletExists(exists);
      if (!exists) {
        setView('home');
        return;
      }
      const session = await getWalletSession();
      if (session) {
        const w = new Wallet(session.publicKey, session.privateKey);
        setWallet(w);
        setAddress(w.address);
        setSignerWallet(
          session.signer1
            ? new Wallet(session.signer1.publicKey, session.signer1.privateKey)
            : null
        );
        setSessionExpiresAt(session.expiresAt);
        setView('unlocked');
      } else {
        setView('home');
      }
    });
  }, []);

  // When unlocked with a session, logout and clear session after 30 minutes
  useEffect(() => {
    if (view !== 'unlocked' || sessionExpiresAt == null || sessionExpiresAt <= Date.now()) return;
    const ms = sessionExpiresAt - Date.now();
    const timeout = setTimeout(() => {
      clearWalletSession();
      setView('home');
      setAddress(null);
      setWallet(null);
      setSignerWallet(null);
      setSessionExpiresAt(null);
    }, ms);
    return () => clearTimeout(timeout);
  }, [view, sessionExpiresAt]);

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
      await setWalletCreated(password, newWallet.publicKey, newWallet.privateKey, newWallet.address);
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
    setView('get-faucet');
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
      const creds = await getDecryptedCredentials(unlockPassword);
      if (!creds) {
        setUnlockError('Incorrect password');
        return;
      }
      const w = new Wallet(creds.publicKey, creds.privateKey);
      setWallet(w);
      setAddress(w.address);
      const signer1Creds = await getMultisigSigner1Credentials(unlockPassword);
      const signer = signer1Creds
        ? new Wallet(signer1Creds.publicKey, signer1Creds.privateKey)
        : null;
      setSignerWallet(signer);
      if (keepLoggedIn) {
        await setWalletSession(
          w.address,
          creds.publicKey,
          creds.privateKey,
          signer1Creds
            ? { publicKey: signer1Creds.publicKey, privateKey: signer1Creds.privateKey }
            : undefined
        );
        setSessionExpiresAt(getSessionExpiresAt());
      }
      setUnlockPassword('');
      setView('unlocked');
    } catch {
      setUnlockError('Incorrect password');
    } finally {
      setUnlocking(false);
    }
  }, [unlockPassword, keepLoggedIn]);

  const handleResetPassword = useCallback(async () => {
    if (
      !window.confirm(
        'This will remove your wallet. You will need to create a new one. Continue?'
      )
    )
      return;
    await clearWalletSession();
    await clearWallet();
    await persistMultisigAccount(null);
    await clearMultisigSigner1();
    setWalletExists(false);
    setAddress(null);
    setWallet(null);
    setSignerWallet(null);
    setMultisigAccount(null);
    setSessionExpiresAt(null);
    setUnlockPassword('');
    setUnlockError(null);
    setView('home');
  }, []);

  const handleLogout = useCallback(async () => {
    await clearWalletSession();
    setSessionExpiresAt(null);
    setView('home');
    setAddress(null);
    setWallet(null);
    setSignerWallet(null);
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

  if (view === 'get-faucet' && address) {
    return (
      <GetFaucetPage
        address={address}
        wallet={wallet}
        onContinue={() => setView('register-sbt')}
      />
    );
  }

  if (view === 'register-sbt' && address) {
    return (
      <RegisterSbtPage
        address={address}
        onBack={() => setView('unlocked')}
        onSuccess={() => setView('unlocked')}
      />
    );
  }

  if (view === 'send-token' && address) {
    return (
      <SendTokenPage
        address={address}
        wallet={wallet}
        onBack={() => setView('unlocked')}
        multisigAccount={multisigAccount}
        signerWallet={signerWallet}
      />
    );
  }

  if (view === 'pending-releases' && wallet) {
    return (
      <PendingReleasesPage
        wallet={wallet}
        onBack={() => setView('unlocked')}
      />
    );
  }

  if (view === 'multisig-config' && address && wallet) {
    return (
      <MultisigConfigPage
        address={address}
        wallet={wallet}
        onBack={() => setView('unlocked')}
        onSaved={() => getMultisigAccount().then(setMultisigAccount)}
        onSigner1Saved={setSignerWallet}
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
    />
  );
}
