const FRAME_MARKERS = {
  START: 0x7e,
  END: 0xef,
};

const ELK_CMD = {
  BRIGHTNESS: 0x01,
  SPEED: 0x02,
  EFFECT: 0x03,
  POWER: 0x04,
  COLOR: 0x05,
};

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function parseHexToken(token) {
  const cleaned = String(token || "")
    .trim()
    .replace(/^0x/i, "")
    .replace(/[^0-9a-f]/gi, "");
  if (!cleaned || cleaned.length % 2 !== 0) {
    return null;
  }
  const bytes = [];
  for (let index = 0; index < cleaned.length; index += 2) {
    bytes.push(parseInt(cleaned.slice(index, index + 2), 16));
  }
  return bytes;
}

/** Extract ELK-style frames from a hex string, whitespace, or mixed log line. */
function parseHexFrames(input) {
  const text = String(input || "");
  const frames = [];

  const lineMatches = text.match(/7e[\da-f\s-]+ef/gi) || [];
  for (const chunk of lineMatches) {
    const bytes = parseHexToken(chunk.replace(/\s+/g, ""));
    if (bytes?.length >= 4 && bytes[0] === FRAME_MARKERS.START && bytes[bytes.length - 1] === FRAME_MARKERS.END) {
      frames.push(bytes);
    }
  }

  if (frames.length) {
    return frames;
  }

  const bytes = parseHexToken(text.replace(/\s+/g, ""));
  if (bytes?.length >= 4 && bytes[0] === FRAME_MARKERS.START && bytes[bytes.length - 1] === FRAME_MARKERS.END) {
    return [bytes];
  }

  return [];
}

function frameToHex(bytes) {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function frameKey(bytes) {
  return bytes.join(",");
}

function classifyElkFrame(bytes) {
  if (!Array.isArray(bytes) || bytes.length < 4) {
    return { type: "invalid", label: "invalid" };
  }
  if (bytes[0] !== FRAME_MARKERS.START || bytes[bytes.length - 1] !== FRAME_MARKERS.END) {
    return { type: "unknown", label: "non-ELK frame" };
  }

  const lengthByte = bytes[1];
  const command = bytes[2];
  const subcommand = bytes[3];

  if (command === ELK_CMD.POWER) {
    return { type: "power", label: "power", lengthByte, command, subcommand };
  }
  if (command === ELK_CMD.BRIGHTNESS) {
    return { type: "brightness", label: "brightness", lengthByte, command, subcommand };
  }
  if (command === ELK_CMD.SPEED) {
    return { type: "speed", label: "effect speed", lengthByte, command, subcommand };
  }
  if (command === ELK_CMD.EFFECT) {
    return { type: "effect", label: "firmware effect", lengthByte, command, subcommand, mode: subcommand };
  }
  if (command === ELK_CMD.COLOR && subcommand === 0x03) {
    return {
      type: "single_rgb",
      label: "single RGB",
      lengthByte,
      command,
      subcommand,
      rgb: [bytes[4], bytes[5], bytes[6]],
    };
  }
  if (command === ELK_CMD.COLOR && subcommand !== 0x03) {
    return {
      type: "color_variant",
      label: `color sub ${subcommand.toString(16)}`,
      lengthByte,
      command,
      subcommand,
      rgb: bytes.length >= 8 ? [bytes[4], bytes[5], bytes[6]] : null,
      indexOrPanel: bytes[4],
    };
  }

  return {
    type: "unknown",
    label: `cmd ${command.toString(16)} sub ${subcommand.toString(16)}`,
    lengthByte,
    command,
    subcommand,
  };
}

function diffFrames(left, right) {
  const max = Math.max(left.length, right.length);
  const diffs = [];
  for (let index = 0; index < max; index += 1) {
    if (left[index] !== right[index]) {
      diffs.push({
        index,
        left: left[index],
        right: right[index],
      });
    }
  }
  return diffs;
}

function parseAnnotatedCapture(raw) {
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const noteMatch = line.match(/^(.*?)(?:\s+#\s*(.+))?$/);
        const body = noteMatch?.[1]?.trim() || line;
        const note = noteMatch?.[2]?.trim() || "";
        return parseHexFrames(body).map((bytes) => ({ bytes, note }));
      });
  }

  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (Array.isArray(entry)) {
        return [{ bytes: entry, note: "" }];
      }
      if (entry?.hex) {
        const bytes = Array.isArray(entry.bytes)
          ? entry.bytes
          : parseHexFrames(entry.hex)[0];
        if (!bytes) {
          return [];
        }
        return [{ bytes, note: entry.note || entry.label || "" }];
      }
      if (Array.isArray(entry?.bytes)) {
        return [{ bytes: entry.bytes, note: entry.note || "" }];
      }
      return [];
    });
  }

  if (raw?.frames && Array.isArray(raw.frames)) {
    return parseAnnotatedCapture(raw.frames);
  }

  return [];
}

function extractIndexFromNote(note) {
  const text = String(note || "").toLowerCase();
  const ledMatch = text.match(/(?:led|panel|index|tam|panel)\s*[#:]?\s*(\d+)/i);
  if (ledMatch) {
    return Number(ledMatch[1]);
  }
  return null;
}

function analyzeCapture(entries) {
  const annotated = parseAnnotatedCapture(entries);
  const uniqueFrames = [];
  const seen = new Set();

  for (const entry of annotated) {
    const key = frameKey(entry.bytes);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueFrames.push({
      ...entry,
      hex: frameToHex(entry.bytes),
      class: classifyElkFrame(entry.bytes),
    });
  }

  const diyCandidates = uniqueFrames.filter((entry) => {
    const type = entry.class.type;
    return type === "color_variant" || (entry.class.command === ELK_CMD.COLOR && entry.class.subcommand !== 0x03);
  });

  const indexHints = [];
  for (let left = 0; left < diyCandidates.length; left += 1) {
    for (let right = left + 1; right < diyCandidates.length; right += 1) {
      const a = diyCandidates[left];
      const b = diyCandidates[right];
      const diffs = diffFrames(a.bytes, b.bytes);
      if (diffs.length < 1 || diffs.length > 4) {
        continue;
      }

      const indexA = extractIndexFromNote(a.note);
      const indexB = extractIndexFromNote(b.note);
      for (const diff of diffs) {
        indexHints.push({
          byteIndex: diff.index,
          frameA: a.note || a.hex,
          frameB: b.note || b.hex,
          valueA: diff.left,
          valueB: diff.right,
          indexDelta:
            Number.isInteger(indexA) && Number.isInteger(indexB) ? indexB - indexA : null,
          valueDelta: diff.right - diff.left,
        });
      }
    }
  }

  const likelyIndexBytes = [...indexHints]
    .filter((hint) => hint.indexDelta != null && hint.valueDelta === hint.indexDelta)
    .reduce((map, hint) => {
      const list = map.get(hint.byteIndex) || [];
      list.push(hint);
      map.set(hint.byteIndex, list);
      return map;
    }, new Map());

  const perLedCandidates = [...likelyIndexBytes.entries()].map(([byteIndex, hints]) => ({
    byteIndex,
    score: hints.length,
    hints,
  }));

  perLedCandidates.sort((a, b) => b.score - a.score);

  return {
    totalFrames: annotated.length,
    uniqueFrames,
    diyCandidates,
    perLedCandidates,
    summary: buildCaptureSummary(uniqueFrames, perLedCandidates),
  };
}

function buildCaptureSummary(uniqueFrames, perLedCandidates) {
  const types = uniqueFrames.reduce((acc, entry) => {
    acc[entry.class.type] = (acc[entry.class.type] || 0) + 1;
    return acc;
  }, {});

  const lines = [
    `Unique frames: ${uniqueFrames.length}`,
    `Frame types: ${Object.entries(types)
      .map(([type, count]) => `${type}=${count}`)
      .join(", ")}`,
  ];

  if (perLedCandidates.length) {
    const best = perLedCandidates[0];
    lines.push(
      `Likely LED/panel index byte: position ${best.byteIndex} (${best.score} matching note pairs)`
    );
  } else {
    lines.push("No confident per-LED index byte yet — capture two paints with different LED indices and notes.");
  }

  return lines.join("\n");
}

function buildReplaySequence(entries, { includeSetup = true } = {}) {
  const annotated = parseAnnotatedCapture(entries);
  const sequence = [];

  if (includeSetup) {
    sequence.push({
      label: "turn on",
      bytes: [0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef],
    });
  }

  for (const entry of annotated) {
    sequence.push({
      label: entry.note || frameToHex(entry.bytes),
      bytes: entry.bytes,
    });
  }

  return sequence;
}

function suggestBuilderPatch(analysis) {
  const best = analysis.perLedCandidates[0];
  if (!best) {
    return null;
  }

  const sample = analysis.diyCandidates[0];
  if (!sample) {
    return null;
  }

  const rgbStart = best.byteIndex + 1;
  return {
    message:
      "Candidate per-LED frame — verify on hardware with ble-diy-replay.js before enabling multiPixelVerified.",
    indexByte: best.byteIndex,
    rgbBytes: [rgbStart, rgbStart + 1, rgbStart + 2],
    sampleHex: sample.hex,
    sampleClass: sample.class,
  };
}

module.exports = {
  FRAME_MARKERS,
  ELK_CMD,
  parseHexToken,
  parseHexFrames,
  frameToHex,
  classifyElkFrame,
  diffFrames,
  parseAnnotatedCapture,
  analyzeCapture,
  buildReplaySequence,
  suggestBuilderPatch,
  clampByte,
};
