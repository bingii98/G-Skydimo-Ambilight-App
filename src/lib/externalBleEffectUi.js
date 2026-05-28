import {
  IconActivity,
  IconBolt,
  IconConfetti,
  IconFlame,
  IconMeteor,
  IconMoon,
  IconPalette,
  IconRipple,
  IconSparkles,
  IconSunset2,
  IconTransitionRight,
  IconWaveSine,
} from "@tabler/icons-react";

export const BLE_EFFECT_GROUP_IDS = {
  ALL: "all",
  FLOW: "flow",
  MOTION: "motion",
  GLOW: "glow",
  FLASH: "flash",
  MUSIC: "music",
};

export const BLE_EFFECT_GROUP_OPTIONS = [
  { id: BLE_EFFECT_GROUP_IDS.ALL, label: "All" },
  { id: BLE_EFFECT_GROUP_IDS.FLOW, label: "Flow" },
  { id: BLE_EFFECT_GROUP_IDS.MOTION, label: "Motion" },
  { id: BLE_EFFECT_GROUP_IDS.GLOW, label: "Glow" },
  { id: BLE_EFFECT_GROUP_IDS.FLASH, label: "Flash" },
  { id: BLE_EFFECT_GROUP_IDS.MUSIC, label: "Music" },
];

export function inferBleEffectGroup(key = "") {
  const normalized = String(key).toLowerCase();
  if (normalized.startsWith("music_")) {
    return BLE_EFFECT_GROUP_IDS.MUSIC;
  }
  if (/flash|strobe|party|bar_flash|pulse_flash/.test(normalized)) {
    return BLE_EFFECT_GROUP_IDS.FLASH;
  }
  if (/fire|pulse|fade|breath|curtain/.test(normalized)) {
    return BLE_EFFECT_GROUP_IDS.GLOW;
  }
  if (/chase|elevator|flow|scroll|action|meteor|jump/.test(normalized)) {
    return BLE_EFFECT_GROUP_IDS.MOTION;
  }
  if (/rainbow|spectrum|color|wave|autoplay/.test(normalized)) {
    return BLE_EFFECT_GROUP_IDS.FLOW;
  }
  return BLE_EFFECT_GROUP_IDS.FLOW;
}

const BLE_EFFECT_ICON_RULES = [
  { test: /rainbow|spectrum|autoplay|color_wave|jump_rgb|fade_rgb/, icon: IconPalette },
  { test: /fire/, icon: IconFlame },
  { test: /chase|elevator|scroll|action|meteor|jump/, icon: IconBolt },
  { test: /fade|sunset|curtain|breath|blue_scroll/, icon: IconSunset2 },
  { test: /pulse|ripple|wave/, icon: IconRipple },
  { test: /flash|strobe|party|bar_flash|pulse_flash/, icon: IconSparkles },
  { test: /music/, icon: IconActivity },
  { test: /disco|confetti|magic/, icon: IconConfetti },
  { test: /moon|night/, icon: IconMoon },
  { test: /transition|flow/, icon: IconTransitionRight },
];

export function getBleEffectIcon(key = "") {
  const normalized = String(key).toLowerCase();
  for (const rule of BLE_EFFECT_ICON_RULES) {
    if (rule.test.test(normalized)) {
      return rule.icon;
    }
  }
  return IconWaveSine;
}

export function enrichBleEffectsForUi(effects = []) {
  return effects.map((effect) => ({
    ...effect,
    group: inferBleEffectGroup(effect.key),
    hint: `Firmware effect #${effect.id} · ${effect.label}`,
  }));
}

export function filterBleEffects(effects = [], { group = BLE_EFFECT_GROUP_IDS.ALL, query = "" } = {}) {
  const normalizedQuery = query.trim().toLowerCase();

  return effects.filter((effect) => {
    if (group !== BLE_EFFECT_GROUP_IDS.ALL && effect.group !== group) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      effect.label.toLowerCase().includes(normalizedQuery) ||
      effect.key.toLowerCase().includes(normalizedQuery) ||
      String(effect.id).includes(normalizedQuery)
    );
  });
}
