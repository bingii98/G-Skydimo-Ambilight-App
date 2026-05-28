import { Button, Text } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";

const ACTION_COLORS = {
  info: "cyan",
  warning: "orange",
  danger: "red",
  success: "teal",
};

const VARIANTS = {
  info: {
    accent: "var(--sk-live)",
    accentSoft: "rgba(14, 165, 233, 0.14)",
    border: "rgba(14, 165, 233, 0.22)",
    bg: "linear-gradient(135deg, var(--sk-bg-panel) 0%, color-mix(in srgb, var(--sk-bg-panel) 88%, var(--sk-live)) 100%)",
  },
  warning: {
    accent: "var(--sk-warning)",
    accentSoft: "rgba(217, 119, 6, 0.14)",
    border: "rgba(217, 119, 6, 0.24)",
    bg: "linear-gradient(135deg, var(--sk-bg-panel) 0%, color-mix(in srgb, var(--sk-bg-panel) 88%, var(--sk-warning)) 100%)",
  },
  danger: {
    accent: "var(--sk-danger)",
    accentSoft: "rgba(220, 38, 38, 0.12)",
    border: "rgba(220, 38, 38, 0.22)",
    bg: "linear-gradient(135deg, var(--sk-bg-panel) 0%, color-mix(in srgb, var(--sk-bg-panel) 88%, var(--sk-danger)) 100%)",
  },
  success: {
    accent: "var(--sk-success)",
    accentSoft: "rgba(22, 163, 74, 0.12)",
    border: "rgba(22, 163, 74, 0.22)",
    bg: "linear-gradient(135deg, var(--sk-bg-panel) 0%, color-mix(in srgb, var(--sk-bg-panel) 88%, var(--sk-success)) 100%)",
  },
};

export function StatusBanner({
  variant = "info",
  title,
  message,
  icon: Icon,
  action,
  className = "",
}) {
  const tone = VARIANTS[variant] || VARIANTS.info;

  return (
    <div
      className={`status-banner status-banner--${variant} ${className}`.trim()}
      role="status"
      style={{
        "--banner-accent": tone.accent,
        "--banner-accent-soft": tone.accentSoft,
        "--banner-border": tone.border,
        "--banner-bg": tone.bg,
      }}
    >
      <div className="status-banner__accent" aria-hidden />

      <div className="status-banner__icon" aria-hidden>
        {Icon && <Icon size={18} stroke={1.75} />}
      </div>

      <div className="status-banner__content">
        {title && (
          <Text fw={700} size="sm" className="status-banner__title">
            {title}
          </Text>
        )}
        <Text size="sm" c="dimmed" className="status-banner__message">
          {message}
        </Text>
      </div>

      {action && (
        <Button
          variant="light"
          color={ACTION_COLORS[variant] || "teal"}
          size="compact-sm"
          radius="sm"
          className="status-banner__action"
          rightSection={<IconChevronRight size={14} />}
          onClick={action.onClick}
          loading={action.loading}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
