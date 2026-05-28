import { Tooltip } from "@mantine/core";
import { IconPalette, IconPlugConnected, IconSettings } from "@tabler/icons-react";

const NAV_ITEMS = [
  { id: "devices", label: "Devices", icon: IconPlugConnected },
  { id: "studio", label: "Color control", icon: IconPalette },
  { id: "settings", label: "Settings", icon: IconSettings },
];

export function NavRail({ active, onChange, connected, embedded = false }) {
  return (
    <nav
      className={`nav-rail${embedded ? " nav-rail--embedded" : ""}`}
      aria-label="Navigation"
    >
      <div className="nav-rail__top">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id} label={label} position="right" withArrow openDelay={300}>
            <button
              type="button"
              className={`nav-rail__btn ${active === id ? "nav-rail__btn--active" : ""}`}
              onClick={() => onChange(id)}
              aria-label={label}
              aria-current={active === id ? "page" : undefined}
            >
              <Icon size={22} stroke={1.8} />
              {id === "devices" && connected && <span className="nav-rail__dot" />}
            </button>
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}
