import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { setupMockVantare } from './mock-vantare';
import { ThemeProvider } from '@vantare/ui-core/themes';

const meta: Meta<typeof DashboardPage> = {
  title: 'Hub/DashboardPage',
  component: DashboardPage,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <MemoryRouter>
          <div className="w-screen h-screen bg-[var(--color-surface)]">
            <Story />
          </div>
        </MemoryRouter>
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof DashboardPage>;

export const Default: Story = {
  name: 'Dashboard',
  parameters: {
    docs: {
      description: {
        story: 'Dashboard principal con 5 paneles glassmorphism en layout asimetrico. Muestra SIM Status, Overlays, Themes, Account y Settings con animaciones de entrada.',
      },
    },
  },
  beforeEach: () => {
    setupMockVantare();
  },
};

export const ConnectedSim: Story = {
  name: 'Connected Sim',
  parameters: {
    docs: {
      description: {
        story: 'Dashboard con simulador conectado. El panel SIM Status muestra "LIVE" con el nombre del simulador.',
      },
    },
  },
  beforeEach: () => {
    setupMockVantare({
      getOverlayWindows: () => Promise.resolve([{ id: 'standings' }, { id: 'relative' }]),
      getThemes: () => Promise.resolve([]),
    });
  },
};

export const LoggedIn: Story = {
  name: 'Logged In',
  parameters: {
    docs: {
      description: {
        story: 'Dashboard con usuario autenticado. El panel Account muestra email, plan y estado de licencia.',
      },
    },
  },
  beforeEach: () => {
    setupMockVantare({
      getSession: () => Promise.resolve({
        id: 'user_123',
        email: 'driver@example.com',
        tier: 'pro',
      }),
      getLicenseStatus: () => Promise.resolve({
        tier: 'pro',
        active: true,
        isValid: true,
      }),
    });
  },
};

export const AllOverlaysActive: Story = {
  name: 'All Overlays Active',
  parameters: {
    docs: {
      description: {
        story: 'Dashboard con todos los overlays abiertos. El panel Overlays muestra "X / X active" y "Open All" esta deshabilitado.',
      },
    },
  },
  beforeEach: () => {
    setupMockVantare({
      getActiveProfile: () => Promise.resolve({
        id: 'profile_1',
        name: 'Default',
        overlays: { standings: {}, relative: {}, delta: {}, alerts: {} },
      }),
      getOverlayWindows: () => Promise.resolve([{ id: 'standings' }, { id: 'relative' }, { id: 'delta' }, { id: 'alerts' }]),
    });
  },
};
