// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HubLayout from '../HubLayout';
import OverlaySettingsPage from '../pages/OverlaySettingsPage';
import ProfilesPage from '../pages/ProfilesPage';
import SettingsPage from '../pages/SettingsPage';
import DashboardPage from '../pages/DashboardPage';
import type { Profile, VantareBridge } from '@vantare/types';
import { useProfileStore } from '../../shared/stores/profile-store';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function createProfile(id: string, name: string, overrides?: Partial<Profile>): Profile {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    overlays: {},
    themeId: '',
    ...overrides,
  };
}

function renderAppAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HubLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="overlays" element={<OverlaySettingsPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Render ProfilesPage standalone (bypasses HubLayout's no-active-profile guard) */
function renderProfilesPage() {
  return render(
    <MemoryRouter initialEntries={['/profiles']}>
      <Routes>
        <Route path="/profiles" element={<ProfilesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockReloadBackend() {
  window.vantare = {
    getProfiles: vi.fn().mockResolvedValue([...storedProfiles]),
    getActiveProfile: vi.fn().mockResolvedValue(storedActiveProfile),
    getSettings: vi.fn().mockResolvedValue({
      language: 'en', autostart: false, minimizeToTray: true,
      startMinimized: false, overlayVisibilityKey: 'ScrollLock',
      preferredSim: 'auto', alertVolume: 0.7, alertEnabled: true,
      autoUpdate: true, updateChannel: 'stable', httpServerPort: 8042,
      networkAccess: false,
    }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getActiveTheme: vi.fn().mockResolvedValue({ id: 'dark', name: 'Dark' }),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    setActiveProfile: vi.fn().mockResolvedValue(undefined),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    exportProfile: vi.fn().mockResolvedValue(JSON.stringify(storedActiveProfile)),
    importProfile: vi.fn().mockResolvedValue(createProfile('imported', 'Imported')),
    getThemes: vi.fn().mockResolvedValue([]),
    onTelemetry: vi.fn().mockReturnValue(vi.fn()),
    onSessionData: vi.fn().mockReturnValue(vi.fn()),
    onSimState: vi.fn().mockReturnValue(vi.fn()),
    getAvailableSims: vi.fn().mockResolvedValue(['iracing']),
    getActiveSim: vi.fn().mockResolvedValue('iracing'),
    setActiveSim: vi.fn().mockResolvedValue(undefined),
    onSimListChanged: vi.fn().mockReturnValue(vi.fn()),
    onRecordingStateChanged: vi.fn().mockReturnValue(vi.fn()),
    login: vi.fn().mockResolvedValue({ success: false, user: null }),
    register: vi.fn().mockResolvedValue({ success: false, user: null }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    getLicenseStatus: vi.fn().mockResolvedValue({ tier: 'free', isValid: true }),
  } as unknown as VantareBridge;
}

let storedProfiles: Profile[] = [];
let storedActiveProfile: Profile | null = null;

function createMockBackend() {
  storedProfiles = [];
  storedActiveProfile = null;

  const mock: Partial<VantareBridge> = {
    getProfiles: vi.fn().mockImplementation(async () => [...storedProfiles]),
    getActiveProfile: vi.fn().mockImplementation(async () => storedActiveProfile),
    saveProfile: vi.fn().mockImplementation(async (profile: Profile) => {
      const idx = storedProfiles.findIndex((p) => p.id === profile.id);
      if (idx >= 0) {
        storedProfiles[idx] = { ...profile, updatedAt: new Date().toISOString() };
      } else {
        storedProfiles.push(profile);
      }
      if (storedActiveProfile?.id === profile.id) {
        storedActiveProfile = { ...profile, updatedAt: new Date().toISOString() };
      }
    }),
    setActiveProfile: vi.fn().mockImplementation(async (id: string) => {
      storedActiveProfile = storedProfiles.find((p) => p.id === id) ?? null;
    }),
    deleteProfile: vi.fn().mockImplementation(async (id: string) => {
      storedProfiles = storedProfiles.filter((p) => p.id !== id);
      if (storedActiveProfile?.id === id) storedActiveProfile = null;
    }),
    exportProfile: vi.fn().mockImplementation(async (id: string) => {
      const profile = storedProfiles.find((p) => p.id === id);
      return JSON.stringify(profile, null, 2);
    }),
    importProfile: vi.fn().mockImplementation(async (json: string) => {
      const profile = JSON.parse(json) as Profile;
      storedProfiles.push(profile);
      return profile;
    }),
    getSettings: vi.fn().mockResolvedValue({
      language: 'en', autostart: false, minimizeToTray: true,
      startMinimized: false, overlayVisibilityKey: 'ScrollLock',
      preferredSim: 'auto', alertVolume: 0.7, alertEnabled: true,
      autoUpdate: true, updateChannel: 'stable', httpServerPort: 8042,
      networkAccess: false,
    }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getActiveTheme: vi.fn().mockResolvedValue({ id: 'dark', name: 'Dark' }),
    getThemes: vi.fn().mockResolvedValue([{ id: 'dark', name: 'Dark' }]),
    onTelemetry: vi.fn().mockReturnValue(vi.fn()),
    onSessionData: vi.fn().mockReturnValue(vi.fn()),
    onSimState: vi.fn().mockReturnValue(vi.fn()),
    getAvailableSims: vi.fn().mockResolvedValue(['iracing']),
    getActiveSim: vi.fn().mockResolvedValue('iracing'),
    setActiveSim: vi.fn().mockResolvedValue(undefined),
    onSimListChanged: vi.fn().mockReturnValue(vi.fn()),
    onRecordingStateChanged: vi.fn().mockReturnValue(vi.fn()),
    login: vi.fn().mockResolvedValue({ success: false, user: null }),
    register: vi.fn().mockResolvedValue({ success: false, user: null }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    getLicenseStatus: vi.fn().mockResolvedValue({ tier: 'free', isValid: true }),
  };

  window.vantare = mock as VantareBridge;
}

// ──────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────

describe('Profile round-trip', () => {
  beforeEach(() => {
    createMockBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('empty state → create profile → overlays → change settings → profiles → export → second profile → activate → persist', async () => {
    // ── 1. EMPTY STATE ─────────────────────────────
    renderAppAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('no-profiles-empty-state')).toBeTruthy();
    });
    expect(screen.getByText('Create profile')).toBeTruthy();

    // HubLayout blocks child routes when no activeProfile,
    // so render at /profiles directly for the next steps.
    cleanup();

    // ── 2. PROFILES PAGE (empty) ───────────────────
    // Render ProfilesPage standalone — HubLayout blocks child routes
    // when no activeProfile exists, so we test the page directly.
    renderProfilesPage();
    await waitFor(() => {
      expect(screen.getByTestId('profile-empty-state')).toBeTruthy();
    });

    // ── 3. CREATE FIRST PROFILE ────────────────────
    fireEvent.click(screen.getByTestId('profile-create'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-create-name')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('profile-create-name'), { target: { value: 'Race Setup' } });

    const createButtons = screen.getAllByRole('button', { name: /^Create$/ });
    await act(async () => {
      fireEvent.click(createButtons[0]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('profile-list')).toBeTruthy();
    });
    const profileCards = screen.getAllByTestId(/^profile-card-/);
    expect(profileCards).toHaveLength(1);
    expect(screen.getByText('Race Setup')).toBeTruthy();

    // ── 4. ACTIVATE FIRST PROFILE ──────────────────
    const profileId1 = storedProfiles[0].id;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`profile-activate-${profileId1}`));
    });
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
    });

    // ── 5. RE-RENDER WITH HUBLAYOUT ─────────────────
    // Now that a profile is active, HubLayout will render <Outlet />
    cleanup();
    renderAppAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-active-profile')).toBeTruthy();
    });

    // ── 6. NAVIGATE TO OVERLAYS ────────────────────
    await act(async () => {
      fireEvent.click(screen.getByTestId('sidebar-overlays'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('overlay-settings-nav')).toBeTruthy();
    });

    // ── 7. CHANGE ROWCOUNT ─────────────────────────
    await waitFor(() => {
      expect(screen.getByTestId('settings-field-rowCount')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('settings-field-rowCount'), { target: { value: '30' } });
    // Two buttons with settings-save: one inside SettingsForm, one in the OverlaySettingsPage footer
    const saveButtons = screen.getAllByTestId('settings-save');
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => {
      const el = screen.getByTestId('settings-confirmation');
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Settings saved');
    });

    // ── 8. NAVIGATE BACK TO PROFILES ───────────────
    await act(async () => {
      fireEvent.click(screen.getByTestId('sidebar-profiles'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('profile-list')).toBeTruthy();
    });

    // ── 9. EXPORT FIRST PROFILE ────────────────────
    await act(async () => {
      fireEvent.click(screen.getByTestId(`profile-export-${profileId1}`));
    });
    await waitFor(() => {
      expect(screen.getByTestId('profile-export-content')).toBeTruthy();
    });
    const exportedJson = JSON.parse(
      (screen.getByTestId('profile-export-content') as HTMLTextAreaElement).value,
    );
    expect(exportedJson.name).toBe('Race Setup');
    expect(exportedJson.id).toBe(profileId1);

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('profile-export-content')).toBeNull();
    });

    // ── 10. CREATE SECOND PROFILE ──────────────────
    fireEvent.click(screen.getByTestId('profile-create'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-create-name')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('profile-create-name'), { target: { value: 'Quali Setup' } });
    const createButtons2 = screen.getAllByRole('button', { name: /^Create$/ });
    // Last Create button is the form submit (first is the top-right toggle)
    await act(async () => {
      fireEvent.click(createButtons2[createButtons2.length - 1]);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId(/^profile-card-/)).toHaveLength(2);
    });
    expect(screen.getByText('Quali Setup')).toBeTruthy();

    // ── 11. ACTIVATE SECOND PROFILE ────────────────
    const profileId2 = storedProfiles.find((p) => p.name === 'Quali Setup')!.id;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`profile-activate-${profileId2}`));
    });
    await waitFor(() => {
      expect(screen.getAllByText('Active')).toHaveLength(1);
    });

    // ── 12. VERIFY PERSISTENCE ON RELOAD ───────────
    cleanup();
    vi.restoreAllMocks();

    mockReloadBackend();
    // Seed store with persisted data so HubLayout shows Dashboard immediately
    useProfileStore.setState({
      profiles: [...storedProfiles],
      activeProfile: storedActiveProfile,
      isLoading: false,
      error: null,
    });

    renderAppAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-active-profile')).toBeTruthy();
    });
    expect(screen.getByText('Quali Setup')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('sidebar-overlays'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('overlay-settings-form')).toBeTruthy();
    });
  });

  it('persists overlay config (rowCount) through the profile round-trip', async () => {
    // Flat overlay config matching how the overlay-config-store saves data
    const profile = createProfile('p1', 'Test Profile', {
      overlays: { standings: { rowCount: 25 } },
    });
    storedProfiles = [profile];
    storedActiveProfile = profile;

    useProfileStore.setState({
      profiles: [profile],
      activeProfile: profile,
      isLoading: false,
      error: null,
    });

    (window.vantare.getProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([...storedProfiles]);
    (window.vantare.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(storedActiveProfile);
    (window.vantare.saveProfile as ReturnType<typeof vi.fn>).mockImplementation(
      async (updated: Profile) => {
        storedActiveProfile = { ...updated };
        const idx = storedProfiles.findIndex((p) => p.id === updated.id);
        if (idx >= 0) storedProfiles[idx] = { ...updated };
        else storedProfiles.push({ ...updated });
      },
    );

    renderAppAt('/overlays');

    await waitFor(() => {
      expect(screen.getByTestId('settings-field-rowCount')).toBeTruthy();
    });

    const initialInput = screen.getByTestId('settings-field-rowCount') as HTMLInputElement;
    expect(initialInput.value).toBe('25');

    fireEvent.change(initialInput, { target: { value: '30' } });
    const saveBtns = screen.getAllByTestId('settings-save');
    fireEvent.click(saveBtns[saveBtns.length - 1]);
    await waitFor(() => {
      const el = screen.getByTestId('settings-confirmation');
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Settings saved');
    });

    const persistedProfile = { ...storedActiveProfile! };

    // ── Simulate reload ──
    cleanup();
    vi.restoreAllMocks();

    storedProfiles = [persistedProfile];
    storedActiveProfile = persistedProfile;

    useProfileStore.setState({ profiles: [], activeProfile: null, isLoading: true, error: null });

    window.vantare = {
      getProfiles: vi.fn().mockResolvedValue([...storedProfiles]),
      getActiveProfile: vi.fn().mockResolvedValue(storedActiveProfile),
      getSettings: vi.fn().mockResolvedValue({
        language: 'en', autostart: false, minimizeToTray: true,
        startMinimized: false, overlayVisibilityKey: 'ScrollLock',
        preferredSim: 'auto', alertVolume: 0.7, alertEnabled: true,
        autoUpdate: true, updateChannel: 'stable', httpServerPort: 8042,
        networkAccess: false,
      }),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      getActiveTheme: vi.fn().mockResolvedValue({ id: 'dark', name: 'Dark' }),
      saveProfile: vi.fn().mockResolvedValue(undefined),
      setActiveProfile: vi.fn().mockResolvedValue(undefined),
      deleteProfile: vi.fn().mockResolvedValue(undefined),
      exportProfile: vi.fn().mockResolvedValue(JSON.stringify(storedActiveProfile)),
      importProfile: vi.fn().mockResolvedValue(profile),
      getThemes: vi.fn().mockResolvedValue([]),
      onTelemetry: vi.fn().mockReturnValue(vi.fn()),
      onSessionData: vi.fn().mockReturnValue(vi.fn()),
      onSimState: vi.fn().mockReturnValue(vi.fn()),
      getAvailableSims: vi.fn().mockResolvedValue(['iracing']),
      getActiveSim: vi.fn().mockResolvedValue('iracing'),
      setActiveSim: vi.fn().mockResolvedValue(undefined),
      onSimListChanged: vi.fn().mockReturnValue(vi.fn()),
      onRecordingStateChanged: vi.fn().mockReturnValue(vi.fn()),
      login: vi.fn().mockResolvedValue({ success: false, user: null }),
      register: vi.fn().mockResolvedValue({ success: false, user: null }),
      logout: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      getLicenseStatus: vi.fn().mockResolvedValue({ tier: 'free', isValid: true }),
    } as unknown as VantareBridge;

    useProfileStore.setState({
      profiles: storedProfiles,
      activeProfile: storedActiveProfile,
      isLoading: false,
      error: null,
    });

    renderAppAt('/overlays');

    await waitFor(() => {
      expect(screen.getByTestId('settings-field-rowCount')).toBeTruthy();
    });

    const reloadedInput = screen.getByTestId('settings-field-rowCount') as HTMLInputElement;
    expect(reloadedInput.value).toBe('30');
  });
});
