import { createHash } from 'node:crypto';

let machineIdProvider: () => Promise<string> = async () => 'mock-machine-id';

export function setMachineIdProvider(provider: () => Promise<string>): void {
  machineIdProvider = provider;
}

export async function getHardwareId(): Promise<string> {
  const machineId = await machineIdProvider();
  return createHash('sha256').update(machineId).digest('hex');
}
