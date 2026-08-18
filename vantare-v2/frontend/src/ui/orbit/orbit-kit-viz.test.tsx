import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AvailabilityBoard,
  CornerSlot,
  CountdownDial,
  Donut,
  HorizontalTimeline,
  KeycapRow,
  Trace,
  TrackMap,
  TyreItem,
  type TyreView,
} from "./index";

const NOW = new Date("2026-08-18T12:00:00Z");

describe("Orbit kit · visualización", () => {
  it("el dial traduce la fracción a stroke-dashoffset y al giro del punto", () => {
    // 90 min restantes sobre una ventana de 180 → frac 0.5 → dashoffset 50.
    const target = new Date(NOW.getTime() + 90 * 60_000);
    const onOpen = vi.fn();
    const { rerender } = render(
      <CountdownDial
        eyebrow="Próxima serie"
        intervalMin={180}
        meta="Spa"
        now={NOW}
        onOpen={onOpen}
        openLabel="Abrir la serie en Carreras"
        prefix="en"
        target={target}
        title="Próxima salida"
      />,
    );
    expect(screen.getByTestId("orbit-dial-arc").getAttribute("stroke-dashoffset")).toBe("50");
    expect(screen.getByTestId("orbit-dial-dot").getAttribute("transform")).toBe(
      "rotate(180.00 160 160)",
    );

    // La tarjeta muestra antetítulo, reloj con prefijo y el botón circular.
    expect(screen.getByText("Próxima serie")).toBeTruthy();
    expect(screen.getByText("en 1 h 30 m")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir la serie en Carreras" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Un cuarto de ventana → frac 0.25 → dashoffset 75.
    rerender(
      <CountdownDial
        eyebrow="Próxima serie"
        intervalMin={180}
        meta="Spa"
        now={NOW}
        onOpen={onOpen}
        openLabel="Abrir la serie en Carreras"
        prefix="en"
        target={new Date(NOW.getTime() + 45 * 60_000)}
        title="Próxima salida"
      />,
    );
    expect(screen.getByTestId("orbit-dial-arc").getAttribute("stroke-dashoffset")).toBe("75");
  });

  it("sin `pxPerHour` la timeline se dibuja como siempre (Estrategia)", () => {
    const { container, unmount } = render(
      <HorizontalTimeline
        blocks={() => []}
        minWidth={900}
        rowLabel={(row: { name: string }) => row.name}
        rows={[{ name: "Isaac" }]}
        spanMin={240}
        start={NOW}
        tickEveryMin={60}
      />,
    );
    const inner = container.querySelector(".orbit-tl__inner")!;
    expect(inner.getAttribute("data-px-per-hour")).toBeNull();
    expect((inner as HTMLElement).style.minWidth).toBe("900px");
    expect((inner as HTMLElement).style.width).toBe("");
    unmount();
  });

  it("con `pxPerHour` el ancho del eje lo manda el zoom", () => {
    const { container, rerender, unmount } = render(
      <HorizontalTimeline
        blocks={() => [
          { id: "a", start: NOW, durationMin: 30, color: "#fff", tip: "Alfa · 12:00" },
        ]}
        headWidth={200}
        pxPerHour={40}
        rowLabel={(row: { name: string }) => row.name}
        rows={[{ name: "Isaac" }]}
        spanMin={1440}
        start={NOW}
        tickEveryMin={60}
      />,
    );
    const inner = () => container.querySelector(".orbit-tl__inner") as HTMLElement;
    // 24 h × 40 px + 200 px de rótulos.
    expect(inner().style.width).toBe("1160px");
    expect(inner().getAttribute("data-px-per-hour")).toBe("40");
    // El tooltip del bloque es propio del kit, nunca `title` nativo.
    const block = container.querySelector('[data-testid="orbit-timeline-block"]')!;
    expect(block.getAttribute("data-tip")).toBe("Alfa · 12:00");
    expect(block.getAttribute("title")).toBeNull();

    rerender(
      <HorizontalTimeline
        blocks={() => []}
        headWidth={200}
        pxPerHour={80}
        rowLabel={(row: { name: string }) => row.name}
        rows={[{ name: "Isaac" }]}
        spanMin={1440}
        start={NOW}
        tickEveryMin={30}
      />,
    );
    expect(inner().style.width).toBe("2120px");
    unmount();
  });

  it("la timeline pinta un bloque por entrada con anchura relativa al span", () => {
    render(
      <HorizontalTimeline
        blocks={(row) => row.blocks}
        rowLabel={(row) => row.name}
        rows={[
          {
            name: "Isaac",
            blocks: [
              { id: "a", start: NOW, durationMin: 60, color: "#fff", label: "S1" },
              {
                id: "b",
                start: new Date(NOW.getTime() + 120 * 60_000),
                durationMin: 30,
                color: "#fff",
                label: "S2",
              },
            ],
          },
          {
            name: "Sol",
            blocks: [
              {
                id: "c",
                start: new Date(NOW.getTime() + 60 * 60_000),
                durationMin: 120,
                color: "#fff",
                label: "S3",
              },
            ],
          },
        ]}
        spanMin={240}
        start={NOW}
        tickEveryMin={60}
      />,
    );

    expect(screen.getAllByTestId("orbit-timeline-row")).toHaveLength(2);
    const blocks = screen.getAllByTestId("orbit-timeline-block");
    expect(blocks).toHaveLength(3);
    // 60/240 = 25 %, arrancando en el origen del eje.
    expect(blocks[0].style.width).toBe("25%");
    expect(blocks[0].style.left).toBe("0%");
    // 30/240 = 12.5 % con dos horas de retraso sobre cuatro.
    expect(blocks[1].style.width).toBe("12.5%");
    expect(blocks[1].style.left).toBe("50%");
    // 120/240 = 50 %.
    expect(blocks[2].style.width).toBe("50%");
  });

  it("el rótulo del bloque va en su caja recortable y marca la tinta", () => {
    const { container } = render(
      <HorizontalTimeline
        blocks={(row) => row.blocks}
        rowLabel={(row) => row.name}
        rows={[
          {
            name: "Isaac",
            blocks: [
              // Con sitio: el consumidor pasa `label` y el bloque lo rotula.
              { id: "a", start: NOW, durationMin: 60, color: "#5ccbd5", label: "WEC Weekly" },
              // Sin sitio: el consumidor no pasa `label`, solo queda el tip.
              {
                id: "b",
                start: new Date(NOW.getTime() + 120 * 60_000),
                durationMin: 10,
                color: "#d52f49",
                ink: "light" as const,
                tip: "LMP3 Fixed · 02:15",
              },
            ],
          },
        ]}
        spanMin={240}
        start={NOW}
        tickEveryMin={60}
      />,
    );

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="orbit-timeline-block"]'),
    );
    // Ancho: el rótulo se pinta y se recorta dentro del bloque, nunca fuera.
    expect(blocks[0].getAttribute("data-label")).toBe("true");
    const label = within(blocks[0]).getByTestId("orbit-timeline-block-label");
    expect(label.className).toBe("orbit-tl__block-label");
    expect(label.textContent).toBe("WEC Weekly");
    expect(blocks[0].getAttribute("data-ink")).toBe("dark");

    // Estrecho: sin rótulo a medias; el nombre completo vive en el `data-tip`.
    expect(blocks[1].getAttribute("data-label")).toBeNull();
    expect(container.querySelectorAll(".orbit-tl__block-label")).toHaveLength(1);
    expect(blocks[1].getAttribute("data-tip")).toBe("LMP3 Fixed · 02:15");
    expect(blocks[1].getAttribute("data-ink")).toBe("light");
  });

  it("el donut pinta un arco por porción", () => {
    render(
      <Donut
        centerLabel="Stints"
        centerValue="4"
        slices={[
          { id: "s1", label: "Isaac", value: 40, color: "#f04755" },
          { id: "s2", label: "Sol", value: 30, color: "#78d68b" },
          { id: "s3", label: "Fable", value: 20, color: "#5ccbd5" },
          { id: "s4", label: "Relevo", value: 10, color: "#ff9b57" },
        ]}
      />,
    );
    expect(screen.getAllByTestId("orbit-donut-slice")).toHaveLength(4);
  });

  it("la traza declara el viewBox del canal y su altura", () => {
    render(<Trace channel="speed" height={150} mine={[10, 40, 20]} reference={[12, 38, 24]} title="Velocidad" />);
    const svg = screen.getByRole("img", { name: /Velocidad/ });
    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 150");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
  });

  it("el corner slot cambia de estado vacío a lleno y limpia", () => {
    const tyre: TyreView = { id: "SET-3", compound: "soft", condition: 94 };
    const onClear = vi.fn();
    const { rerender } = render(
      <CornerSlot corner="FL" onClear={onClear} onDrop={() => {}} />,
    );
    const slot = screen.getByTestId("orbit-corner-slot-FL");
    expect(slot.getAttribute("data-state")).toBe("empty");

    rerender(<CornerSlot corner="FL" onClear={onClear} onDrop={() => {}} picked tyre={tyre} />);
    expect(slot.getAttribute("data-state")).toBe("filled");
    expect(slot.getAttribute("data-picked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Quitar el neumático/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("el corner slot marca `over` mientras se arrastra encima", () => {
    render(<CornerSlot corner="RR" onClear={() => {}} onDrop={() => {}} />);
    const slot = screen.getByTestId("orbit-corner-slot-RR");
    fireEvent.dragOver(slot);
    expect(slot.getAttribute("data-over")).toBe("true");
    fireEvent.dragLeave(slot);
    expect(slot.getAttribute("data-over")).toBeNull();
  });

  it("el tyre item expone aria-pressed y aria-grabbed", () => {
    const tyre: TyreView = { id: "SET-1", compound: "medium", condition: 71 };
    const onPick = vi.fn();
    const { rerender } = render(<TyreItem onPick={onPick} tyre={tyre} used={[]} />);
    const item = screen.getByTestId("orbit-tyre-item-SET-1");
    expect(item.getAttribute("aria-pressed")).toBe("false");
    expect(item.getAttribute("aria-grabbed")).toBe("false");
    fireEvent.click(item);
    expect(onPick).toHaveBeenCalledTimes(1);

    rerender(<TyreItem onPick={onPick} picked tyre={tyre} used={[{ stint: 1, corner: "FL" }]} />);
    expect(item.getAttribute("aria-pressed")).toBe("true");
    expect(item.getAttribute("data-used")).toBe("true");
  });

  it("el keycap row marca el conflicto y la fila vacía", () => {
    const { rerender } = render(
      <KeycapRow description="Muestra u oculta el overlay" keys={["Ctrl", "S"]} title="Alternar" />,
    );
    const row = screen.getByTestId("orbit-keycap-row");
    expect(row.getAttribute("data-conflict")).toBeNull();

    rerender(
      <KeycapRow
        conflict
        description="Muestra u oculta el overlay"
        keys={["Ctrl", "S"]}
        title="Alternar"
      />,
    );
    expect(row.getAttribute("data-conflict")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("En conflicto");

    rerender(<KeycapRow description="Sin atajo" empty keys={[]} title="Capturar" />);
    expect(row.getAttribute("data-empty")).toBe("true");
    expect(screen.getByText("sin asignar")).toBeTruthy();
  });

  it("el availability board pinta una celda por tramo con etiqueta legible", () => {
    render(
      <AvailabilityBoard
        drivers={[
          { id: "isaac", name: "Isaac", color: "#f04755" },
          { id: "sol", name: "Sol", color: "#78d68b" },
        ]}
        from={13}
        ranges={{
          isaac: [
            { from: 13, to: 15, state: "ok" },
            { from: 15, to: 16.5, state: "maybe" },
          ],
          sol: [{ from: 14, to: 18.5, state: "no" }],
        }}
        to={18.5}
      />,
    );
    const cells = screen.getAllByTestId("orbit-availability-cell");
    expect(cells).toHaveLength(3);
    expect(cells[0].getAttribute("aria-label")).toBe("Isaac · 13:00–15:00 · disponible");
    expect(cells[1].getAttribute("aria-label")).toBe("Isaac · 15:00–16:30 · quizá");
    expect(cells[2].getAttribute("aria-label")).toBe("Sol · 14:00–18:30 · no disponible");
  });

  it("el mapa colorea los tramos por delta y avisa del tramo elegido", () => {
    const onSegment = vi.fn();
    render(
      <TrackMap
        cursor={0.25}
        onSegment={onSegment}
        path={[
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ]}
        segments={[
          { id: "t1", from: 0, to: 0.25, delta: 0.12, label: "T1" },
          { id: "t2", from: 0.5, to: 0.75, delta: -0.08, label: "T2" },
        ]}
        selected="t1"
      />,
    );
    const segments = screen.getAllByTestId("orbit-trackmap-segment");
    expect(segments[0].getAttribute("data-tone")).toBe("loss");
    expect(segments[0].getAttribute("data-on")).toBe("true");
    expect(segments[1].getAttribute("data-tone")).toBe("gain");
    expect(screen.getByTestId("orbit-trackmap-car")).toBeTruthy();
    fireEvent.click(segments[1]);
    expect(onSegment).toHaveBeenCalledWith("t2");
  });
});
