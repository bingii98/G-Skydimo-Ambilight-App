/**
 * Probe per-LED BLE commands on MELK / honeycomb triangle panels.
 *
 * Usage:
 *   node scripts/ble-honeycomb-led-probe.js
 *   node scripts/ble-honeycomb-led-probe.js --leds=12 --delay=2000
 *   node scripts/ble-honeycomb-led-probe.js --variant=v2_000506_index0
 *   node scripts/ble-honeycomb-led-probe.js --device-id=<ble-id>
 *
 * Watch the physical panel while each LED index is lit in sequence (red → green → blue).
 * Note which variant (if any) changes individual LEDs vs whole chain.
 */

const { ExternalLedManager } = require("../externalLedManager");
const { resolveBleProfile } = require("../services/elkBleProfiles");
const {
  sleep,
  HONEYCOMB_LED_CANDIDATES,
} = require("../services/lotusLampProtocol");

function parseArgs(argv) {
  const options = {
    ledCount: 12,
    delayMs: 2000,
    variant: HONEYCOMB_LED_CANDIDATES[0].id,
    deviceId: null,
    scanMs: 25000,
  };

  for (const arg of argv) {
    if (arg.startsWith("--leds=")) {
      options.ledCount = Math.max(1, Number(arg.split("=")[1]) || 12);
    } else if (arg.startsWith("--delay=")) {
      options.delayMs = Math.max(500, Number(arg.split("=")[1]) || 2000);
    } else if (arg.startsWith("--variant=")) {
      options.variant = arg.split("=")[1];
    } else if (arg.startsWith("--device-id=")) {
      options.deviceId = arg.split("=")[1];
    } else if (arg.startsWith("--scan-ms=")) {
      options.scanMs = Math.max(5000, Number(arg.split("=")[1]) || 25000);
    }
  }

  return options;
}

function hexFrame(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function colorForLedIndex(index) {
  const phase = index % 3;
  if (phase === 0) {
    return { r: 255, g: 0, b: 0, name: "red" };
  }
  if (phase === 1) {
    return { r: 0, g: 255, b: 0, name: "green" };
  }
  return { r: 0, g: 0, b: 255, name: "blue" };
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
      console.log("Found:", device.name, device.id, device.rssi != null ? `rssi=${device.rssi}` : "");
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
  const candidate =
    HONEYCOMB_LED_CANDIDATES.find((entry) => entry.id === options.variant) ||
    HONEYCOMB_LED_CANDIDATES[0];

  console.log("Honeycomb per-LED probe");
  console.log("  LEDs:", options.ledCount);
  console.log("  Delay between commands:", options.delayMs, "ms");
  console.log("  Variant:", candidate.id, "—", candidate.label);
  console.log("  Available variants:", HONEYCOMB_LED_CANDIDATES.map((entry) => entry.id).join(", "));
  console.log("");

  const manager = new ExternalLedManager();
  await manager.init();
  if (!manager.bleAvailable) {
    throw new Error(manager.bleError || "Bluetooth not available");
  }

  const targetId = await findDevice(manager, options);
  if (!targetId) {
    throw new Error("No BLE device found. Ensure panel is on and not connected to phone app.");
  }

  console.log("Connecting to", targetId, "...");
  await manager.connect(targetId);
  await manager.setPower(targetId, true);
  await sleep(400);

  const connection = manager.connections.get(targetId.toLowerCase());
  const profile = connection?.profile || resolveBleProfile(connection?.deviceName);
  console.log("Profile:", profile.id, "| device name:", connection?.deviceName || "?");
  console.log("");

  console.log("Baseline: all off (single-zone black)...");
  await manager.setColor(targetId, 0, 0, 0, 100);
  await sleep(800);

  console.log("Sending one command per LED index (watch the panel):");
  console.log("");

  for (let index = 0; index < options.ledCount; index += 1) {
    const { r, g, b, name } = colorForLedIndex(index);
    const frame = candidate.build(index, r, g, b);
    console.log(
      `[LED ${index + 1}/${options.ledCount}] index=${index} color=${name}  frame=${hexFrame(frame)}`
    );
    await manager.writeRaw(targetId, frame, { force: true });
    await sleep(options.delayMs);
  }

  console.log("");
  console.log("Done sequence. Restoring single-zone white...");
  await manager.setColor(targetId, 255, 255, 255, 100);
  await sleep(1000);
  await manager.disconnect(targetId);
  await manager.destroy();

  console.log("");
  console.log("If the whole chain showed ONE color (not individual LEDs), the variant failed.");
  console.log("MELK-OA21 / ELK-BLEDOM strips are single-zone only in known protocols.");
  console.log("Try another variant, or sniff the triangle app with ble-honeycomb-sniff-notes.md");
  console.log("  node scripts/ble-honeycomb-led-probe.js --variant=v2_000506_index0");
  console.log("Update buildHoneycombLedColorCommand in services/lotusLampProtocol.js when you find the working frame.");
}

main().catch(async (error) => {
  console.error("PROBE FAILED:", error.message || error);
  process.exit(1);
});
