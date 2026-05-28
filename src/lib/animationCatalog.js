export const ANIMATION_ID_ALIASES = {
  blend: "rainbow",
  ocean: "aurora",
  lava: "fire",
  comet: "chase",
  twinkle: "sparkle",
  candle: "breathe",
  neon: "police",
};

export function migrateAnimationId(animationId) {
  if (typeof animationId !== "string") {
    return animationId;
  }

  const key = animationId.trim().toLowerCase();
  return ANIMATION_ID_ALIASES[key] || key;
}
