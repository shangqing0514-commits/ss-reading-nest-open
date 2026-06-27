import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useState
} from "react";

const RESOURCE_VERSION = "app-v8";
const APP_VERSION = "0.2.2";

type AppModule = {
  App: ComponentType;
};

type BootStage = "booting" | "loading-app" | "ready" | "failed";

type BootError = {
  stage: BootStage;
  message: string;
};

type BootProps = {
  loadApp?: () => Promise<AppModule>;
};

type BoundaryProps = {
  children: ReactNode;
};

type BoundaryState = {
  error?: BootError;
};

export function Boot({ loadApp = () => import("./App.js") }: BootProps) {
  const [stage, setStage] = useState<BootStage>("booting");
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<BootError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reportGlobalError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const reason = "reason" in event ? event.reason : event.error;
      if (!cancelled) {
        setError({
          stage: "failed",
          message: sanitizeErrorMessage(reason)
        });
      }
    };
    window.addEventListener("error", reportGlobalError);
    window.addEventListener("unhandledrejection", reportGlobalError);

    setStage("loading-app");
    loadApp()
      .then((module) => {
        if (cancelled) return;
        setAppComponent(() => module.App);
        setStage("ready");
      })
      .catch((reason) => {
        if (cancelled) return;
        setError({
          stage: "failed",
          message: sanitizeErrorMessage(reason)
        });
        setStage("failed");
      });

    return () => {
      cancelled = true;
      window.removeEventListener("error", reportGlobalError);
      window.removeEventListener("unhandledrejection", reportGlobalError);
    };
  }, [loadApp]);

  if (error) {
    return <BootDiagnostics stage={error.stage} errorMessage={error.message} />;
  }

  if (!AppComponent) {
    return <BootDiagnostics stage={stage} />;
  }

  return (
    <BootErrorBoundary>
      <AppComponent />
    </BootErrorBoundary>
  );
}

class BootErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      error: {
        stage: "failed",
        message: sanitizeErrorMessage(error)
      }
    };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    console.error("SxS reading nest boot failed", sanitizeErrorMessage(error));
  }

  render() {
    if (this.state.error) {
      return (
        <BootDiagnostics
          stage={this.state.error.stage}
          errorMessage={this.state.error.message}
        />
      );
    }
    return this.props.children;
  }
}

export function BootDiagnostics({
  stage,
  errorMessage
}: {
  stage: BootStage;
  errorMessage?: string;
}) {
  const toolOutput = window.openai?.toolOutput as
    | { sourceEndpointBase?: string; bookshelfSessions?: unknown[]; recentSessions?: unknown[] }
    | undefined;
  const bookshelfCount =
    toolOutput?.bookshelfSessions?.length ?? toolOutput?.recentSessions?.length ?? 0;

  return (
    <main className="boot-diagnostics" role="alert" aria-live="polite">
      <strong>SxS 小窝加载诊断</strong>
      <p>组件还没有正常显示。请刷新小窝；如果仍是空白，把这块信息截图给 Codex。</p>
      <dl>
        <div>
          <dt>resourceVersion</dt>
          <dd>{RESOURCE_VERSION}</dd>
        </div>
        <div>
          <dt>appVersion</dt>
          <dd>{APP_VERSION}</dd>
        </div>
        <div>
          <dt>bootStage</dt>
          <dd>{stage}</dd>
        </div>
        <div>
          <dt>widgetState</dt>
          <dd>{window.openai?.widgetState ? "present" : "missing"}</dd>
        </div>
        <div>
          <dt>toolOutput</dt>
          <dd>{toolOutput ? "present" : "missing"}</dd>
        </div>
        <div>
          <dt>sourceEndpointBase</dt>
          <dd>{toolOutput?.sourceEndpointBase ? "present" : "missing"}</dd>
        </div>
        <div>
          <dt>bookshelfSessions</dt>
          <dd>{bookshelfCount}</dd>
        </div>
        {errorMessage ? (
          <div>
            <dt>error</dt>
            <dd>{errorMessage}</dd>
          </div>
        ) : null}
      </dl>
    </main>
  );
}

function sanitizeErrorMessage(reason: unknown): string {
  const raw =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "unknown boot error";
  return raw
    .replace(/\/mcp\/[^/\s"'<>]+/g, "/mcp/[redacted]")
    .replace(/\/source\/[^/\s"'<>]+/g, "/source/[redacted]")
    .replace(/private\/sources\/[^/\s"'<>]+/g, "private/sources/[redacted]")
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g, "data:image/[redacted]")
    .slice(0, 220);
}
