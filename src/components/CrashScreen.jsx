import { useMemo, useState } from "react";
import { Button, Collapse, Group, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { APP_NAME, APP_NAME_PRIMARY, APP_NAME_TAG } from "../lib/constants";
import appLogoUrl from "../assets/app-logo.png";

function buildErrorReport(error, errorInfo) {
  const parts = [
    `${APP_NAME} crash report`,
    `Time: ${new Date().toISOString()}`,
    "",
    "Message:",
    error?.message || "Unknown error",
    "",
    "Stack:",
    error?.stack || "(no stack trace)",
  ];

  if (errorInfo?.componentStack) {
    parts.push("", "Component stack:", errorInfo.componentStack.trim());
  }

  return parts.join("\n");
}

export function CrashScreen({ error, errorInfo, onReload, onResetAndReload }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const report = useMemo(() => buildErrorReport(error, errorInfo), [error, errorInfo]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="crash-screen" role="alertdialog" aria-labelledby="crash-title" aria-modal="true">
      <div className="crash-screen__backdrop" aria-hidden />

      <div className="crash-screen__frame">
        <header className="crash-screen__brand">
          <span className="crash-screen__logo" aria-hidden>
            <img src={appLogoUrl} alt="" draggable={false} />
          </span>
          <div className="crash-screen__brand-text">
            <span className="crash-screen__brand-name">{APP_NAME_PRIMARY}</span>
            <span className="crash-screen__brand-tag">{APP_NAME_TAG}</span>
          </div>
        </header>

        <section className="crash-screen__card">
          <div className="crash-screen__accent" aria-hidden />

          <div className="crash-screen__icon" aria-hidden>
            <IconAlertTriangle size={22} stroke={1.75} />
          </div>

          <div className="crash-screen__body">
            <Text id="crash-title" fw={700} size="lg" className="crash-screen__title">
              Something went wrong
            </Text>

            <Text size="sm" c="dimmed" className="crash-screen__lead">
              {APP_NAME} hit an unexpected error and stopped. Your LED device is unaffected.
              Try reloading the app, or reset saved settings if the problem started after a recent change.
            </Text>

            <div className="crash-screen__message">
              <Text size="xs" tt="uppercase" fw={700} className="crash-screen__message-label">
                Error
              </Text>
              <Text size="sm" className="crash-screen__message-text">
                {error?.message || "Unknown error"}
              </Text>
            </div>

            <div className="crash-screen__details">
              <button
                type="button"
                className={`crash-screen__details-toggle${detailsOpen ? " is-open" : ""}`}
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                <span>Technical details</span>
                <IconChevronDown size={16} stroke={1.75} />
              </button>

              <Collapse in={detailsOpen}>
                <pre className="crash-screen__stack">{report}</pre>
              </Collapse>
            </div>

            <Group gap="sm" className="crash-screen__actions">
              <Button
                leftSection={<IconRefresh size={16} stroke={1.75} />}
                color="teal"
                radius="sm"
                onClick={onReload}
              >
                Reload app
              </Button>

              <Button
                variant="light"
                color="red"
                radius="sm"
                leftSection={<IconTrash size={16} stroke={1.75} />}
                onClick={onResetAndReload}
              >
                Reset settings & reload
              </Button>

              <Button
                variant="subtle"
                color="gray"
                radius="sm"
                leftSection={copied ? <IconCheck size={16} stroke={1.75} /> : <IconCopy size={16} stroke={1.75} />}
                onClick={handleCopy}
              >
                {copied ? "Copied" : "Copy report"}
              </Button>
            </Group>
          </div>
        </section>
      </div>
    </div>
  );
}
