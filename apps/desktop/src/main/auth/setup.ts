import path from 'node:path';
import { app, safeStorage } from 'electron';
import { config } from 'dotenv';
import {
  AuthService,
  setSecureStorageAdapter,
  setMachineIdProvider,
  type LicenseCacheStore,
} from '@vantare/auth';

export function loadEnv(): void {
  config({ path: path.resolve(process.cwd(), '.env') });
  config({ path: path.resolve(process.cwd(), '../../.env') });
}

export function setupSecureStorage(): void {
  setSecureStorageAdapter({
    async get(key) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encoded = await import('node:fs/promises')
        .then((fs) => fs.readFile(storagePath(key), 'utf8'))
        .catch(() => null);
      if (!encoded) return null;
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    },
    async set(key, value) {
      if (!safeStorage.isEncryptionAvailable()) return;
      const encrypted = safeStorage.encryptString(value).toString('base64');
      const fs = await import('node:fs/promises');
      await fs.mkdir(storageDir(), { recursive: true });
      await fs.writeFile(storagePath(key), encrypted, 'utf8');
    },
    async remove(key) {
      const fs = await import('node:fs/promises');
      await fs.rm(storagePath(key), { force: true });
    },
  });
}

export function setupMachineId(): void {
  setMachineIdProvider(async () => {
    const { machineIdSync } = await import('machine-id');
    return machineIdSync(true);
  });
}

export function setupAuth(licenseCacheStore: LicenseCacheStore): void {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    AuthService.enableMockMode();
    return;
  }

  AuthService.configure({
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    licenseCacheStore,
    mock: false,
  });
}

function storageDir(): string {
  return path.join(app.getPath('userData'), 'secure-storage');
}

function storagePath(key: string): string {
  return path.join(storageDir(), `${key}.bin`);
}
