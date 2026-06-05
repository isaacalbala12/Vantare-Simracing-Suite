import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Feature } from '@vantare/auth';
import { useTelemetryStore } from '@vantare/ui-core';
import { useAppStore } from '../../stores/app-store';
import { useAuthStore } from '../../stores/auth-store';
import { useLicense } from '../useLicense';

describe('useLicense', () => {
  beforeEach(() => {
    useAppStore.setState({ demoMode: false });
    useTelemetryStore.setState({ isMock: false });
    useAuthStore.setState({
      user: { id: '1', email: 'free@test.com', tier: 'free' },
      license: { tier: 'free', isValid: true },
      isLoading: false,
      error: null,
    });
  });

  it('denies pro sims on free tier', () => {
    const { result } = renderHook(() => useLicense());
    expect(result.current.canAccess(Feature.LMU)).toBe(false);
    expect(result.current.canAccess(Feature.IRACING)).toBe(true);
  });

  it('bypasses gating in demo mode', () => {
    useAppStore.setState({ demoMode: true });
    const { result } = renderHook(() => useLicense());
    expect(result.current.canAccess(Feature.LMU)).toBe(true);
  });
});
