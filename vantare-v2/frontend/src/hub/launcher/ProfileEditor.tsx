import { useState } from "react";
import {
  type LauncherAppEntry,
  type LaunchProfile,
  type LaunchStep,
} from "./launcher-state";

type ProfileEditorProps = {
  profile: LaunchProfile;
  apps: LauncherAppEntry[];
  onSave: (profile: LaunchProfile) => void;
  onCancel: () => void;
  className?: string;
};


export function ProfileEditor({
  profile,
  apps,
  onSave,
  onCancel,
  className,
}: ProfileEditorProps) {
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [steps, setSteps] = useState<LaunchStep[]>(
    profile.steps.map((s) => ({ ...s })),
  );

  const updateStep = (index: number, patch: Partial<LaunchStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const addStep = (appId: string) => {
    if (!appId) return;
    setSteps((prev) => [...prev, { appId, delay: 2 }]);
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = prev.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <form
      className={`mt-3 rounded-lg border border-accent/30 bg-black/30 p-3 flex flex-col gap-3 ${className ?? ""}`}
      data-testid="profile-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...profile, name: name.trim() || profile.name, description, steps });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
          Nombre
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
          data-testid="profile-editor-name"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
          Descripción
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
          data-testid="profile-editor-description"
        />
      </div>

      <div className="flex flex-col gap-2" data-testid="profile-editor-steps">
        {steps.map((step, index) => {
          const app = apps.find((a) => a.id === step.appId);
          return (
            <div
              key={`${step.appId}-${index}`}
              className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1.5"
              data-testid={`profile-step-${index}`}
            >
              <select
                value={step.appId}
                onChange={(e) => updateStep(index, { appId: e.target.value })}
                className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
                data-testid={`profile-step-app-${index}`}
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
                onChange={(e) =>
                  updateStep(index, { delay: Number(e.target.value) || 0 })
                }
                className="w-16 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
                data-testid={`profile-step-delay-${index}`}
                aria-label={`Retardo del paso ${index + 1} en segundos`}
              />
              <span className="text-[10px] uppercase text-vantare-textDim">s</span>
              <button
                type="button"
                onClick={() => moveStep(index, -1)}
                className="px-1 text-vantare-textMuted hover:text-white"
                data-testid={`profile-step-up-${index}`}
                aria-label="Subir paso"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveStep(index, 1)}
                className="px-1 text-vantare-textMuted hover:text-white"
                data-testid={`profile-step-down-${index}`}
                aria-label="Bajar paso"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeStep(index)}
                className="px-1 text-vantare-textDim hover:text-vantare-red-400"
                data-testid={`profile-step-remove-${index}`}
                aria-label="Eliminar paso"
              >
                ✕
              </button>
              {app && (
                <span className="text-[10px] uppercase tracking-[.18em] text-emerald-400/80 hidden md:inline">
                  {app.abbreviation}
                </span>
              )}
            </div>
          );
        })}
        <select
          value=""
          onChange={(e) => addStep(e.target.value)}
          className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
          data-testid="profile-step-add"
        >
          <option value="">+ Añadir paso</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-white"
          data-testid="profile-editor-cancel"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90"
          data-testid="profile-editor-save"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}

