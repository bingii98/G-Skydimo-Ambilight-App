const { ExternalLedManager } = require("../externalLedManager");
const { sleep } = require("../services/lotusLampProtocol");

async function main() {
  const manager = new ExternalLedManager();
  await manager.init();
  await manager.startScan();

  let targetId = null;
  const deadline = Date.now() + 12000;
  while (!targetId && Date.now() < deadline) {
    const state = manager.getState();
    const device =
      state.devices.find((item) => /MELK-OA21/i.test(item.name)) || state.devices[0];
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
  console.log("Connected. Sending red...");
  await manager.setColor(targetId, 255, 0, 0, 100);
  await sleep(2000);
  console.log("Sending green...");
  await manager.setColor(targetId, 0, 255, 0, 100);
  await sleep(2000);
  console.log("Turning off...");
  await manager.setPower(targetId, false);
  await sleep(1500);
  console.log("Turning on white...");
  await manager.setPower(targetId, true);
  await manager.setColor(targetId, 255, 255, 255, 100);
  await manager.disconnect(targetId);
  await manager.destroy();
  console.log("Done");
}

main().catch(async (error) => {
  console.error("TEST FAILED:", error);
  process.exit(1);
});
