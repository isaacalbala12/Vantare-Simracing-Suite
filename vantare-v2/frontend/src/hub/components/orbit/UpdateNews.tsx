import { useEffect, useState, type ReactNode } from "react";
import type { ReleaseNote } from "../../settings/release-notes";

export interface UpdateNewsLabels {
  /** Encabezado del panel. */
  title: string;
  /** Pie: qué pasa si haces clic en el aviso. */
  hint: string;
  /** Aviso de que quedan versiones sin describir. `{{count}}` es el total. */
  more: string;
}

export interface UpdateNewsProps {
  notes: ReleaseNote[];
  /** Cuántas versiones hay pendientes en total, descritas o no. */
  total: number;
  labels: UpdateNewsLabels;
  /** El aviso de actualización; el panel cuelga de él. */
  children: ReactNode;
  className?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

/**
 * Qué trae la versión que aún no te has descargado, sin salir de la pantalla.
 *
 * El aviso decía la versión y nada más, así que decidir si actualizar ahora o
 * después exigía abrir Ajustes o irse a GitHub. El texto no se escribe aquí:
 * es el cuerpo de la release, el mismo que lee un tester en GitHub, generado
 * desde el manifiesto del corte.
 *
 * Se abre al pasar el ratón **y** al enfocar el aviso con el teclado, y el
 * panel cuelga del mismo contenedor para poder recorrerlo con el ratón dentro
 * sin que se cierre. `Esc` lo cierra.
 */
export function UpdateNews({ notes, total, labels, children, className }: UpdateNewsProps) {
  const [open, setOpen] = useState(false);
  const available = notes.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Sin nada que contar (una release antigua sin notas, o un cuerpo vacío) el
  // aviso se queda como estaba: un panel vacío es peor que ningún panel.
  if (!available) return <>{children}</>;

  const remaining = total - notes.length;

  return (
    <div
      className={["orbit-update-news", className].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open ? (
        <div
          aria-label={labels.title}
          className="orbit-update-news__panel"
          data-testid="orbit-update-news"
          role="note"
        >
          <p className="orbit-update-news__title">{labels.title}</p>
          {notes.map((note) => (
            <article className="orbit-update-news__release" key={note.tag}>
              <header>
                <span className="orbit-update-news__tag">{note.tag}</span>
                <span className="orbit-update-news__date">{formatDate(note.publishedAt)}</span>
              </header>
              {note.headline ? (
                <p className="orbit-update-news__headline">{note.headline}</p>
              ) : null}
              {note.summary ? <p className="orbit-update-news__lead">{note.summary}</p> : null}
              {note.sections.map((section, index) => (
                <section key={`${note.tag}-${section.heading}-${index}`}>
                  {section.heading ? (
                    <h4 className="orbit-update-news__heading">{section.heading}</h4>
                  ) : null}
                  <ul>
                    {section.items.map((item, itemIndex) => (
                      <li key={`${itemIndex}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
          {remaining > 0 ? (
            <p className="orbit-update-news__more">
              {labels.more.replace("{{count}}", String(remaining))}
            </p>
          ) : null}
          <p className="orbit-update-news__hint">{labels.hint}</p>
        </div>
      ) : null}
    </div>
  );
}
