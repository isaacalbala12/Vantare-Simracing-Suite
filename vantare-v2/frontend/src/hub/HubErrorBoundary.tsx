import { Component, type ErrorInfo, type ReactNode } from "react";

type HubErrorBoundaryProps = {
  children: ReactNode;
};

type HubErrorBoundaryState = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export class HubErrorBoundary extends Component<
  HubErrorBoundaryProps,
  HubErrorBoundaryState
> {
  state: HubErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): HubErrorBoundaryState {
    return { error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[HubErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (this.state.error) {
      const { error, errorInfo } = this.state;
      return (
        <div
          data-testid="hub-error-boundary"
          className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white p-8"
        >
          <div className="max-w-lg w-full space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="font-sans font-bold text-xl tracking-tight text-vantare-red-400">
                Hub no pudo renderizarse
              </h1>
              <p className="text-sm text-vantare-textMuted">
                Se detectó un error durante la carga del Hub. Puede ser un
                problema temporal.
              </p>
            </div>

            <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-vantare-textDim hover:text-white">
                Detalle técnico
              </summary>
              <pre
                data-testid="hub-error-detail"
                className="mt-3 max-h-60 overflow-auto text-[11px] font-mono text-vantare-textDim whitespace-pre-wrap break-all"
              >
                {error.message}
                {errorInfo?.componentStack
                  ? `\n\nComponent stack:${errorInfo.componentStack}`
                  : ""}
              </pre>
            </details>

            <button
              type="button"
              data-testid="hub-error-retry"
              onClick={this.handleRetry}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-3 text-sm font-bold uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
