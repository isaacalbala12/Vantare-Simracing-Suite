import { Component, type ErrorInfo, type ReactNode } from "react";

export type WidgetRenderBoundaryProps = {
  widgetId: string;
  widgetType: string;
  systemId?: string;
  children: ReactNode;
  onError?: (error: Error) => void;
};

type WidgetRenderBoundaryState = {
  error: Error | null;
};

export class WidgetRenderBoundary extends Component<
  WidgetRenderBoundaryProps,
  WidgetRenderBoundaryState
> {
  state: WidgetRenderBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WidgetRenderBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          data-testid="widget-render-diagnostic"
          data-widget-id={this.props.widgetId}
          data-widget-type={this.props.widgetType}
          data-system-id={this.props.systemId ?? ""}
          role="alert"
        >
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}