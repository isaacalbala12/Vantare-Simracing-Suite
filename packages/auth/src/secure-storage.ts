import type { SecureStorageAdapter } from './types';

const memory = new Map<string, string>();

export const memorySecureStorage: SecureStorageAdapter = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async remove(key) {
    memory.delete(key);
  },
};

let adapter: SecureStorageAdapter = memorySecureStorage;

export function setSecureStorageAdapter(next: SecureStorageAdapter): void {
  adapter = next;
}

export function getSecureStorageAdapter(): SecureStorageAdapter {
  return adapter;
}

export const secureStorage = {
  get: (key: string) => adapter.get(key),
  set: (key: string, value: string) => adapter.set(key, value),
  remove: (key: string) => adapter.remove(key),
};
