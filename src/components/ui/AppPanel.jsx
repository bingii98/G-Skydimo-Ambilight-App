import { Paper, Text } from "@mantine/core";

export function AppPanel({
  title,
  titleIcon: TitleIcon,
  description,
  rightSection,
  children,
  className = "",
  variant = "soft",
  noPadding = false,
  compact = false,
  ...props
}) {
  const variantClass =
    variant === "soft"
      ? "app-panel--soft"
      : variant === "glass"
        ? "app-panel--glass"
        : variant === "accent"
          ? "app-panel--accent"
          : "";

  return (
    <Paper
      className={`app-panel ${variantClass} ${compact ? "app-panel--compact" : ""} ${className}`}
      p={noPadding ? 0 : compact ? "sm" : "md"}
      {...props}
    >
      {(title || description || rightSection) && (
        <div className="app-panel-head">
          <div>
            {title && (
              <PanelTitle icon={TitleIcon} size="sm">
                {title}
              </PanelTitle>
            )}
            {description && (
              <Text size="xs" c="dimmed" mt={2}>
                {description}
              </Text>
            )}
          </div>
          {rightSection}
        </div>
      )}
      {children}
    </Paper>
  );
}

export function PanelTitle({ icon: Icon, children, size = "lg", className = "" }) {
  const iconSize = size === "lg" ? 20 : size === "md" ? 18 : 16;

  return (
    <div className={`panel-title panel-title--${size} ${className}`.trim()}>
      {Icon && (
        <span className="panel-title__icon" aria-hidden>
          <Icon size={iconSize} stroke={1.75} />
        </span>
      )}
      <Text fw={700} size={size} className="panel-title__text">
        {children}
      </Text>
    </div>
  );
}

export function SectionLabel({ children, right, icon: Icon, className = "" }) {
  return (
    <div className={`app-section-label ${className}`.trim()}>
      <div className="section-label__main">
        {Icon && (
          <span className="section-label__icon" aria-hidden>
            <Icon size={14} stroke={1.75} />
          </span>
        )}
        <Text size="xs" tt="uppercase" fw={700} c="dimmed" className="section-label__text">
          {children}
        </Text>
      </div>
      {right}
    </div>
  );
}
