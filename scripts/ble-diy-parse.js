#!/usr/bin/env node
/**
 * Parse DIY sniff captures (nRF Connect logs, pasted hex, or JSON sessions).
 *
 * Usage:
 *   node scripts/ble-diy-parse.js captures/my-session.txt
 *   node scripts/ble-diy-parse.js captures/my-session.json
 *   type sniff.log | node scripts/ble-diy-parse.js
 *
 * Annotate lines with notes so the analyzer can find the index byte:
 *   7e 07 05 06 00 ff 00 00 ef  # led 0 red
 *   7e 07 05 06 03 00 00 ff ef  # led 3 blue
 */

const fs = require("fs");
const path = require("path");
const {
  analyzeCapture,
  suggestBuilderPatch,
} = require("../services/bleFrameParser");

function loadInput(filePath) {
  if (filePath) {
    const absolute = path.resolve(filePath);
    const raw = fs.readFileSync(absolute, "utf8");
    if (absolute.endsWith(".json")) {
      return JSON.parse(raw);
    }
    return raw;
  }

  return fs.readFileSync(0, "utf8");
}

function main() {
  const filePath = process.argv[2] || null;
  const input = loadInput(filePath);
  const analysis = analyzeCapture(input);
  const patch = suggestBuilderPatch(analysis);

  console.log("=== DIY BLE capture analysis ===\n");
  console.log(analysis.summary);
  console.log("");

  if (analysis.uniqueFrames.length) {
    console.log("Unique frames:");
    for (const entry of analysis.uniqueFrames) {
      const note = entry.note ? `  # ${entry.note}` : "";
      console.log(`  [${entry.class.label}] ${entry.hex}${note}`);
    }
    console.log("");
  }

  if (analysis.perLedCandidates.length) {
    console.log("Index byte candidates:");
    for (const candidate of analysis.perLedCandidates.slice(0, 3)) {
      console.log(`  byte ${candidate.byteIndex} — score ${candidate.score}`);
      for (const hint of candidate.hints.slice(0, 3)) {
        console.log(
          `    ${hint.frameA} vs ${hint.frameB} → delta index ${hint.indexDelta}, delta value ${hint.valueDelta}`
        );
      }
    }
    console.log("");
  }

  if (patch) {
    console.log("Suggested builder patch:");
    console.log(JSON.stringify(patch, null, 2));
    console.log("");
    console.log("Next: replay on hardware:");
    console.log(`  node scripts/ble-diy-replay.js ${filePath || "captures/session.json"} --device-id <id>`);
  } else {
    console.log("No per-LED pattern detected yet.");
    console.log("Capture at least two paint actions with notes like `# led 0 red` and `# led 3 blue`.");
  }

  const diyOnly = analysis.uniqueFrames.filter(
    (entry) => entry.class.type !== "single_rgb" && entry.class.type !== "effect"
  );
  if (diyOnly.length) {
    console.log("\nNon-RGB / non-effect frames (likely DIY):");
    for (const entry of diyOnly) {
      console.log(`  ${entry.hex}  (${entry.class.label})`);
    }
  }
}

main();
