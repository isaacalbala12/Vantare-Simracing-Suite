import { ChainStep, Monogram, type ChainStepProps, type MonogramProps } from "../../ui/orbit";
import { useAppIcon, type IconApp } from "../launcher/use-app-icon";

export type AppMonogramProps = Omit<MonogramProps, "src" | "onSrcError"> & {
  app: IconApp;
};

/**
 * Monograma de una aplicación con su icono real.
 *
 * `useAppIcon` es un hook, así que la resolución no puede vivir dentro de un
 * `map`: este componente es el envoltorio mínimo que la lleva a cada fila del
 * catálogo y a cada paso de cadena. Sin icono resuelto se cae en las iniciales,
 * que es lo que ya hacía el monograma.
 */
export function AppMonogram({ app, ...rest }: AppMonogramProps) {
  const { src, onError } = useAppIcon(app);
  return <Monogram {...rest} onSrcError={onError} src={src} />;
}

export type AppChainStepProps = Omit<ChainStepProps, "src" | "onSrcError"> & {
  app: IconApp;
};

/** Paso de cadena con el icono real de su aplicación (mismo motivo que arriba). */
export function AppChainStep({ app, ...rest }: AppChainStepProps) {
  const { src, onError } = useAppIcon(app);
  return <ChainStep {...rest} onSrcError={onError} src={src} />;
}
