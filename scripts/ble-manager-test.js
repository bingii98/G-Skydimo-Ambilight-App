const { ExternalLedManager } = require("../externalLedManager");

async function main() {
  const manager = new ExternalLedManager();
  await manager.init();
  console.log("BLE available:", manager.bleAvailable, manager.bleError || "");

  await manager.startScan();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const state = manager.getState();
  console.log("Found devices:", state.devices.length);
  for (const device of state.devices) {
    console.log("-", device.name, device.id, device.rssi);
  }
  await manager.stopScan();
  await manager.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
