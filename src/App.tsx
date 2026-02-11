import { useState, useEffect, useCallback } from 'react';
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
import { isCrossmarkInstalled } from './crossmark';
import { checkCrossmarkViaContentScript, connectCrossmarkViaContentScript } from './crossmarkBridge';
import { saveCrossmarkWallet, getCrossmarkWallet, clearCrossmarkWallet } from './crossmarkStorage';

const MIN_PASSWORD_LENGTH = 8;

type View = 'home' | 'create-password' | 'backup-seed' | 'get-faucet' | 'unlocked' | 'register-sbt' | 'send-token' | 'pending-releases' | 'multisig-config';

// Crossmark types are defined in crossmark.ts

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
  
  // Crossmark wallet state
  const [isCrossmarkWallet, setIsCrossmarkWallet] = useState(false);
  const [crossmarkInstalled, setCrossmarkInstalled] = useState(false);

  // Temporary seed storage for backup display (cleared after user confirms backup)
  const [tempSeed, setTempSeed] = useState<string | null>(null);

  // Check for Crossmark installation via content script when running as extension
  useEffect(() => {
    const checkCrossmark = async () => {
      // Check if running in extension context
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
      
      if (isExtension) {
        // Use content script to check Crossmark on the active tab
        const installed = await checkCrossmarkViaContentScript();
        console.log('Crossmark check via content script:', installed);
        setCrossmarkInstalled(installed);
      } else {
        // Running as web app - direct check
        const installed = isCrossmarkInstalled();
        console.log('Crossmark check (web app):', installed);
        setCrossmarkInstalled(installed);
      }
    };
    
    // Check immediately
    checkCrossmark();
    
    // Retry after delays to catch async injection
    const timers = [
      setTimeout(checkCrossmark, 100),
      setTimeout(checkCrossmark, 500),
      setTimeout(checkCrossmark, 1000),
      setTimeout(checkCrossmark, 2000),
    ];
    
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (walletExists) {
      getMultisigAccount().then(setMultisigAccount);
    } else {
      setMultisigAccount(null);
    }
  }, [walletExists, view]);

  useEffect(() => {
    // Check wallet and Crossmark connection on mount
    getWalletExists().then((exists) => {
      setWalletExists(exists);
      if (exists) setView('home');
    });
    
    // Check for saved Crossmark connection
    getCrossmarkWallet().then((savedAddress) => {
      if (savedAddress) {
        console.log('Restored Crossmark wallet:', savedAddress);
        setAddress(savedAddress);
        setIsCrossmarkWallet(true);
        setView('unlocked');
      }
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
      setSignerWallet(
        signer1Creds ? new Wallet(signer1Creds.publicKey, signer1Creds.privateKey) : null
      );
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
    await persistMultisigAccount(null);
    await clearMultisigSigner1();
    setWalletExists(false);
    setAddress(null);
    setWallet(null);
    setSignerWallet(null);
    setMultisigAccount(null);
    setUnlockPassword('');
    setUnlockError(null);
    setView('home');
  }, []);

  const handleLogout = useCallback(async () => {
    setView('home');
    setAddress(null);
    setWallet(null);
    setSignerWallet(null);
    setIsCrossmarkWallet(false);
    // Clear Crossmark connection
    await clearCrossmarkWallet();
  }, []);

  const onImportWallet = useCallback(() => {
    // TODO: implement import flow
  }, []);

  const handleConnectCrossmark = useCallback(async () => {
    try {
      // Check if running in extension context
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
      
      if (isExtension) {
        // Use content script bridge
        const result = await connectCrossmarkViaContentScript();
        
        if (result.success && result.address) {
          setAddress(result.address);
          setIsCrossmarkWallet(true);
          setView('unlocked');
          // Save Crossmark connection
          await saveCrossmarkWallet(result.address);
          console.log('Connected to Crossmark via content script:', result.address);
        } else {
          alert(result.error || 'Failed to connect to Crossmark wallet');
        }
      } else {
        // Running as web app - direct Crossmark access
        if (!window.crossmark) {
          alert('Crossmark extension not found. Please install it from crossmark.io');
          return;
        }

        const result = await window.crossmark.getAddress();
        
        if (result?.address) {
          setAddress(result.address);
          setIsCrossmarkWallet(true);
          setView('unlocked');
          // Save Crossmark connection
          await saveCrossmarkWallet(result.address);
          console.log('Connected to Crossmark:', result.address);
        } else {
          alert('Failed to connect to Crossmark wallet');
        }
      }
    } catch (error) {
      console.error('Crossmark connection error:', error);
      alert('Error connecting to Crossmark: ' + (error instanceof Error ? error.message : String(error)));
    }
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
        onConnectCrossmark={handleConnectCrossmark}
        isCrossmarkInstalled={crossmarkInstalled}
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
      isCrossmarkWallet={isCrossmarkWallet}
    />
  );
}
