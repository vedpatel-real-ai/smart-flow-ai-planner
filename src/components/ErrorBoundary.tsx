import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

import DemoStorageControls from "./DemoStorageControls";

interface Props {
  children: ReactNode;
  mode?: "demo" | "cloud" | null;
}

interface State {
  error: Error | null;
}

/**
 * Generic React Error Boundary that prevents unhandled render exceptions
 * from producing a blank white screen.
 *
 * In Demo Mode it offers data-export and workspace-reset actions.
 * In Cloud Mode it displays a simple reload prompt.
 *
 * This boundary never silently deletes browser storage.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isDemo = this.props.mode === "demo";

    return (
      <main className="min-h-screen grid place-items-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <CardTitle role="alert">Something went wrong</CardTitle>
            </div>
            <CardDescription>
              An unexpected error occurred while loading this view. Your data has not been modified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <details className="rounded border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleReload}>Reload page</Button>
              {isDemo && <DemoStorageControls />}
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }
}
