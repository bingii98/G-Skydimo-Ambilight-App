const { ExternalLedManager } = require("../externalLedManager");
const { sleep } = require("../services/lotusLampProtocol");
const { HONEYCOMB_TRI } = require("../services/elkBleProfiles");

async function main() {
  const manager = new ExternalLedManager();
  await manager.init();
  await manager.startScan();

  let targetId = null;
  const deadline = Date.now() + 20000;
  while (!targetId && Date.now() < deadline) {
    const state = manager.getState();
    const device =
      state.devices.find((item) => /HONEYCOMB|MELK|TRIANG|LOTUS/i.test(item.name || "")) ||
      state.devices[0];
    if (device) {
      targetId = device.id;
      console.log("Target:", device.name, device.id);
      break;
    }
    await sleep(500);
  }

  await manager.stopScan();
  if (!targetId) {
    throw new Error("No target device found");
  }

  console.log("Connecting...");
  await manager.connect(targetId);
  await manager.setPower(targetId, true);
  await sleep(300);

  const ledCount = 12;
  const pixels = new Array(ledCount * 3).fill(0);
  for (let index = 0; index < ledCount; index += 1) {
    pixels[index * 3] = index % 3 === 0 ? 255 : 0;
    pixels[index * 3 + 1] = index % 3 === 1 ? 255 : 0;
    pixels[index * 3 + 2] = index % 3 === 2 ? 255 : 0;
  }

  console.log("Profile:", HONEYCOMB_TRI.id);
  console.log("Sending per-LED test pattern via setPixels...");
  await manager.setPixels(targetId, pixels, 100);
  await sleep(3000);

  console.log("Sending single-zone red fallback...");
  await manager.setColor(targetId, 255, 0, 0, 100);
  await sleep(1500);

  await manager.disconnect(targetId);
  await manager.destroy();
  console.log("Done. If colors did not match per-LED, update buildHoneycombLedColorCommand per ble-honeycomb-sniff-notes.md");
}

main().catch(async (error) => {
  console.error("TEST FAILED:", error);
  process.exit(1);
});
