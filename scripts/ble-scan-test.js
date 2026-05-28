const { withBindings } = require("@stoprocent/noble");

async function main() {
  const noble = withBindings(process.platform === "win32" ? "win" : "default");
  console.log("Platform:", process.platform);
  console.log("Initial state:", noble.state);

  await noble.waitForPoweredOnAsync(15000);
  console.log("Powered on");

  let count = 0;
  noble.on("discover", (peripheral) => {
    count += 1;
    const ad = peripheral.advertisement || {};
    console.log(
      `[${count}]`,
      peripheral.id,
      ad.localName || "(no name)",
      "rssi=" + peripheral.rssi,
      "services=" + JSON.stringify(ad.serviceUuids || []),
      "serviceData=" + JSON.stringify(ad.serviceData || [])
    );
  });

  await noble.startScanningAsync([], true);
  console.log("Scanning all BLE devices for 12s...");
  await new Promise((resolve) => setTimeout(resolve, 12000));
  await noble.stopScanningAsync();
  console.log("Done. Total:", count);
}

main().catch((error) => {
  console.error("SCAN FAILED:", error.message);
  process.exit(1);
});
