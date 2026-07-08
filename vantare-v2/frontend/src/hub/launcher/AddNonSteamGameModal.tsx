import { useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";

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

export function AddNonSteamGameModal({ open, onClose, onAdd }: Props) {
  // When closed, return null so the child unmounts and state resets fresh on re-open.
  if (!open) return null;
  return <ModalBody onClose={onClose} onAdd={onAdd} />;
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

  const lowercased = useMemo(
    () =>
      apps.map((a) => ({
        ...a,
        _lower:
          a.displayName.toLowerCase() +
          "|" +
          a.executablePath.toLowerCase(),
      })),
    [apps],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q
      ? lowercased.filter((a) => a._lower.includes(q))
      : lowercased;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="add-non-steam-modal"
    >
      <div className="card-sleek rounded-xl w-[640px] max-h-[80vh] flex flex-col">
        <header className="p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Añadir programa</h2>
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
            className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
            data-testid="add-non-steam-search"
          />
        </div>

        <div
          className="flex-1 overflow-y-auto"
          data-testid="add-non-steam-list"
        >
          {loading ? (
            <div className="p-4 text-xs text-vantare-textDim">
              Cargando...
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {visible.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() =>
                      setSelectedId(selectedId === a.id ? null : a.id)
                    }
                    className={`cursor-pointer ${
                      selectedId === a.id
                        ? "bg-accent/20"
                        : "hover:bg-white/5"
                    }`}
                    data-testid={`add-non-steam-row-${a.id}`}
                  >
                    <td className="p-2">{a.displayName}</td>
                    <td className="p-2 text-xs text-vantare-textDim">
                      {a.executablePath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {moreCount > 0 && (
            <div className="p-3 text-xs text-vantare-textMuted border-t border-white/5">
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
            className="mr-auto px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:text-white"
          >
            Browse...
          </button>
          <button
            onClick={onClose}
            data-testid="add-non-steam-cancel"
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-white"
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
      </div>
    </div>
  );
}
