import { describe, expect, it } from "vitest";
import {
  buildActiveExternalSettingsPatch,
  buildExternalDeviceManualConnectPatch,
  buildExternalLedsAutoConnectPatch,
  buildRegisterExternalDevicePatch,
  getActiveExternalDevice,
  getExternalDeviceLabel,
  listPreviouslyConnectedExternalDeviceIds,
  resolveExternalAutoConnectTargetId,
  sanitizeExternalLeds,
} from "./externalLedSettings";

describe("externalLedSettings", () => {
  it("sanitizes saved external devices", () => {
    const result = sanitizeExternalLeds({
      activeDeviceId: "abc123",
      devices: {
        ABC123: {
          customName: " Desk lamp ",
          ledCount: 24,
          hex: "#FF0000",
          colorMode: "single",
        },
      },
    });

    expect(result.activeDeviceId).toBe("abc123");
    expect(result.devices.abc123.customName).toBe(" Desk lamp ");
    expect(result.devices.abc123.ledCount).toBe(24);
    expect(result.devices.abc123.hex).toBe("#FF0000");
  });

  it("preserves spaces in display names while typing", () => {
    const device = sanitizeExternalLeds({
      devices: {
        "device-1": { customName: "Desk lamp left", name: "MELK-OA21" },
      },
    }).devices["device-1"];

    expect(device.customName).toBe("Desk lamp left");
    expect(getExternalDeviceLabel(device)).toBe("Desk lamp left");
  });

  it("registers and selects a discovered device", () => {
    const settings = { externalLeds: sanitizeExternalLeds({}) };
    const patch = buildRegisterExternalDevicePatch(settings, {
      id: "device-1",
      name: "MELK-OA10",
      address: "aa:bb:cc:dd:ee:ff",
    });

    const next = {
      ...settings,
      ...patch,
    };

    expect(getActiveExternalDevice(next)?.id).toBe("device-1");
    expect(getActiveExternalDevice(next)?.name).toBe("MELK-OA10");
    expect(getActiveExternalDevice(next)?.deviceModel).toBe("MELK-OA10");
    expect(getActiveExternalDevice(next)?.ledCount).toBe(1);
    expect(getActiveExternalDevice(next)?.ledCountSource).toBe("auto");
  });

  it("updates active device color settings independently", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "device-1",
        devices: {
          "device-1": { hex: "#111111", brightness: 50, colorMode: "single" },
        },
      }),
      hex: "#FFD700",
      brightness: 100,
    };

    const patch = buildActiveExternalSettingsPatch(settings, { hex: "#00FF00" });
    const next = { ...settings, ...patch };

    expect(next.externalLeds.devices["device-1"].hex).toBe("#00FF00");
    expect(next.hex).toBe("#FFD700");
  });

  it("tracks manual connect eligibility and auto-connect preference", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "device-2",
        autoConnect: true,
        devices: {
          "device-1": { everConnected: true },
          "device-2": { everConnected: false },
        },
      }),
    };

    const manualPatch = buildExternalDeviceManualConnectPatch(settings, "device-2");
    const next = { ...settings, ...manualPatch };

    expect(next.externalLeds.devices["device-2"].everConnected).toBe(true);
    expect(listPreviouslyConnectedExternalDeviceIds(next)).toEqual(["device-1", "device-2"]);
    expect(resolveExternalAutoConnectTargetId(next)).toBe("device-2");

    const autoOff = {
      ...next,
      ...buildExternalLedsAutoConnectPatch(next, false),
    };
    expect(autoOff.externalLeds.autoConnect).toBe(false);
  });
});
