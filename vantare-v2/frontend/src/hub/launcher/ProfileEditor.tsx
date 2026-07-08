import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { LaunchProfile } from "./launcher-state";

type ProfileEditorProps = {
  profile: LaunchProfile;
  open: boolean;
  onClose: () => void;
  onSave: (profile: LaunchProfile) => void;
};

export function ProfileEditor({
  profile,
  open,
  onClose,
  onSave,
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

            {/* Steps, hotkey, autostart van en Task 3.3b */}

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
