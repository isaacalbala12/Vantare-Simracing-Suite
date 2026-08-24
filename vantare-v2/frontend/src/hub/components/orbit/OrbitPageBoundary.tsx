import { Component, type ReactNode } from 'react';

export type OrbitPageBoundaryProps = {
  children: ReactNode;
  title: string;
  retry: string;
};

type OrbitPageBoundaryState = { failed: boolean };

/**
 * Frontera de error del slot de página lazy. Si un chunk no se puede descargar
 * (disco, antivirus, actualización a medias), la pestaña muestra un error con
 * salida de reintento en vez de quedarse en el fallback de Suspense para
 * siempre. El reintento recarga la app: los chunks vuelven a resolverse desde
 * el embebido y el estado de navegación se restaura por su propia vía.
 */
export class OrbitPageBoundary extends Component<
  OrbitPageBoundaryProps,
  OrbitPageBoundaryState
> {
  state: OrbitPageBoundaryState = { failed: false };

  static getDerivedStateFromError(): OrbitPageBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="orbit-page-error" role="alert">
          <p>{this.props.title}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {this.props.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
