import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

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
      return <HubErrorFallback error={error} errorInfo={errorInfo} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

type HubErrorFallbackProps = {
  error: Error;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
};

function HubErrorFallback({ error, errorInfo, onRetry }: HubErrorFallbackProps) {
  const { t } = useI18n();

  return (
    <div
      data-testid="hub-error-boundary"
      className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white p-8"
    >
      <div className="max-w-lg w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-sans font-bold text-xl tracking-tight text-vantare-red-400">
            {t("hub.error.title")}
          </h1>
          <p className="text-sm text-vantare-textMuted">{t("hub.error.body")}</p>
        </div>

        <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-vantare-textDim hover:text-white">
            {t("hub.error.detail")}
          </summary>
          <pre
            data-testid="hub-error-detail"
            className="mt-3 max-h-60 overflow-auto text-[11px] font-mono text-vantare-textDim whitespace-pre-wrap break-all"
          >
            {error.message}
            {errorInfo?.componentStack
              ? `

Component stack:${errorInfo.componentStack}`
              : ""}
          </pre>
        </details>

        <button
          type="button"
          data-testid="hub-error-retry"
          onClick={onRetry}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-3 text-sm font-bold uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
        >
          {t("hub.error.retry")}
        </button>
      </div>
    </div>
  );
}
