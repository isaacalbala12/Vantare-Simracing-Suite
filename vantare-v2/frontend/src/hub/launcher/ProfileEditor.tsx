import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { LaunchProfile, LauncherAppEntry } from "./launcher-state";
import { isHotkeyAllowed } from "./launcher-state";

type ProfileEditorProps = {
  profile: LaunchProfile;
  open: boolean;
  onClose: () => void;
  onSave: (profile: LaunchProfile) => void;
  apps: LauncherAppEntry[];
};

export function ProfileEditor({
  profile,
  open,
  onClose,
  onSave,
  apps,
}: ProfileEditorProps) {
  const [draft, setDraft] = useState(profile);

  // Sync draft when profile identity changes (render-time, avoids cascading effect)
  if (draft.id !== profile.id) {
    setDraft(profile);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 bottom-0 w-[480px] z-50 card-sleek p-5 overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            data-testid="profile-editor-panel"
            role="dialog"
            aria-label="Editar perfil"
          >
            <h2 className="text-lg font-bold text-white">Editar perfil</h2>

            <label className="block mt-3">
              <span className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                Nombre
              </span>
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                data-testid="profile-editor-name"
                className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
              />
            </label>

            <label className="block mt-3">
              <span className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                Descripción
              </span>
              <input
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                data-testid="profile-editor-description"
                className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
              />
            </label>

            <label className="block mt-3">
              <span className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                Notas
              </span>
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, notes: e.target.value })
                }
                data-testid="profile-editor-notes"
                rows={3}
                className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
              />
            </label>

            {/* ── Steps editor ── */}
            <div className="mt-4">
              <span className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                Pasos
              </span>
              {draft.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 mt-2"
                  data-testid={`editor-step-${i}`}
                >
                  <select
                    value={step.appId}
                    onChange={(e) => {
                      const next = [...draft.steps];
                      next[i] = { ...step, appId: e.target.value };
                      setDraft({ ...draft, steps: next });
                    }}
                    data-testid={`editor-step-app-${i}`}
                    className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
                  >
                    <option value="">— Selecciona app —</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={step.delay}
                    onChange={(e) => {
                      const next = [...draft.steps];
                      next[i] = { ...step, delay: Number(e.target.value) || 0 };
                      setDraft({ ...draft, steps: next });
                    }}
                    data-testid={`editor-step-delay-${i}`}
                    className="w-16 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
                  />
                  <button
                    onClick={() => {
                      if (i === 0) return;
                      const next = [...draft.steps];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setDraft({ ...draft, steps: next });
                    }}
                    data-testid={`editor-step-up-${i}`}
                    aria-label="Mover arriba"
                    className="px-1 text-vantare-textDim hover:text-white"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => {
                      if (i === draft.steps.length - 1) return;
                      const next = [...draft.steps];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      setDraft({ ...draft, steps: next });
                    }}
                    data-testid={`editor-step-down-${i}`}
                    aria-label="Mover abajo"
                    className="px-1 text-vantare-textDim hover:text-white"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => {
                      const next = draft.steps.filter((_, idx) => idx !== i);
                      setDraft({ ...draft, steps: next });
                    }}
                    data-testid={`editor-step-remove-${i}`}
                    aria-label="Eliminar paso"
                    className="px-1 text-vantare-textDim hover:text-vantare-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: [...draft.steps, { appId: "", delay: 2 }],
                  })
                }
                data-testid="editor-step-add"
                className="mt-2 px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40"
              >
                + Añadir paso
              </button>
            </div>

            {/* ── Hotkey ── */}
            <label className="block mt-4">
              <span className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                Hotkey global
              </span>
              <input
                type="text"
                value={draft.hotkey ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    hotkey: e.target.value || undefined,
                  })
                }
                data-testid="profile-editor-hotkey"
                placeholder="ctrl+shift+1 (vacío = sin hotkey)"
                className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
              />
              {draft.hotkey && !isHotkeyAllowed(draft.hotkey) && (
                <span
                  className="text-xs text-vantare-red-400"
                  data-testid="profile-editor-hotkey-error"
                >
                  Combinación reservada
                </span>
              )}
            </label>

            {/* ── Autostart ── */}
            <label className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                checked={draft.launchOnWindowsStartup ?? false}
                disabled={draft.steps.length === 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    launchOnWindowsStartup: e.target.checked,
                  })
                }
                data-testid="profile-editor-autostart"
              />
              <span className="text-sm text-white">Iniciar con Windows</span>
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                data-testid="profile-editor-cancel"
                className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(draft)}
                data-testid="profile-editor-save"
                className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90"
              >
                Guardar
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
