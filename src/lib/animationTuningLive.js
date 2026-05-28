const liveTuning = {
  speed: 50,
  intensity: 50,
};

export function applyAnimationTuningLive(settings) {
  liveTuning.speed = settings?.animationSpeed ?? 50;
  liveTuning.intensity = settings?.animationIntensity ?? 50;
}

export function patchAnimationTuningLive(patch) {
  if (patch?.speed != null) {
    liveTuning.speed = patch.speed;
  }
  if (patch?.intensity != null) {
    liveTuning.intensity = patch.intensity;
  }
}

export function resolveAnimationSettings(settings) {
  if (!settings || typeof settings !== "object") {
    return settings;
  }

  return {
    ...settings,
    animationSpeed: liveTuning.speed,
    animationIntensity: liveTuning.intensity,
  };
}
