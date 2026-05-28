const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const MODES = {
  PALETTE_BLEND: "palette_blend",
  PALETTE_FRESH: "palette_fresh",
  SETUP: "setup",
};

const EFFECT_CATALOG = [
  { id: "rainbow", label: "Rainbow", palette: "multi" },
  { id: "chase", label: "Chase", palette: "multi" },
  { id: "breathe", label: "Breathe", palette: "single" },
  { id: "wave", label: "Wave", palette: "multi" },
  { id: "sparkle", label: "Sparkle", palette: "multi" },
  { id: "fire", label: "Fire", palette: "multi" },
  { id: "aurora", label: "Aurora", palette: "multi" },
  { id: "pulse", label: "Pulse", palette: "single" },
  { id: "strobe", label: "Strobe", palette: "single" },
  { id: "police", label: "Police", palette: "multi" },
  { id: "heartbeat", label: "Heartbeat", palette: "single" },
  { id: "scanner", label: "Scanner", palette: "single" },
  { id: "meteor", label: "Meteor", palette: "multi" },
  { id: "lightning", label: "Lightning", palette: "multi" },
  { id: "spectrum", label: "Spectrum", palette: "multi" },
  { id: "fade", label: "Fade", palette: "multi" },
];

function buildPaletteBlendPrompt({
  effectLabel,
  effectHint,
  colorFrom,
  colorTo,
  topPosition,
  bottomPosition,
  mood,
  constraints,
}) {
  const topPct = Math.round((topPosition ?? 0) * 100);
  const bottomPct = Math.round((bottomPosition ?? 1) * 100);
  const moodLine = mood?.trim() ? `User request (HIGHEST PRIORITY): "${mood.trim()}".` : "";

  return [
    `Palette for "${effectLabel}" (${effectHint}).`,
    moodLine,
    buildConstraintsLine(constraints),
    `FIXED first keyframe: ${colorFrom} at position ${topPosition ?? 0} (${topPct}%).`,
    `FIXED last keyframe: ${colorTo} at position ${bottomPosition ?? 1} (${bottomPct}%).`,
    "Add 1–3 NEW intermediate stops between them only.",
    "Intermediate colors must stay between the two anchor colors.",
    "Return 3–5 stops total with strictly increasing positions 0–1.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPaletteFreshPrompt({
  effectLabel,
  effectHint,
  paletteMode,
  mood,
  constraints,
}) {
  const stopCount = constraints?.stopCount ?? constraints?.maxStops ?? 4;
  const stopHint =
    paletteMode === "single"
      ? "Return exactly 2 stops with the SAME hex color."
      : `Return exactly ${stopCount} stops.`;

  const moodLine = mood?.trim()
    ? `User request (HIGHEST PRIORITY): "${mood.trim()}".`
    : "Create a cohesive palette.";

  const constraintLine = constraints?.instruction || buildConstraintsLine(constraints);

  return [
    `Palette for "${effectLabel}" (${effectHint}). Colors only — keep the effect unchanged.`,
    moodLine,
    constraintLine,
    constraints?.ignoreExistingPalette
      ? "Do NOT reuse or tweak the current palette/keyframe colors. Generate fresh colors from the user request only."
      : "",
    constraints?.wantsRainbow
      ? "Use a bold multi-hue rainbow spread with clearly different saturated colors."
      : 'The effect name alone must NOT dictate hues unless the user asks for them.',
    stopHint,
    "Use only #RRGGBB hex colors suitable for LEDs.",
    `Example shape: {"stops":[${Array.from({ length: Math.min(stopCount, 3) }, (_, index) => `{ "color":"#RRGGBB", "position":${index === 0 ? 0 : index === 1 ? 0.5 : 1} }`).join(", ")}]}`,
    "position is 0–1, strictly increasing.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildConstraintsLine(constraints) {
  if (!constraints) return "";
  const parts = [];
  if (constraints.families?.length) {
    parts.push(`Allowed color families: ${constraints.families.join(", ")}.`);
  }
  if (constraints.maxStops) {
    parts.push(`Use exactly ${constraints.stopCount || constraints.maxStops} stops.`);
  }
  if (constraints.muted) {
    parts.push("Prefer soft, muted tones.");
  }
  if (constraints.instruction) {
    parts.push(constraints.instruction);
  }
  return parts.join(" ");
}

function buildSetupPrompt({ baseColor, currentEffectId, mood }) {
  const catalog = EFFECT_CATALOG.map((item) => `${item.id} (${item.label}, ${item.palette} color)`).join(
    ", "
  );
  const moodLine = mood?.trim()
    ? `User mood or request: "${mood.trim()}".`
    : `Base color hint: ${baseColor || "#FFD700"}.`;

  return [
    "Pick the best LED perimeter animation for a monitor backlight.",
    moodLine,
    currentEffectId ? `Current effect (may change): ${currentEffectId}.` : "No effect selected yet.",
    `Available animationId values: ${catalog}.`,
    "Return JSON:",
    '{"animationId":"aurora","speed":45,"intensity":55,"stops":[{"color":"#003366","position":0},{"color":"#00AACC","position":1}]}',
    "speed and intensity are integers 1–100.",
    "Use 2 stops for single-color effects, 3–5 for multi-color effects.",
  ].join(" ");
}

/**
 * @param {string} apiKey
 * @param {{
 *   mode?: string,
 *   animationId?: string,
 *   effectLabel?: string,
 *   effectHint?: string,
 *   paletteMode?: 'single'|'multi',
 *   baseColor?: string,
 *   colorFrom?: string,
 *   colorTo?: string,
 *   topPosition?: number,
 *   bottomPosition?: number,
 *   mood?: string,
 *   constraints?: object,
 * }} options
 */
async function fetchAnimationSuggestion(apiKey, options = {}) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error("OpenAI API key is required. Add it in Settings.");
  }

  const mode = options.mode || MODES.SETUP;
  const colorFrom = typeof options.colorFrom === "string" ? options.colorFrom : "#FFD700";
  const colorTo = typeof options.colorTo === "string" ? options.colorTo : "#FF0066";
  const baseColor = typeof options.baseColor === "string" ? options.baseColor : colorFrom;
  const topPosition = typeof options.topPosition === "number" ? options.topPosition : 0;
  const bottomPosition = typeof options.bottomPosition === "number" ? options.bottomPosition : 1;
  const effectLabel = options.effectLabel || "Animation";
  const effectHint = options.effectHint || "LED perimeter effect";
  const paletteMode = options.paletteMode === "single" ? "single" : "multi";
  const constraints = options.constraints || null;

  let systemContent;
  let userContent;

  if (mode === MODES.PALETTE_BLEND) {
    systemContent =
      'You output JSON only: {"stops":[{"color":"#RRGGBB","position":0}]}. ' +
      "Follow the user's color request exactly. First and last stops must match anchor colors when provided.";
    userContent = buildPaletteBlendPrompt({
      effectLabel,
      effectHint,
      colorFrom,
      colorTo,
      topPosition,
      bottomPosition,
      mood: options.mood,
      constraints,
    });
  } else if (mode === MODES.PALETTE_FRESH) {
    const wantsRainbow = Boolean(constraints?.wantsRainbow);
    systemContent =
      'You output JSON only: {"stops":[{"color":"#RRGGBB","position":0}]}. ' +
      (wantsRainbow
        ? "Generate a fresh saturated multi-hue rainbow palette. Ignore any existing keyframe colors."
        : "Obey the user's requested color families and stop count exactly. Do not default to rainbow unless asked.");
    userContent = buildPaletteFreshPrompt({
      effectLabel,
      effectHint,
      paletteMode,
      mood: options.mood,
      constraints,
    });
  } else {
    systemContent =
      'You output JSON only: {"animationId":"wave","speed":50,"intensity":50,"stops":[...]}. ' +
      "animationId must be one of the listed ids. speed and intensity are integers 1-100.";
    userContent = buildSetupPrompt({
      baseColor,
      currentEffectId: options.animationId,
      mood: options.mood,
    });
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: mode === MODES.SETUP ? 0.75 : mode === MODES.PALETTE_FRESH ? 0.45 : 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error?.message || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty response from OpenAI");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Could not parse AI animation response");
  }

  if (mode === MODES.SETUP) {
    if (!parsed?.animationId || !Array.isArray(parsed?.stops) || parsed.stops.length < 1) {
      throw new Error("AI response missing animation setup");
    }
    return parsed;
  }

  const stops = Array.isArray(parsed?.stops)
    ? parsed.stops
    : Array.isArray(parsed?.gradient)
      ? parsed.gradient
      : null;

  if (!stops || stops.length < 2) {
    throw new Error("AI response missing palette stops");
  }

  return { stops };
}

module.exports = { fetchAnimationSuggestion, AI_ANIMATION_MODES: MODES, EFFECT_CATALOG };
