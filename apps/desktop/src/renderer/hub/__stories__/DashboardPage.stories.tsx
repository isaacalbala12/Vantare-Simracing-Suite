import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { useProfileStore } from '../../shared/stores/profile-store';
import { useSettingsStore } from '../../shared/stores/settings-store';
import { useAppStore } from '../../shared/stores/app-store';
import { dark, midnight } from '@vantare/ui-core/themes';
import { setupMockVantare } from './mock-vantare';

function DashboardPageWrapper() {
  useEffect(() => {
    useAppStore.setState({ demoMode: false });
  }, []);

  return <DashboardPage />;
}

const meta: Meta<typeof DashboardPage> = {
  title: 'Hub/DashboardPage',
  component: DashboardPage,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="bg-[#0a0a0a] min-h-screen">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
};

export default meta;
type Story = StoryObj<typeof DashboardPage>;

export const Connected: Story = {
  beforeEach: () => {
    setupMockVantare({
      getActiveTheme: () => Promise.resolve(midnight),
      onSimState: (callback: (state: any) => void) => {
        callback({ connected: true, name: 'iRacing' });
        return () => {};
      },
    });
    useProfileStore.setState({
      activeProfile: {
        id: 'profile-1',
        name: 'My Racing Profile',
        createdAt: '2025-01-15T10:00:00Z',
        updatedAt: '2025-06-01T08:30:00Z',
        overlays: {},
        themeId: 'midnight',
      },
    });
    useSettingsStore.setState({
      settings: {
        language: 'en',
        autostart: false,
        minimizeToTray: true,
        startMinimized: false,
        overlayVisibilityKey: 'F9',
        preferredSim: 'auto',
        alertVolume: 0.8,
        alertEnabled: true,
        autoUpdate: true,
        updateChannel: 'stable',
        httpServerPort: 2546,
        networkAccess: true,
      },
      isLoading: false,
      error: null,
    });
  },
};

export const Disconnected: Story = {
  beforeEach: () => {
    setupMockVantare({
      getActiveTheme: () => Promise.resolve(dark),
      onSimState: (callback: (state: any) => void) => {
        callback({ connected: false, name: null });
        return () => {};
      },
    });
    useProfileStore.setState({
      activeProfile: {
        id: 'profile-2',
        name: 'Streaming Setup',
        createdAt: '2025-03-20T14:00:00Z',
        updatedAt: '2025-05-28T16:00:00Z',
        overlays: {},
        themeId: 'dark',
      },
    });
    useSettingsStore.setState({
      settings: {
        language: 'en',
        autostart: false,
        minimizeToTray: true,
        startMinimized: false,
        overlayVisibilityKey: 'F9',
        preferredSim: 'auto',
        alertVolume: 0.8,
        alertEnabled: true,
        autoUpdate: true,
        updateChannel: 'stable',
        httpServerPort: 2546,
        networkAccess: true,
      },
      isLoading: false,
      error: null,
    });
  },
};
