import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Events } from "@wailsio/runtime";
import { AppBadge } from "../components/AppBadge";
import type { LauncherAppEntry } from "./launcher-state";

type RegistryApp = {
  id: string;
  displayName: string;
  executablePath: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (entry: { displayName: string; executablePath: string }) => void;
};

const CAP = 200;

const KNOWN_IDS = new Set([
  "lmu",
  "obs",
  "crewchief",
  "discord",
  "spotify",
  "motec",
  "simhub",
]);

const BLOCKED_KEYWORDS = [
  // Drivers
  "driver", "drivers",
  // SDKs y runtimes
  "sdk", "runtime", "run time", "redistributable", "c++", "vc++", "vc redist",
  "vulkan run", "vulkan", "directx", "opengl",
  // Debuggers y dev tools
  "debugger", "debug", "developer", "diagnostic",
  // Test suites
  "test suite", "test framework",
  // System utilities
  "ryzen master", "intel", "nvidia", "amd install", "geforce", "radeon",
  "install manager", "uninstall", "updater", "update service",
  // Services y agents
  "service", "agent", "helper", "support agent",
  // Audio drivers
  "audio accelerator", "audio driver", "audio control",
  // Microsoft/Windows components
  "microsoft visual", "windows sdk", "net framework", ".net",
  "powershell", "wsl", "openssh",
  // Python dev
  "idle",
  // Build tools
  "cmake", "mingw", "toolchain",
  // Control panels
  "control panel",
  // Utility accelerators
  "utility accelerator",
];

function shouldBlockApp(name: string, path: string): boolean {
  const nameLower = name.toLowerCase();
  // Bloquear si el nombre contiene alguna keyword bloqueada
  if (BLOCKED_KEYWORDS.some((kw) => nameLower.includes(kw))) return true;
  // Bloquear si el path contiene carpetas de sistema
  if (path.toLowerCase().includes("\\windows\\system32")) return true;
  if (path.toLowerCase().includes("\\windows\\syswow64")) return true;
  // Bloquear apps cuyo nombre es solo números o muy corto (<3 chars)
  if (name.trim().length < 3) return true;
  // Bloquear apps cuyo nombre parece un número de versión (ej: "3.12.10")
  if (/^\d+\.\d+/.test(name.trim())) return true;
  return false;
}

function toLauncherEntry(app: RegistryApp): LauncherAppEntry {
  const hash = [...app.displayName].reduce(
    (a, c) => a + c.charCodeAt(0),
    0,
  );
  const hue = hash % 360;
  const words = app.displayName.split(/[\s_-]+/).filter(Boolean);
  const abbreviation =
    words.length > 0
      ? words
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 3)
      : app.displayName.slice(0, 2).toUpperCase();

  return {
    id: app.id,
    displayName: app.displayName,
    abbreviation,
    category: "utility",
    launchMethod: "executable",
    executablePath: app.executablePath,
    detected: true,
    gradientFrom: `hsl(${hue}, 40%, 40%)`,
    gradientTo: `hsl(${hue}, 40%, 20%)`,
  };
}

export function AddNonSteamGameModal({ open, onClose, onAdd }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="add-non-steam-modal"
        >
          <motion.div
            key="panel"
            className="card-sleek rounded-xl w-[640px] max-h-[80vh] flex flex-col"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <ModalBody onClose={onClose} onAdd={onAdd} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ModalBody({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (entry: { displayName: string; executablePath: string }) => void;
}) {
  const [apps, setApps] = useState<RegistryApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On mount, fetch the registry app list. ModalBody unmounts on close so
  // no cleanup for stale state is needed.
  useEffect(() => {
    Events.Emit("launcher:registry:list");
    const off = Events.On(
      "launcher:registry:listed",
      (e: { data?: { apps?: RegistryApp[] } }) => {
        setApps(e.data?.apps ?? []);
        setLoading(false);
      },
    );
    return () => {
      off();
    };
  }, []);

  const entries = useMemo(() => apps.map(toLauncherEntry), [apps]);

  const lowercased = useMemo(
    () =>
      entries.map((a) => ({
        ...a,
        _lower:
          a.displayName.toLowerCase() +
          "|" +
          (a.executablePath ?? "").toLowerCase(),
      })),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return lowercased.filter((a) => {
      // Siempre mostrar apps del catálogo conocido
      if (KNOWN_IDS.has(a.id)) return true;
      // Bloquear apps no deseadas por keyword, path, nombre corto o versión
      if (shouldBlockApp(a.displayName, a.executablePath ?? ""))
        return false;
      // Filtrar por búsqueda
      return q ? a._lower.includes(q) : true;
    });
  }, [lowercased, search]);

  const visible = filtered.slice(0, CAP);
  const moreCount = filtered.length - visible.length;

  const handleAdd = () => {
    const selected = apps.find((a) => a.id === selectedId);
    if (selected) {
      onAdd({
        displayName: selected.displayName,
        executablePath: selected.executablePath,
      });
      onClose();
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileWithPath = file as File & { path?: string };
    const path = fileWithPath.path || file.name;
    const displayName = file.name.replace(/\.exe$/i, "");
    onAdd({ displayName, executablePath: path });
    onClose();
  };

  const toggleSelection = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <header className="p-4 border-b border-white/10">
        <h2 className="text-lg font-bold text-white">Añadir programa</h2>
        <p className="mt-1 text-xs text-white/60">
          Selecciona un programa para añadir a tu launcher
        </p>
      </header>

      <div className="p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedId(null);
          }}
          placeholder="Buscar..."
          className="w-full rounded-md bg-black/40 border border-white/20 px-2 py-1 text-sm text-white focus:ring-2 focus:ring-accent/40 focus:outline-none"
          data-testid="add-non-steam-search"
        />
      </div>

      <div
        className="flex-1 overflow-y-auto scrollable-main"
        data-testid="add-non-steam-list"
      >
        {loading ? (
          <div className="p-4 text-xs text-white/35">
            Cargando...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-white/35 border-b border-white/5">
                <th className="p-2 text-left font-medium">PROGRAMA</th>
                <th className="p-2 text-left font-medium">UBICACIÓN</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => toggleSelection(entry.id)}
                  className={`cursor-pointer bg-black/20 ${
                    selectedId === entry.id
                      ? "bg-accent/10 border border-accent/30"
                      : "hover:bg-white/5"
                  }`}
                  data-testid={`add-non-steam-row-${entry.id}`}
                >
                  <td className="p-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span
                        data-testid={`add-non-steam-checkbox-${entry.id}`}
                        className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                          selectedId === entry.id
                            ? "bg-accent border-accent"
                            : "border-white/20 bg-black/40"
                        }`}
                      >
                        {selectedId === entry.id && (
                          <svg
                            className="w-3 h-3 text-black"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <AppBadge app={entry} size="sm" />
                    </label>
                  </td>
                  <td
                    className="max-w-[320px] truncate p-2 text-xs text-white/50"
                    title={entry.executablePath ?? ""}
                  >
                    {entry.executablePath ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {moreCount > 0 && (
          <div className="p-3 text-xs text-white/35 border-t border-white/5">
            Refina la búsqueda para ver más ({moreCount} resultados más).
          </div>
        )}
      </div>

      <footer className="p-3 border-t border-white/10 flex justify-end gap-2">
        <input
          type="file"
          accept=".exe"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          data-testid="add-non-steam-file-input"
        />
        <button
          onClick={handleBrowse}
          data-testid="add-non-steam-browse"
          className="mr-auto px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-white/60 hover:text-white"
        >
          Browse...
        </button>
        <button
          onClick={onClose}
          data-testid="add-non-steam-cancel"
          className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[.18em] text-white/35 hover:text-white"
        >
          Cancelar
        </button>
        <button
          onClick={handleAdd}
          disabled={!selectedId}
          data-testid="add-non-steam-add"
          className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90 disabled:opacity-40"
        >
          Añadir
        </button>
      </footer>
    </>
  );
}
