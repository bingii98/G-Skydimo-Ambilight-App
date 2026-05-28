import { describe, expect, it } from "vitest";
import {
  BLE_EFFECT_GROUP_IDS,
  enrichBleEffectsForUi,
  filterBleEffects,
  inferBleEffectGroup,
} from "./externalBleEffectUi";

describe("externalBleEffectUi", () => {
  const sample = enrichBleEffectsForUi([
    { id: 1, key: "rainbow_up", label: "Rainbow Up" },
    { id: 61, key: "fire", label: "Fire" },
    { id: 386, key: "music_rainbow", label: "Music Rainbow" },
  ]);

  it("infers effect groups from keys", () => {
    expect(inferBleEffectGroup("rainbow_up")).toBe(BLE_EFFECT_GROUP_IDS.FLOW);
    expect(inferBleEffectGroup("fire")).toBe(BLE_EFFECT_GROUP_IDS.GLOW);
    expect(inferBleEffectGroup("music_rainbow")).toBe(BLE_EFFECT_GROUP_IDS.MUSIC);
  });

  it("filters by group and search query", () => {
    expect(filterBleEffects(sample, { group: BLE_EFFECT_GROUP_IDS.MUSIC })).toHaveLength(1);
    expect(filterBleEffects(sample, { query: "fire" })[0]?.id).toBe(61);
    expect(filterBleEffects(sample, { query: "61" })[0]?.id).toBe(61);
  });
});
