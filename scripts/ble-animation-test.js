#!/usr/bin/env node
/**
 * Cycle firmware effects on a connected ELK/MELK BLE device.
 *
 * Usage:
 *   node scripts/ble-animation-test.js
 *   node scripts/ble-animation-test.js --device-id be16a10003e3
 *   node scripts/ble-animation-test.js --effect 61 --speed 70
 *   node scripts/ble-animation-test.js --cycle
 */

const { ExternalLedManager } = require("../externalLedManager");
const { listBleEffects } = require("../services/externalBleEffects");
const { sleep } = require("../services/lotusLampProtocol");

function parseArgs(argv) {
  const args = {
    deviceId: null,
    effect: null,
    speed: 50,
    cycle: false,
    dwellMs: 4000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--device-id") {
      args.deviceId = argv[index + 1]?.toLowerCase();
      index += 1;
    } else if (token === "--effect") {
      args.effect = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--speed") {
      args.speed = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--cycle") {
      args.cycle = true;
    } else if (token === "--dwell") {
      args.dwellMs = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

async function findDevice(manager, deviceId) {
  await manager.startScan();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = manager.getState();
    if (deviceId) {
      const match = state.devices.find((item) => item.id?.toLowerCase() === deviceId);
      if (match) {
        await manager.stopScan();
        return match;
      }
    } else {
      const match =
        state.devices.find((item) => /MELK-OA21/i.test(item.name)) || state.devices[0];
      if (match) {
        await manager.stopScan();
        return match;
      }
    }
    await sleep(500);
  }
  await manager.stopScan();
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manager = new ExternalLedManager();
  await manager.init();

  const device = await findDevice(manager, args.deviceId);
  if (!device) {
    throw new Error("No target device found");
  }

  console.log("Target:", device.name, device.id);
  console.log("Connecting…");
  await manager.connect(device.id);

  const profileId = /MELK-OA21/i.test(device.name) ? "MELK_OA21" : "MELK_GENERIC";
  const effects = listBleEffects(profileId);
  const effectIds = args.cycle
    ? effects.slice(0, 8).map((entry) => entry.id)
    : [Number.isFinite(args.effect) ? args.effect : effects[0]?.id ?? 1];

  await manager.setPower(device.id, true);
  await sleep(300);

  for (const effectId of effectIds) {
    const label = effects.find((entry) => entry.id === effectId)?.label || `Effect ${effectId}`;
    console.log(`\nPlaying ${label} (id=${effectId}, speed=${args.speed})`);
    await manager.setAnimation(device.id, effectId, args.speed);
    await sleep(args.dwellMs);
  }

  console.log("\nDone.");
  await manager.disconnect(device.id);
  await manager.destroy();
}

main().catch(async (error) => {
  console.error("TEST FAILED:", error.message || error);
  process.exit(1);
});
