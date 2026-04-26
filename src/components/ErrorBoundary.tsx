import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the overlay to identify which subtree failed. */
  name?: string;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render-time errors anywhere below it and shows a friendly fallback
 * card instead of a blank screen. In dev, also surfaces the failing component
 * stack so issues like "Component is not a function" are easier to pinpoint.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info);
  }

  private reset = () => this.setState({ error: null, componentStack: null });

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const isDev = import.meta.env.DEV;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 text-card-foreground shadow-lg">
          <div className="mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-base font-semibold">
              Something broke{this.props.name ? ` in ${this.props.name}` : ""}
            </h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while rendering."}
          </p>
          {isDev && componentStack && (
            <pre className="mb-4 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-tight text-muted-foreground">
              {componentStack.trim()}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="brand" onClick={this.reset}>
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
