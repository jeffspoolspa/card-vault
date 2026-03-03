import { useState, useEffect, useCallback, useRef } from 'react';
import { decryptPrivateKey, IDLE_TIMEOUT_MINUTES } from '@card-vault/shared';
import { supabase } from '../lib/supabase';

interface VaultSession {
  privateKey: CryptoKey | null;
  masterPassword: string | null;
  isUnlocked: boolean;
  unlocking: boolean;
  error: string | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
}

export function useVaultSession(): VaultSession {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    setPrivateKey(null);
    setMasterPassword(null);
    setError(null);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(lock, IDLE_TIMEOUT_MINUTES * 60 * 1000);
  }, [lock]);

  // Activity listeners for idle timeout
  useEffect(() => {
    if (!privateKey) return;

    resetIdleTimer();

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [privateKey, resetIdleTimer]);

  async function unlock(password: string): Promise<boolean> {
    setUnlocking(true);
    setError(null);

    try {
      // Fetch vault config
      const { data, error: fetchError } = await supabase
        .from('vault_config')
        .select('*')
        .limit(1)
        .single();

      if (fetchError || !data) {
        setError('Failed to fetch vault configuration');
        return false;
      }

      // Decrypt RSA private key with master password
      const key = await decryptPrivateKey(
        password,
        data.rsa_private_key_encrypted,
        data.rsa_private_key_iv,
        data.rsa_private_key_salt,
        data.pbkdf2_iterations,
      );

      setPrivateKey(key);
      setMasterPassword(password);
      return true;
    } catch {
      setError('Incorrect vault password');
      return false;
    } finally {
      setUnlocking(false);
    }
  }

  return {
    privateKey,
    masterPassword,
    isUnlocked: privateKey !== null,
    unlocking,
    error,
    unlock,
    lock,
  };
}
