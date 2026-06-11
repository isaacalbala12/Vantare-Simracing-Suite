import { create } from 'zustand';
import type { Profile } from '@vantare/types';

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  isLoading: boolean;
  error: string | null;
  loadProfiles: () => Promise<void>;
  setActiveProfile: (id: string) => Promise<void>;
  createProfile: (name: string) => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  importProfile: (data: string) => Promise<Profile>;
  exportProfile: (id: string) => Promise<string>;
}

const reload = async (set: (partial: Partial<ProfileState>) => void) => {
  const [profiles, activeProfile] = await Promise.all([
    window.vantare.getProfiles(),
    window.vantare.getActiveProfile(),
  ]);
  set({ profiles, activeProfile });
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: false,
  error: null,

  loadProfiles: async () => {
    try {
      set({ isLoading: true, error: null });
      await reload(set);
      set({ isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profiles';
      set({ error: message, isLoading: false });
    }
  },

  setActiveProfile: async (id) => {
    try {
      set({ error: null });
      await window.vantare.setActiveProfile(id);
      const activeProfile = await window.vantare.getActiveProfile();
      set({ activeProfile });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set active profile';
      set({ error: message });
    }
  },

  createProfile: async (name) => {
    try {
      set({ error: null });
      const profile: Profile = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        overlays: {},
        themeId: '',
      };
      await window.vantare.saveProfile(profile);
      await window.vantare.setActiveProfile(profile.id);
      await reload(set);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create profile';
      set({ error: message });
    }
  },

  saveProfile: async (profile) => {
    try {
      set({ error: null });
      await window.vantare.saveProfile(profile);
      await reload(set);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      set({ error: message });
    }
  },

  deleteProfile: async (id) => {
    try {
      set({ error: null });
      await window.vantare.deleteProfile(id);
      await reload(set);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete profile';
      set({ error: message });
    }
  },

  importProfile: async (data) => {
    try {
      set({ error: null });
      const profile = await window.vantare.importProfile(data);
      await reload(set);
      return profile;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import profile';
      set({ error: message });
      throw new Error(message);
    }
  },

  exportProfile: async (id) => {
    try {
      set({ error: null });
      return await window.vantare.exportProfile(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export profile';
      set({ error: message });
      throw new Error(message);
    }
  },
}));
