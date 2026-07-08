import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { AddNonSteamGameModal } from "./AddNonSteamGameModal";

const listeners = new Map<
  string,
  ((event: { data: unknown }) => void)[]
>();
const emitCalls: { name: string; data: unknown }[] = [];

afterEach(() => {
  cleanup();
  listeners.clear();
  emitCalls.length = 0;
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(
      (name: string, cb: (event: { data: unknown }) => void) => {
        const existing = listeners.get(name) ?? [];
        existing.push(cb);
        listeners.set(name, existing);
        return vi.fn();
      },
    ),
    Emit: vi.fn((name: string, data: unknown) => {
      emitCalls.push({ name, data });
    }),
  },
}));

function dispatch(name: string, data: unknown) {
  for (const handler of listeners.get(name) ?? []) {
    handler({ data });
  }
}

describe("AddNonSteamGameModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <AddNonSteamGameModal
        open={false}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders modal overlay when open", () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByTestId("add-non-steam-modal")).toBeTruthy();
  });

  it("emits launcher:registry:list on open and shows loading", () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    expect(Events.Emit).toHaveBeenCalledWith("launcher:registry:list");
    expect(screen.getByText("Cargando...")).toBeTruthy();
  });

  it("renders apps received via event", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "Spotify",
          executablePath: "C:\\Spotify\\spotify.exe",
        },
        {
          id: "r-2",
          displayName: "Discord",
          executablePath: "C:\\Discord\\discord.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeTruthy();
      expect(screen.getByText("Discord")).toBeTruthy();
      expect(
        screen.getByText("C:\\Spotify\\spotify.exe"),
      ).toBeTruthy();
    });
  });

  it("caps results at 200 when more matches exist and shows footer", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const mockApps = Array.from({ length: 250 }, (_, i) => ({
      id: `r-${i}`,
      displayName: `App ${i}`,
      executablePath: `C:\\P\\A${i}.exe`,
    }));
    dispatch("launcher:registry:listed", { apps: mockApps });

    await waitFor(() => {
      expect(
        screen.getAllByTestId(/^add-non-steam-row-/),
      ).toHaveLength(200);
    });
    expect(
      screen.getByText(
        /Refina la búsqueda para ver más \(50 resultados más\)/,
      ),
    ).toBeTruthy();
  });

  it("filters results by search text using case-insensitive includes", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "Alpha App",
          executablePath: "C:\\P\\A.exe",
        },
        {
          id: "r-2",
          displayName: "Beta App",
          executablePath: "C:\\P\\B.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Alpha App")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("add-non-steam-search"), {
      target: { value: "beta" },
    });

    expect(screen.queryByText("Alpha App")).toBeNull();
    expect(screen.getByText("Beta App")).toBeTruthy();
  });

  it("filters out apps with blocked keywords in displayName", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        { id: "r-1", displayName: "NVIDIA Driver", executablePath: "C:\\P\\d.exe" },
        { id: "r-2", displayName: "Java Updater", executablePath: "C:\\P\\u.exe" },
        { id: "r-3", displayName: "Support Agent", executablePath: "C:\\P\\a.exe" },
        { id: "r-4", displayName: "Spotify", executablePath: "C:\\P\\s.exe" },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeTruthy();
    });

    // Apps with blocked keywords should not appear
    expect(screen.queryByText("NVIDIA Driver")).toBeNull();
    expect(screen.queryByText("Java Updater")).toBeNull();
    expect(screen.queryByText("Support Agent")).toBeNull();
  });

  it("always shows known apps even with blocked keywords in name", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    // "crewchief" has "helper" in blocked keywords semantics, but
    // known IDs bypass filtering entirely
    dispatch("launcher:registry:listed", {
      apps: [
        { id: "crewchief", displayName: "CrewChief", executablePath: "C:\\P\\cc.exe" },
        { id: "lmu", displayName: "LMU Helper", executablePath: "C:\\P\\lmu.exe" },
        { id: "r-1", displayName: "Some Driver Tool", executablePath: "C:\\P\\t.exe" },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("CrewChief")).toBeTruthy();
      expect(screen.getByText("LMU Helper")).toBeTruthy();
    });

    // Non-known app with blocked keyword should be filtered
    expect(screen.queryByText("Some Driver Tool")).toBeNull();
  });

  it.each([
    ["Microsoft Visual C++ 2013"],
    ["HIP SDK Core"],
    ["AMD Ryzen Master"],
    ["Python 3.12.10 Test Suite"],
  ])('filters out problematic app "%s"', async (name) => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        { id: "r-1", displayName: name, executablePath: "C:\\P\\x.exe" },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText(name)).toBeNull();
    });
  });

  it.each([
    ["Le Mans Ultimate", "lmu"],
    ["OBS Studio", "obs"],
    ["Firefox", "r-99"],
  ])('keeps known/real app "%s" visible', async (name, id) => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        { id, displayName: name, executablePath: "C:\\P\\x.exe" },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(name)).toBeTruthy();
    });
  });

  it("filters out apps in system32 path even with benign name", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "Notepad",
          executablePath: "C:\\Windows\\System32\\notepad.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText("Notepad")).toBeNull();
    });
  });

  it("filters out apps with version-like names", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "3.12.10",
          executablePath: "C:\\P\\x.exe",
        },
        {
          id: "r-2",
          displayName: "1.0.0.0",
          executablePath: "C:\\P\\x.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText("3.12.10")).toBeNull();
      expect(screen.queryByText("1.0.0.0")).toBeNull();
    });
  });

  it("single-select: clicking a row highlights it, clicking another switches selection", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const mockApps = [
      {
        id: "r-1",
        displayName: "App 1",
        executablePath: "C:\\P\\1.exe",
      },
      {
        id: "r-2",
        displayName: "App 2",
        executablePath: "C:\\P\\2.exe",
      },
    ];
    dispatch("launcher:registry:listed", { apps: mockApps });

    await waitFor(() => {
      expect(screen.getByTestId("add-non-steam-row-r-1")).toBeTruthy();
    });

    const row1 = screen.getByTestId("add-non-steam-row-r-1");
    const row2 = screen.getByTestId("add-non-steam-row-r-2");

    // Click first row
    fireEvent.click(row1);
    expect(row1.className).toContain("bg-accent/10");
    expect(row2.className).not.toContain("bg-accent/10");

    // Click second row
    fireEvent.click(row2);
    expect(row1.className).not.toContain("bg-accent/10");
    expect(row2.className).toContain("bg-accent/10");
  });

  it("single-select: clicking the same row toggles selection off", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "App 1",
          executablePath: "C:\\P\\1.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("add-non-steam-row-r-1")).toBeTruthy();
    });

    const row = screen.getByTestId("add-non-steam-row-r-1");

    fireEvent.click(row);
    expect(row.className).toContain("bg-accent/10");

    fireEvent.click(row);
    expect(row.className).not.toContain("bg-accent/10");
  });

  it("add button is disabled when no selection", () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const btn = screen.getByTestId(
      "add-non-steam-add",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("add button becomes enabled after selecting a row", async () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "App 1",
          executablePath: "C:\\P\\1.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("add-non-steam-row-r-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("add-non-steam-row-r-1"));
    const btn = screen.getByTestId(
      "add-non-steam-add",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("calls onAdd with selected entry and onClose when Añadir is clicked", async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={onClose}
        onAdd={onAdd}
      />,
    );
    dispatch("launcher:registry:listed", {
      apps: [
        {
          id: "r-1",
          displayName: "Spotify",
          executablePath: "C:\\Spotify\\spotify.exe",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("add-non-steam-row-r-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("add-non-steam-row-r-1"));
    fireEvent.click(screen.getByTestId("add-non-steam-add"));

    expect(onAdd).toHaveBeenCalledWith({
      displayName: "Spotify",
      executablePath: "C:\\Spotify\\spotify.exe",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("Browse button is present", () => {
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByTestId("add-non-steam-browse")).toBeTruthy();
  });

  it("Cancelar button closes the modal", () => {
    const onClose = vi.fn();
    render(
      <AddNonSteamGameModal
        open={true}
        onClose={onClose}
        onAdd={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("add-non-steam-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
