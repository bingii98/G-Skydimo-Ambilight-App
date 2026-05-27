const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const MODES = {
  BLEND: "blend",
  FRESH: "fresh",
};

function buildConstraintsLine(constraints) {
  if (!constraints) return "";
  const parts = [];
  if (constraints.families?.length) {
    parts.push(`Allowed color families: ${constraints.families.join(", ")}.`);
  }
  if (constraints.stopCount || constraints.maxStops) {
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

function buildBlendPrompt({ colorFrom, colorTo, topPosition, bottomPosition, mood }) {
  const topPct = Math.round((topPosition ?? 0) * 100);
  const bottomPct = Math.round((bottomPosition ?? 1) * 100);
  const moodLine = mood?.trim() ? `User request (HIGHEST PRIORITY): "${mood.trim()}".` : "";

  return [
    "Design a vertical LED strip gradient (top = smaller position, bottom = larger position).",
    moodLine,
    `FIXED top keyframe: ${colorFrom} at position ${topPosition ?? 0} (${topPct}% from top) — do not change this color.`,
    `FIXED bottom keyframe: ${colorTo} at position ${bottomPosition ?? 1} (${bottomPct}% from top) — do not change this color.`,
    "Add 1–3 NEW intermediate stops between them only.",
    "Intermediate colors must fit the user request while staying between the two anchor colors.",
    "Return 3–5 stops total, including both fixed anchors with their exact hex values.",
    "Positions must strictly increase; keep the two anchor positions unchanged.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFreshPrompt({ baseColor, colorFrom, colorTo, variationSeed, mood, constraints }) {
  const stopCount = constraints?.stopCount ?? constraints?.maxStops ?? 4;
  const moodLine = mood?.trim()
    ? `User request (HIGHEST PRIORITY): "${mood.trim()}".`
    : `Mood hints only (do not copy): top ${colorFrom}, bottom ${colorTo}, active ${baseColor || "#FFD700"}.`;

  const constraintLine = constraints?.instruction || buildConstraintsLine(constraints);

  return [
    "Design a completely NEW vertical LED strip gradient.",
    moodLine,
    constraintLine,
    mood?.trim()
      ? "Do NOT reuse or tweak the current keyframe colors. Generate fresh colors from the user request only."
      : `Variation seed: ${variationSeed}. Pick a different palette than prior requests.`,
    constraints?.wantsRainbow
      ? "Use a bold multi-hue rainbow spread with clearly different saturated colors."
      : "",
    `Return exactly ${stopCount} stops with DIFFERENT colors.`,
    `Example shape: {"stops":[${Array.from({ length: Math.min(stopCount, 3) }, (_, index) => `{ "color":"#RRGGBB", "position":${index === 0 ? 0 : index === 1 ? 0.5 : 1} }`).join(", ")}]}`,
    "position must be 0–1 (0=top, 1=bottom), strictly increasing.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {string} apiKey
 * @param {{ mode?: 'blend'|'fresh', colorFrom: string, colorTo: string, baseColor?: string, topPosition?: number, bottomPosition?: number, mood?: string, constraints?: object }} options
 * @returns {Promise<{ stops: Array<{ color: string, position: number }> }>}
 */
async function fetchGradientSuggestion(apiKey, options = {}) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error("OpenAI API key is required. Add it in Settings.");
  }

  const mode = options.mode === MODES.FRESH ? MODES.FRESH : MODES.BLEND;
  const colorFrom = typeof options.colorFrom === "string" ? options.colorFrom : "#FFD700";
  const colorTo = typeof options.colorTo === "string" ? options.colorTo : "#FF0066";
  const baseColor = typeof options.baseColor === "string" ? options.baseColor : colorFrom;
  const topPosition = typeof options.topPosition === "number" ? options.topPosition : 0;
  const bottomPosition = typeof options.bottomPosition === "number" ? options.bottomPosition : 1;
  const mood = typeof options.mood === "string" ? options.mood : "";
  const constraints = options.constraints || null;

  const variationSeed = Date.now();
  const isFresh = mode === MODES.FRESH;
  const wantsRainbow = Boolean(constraints?.wantsRainbow);
  const systemContent = isFresh
    ? 'You output JSON only: {"stops":[{"color":"#RRGGBB","position":0}]}. ' +
      "Return exactly the requested number of stops. position is 0-1 (NOT 0-100). " +
      (wantsRainbow
        ? "Generate a fresh saturated multi-hue rainbow palette."
        : "First stop position MUST be 0, last MUST be 1. Colors must differ from each other.") +
      " Never return a single stop."
    : 'You output JSON only: {"stops":[{"color":"#RRGGBB","position":0.0}]}. ' +
      "Use 3-5 stops. position is 0-1 (not percent). Colors must be # plus 6 hex digits. " +
      "The first and last stops must match the user's two anchor colors exactly. " +
      "Middle stop colors must fit the user request while staying between the anchor colors.";

  const userContent = isFresh
    ? buildFreshPrompt({ baseColor, colorFrom, colorTo, variationSeed, mood, constraints })
    : buildBlendPrompt({ colorFrom, colorTo, topPosition, bottomPosition, mood });

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: isFresh ? 0.75 : 0.55,
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
    throw new Error("Could not parse AI gradient response");
  }

  const stops = Array.isArray(parsed?.stops)
    ? parsed.stops
    : Array.isArray(parsed?.gradient)
      ? parsed.gradient
      : null;

  if (!stops || stops.length < 2) {
    throw new Error("AI response missing gradient stops");
  }

  return { stops };
}

module.exports = { fetchGradientSuggestion, AI_GRADIENT_MODES: MODES };
