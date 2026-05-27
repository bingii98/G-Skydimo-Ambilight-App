import { Text } from "@mantine/core";
import {
  SCREEN_SYNC_REGION_OPTIONS,
  SCREEN_SYNC_REGIONS,
  resolveScreenSyncRegion,
} from "../lib/screenSync";

function RegionIllustration({ region, active }) {
  const accent = active ? "var(--sk-accent)" : "rgba(13, 148, 136, 0.55)";
  const accentSoft = active ? "rgba(13, 148, 136, 0.28)" : "rgba(13, 148, 136, 0.12)";
  const bezel = "rgba(15, 35, 30, 0.18)";
  const screen = "rgba(255, 255, 255, 0.92)";
  const dim = "rgba(15, 35, 30, 0.08)";

  return (
    <svg
      viewBox="0 0 88 56"
      className="screen-sync-region__art"
      aria-hidden
      focusable="false"
    >
      <rect x="6" y="6" width="76" height="44" rx="5" fill={bezel} />
      <rect x="10" y="10" width="68" height="36" rx="3" fill={screen} stroke={dim} strokeWidth="1" />

      {region === SCREEN_SYNC_REGIONS.EDGE ? (
        <>
          <rect
            x="10"
            y="10"
            width="68"
            height="36"
            rx="3"
            fill="none"
            stroke={accent}
            strokeWidth="3"
          />
          {[
            [10, 28],
            [78, 28],
            [44, 10],
            [44, 46],
          ].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="2.6" fill={accent} />
          ))}
        </>
      ) : null}

      {region === SCREEN_SYNC_REGIONS.WIDE ? (
        <>
          <rect
            x="13"
            y="13"
            width="62"
            height="30"
            rx="2"
            fill={accentSoft}
            stroke={accent}
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <rect
            x="10"
            y="10"
            width="68"
            height="36"
            rx="3"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            opacity="0.45"
          />
        </>
      ) : null}

      {region === SCREEN_SYNC_REGIONS.FULL ? (
        <>
          <path d="M44 28 L44 10" stroke={accentSoft} strokeWidth="1.5" />
          <path d="M44 28 L78 28" stroke={accentSoft} strokeWidth="1.5" />
          <path d="M44 28 L44 46" stroke={accentSoft} strokeWidth="1.5" />
          <path d="M44 28 L10 28" stroke={accentSoft} strokeWidth="1.5" />
          <path d="M44 28 L78 10" stroke={accentSoft} strokeWidth="1.2" />
          <path d="M44 28 L78 46" stroke={accentSoft} strokeWidth="1.2" />
          <path d="M44 28 L10 46" stroke={accentSoft} strokeWidth="1.2" />
          <path d="M44 28 L10 10" stroke={accentSoft} strokeWidth="1.2" />
          <rect x="10" y="10" width="68" height="36" rx="3" fill={accentSoft} opacity="0.35" />
          <circle cx="44" cy="28" r="3" fill={accent} />
        </>
      ) : null}

      {region === SCREEN_SYNC_REGIONS.CENTER ? (
        <>
          <rect x="10" y="10" width="68" height="36" rx="3" fill={dim} />
          <rect
            x="30"
            y="20"
            width="28"
            height="16"
            rx="4"
            fill={accentSoft}
            stroke={accent}
            strokeWidth="2"
          />
          {[10, 78].flatMap((cx) =>
            [10, 46].map((cy) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" fill={accent} opacity="0.55" />
            ))
          )}
        </>
      ) : null}
    </svg>
  );
}

export function ScreenSyncRegionPicker({ settings, onChange }) {
  const activeRegion = resolveScreenSyncRegion(settings);

  return (
    <div className="screen-sync-region">
      <Text size="xs" fw={600} className="sk-field__label">
        Sample region
      </Text>
      <div className="screen-sync-region__grid" role="radiogroup" aria-label="Sample region">
        {SCREEN_SYNC_REGION_OPTIONS.map(({ id, label, description }) => {
          const active = activeRegion === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`screen-sync-region__option ${active ? "screen-sync-region__option--active" : ""}`}
              onClick={() => onChange({ screenSyncRegion: id })}
            >
              <div className="screen-sync-region__preview">
                <RegionIllustration region={id} active={active} />
              </div>
              <span className="screen-sync-region__label">{label}</span>
              <span className="screen-sync-region__hint">{description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
