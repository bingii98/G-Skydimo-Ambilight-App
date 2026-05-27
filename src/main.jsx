import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { CrashScreen } from "./components/CrashScreen";
import { APP_NAME, SETTINGS_KEY } from "./lib/constants";
import { applyCssVariables, mantineTheme } from "./theme";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";

applyCssVariables();

function Root({ App }) {
  useEffect(() => {
    applyCssVariables();
  }, []);

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="light">
      <Notifications
        position="bottom-right"
        limit={4}
        zIndex={1000}
        containerWidth={400}
        withinPortal
        classNames={{ root: "app-toast-stack" }}
      />
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </MantineProvider>
  );
}

function BootError({ error }) {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="light">
      <CrashScreen
        error={error}
        errorInfo={null}
        onReload={() => window.location.reload()}
        onResetAndReload={() => {
          localStorage.removeItem(SETTINGS_KEY);
          window.location.reload();
        }}
      />
    </MantineProvider>
  );
}

async function boot() {
  const rootElement = document.getElementById("root");

  try {
    const { default: App } = await import("./App.jsx");
    const app = <Root App={App} />;
    ReactDOM.createRoot(rootElement).render(
      import.meta.env.PROD ? <React.StrictMode>{app}</React.StrictMode> : app
    );
  } catch (error) {
    console.error(`${APP_NAME} boot failed:`, error);
    const bootError = error instanceof Error ? error : new Error(String(error));
    ReactDOM.createRoot(rootElement).render(<BootError error={bootError} />);
  }
}

boot();
