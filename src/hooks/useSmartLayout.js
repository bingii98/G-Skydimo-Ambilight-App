import { useEffect, useMemo, useState } from "react";

/**
 * Layout theo ngữ cảnh:
 * - setup: chưa kết nối hoặc cần xử lý (SkyDimo.exe, cổng bận) → ưu tiên kết nối
 * - studio: đã kết nối → ưu tiên điều khiển màu
 */
export function useSmartLayout({ connected, skydimoRunning, ports }) {
  const hasBusyPort = ports?.some((port) => port.status === "busy");
  const needsAttention = skydimoRunning || hasBusyPort;

  const layoutMode = connected && !needsAttention ? "studio" : "setup";

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);

  useEffect(() => {
    if (layoutMode === "setup") {
      setConnectionOpen(false);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (needsAttention) {
      setConnectionOpen(true);
    }
  }, [needsAttention]);

  const layoutClass = useMemo(
    () => `layout-${layoutMode}`,
    [layoutMode]
  );

  return {
    layoutMode,
    layoutClass,
    needsAttention,
    settingsOpen,
    setSettingsOpen,
    connectionOpen,
    setConnectionOpen,
    openSettings: () => setSettingsOpen(true),
    openConnection: () => setConnectionOpen(true),
    closeSettings: () => setSettingsOpen(false),
    closeConnection: () => setConnectionOpen(false),
  };
}
