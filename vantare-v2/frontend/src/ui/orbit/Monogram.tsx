import type { CSSProperties } from "react";

export interface MonogramProps {
  text: string;
  /** Degradado de la app (`gradientFrom`/`gradientTo` del contrato del launcher). */
  g1: string;
  g2: string;
  size?: 26 | 32 | 39 | 46 | 52 | 60;
  /**
   * Icono real de la aplicación (data URI o ruta local). Cuando existe se pinta
   * en lugar de las iniciales, conservando la misma caja y el mismo radio; si
   * no carga, quien llame lo retira con `onSrcError` y vuelve el monograma.
   */
  src?: string | null;
  onSrcError?: () => void;
  className?: string;
}

export function Monogram({
  text,
  g1,
  g2,
  size = 39,
  src,
  onSrcError,
  className,
}: MonogramProps) {
  const classes = [
    "orbit-monogram",
    `orbit-monogram--${size}`,
    src ? "orbit-monogram--icon" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Sin degradado declarado no se escriben las variables: así manda el valor de
  // reserva del kit en lugar de dejar la losa transparente.
  const style: CSSProperties = {};
  if (g1) (style as Record<string, string>)["--orbit-mono-g1"] = g1;
  if (g2) (style as Record<string, string>)["--orbit-mono-g2"] = g2;

  return (
    <span aria-hidden="true" className={classes} style={style}>
      {src ? (
        <img alt="" className="orbit-monogram__img" loading="lazy" onError={onSrcError} src={src} />
      ) : (
        text
      )}
    </span>
  );
}
