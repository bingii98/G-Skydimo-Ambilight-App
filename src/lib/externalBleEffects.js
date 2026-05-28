import catalog from "../../data/elkBleEffectCatalog.json";
import { COLOR_MODES } from "./colorModes";

export const EXTERNAL_BLE_EFFECT_CATALOG = catalog;

const PROFILE_EFFECT_SET = {
  MELK_OA21: "STRIPX",
  MELK_OC21: "STRIPX",
  HONEYCOMB_TRI: "STRIPX",
  MELK_OA10: "MELK_Ox",
  MELK_OA: "MELK_Ox",
  MELK_OC10: "MELK_Ox",
  LOTUS_OA10: "MELK_Ox",
  MELK_GENERIC: "STRIPX",
  ELK_BLEDOM: "STRIPX",
  ELK_BLE: "STRIPX",
  LEDBLE: "STRIPX",
};

export function resolveExternalBleEffectSetKey(deviceModel) {
  const model = String(deviceModel || "").trim().toUpperCase();
  if (PROFILE_EFFECT_SET[model]) {
    return PROFILE_EFFECT_SET[model];
  }
  if (/OA10|OC10|OG10|OF10/.test(model)) {
    return "MELK_Ox";
  }
  return "STRIPX";
}

export function listExternalBleEffects(deviceModel) {
  const setKey = resolveExternalBleEffectSetKey(deviceModel);
  return catalog[setKey] ?? catalog.STRIPX;
}

export function findExternalBleEffect(deviceModel, effectId) {
  const id = Math.round(Number(effectId));
  return listExternalBleEffects(deviceModel).find((entry) => entry.id === id) ?? null;
}

export function getExternalBleEffectLabel(deviceModel, effectId) {
  const match = findExternalBleEffect(deviceModel, effectId);
  return match?.label || `Effect ${effectId}`;
}

export function formatExternalBleEffectOptionLabel(effect) {
  return `${effect.label} (#${effect.id})`;
}

export function isBleEffectPlaybackActive(settings) {
  const effectId = Math.round(Number(settings?.bleEffectId));
  return (
    settings?.colorMode === COLOR_MODES.BLE_EFFECT &&
    Number.isFinite(effectId) &&
    effectId >= 0
  );
}

export function defaultBleEffectId(deviceModel) {
  const effects = listExternalBleEffects(deviceModel);
  return effects[0]?.id ?? 1;
}
