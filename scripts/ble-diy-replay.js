#!/usr/bin/env node
/**
 * Replay a sniffed DIY capture on connected hardware to verify per-LED behavior.
 *
 * Usage:
 *   node scripts/ble-diy-replay.js scripts/captures/example-diy-session.json
 *   node scripts/ble-diy-replay.js captures/session.txt --device-id be16...
 *   node scripts/ble-diy-replay.js captures/session.json --delay=500 --no-setup
 */

const fs = require("fs");
const path = require("path");
const { ExternalLedManager } = require("../externalLedManager");
const { sleep } = require("../services/lotusLampProtocol");
const {
  analyzeCapture,
  buildReplaySequence,
  frameToHex,
  parseAnnotatedCapture,
} = require("../services/bleFrameParser");

function parseArgs(argv) {
  const options = {
    file: null,
    deviceId: null,
    delayMs: 800,
    includeSetup: true,
    scanMs: 25000,
  };

  for (const arg of argv) {
    if (!arg.startsWith("--") && !options.file) {
      options.file = arg;
    } else if (arg.startsWith("--device-id=")) {
      options.deviceId = arg.split("=")[1]?.toLowerCase();
    } else if (arg.startsWith("--delay=")) {
      options.delayMs = Math.max(100, Number(arg.split("=")[1]) || 800);
    } else if (arg === "--no-setup") {
      options.includeSetup = false;
    } else if (arg.startsWith("--scan-ms=")) {
      options.scanMs = Math.max(5000, Number(arg.split("=")[1]) || 25000);
    }
  }

  return options;
}

function loadCapture(filePath) {
  const absolute = path.resolve(filePath);
  const raw = fs.readFileSync(absolute, "utf8");
  if (absolute.endsWith(".json")) {
    return JSON.parse(raw);
  }
  return raw;
}

async function findDevice(manager, options) {
  if (options.deviceId) {
    return options.deviceId;
  }

  await manager.startScan();
  const deadline = Date.now() + options.scanMs;
  while (Date.now() < deadline) {
    const state = manager.getState();
    const device =
      state.devices.find((item) => /HONEYCOMB|TRIANGULAR|HEX.*PANEL|NANOLEAF/i.test(item.name || "")) ||
      state.devices.find((item) => /LOTUS.*TRI|MELK.*TRI/i.test(item.name || "")) ||
      state.devices.find((item) => /MELK|LOTUS|HONEYCOMB|TRIANG/i.test(item.name || "")) ||
      state.devices[0];
    if (device) {
      console.log("Found:", device.name, device.id);
      await manager.stopScan();
      return device.id;
    }
    await sleep(500);
  }

  await manager.stopScan();
  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) {
    throw new Error("Usage: node scripts/ble-diy-replay.js <capture.txt|json> [--device-id=...]");
  }

  const capture = loadCapture(options.file);
  const analysis = analyzeCapture(capture);
  const sequence = buildReplaySequence(parseAnnotatedCapture(capture), {
    includeSetup: options.includeSetup,
  });

  console.log("DIY replay");
  console.log("  Capture:", options.file);
  console.log("  Frames:", sequence.length);
  console.log("  Analysis:\n", analysis.summary.replace(/^/gm, "    "));
  console.log("");

  const manager = new ExternalLedManager();
  await manager.init();
  if (!manager.bleAvailable) {
    throw new Error(manager.bleError || "Bluetooth not available");
  }

  const targetId = await findDevice(manager, options);
  if (!targetId) {
    throw new Error("No BLE device found. Disconnect the phone app first.");
  }

  console.log("Connecting to", targetId, "...");
  await manager.connect(targetId);
  await sleep(400);

  for (let index = 0; index < sequence.length; index += 1) {
    const step = sequence[index];
    console.log(`[${index + 1}/${sequence.length}] ${step.label}`);
    console.log(`  ${frameToHex(step.bytes)}`);
    await manager.writeRaw(targetId, step.bytes, { force: true });
    await sleep(options.delayMs);
  }

  console.log("\nReplay done. Did individual panels/LEDs change as expected?");
  await manager.disconnect(targetId);
  await manager.destroy();
}

main().catch((error) => {
  console.error("REPLAY FAILED:", error.message || error);
  process.exit(1);
});
