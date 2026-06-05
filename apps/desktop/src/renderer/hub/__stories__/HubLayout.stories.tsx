import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HubLayout from '../HubLayout';
import { useProfileStore } from '../../shared/stores/profile-store';
import { dark } from '@vantare/ui-core/themes';
import { setupMockVantare } from './mock-vantare';

/**
 * Placeholder component rendered inside <Outlet /> so HubLayout's content
 * area has visible output in the story.
 */
function PlaceholderPage() {
  return (
    <div className="flex items-center justify-center h-full text-white/30 text-sm">
      Select a nav item to see the corresponding page
    </div>
  );
}

const meta: Meta<typeof HubLayout> = {
  title: 'Hub/HubLayout',
  component: HubLayout,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Story />}>
            <Route index element={<PlaceholderPage />} />
            <Route path="overlays" element={<PlaceholderPage />} />
            <Route path="profiles" element={<PlaceholderPage />} />
            <Route path="settings" element={<PlaceholderPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
};

export default meta;
type Story = StoryObj<typeof HubLayout>;

export const WithActiveProfile: Story = {
  beforeEach: () => {
    setupMockVantare({
      getActiveTheme: () => Promise.resolve(dark),
    });
    useProfileStore.setState({
      activeProfile: {
        id: 'profile-1',
        name: 'My Racing Profile',
        createdAt: '2025-01-15T10:00:00Z',
        updatedAt: '2025-06-01T08:30:00Z',
        overlays: {},
        themeId: 'dark',
      },
      profiles: [
        {
          id: 'profile-1',
          name: 'My Racing Profile',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-06-01T08:30:00Z',
          overlays: {},
          themeId: 'dark',
        },
        {
          id: 'profile-2',
          name: 'Streaming Setup',
          createdAt: '2025-03-20T14:00:00Z',
          updatedAt: '2025-05-28T16:00:00Z',
          overlays: {},
          themeId: 'blood',
        },
      ],
    });
  },
};

export const DashboardActive: Story = {
  ...WithActiveProfile,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Story />}>
            <Route index element={<PlaceholderPage />} />
            <Route path="overlays" element={<PlaceholderPage />} />
            <Route path="profiles" element={<PlaceholderPage />} />
            <Route path="settings" element={<PlaceholderPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    ),
  ],
  parameters: {
    ...WithActiveProfile.parameters,
    reactRouter: { initialEntries: ['/'] },
  },
};
