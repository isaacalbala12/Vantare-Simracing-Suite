import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../index.ts';

describe('AuthService', () => {
  beforeEach(async () => {
    AuthService.enableMockMode();
    await AuthService.logout();
  });

  it('register creates user, login succeeds with correct credentials', async () => {
    const registerResult = await AuthService.register('alice1@test.com', 'secret123');
    expect(registerResult.success).toBe(true);
    expect(registerResult.user).not.toBeNull();
    expect(registerResult.user!.email).toBe('alice1@test.com');

    await AuthService.logout();

    const loginResult = await AuthService.login('alice1@test.com', 'secret123');
    expect(loginResult.success).toBe(true);
    expect(loginResult.user).not.toBeNull();
    expect(loginResult.user!.email).toBe('alice1@test.com');
  });

  it('login fails with wrong password', async () => {
    await AuthService.register('bob1@test.com', 'correct-password');
    await AuthService.logout();

    const result = await AuthService.login('bob1@test.com', 'wrong-password');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email or password');
    expect(result.user).toBeNull();
  });

  it('getSession returns null before login, user after register', async () => {
    const beforeLogin = await AuthService.getSession();
    expect(beforeLogin).toBeNull();

    await AuthService.register('charlie1@test.com', 'password');
    const afterRegister = await AuthService.getSession();
    expect(afterRegister).not.toBeNull();
    expect(afterRegister!.email).toBe('charlie1@test.com');
  });

  it('getLicenseStatus returns free for free-tier users', async () => {
    await AuthService.register('dave1@test.com', 'password', 'free');
    const license = await AuthService.getLicenseStatus();
    expect(license.tier).toBe('free');
    expect(license.isValid).toBe(true);
  });

  it('canAccess(\"pro-features\") returns false for free tier', async () => {
    await AuthService.register('eve1@test.com', 'password', 'free');
    expect(AuthService.canAccess('pro-features')).toBe(false);
  });

  it('canAccess(\"pro-features\") returns true for pro tier', async () => {
    await AuthService.register('frank1@test.com', 'password', 'pro');
    expect(AuthService.canAccess('pro-features')).toBe(true);
  });

  it('logout clears session', async () => {
    await AuthService.register('grace1@test.com', 'password');
    expect(await AuthService.getSession()).not.toBeNull();

    await AuthService.logout();
    expect(await AuthService.getSession()).toBeNull();
  });
});