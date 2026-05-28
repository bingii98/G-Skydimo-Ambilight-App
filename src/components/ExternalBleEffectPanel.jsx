import { useMemo, useState } from "react";
import { Text, Tooltip } from "@mantine/core";
import { IconActivity, IconSearch, IconX } from "@tabler/icons-react";
import { COLOR_MODES } from "../lib/colorModes";
import {
  defaultBleEffectId,
  listExternalBleEffects,
} from "../lib/externalBleEffects";
import {
  BLE_EFFECT_GROUP_IDS,
  BLE_EFFECT_GROUP_OPTIONS,
  enrichBleEffectsForUi,
  filterBleEffects,
  getBleEffectIcon,
} from "../lib/externalBleEffectUi";
import { ExternalBleEffectTuningSliders } from "./ExternalBleEffectTuningSliders";

export function ExternalBleEffectPanel({
  deviceModel,
  settings,
  onChange,
  connected = false,
  ledOn = true,
}) {
  const [effectGroup, setEffectGroup] = useState(BLE_EFFECT_GROUP_IDS.ALL);
  const [effectQuery, setEffectQuery] = useState("");

  const catalog = useMemo(
    () => enrichBleEffectsForUi(listExternalBleEffects(deviceModel)),
    [deviceModel]
  );

  const visibleEffects = useMemo(
    () => filterBleEffects(catalog, { group: effectGroup, query: effectQuery }),
    [catalog, effectGroup, effectQuery]
  );

  const activeId = Math.round(Number(settings?.bleEffectId));
  const hasActiveId = Number.isFinite(activeId) && activeId >= 0;
  const hasEffectFilters =
    effectGroup !== BLE_EFFECT_GROUP_IDS.ALL || effectQuery.trim().length > 0;

  const selectEffect = (id) => {
    onChange({
      colorMode: COLOR_MODES.BLE_EFFECT,
      bleEffectId: id,
    });
  };

  return (
    <div className="animation-panel external-ble-effect-panel">
      <Text size="xs" c="dimmed" mb="sm" lh={1.45}>
        {catalog.length} firmware modes on chip. Not every ID works on all devices.
        {!connected
          ? " Connect to run on hardware."
          : !ledOn
            ? " Turn LEDs on to preview."
            : " Speed and brightness apply when you change controls."}
      </Text>

      <div className="animation-effect-picker">
        <div className="animation-effect-picker__bar">
          <div className="animation-effect-picker__filters" role="tablist" aria-label="Effect categories">
            {BLE_EFFECT_GROUP_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`animation-effect-picker__filter ${effectGroup === id ? "animation-effect-picker__filter--active" : ""}`}
                aria-selected={effectGroup === id}
                onClick={() => setEffectGroup(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="animation-effect-picker__search">
            <IconSearch size={14} stroke={1.75} aria-hidden />
            <input
              type="search"
              value={effectQuery}
              onChange={(event) => setEffectQuery(event.currentTarget.value)}
              placeholder="Search…"
              aria-label="Search firmware effects"
            />
            {effectQuery ? (
              <button
                type="button"
                className="animation-effect-picker__search-clear"
                onClick={() => setEffectQuery("")}
                aria-label="Clear search"
              >
                <IconX size={12} stroke={1.75} />
              </button>
            ) : null}
          </label>
        </div>

        {visibleEffects.length === 0 ? (
          <Text size="xs" c="dimmed" className="animation-effect-picker__empty">
            No effects match. Try another category or search term.
          </Text>
        ) : (
          <div className="animation-effect-grid" role="list">
            {visibleEffects.map((effect) => {
              const Icon = getBleEffectIcon(effect.key) || IconActivity;
              const active = hasActiveId && activeId === effect.id;
              return (
                <Tooltip key={effect.id} label={effect.hint} openDelay={300}>
                  <button
                    type="button"
                    role="listitem"
                    className={`animation-effect-chip ${active ? "animation-effect-chip--active" : ""}`}
                    onClick={() => selectEffect(effect.id)}
                    aria-pressed={active}
                    aria-label={effect.hint}
                  >
                    <span className="animation-effect-chip__icon" aria-hidden>
                      <Icon size={18} stroke={1.75} />
                    </span>
                    <span className="animation-effect-chip__label">{effect.label}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}

        {hasEffectFilters ? (
          <Text size="xs" c="dimmed" className="animation-effect-picker__meta">
            {visibleEffects.length} effect{visibleEffects.length === 1 ? "" : "s"}
          </Text>
        ) : null}
      </div>

      <ExternalBleEffectTuningSliders
        speed={settings?.animationSpeed ?? 50}
        brightness={settings?.brightness ?? 100}
        onChange={onChange}
      />

      {!hasActiveId ? (
        <Text size="xs" c="dimmed" lh={1.45} className="animation-panel__idle-hint">
          Select an effect above. Default starts at #{defaultBleEffectId(deviceModel)}.
        </Text>
      ) : null}
    </div>
  );
}

export default ExternalBleEffectPanel;
