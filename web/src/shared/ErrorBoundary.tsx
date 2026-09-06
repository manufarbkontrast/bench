/**
 * The one thing every document renders above its own App: a boundary that turns a render-time
 * throw into a page that still carries the Bench strip, says what happened and offers a reload -
 * instead of React unmounting the whole tree to a white page, which is what Eingang did when one
 * recording's start was blank. A class, because React 19 still exposes getDerivedStateFromError
 * to classes only. It catches render errors and nothing else: a rejected fetch or a throwing
 * event handler never reaches a boundary, by React's own contract.
 */
import { Component, type ReactNode } from "react";
import BenchNav, { type AppKey } from "./BenchNav";
import "./crash.css";

interface Props {
  active: AppKey;
  children: ReactNode;
}

interface State {
  message: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  // React hands over whatever was thrown, Error or not; the message is what the page shows.
  static getDerivedStateFromError(thrown: unknown): State {
    return {
      message: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <>
        <BenchNav active={this.props.active} />
        <main className="bench-crash">
          <div className="bench-crash-body">
            <h1 className="bench-crash-title">Diese Seite ist abgestürzt.</h1>
            <p className="bench-crash-text">
              Die Bench-Leiste oben funktioniert weiter. Der Fehler:
            </p>
            <pre className="bench-crash-error">{this.state.message}</pre>
            <button
              type="button"
              className="bench-crash-reload"
              onClick={() => window.location.reload()}
            >
              Neu laden
            </button>
          </div>
        </main>
      </>
    );
  }
}
