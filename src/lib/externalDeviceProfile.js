const EXTERNAL_MODEL_PATTERNS = [
  {
    pattern: /HONEYCOMB|TRIANGULAR.*PANEL|HEX.*PANEL|NANOLEAF|LOTUS.*TRI/i,
    model: "HONEYCOMB_TRI",
    kind: "triangle",
    defaultLedCount: 12,
    defaultTriangleCount: 4,
  },
  { pattern: /MELK-OA21/i, model: "MELK-OA21", kind: "strip", defaultLedCount: 30 },
  { pattern: /MELK-OC21/i, model: "MELK-OC21", kind: "strip", defaultLedCount: 30 },
  { pattern: /MELK-OA10/i, model: "MELK-OA10", kind: "bulb", defaultLedCount: 1 },
  { pattern: /MELK-OC10/i, model: "MELK-OC10", kind: "bulb", defaultLedCount: 1 },
  { pattern: /MELK-OA/i, model: "MELK-OA", kind: "strip", defaultLedCount: 30 },
  { pattern: /MELK-OC/i, model: "MELK-OC", kind: "strip", defaultLedCount: 30 },
  { pattern: /ELK-BLEDOM/i, model: "ELK-BLEDOM", kind: "strip", defaultLedCount: 30 },
  { pattern: /ELK-BLE/i, model: "ELK-BLE", kind: "strip", defaultLedCount: 30 },
  { pattern: /LEDBLE/i, model: "LEDBLE", kind: "strip", defaultLedCount: 30 },
  { pattern: /LEDNETWF/i, model: "LEDNETWF", kind: "strip", defaultLedCount: 60 },
];

export const EXTERNAL_LED_COUNT_PRESETS = [
  { label: "Bulb / 1 zone", value: 1 },
  { label: "5 m · 30", value: 30 },
  { label: "5 m · 60", value: 60 },
  { label: "5 m · 96", value: 96 },
  { label: "10 m · 150", value: 150 },
  { label: "10 m · 300", value: 300 },
];

export function parseExternalDeviceModel(name) {
  const text = String(name || "").trim();
  if (!text) {
    return null;
  }

  for (const entry of EXTERNAL_MODEL_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.model;
    }
  }

  const generic = text.match(/(MELK-[A-Z0-9]+|ELK-[A-Z0-9]+|LED[A-Z0-9-]*)/i);
  return generic ? generic[1].toUpperCase() : null;
}

export function getExternalDeviceProfile(name) {
  const text = String(name || "").trim();

  for (const entry of EXTERNAL_MODEL_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        model: entry.model,
        kind: entry.kind,
        defaultLedCount: entry.defaultLedCount,
        defaultTriangleCount: entry.defaultTriangleCount ?? null,
        singleZone: entry.kind !== "triangle",
        supportsPerLedOutput: false,
        perLedPreviewSupported: entry.kind === "triangle",
        supportsBleEffects: true,
        ledCountDetectable: false,
      };
    }
  }

  const model = parseExternalDeviceModel(text);
  return {
    model,
    kind: model ? "strip" : "unknown",
    defaultLedCount: 1,
    singleZone: true,
    supportsPerLedOutput: false,
    perLedPreviewSupported: false,
    supportsBleEffects: Boolean(model),
    ledCountDetectable: false,
  };
}

export function resolveExternalLedCount(device) {
  const saved = Math.round(Number(device?.ledCount));
  if (Number.isFinite(saved) && saved >= 1) {
    return {
      ledCount: saved,
      source: device?.ledCountSource === "auto" ? "auto" : "manual",
    };
  }

  const profile = getExternalDeviceProfile(device?.name);
  return {
    ledCount: profile.defaultLedCount,
    source: "auto",
  };
}

export function inferExternalLayoutKind(name) {
  const profile = getExternalDeviceProfile(name);
  if (profile.kind === "triangle") {
    return "triangle";
  }
  return profile.kind === "bulb" ? "strip" : profile.kind === "strip" ? "strip" : "strip";
}

export function buildExternalDeviceRegistration(device, existing = null) {
  const profile = getExternalDeviceProfile(device?.name);
  const hasManualCount =
    existing?.ledCountSource === "manual" &&
    Number.isFinite(Number(existing?.ledCount)) &&
    Number(existing.ledCount) >= 1;

  const defaultLedCount = hasManualCount ? Number(existing.ledCount) : profile.defaultLedCount;
  const layoutKind = existing?.layoutKind || inferExternalLayoutKind(device?.name);
  const triangleCount =
    layoutKind === "triangle"
      ? existing?.triangleCount ?? profile.defaultTriangleCount ?? 4
      : existing?.triangleCount ?? 4;

  return {
    deviceModel: existing?.deviceModel || profile.model,
    layoutKind,
    triangleCount,
    stripLedCount: existing?.stripLedCount ?? defaultLedCount,
    ledCount:
      layoutKind === "triangle"
        ? triangleCount * 3
        : defaultLedCount,
    ledCountSource: hasManualCount ? "manual" : "auto",
    singleZone: profile.singleZone,
    supportsPerLedOutput: false,
    perLedPreviewSupported: layoutKind === "triangle",
  };
}
