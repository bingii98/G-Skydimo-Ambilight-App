const catalog = require("../data/elkBleEffectCatalog.json");

const PROFILE_EFFECT_SET = {
  MELK_OA21: "STRIPX",
  MELK_OC21: "STRIPX",
  HONEYCOMB_TRI: "STRIPX",
  MELK_OA10: "MELK_Ox",
  LOTUS_OA10: "MELK_Ox",
  MELK_GENERIC: "STRIPX",
};

function resolveBleEffectSetKey(profileId) {
  return PROFILE_EFFECT_SET[profileId] || "STRIPX";
}

function listBleEffects(profileId) {
  const setKey = resolveBleEffectSetKey(profileId);
  return catalog[setKey] || catalog.STRIPX;
}

function getBleEffectLabel(profileId, effectId) {
  const id = Math.round(Number(effectId));
  const match = listBleEffects(profileId).find((entry) => entry.id === id);
  return match?.label || `Effect ${effectId}`;
}

module.exports = {
  catalog,
  resolveBleEffectSetKey,
  listBleEffects,
  getBleEffectLabel,
};
