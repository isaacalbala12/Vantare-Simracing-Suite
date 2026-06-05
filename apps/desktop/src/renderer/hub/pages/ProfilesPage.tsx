import { useEffect, useState } from 'react';
import { useProfileStore } from '../../shared/stores/profile-store';
import type { Profile } from '@vantare/types';

export default function ProfilesPage() {
  const {
    profiles,
    activeProfile,
    isLoading,
    loadProfiles,
    setActiveProfile,
    createProfile,
    deleteProfile,
    importProfile,
    exportProfile,
  } = useProfileStore();

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');

  // Import form state
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Edit name state (tracking per profile id)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Export modal state
  const [exportData, setExportData] = useState<string | null>(null);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // --- Handlers ---

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createProfile(trimmed);
    setNewName('');
    setShowCreateForm(false);
  };

  const handleStartEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setEditName(profile.name);
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    // Use saveProfile to persist the name change
    const store = useProfileStore.getState();
    const profile = store.profiles.find((p) => p.id === id);
    if (profile) {
      await store.saveProfile({ ...profile, name: trimmed });
    }
    setEditingId(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleExport = async (id: string) => {
    try {
      const json = await exportProfile(id);
      setExportData(json);
    } catch {
      // error handled by store
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    await deleteProfile(id);
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      JSON.parse(importJson);
    } catch {
      setImportError('Invalid JSON format. Please check your input.');
      return;
    }
    try {
      await importProfile(importJson);
      setImportJson('');
      setShowImport(false);
    } catch {
      // error handled by store
    }
  };

  // --- Empty State ---

  if (!isLoading && profiles.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Profiles</h1>
        <div
          data-testid="profile-empty-state"
          className="flex flex-col items-center justify-center py-16"
        >
          <div className="glass-panel p-8 max-w-md text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-glass)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">No Profiles Yet</h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              Create your first profile to configure overlays, themes, and alerts.
              Profiles let you quickly switch between different setups.
            </p>
            <button
              data-testid="profile-create"
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              Create profile
            </button>
          </div>
        </div>

        {/* Create form (empty state) */}
        {showCreateForm && (
          <div className="glass-panel p-4 max-w-md mx-auto space-y-3">
            <label className="block text-sm font-medium text-[var(--color-text-muted)]">Profile Name</label>
            <input
              data-testid="profile-create-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="My Profile"
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-glass)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Profiles</h1>
        <div className="flex gap-2">
          <button
            data-testid="profile-create"
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Create
          </button>
          <button
            data-testid="profile-import-btn"
            onClick={() => setShowImport(true)}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] transition-colors"
          >
            Import
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="glass-panel p-4 space-y-3">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">Profile Name</label>
          <input
            data-testid="profile-create-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="My Profile"
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-glass)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewName('');
              }}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import form */}
      {showImport && (
        <div className="glass-panel p-4 space-y-3">
          <label className="block text-sm font-medium text-[var(--color-text-muted)]">
            Paste Profile JSON
          </label>
          <textarea
            data-testid="profile-import-textarea"
            value={importJson}
            onChange={(e) => {
              setImportJson(e.target.value);
              setImportError(null);
            }}
            placeholder="Paste profile JSON here..."
            rows={6}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-glass)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors font-mono resize-none"
          />
          {importError && (
            <p className="text-xs text-red-400">{importError}</p>
          )}
          <div className="flex gap-2">
            <button
              data-testid="profile-import-submit"
              onClick={handleImport}
              disabled={!importJson.trim()}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                setImportJson('');
                setImportError(null);
              }}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Export modal */}
      {exportData !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="glass-panel p-6 max-w-lg w-full mx-4 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Profile Export</h2>
            <textarea
              data-testid="profile-export-content"
              readOnly
              value={exportData}
              rows={12}
              className="w-full px-3 py-2 text-xs rounded-md bg-[var(--color-glass)] border border-[var(--color-border)] text-[var(--color-text)] font-mono resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(exportData);
                }}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setExportData(null)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-[var(--color-text-muted)]">Loading profiles...</span>
        </div>
      )}

      {/* Profile list */}
      {!isLoading && (
        <div data-testid="profile-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const isActive = activeProfile?.id === profile.id;
            const isEditing = editingId === profile.id;

            return (
              <div
                key={profile.id}
                data-testid={`profile-card-${profile.id}`}
                className={`glass-panel p-4 space-y-3 transition-all ${
                  isActive ? 'ring-1 ring-[var(--color-primary-muted)]' : ''
                }`}
              >
                {/* Header: name + active badge */}
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <input
                      data-testid={`profile-edit-input-${profile.id}`}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(profile.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="flex-1 px-2 py-1 text-sm rounded-md bg-[var(--color-glass)] border border-[var(--color-border)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                      autoFocus
                    />
                  ) : (
                    <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">
                      {profile.name}
                    </h3>
                  )}
                  {isActive && (
                    <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)] border border-[var(--color-primary-muted)]">
                      Active
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                  <p>
                    Created:{' '}
                    {new Date(profile.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p>
                    Theme:{' '}
                    <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--color-glass)] text-[var(--color-text-muted)] font-mono text-[10px]">
                      {profile.themeId || 'none'}
                    </span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {!isActive && (
                    <button
                      data-testid={`profile-activate-${profile.id}`}
                      onClick={() => setActiveProfile(profile.id)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors"
                    >
                      Activate
                    </button>
                  )}

                  {isEditing ? (
                    <>
                      <button
                        data-testid={`profile-edit-save-${profile.id}`}
                        onClick={() => handleSaveEdit(profile.id)}
                        disabled={!editName.trim()}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-green-600/80 text-[var(--color-text)] hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      data-testid={`profile-edit-btn-${profile.id}`}
                      onClick={() => handleStartEdit(profile)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
                    >
                      Edit Name
                    </button>
                  )}

                  <button
                    data-testid={`profile-export-${profile.id}`}
                    onClick={() => handleExport(profile.id)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--color-glass)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
                  >
                    Export
                  </button>

                  <button
                    data-testid={`profile-delete-${profile.id}`}
                    onClick={() => handleDelete(profile.id)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-600/60 text-red-300 hover:bg-red-600/80 hover:text-red-200 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
