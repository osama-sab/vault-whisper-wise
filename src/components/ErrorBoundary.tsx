import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time errors so a single bad value cannot blank the window.
 *
 * This is not theoretical: formatMoney() used to throw RangeError on an
 * incomplete currency code, and because the packaged app has no menu bar there
 * are no DevTools to find out why the screen went white.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Pocket Money crashed while rendering:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-5 space-y-3">
          <h1 className="font-semibold text-lg">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Your data is safe — it is stored locally and was not affected. Reloading usually clears this.
          </p>
          <pre className="text-[11px] bg-secondary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2"
              onClick={() => location.reload()}
            >
              Reload
            </button>
            <button
              className="flex-1 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium py-2"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
