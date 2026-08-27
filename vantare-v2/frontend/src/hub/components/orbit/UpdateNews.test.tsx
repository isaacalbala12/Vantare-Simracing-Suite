import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";
import { UpdateNews, type UpdateNewsLabels } from "./UpdateNews";
import type { ReleaseNote } from "../../settings/release-notes";

const labels: UpdateNewsLabels = {
  title: "Qué trae esta actualización",
  hint: "Pulsa para abrirla en Ajustes › Actualizaciones.",
  more: "Y {{count}} versión(es) más sin describir aquí.",
};

const note: ReleaseNote = {
  tag: "v0.1.0.7-nightly.12",
  publishedAt: "2026-08-25T10:00:00Z",
  headline: "Notas de version legibles",
  summary: "Esta Nightly explica que cambia antes de descargarla.",
  sections: [
    { heading: "Novedades", items: ["El aviso cuenta que trae la version."] },
    { heading: "Para testers", items: ["Abrir Ajustes y comprobar el aviso."] },
  ],
};

function older(tag: string): ReleaseNote {
  return { ...note, tag, headline: `Corte ${tag}` };
}

function renderNews(overrides: Partial<React.ComponentProps<typeof UpdateNews>> = {}) {
  render(
    <UpdateNews labels={labels} notes={[note]} total={1} {...overrides}>
      <button type="button">v0.1.0.7-nightly.12</button>
    </UpdateNews>,
  );
  return screen.getByRole("button", { name: /nightly/i });
}

afterEach(cleanup);

describe("UpdateNews", () => {
  it("says nothing until the pointer is on the update pill", () => {
    renderNews();
    expect(screen.queryByTestId("orbit-update-news")).toBeNull();
  });

  it("tells what the pending version brings on hover", () => {
    const pill = renderNews();
    fireEvent.mouseEnter(pill.parentElement as HTMLElement);

    const panel = screen.getByTestId("orbit-update-news");
    expect(panel.textContent).toContain("Notas de version legibles");
    expect(panel.textContent).toContain("Esta Nightly explica que cambia antes de descargarla.");
    expect(panel.textContent).toContain("Novedades");
    expect(panel.textContent).toContain("El aviso cuenta que trae la version.");
    expect(panel.textContent).toContain("v0.1.0.7-nightly.12");
  });

  it("opens with the keyboard too, not only with the mouse", () => {
    const pill = renderNews();
    fireEvent.focus(pill);
    expect(screen.getByTestId("orbit-update-news")).not.toBeNull();
  });

  it("closes when the pointer leaves and when Escape is pressed", () => {
    const pill = renderNews();
    const wrap = pill.parentElement as HTMLElement;

    fireEvent.mouseEnter(wrap);
    fireEvent.mouseLeave(wrap);
    expect(screen.queryByTestId("orbit-update-news")).toBeNull();

    fireEvent.mouseEnter(wrap);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("orbit-update-news")).toBeNull();
  });

  it("describes every pending version, newest first", () => {
    const pill = renderNews({
      notes: [note, older("v0.1.0.7-nightly.11")],
      total: 2,
    });
    fireEvent.mouseEnter(pill.parentElement as HTMLElement);

    const headlines = screen
      .getAllByText(/Notas de version legibles|Corte v0/)
      .map((element) => element.textContent);
    expect(headlines).toEqual(["Notas de version legibles", "Corte v0.1.0.7-nightly.11"]);
  });

  it("admits how many versions it is leaving out", () => {
    const pill = renderNews({ notes: [note], total: 4 });
    fireEvent.mouseEnter(pill.parentElement as HTMLElement);
    expect(screen.getByTestId("orbit-update-news").textContent).toContain(
      "Y 3 versión(es) más sin describir aquí.",
    );
  });

  it("does not claim to leave anything out when it describes them all", () => {
    const pill = renderNews({ notes: [note], total: 1 });
    fireEvent.mouseEnter(pill.parentElement as HTMLElement);
    expect(screen.getByTestId("orbit-update-news").textContent).not.toContain(
      "más sin describir",
    );
  });

  it("leaves the pill alone when there is nothing to tell", () => {
    render(
      <UpdateNews labels={labels} notes={[]} total={0}>
        <button type="button">v0.1.0.7-nightly.12</button>
      </UpdateNews>,
    );
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.queryByTestId("orbit-update-news")).toBeNull();
    expect(screen.getByRole("button")).not.toBeNull();
  });
});

describe("Topbar", () => {
  it("hangs the notes off the update pill", () => {
    render(
      <Topbar
        eyebrow="Vantare"
        title="Inicio"
        update="available"
        updateLabel="v0.1.0.7-nightly.12"
        updateNewsLabels={labels}
        updateNotes={[note]}
        updateNotesTotal={1}
        view="inicio"
      />,
    );
    // Sin `onUpdate` el pill es un span, no un botón: se apunta al contenedor
    // que gobierna el hover.
    fireEvent.mouseEnter(document.querySelector(".orbit-update-news") as HTMLElement);
    expect(screen.getByTestId("orbit-update-news").textContent).toContain(
      "Notas de version legibles",
    );
  });

  it("still opens Ajustes when the pill is clicked", () => {
    const onUpdate = vi.fn();
    render(
      <Topbar
        eyebrow="Vantare"
        onUpdate={onUpdate}
        title="Inicio"
        update="available"
        updateLabel="v0.1.0.7-nightly.12"
        updateNewsLabels={labels}
        updateNotes={[note]}
        updateNotesTotal={1}
        view="inicio"
      />,
    );
    fireEvent.click(screen.getByText("v0.1.0.7-nightly.12"));
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("renders the bare pill when the release carries no notes", () => {
    render(
      <Topbar
        eyebrow="Vantare"
        title="Inicio"
        update="available"
        updateLabel="v0.1.0.7-nightly.12"
        updateNewsLabels={labels}
        updateNotes={[]}
        view="inicio"
      />,
    );
    expect(screen.getByText("v0.1.0.7-nightly.12")).not.toBeNull();
    expect(screen.queryByTestId("orbit-update-news")).toBeNull();
  });
});
