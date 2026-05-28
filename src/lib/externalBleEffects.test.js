import { describe, expect, it } from "vitest";
import {
  defaultBleEffectId,
  getExternalBleEffectLabel,
  isBleEffectPlaybackActive,
  listExternalBleEffects,
} from "./externalBleEffects";
import { COLOR_MODES } from "./colorModes";

describe("externalBleEffects", () => {
  it("lists full STRIPX catalog for MELK-OA21", () => {
    const effects = listExternalBleEffects("MELK-OA21");
    expect(effects.length).toBeGreaterThan(200);
    expect(effects.some((entry) => entry.id === 1 && entry.label === "Rainbow Up")).toBe(true);
    expect(effects.some((entry) => entry.id === 61 && entry.label === "Fire")).toBe(true);
  });

  it("detects ble effect playback mode", () => {
    expect(
      isBleEffectPlaybackActive({
        colorMode: COLOR_MODES.BLE_EFFECT,
        bleEffectId: 3,
      })
    ).toBe(true);
    expect(
      isBleEffectPlaybackActive({
        colorMode: COLOR_MODES.SINGLE,
        bleEffectId: 3,
      })
    ).toBe(false);
  });

  it("resolves default effect id", () => {
    expect(defaultBleEffectId("MELK-OA21")).toBe(1);
    expect(getExternalBleEffectLabel("MELK-OA21", 61)).toBe("Fire");
  });
});
