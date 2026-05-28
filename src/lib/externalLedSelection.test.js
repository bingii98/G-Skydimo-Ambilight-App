import { describe, expect, it } from "vitest";
import {
  canAddDeviceToConfigGroup,
  getExternalDeviceConfigGroupKey,
  reorderDeviceIds,
  resolveSmartBulkSelection,
  sanitizeDeviceOrder,
  shouldSwitchBulkConfigGroup,
  sortExternalDevicesByOrder,
  summarizeBulkSelection,
} from "./externalLedSelection";
import {
  buildAutoAddConnectedDeviceToBulkPatch,
  buildBulkExternalDevicesSettingsPatch,
  buildBulkConfigSelectionPatch,
  buildBulkFocusDevicePatch,
  buildExternalDeviceOrderPatch,
  buildFocusExternalDevicePatch,
  buildToggleExternalConfigDevicePatch,
  listExternalConfigDeviceIds,
  sanitizeExternalLeds,
} from "./externalLedSettings";

describe("externalLedSelection", () => {
  it("groups devices by layout kind and model", () => {
    expect(
      getExternalDeviceConfigGroupKey({
        layoutKind: "strip",
        deviceModel: "MELK-OA21",
        name: "MELK-OA21",
      })
    ).toBe("strip:MELK-OA21");
    expect(
      getExternalDeviceConfigGroupKey({
        layoutKind: "triangle",
        deviceModel: "MELK-OA21",
        name: "MELK-OA21",
      })
    ).toBe("triangle:MELK-OA21");
  });

  it("blocks mixed-type bulk selection", () => {
    const strip = { layoutKind: "strip", deviceModel: "MELK-OA21", name: "MELK-OA21" };
    const triangle = { layoutKind: "triangle", deviceModel: "MELK-OA21", name: "MELK-OA21" };
    const devicesById = { a: strip, b: triangle };
    expect(canAddDeviceToConfigGroup(["a"], devicesById, triangle)).toBe(false);
    expect(canAddDeviceToConfigGroup([], devicesById, triangle)).toBe(true);
    expect(shouldSwitchBulkConfigGroup(["a"], devicesById, triangle)).toBe(true);
  });

  it("selects connected peers on first bulk check", () => {
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
      c: { id: "c", layoutKind: "strip", deviceModel: "MELK-OA21", connected: false, name: "C" },
    };
    expect(resolveSmartBulkSelection(devicesById, devicesById.a).sort()).toEqual(["a", "b"]);
    expect(resolveSmartBulkSelection(devicesById, devicesById.c)).toEqual(["c"]);
  });

  it("sorts devices by saved order and supports reordering", () => {
    const devices = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];

    expect(sortExternalDevicesByOrder(devices, ["c", "a", "b"]).map((device) => device.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(reorderDeviceIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(sanitizeDeviceOrder(["b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("summarizes bulk selection for contextual UI", () => {
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
      c: { id: "c", layoutKind: "strip", deviceModel: "MELK-OA21", connected: false, name: "C" },
      d: { id: "d", layoutKind: "triangle", deviceModel: "MELK-OC21", connected: true, name: "D" },
    };

    const summary = summarizeBulkSelection(devicesById, ["a", "c"], "c");
    expect(summary.selectedConnected).toBe(1);
    expect(summary.selectedOffline).toBe(1);
    expect(summary.unselectedConnected).toEqual(["b"]);
    expect(summary.unselectedOffline).toEqual([]);
    expect(summary.isMultiBulk).toBe(true);
    expect(summary.focusDeviceId).toBe("c");
  });
});

describe("external bulk settings", () => {
  it("applies settings to all configured devices", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a", "b"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", hex: "#111111", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", hex: "#222222", name: "B" },
        },
      }),
    };

    const patch = buildBulkExternalDevicesSettingsPatch(settings, { hex: "#00FF00" });
    const next = { ...settings, ...patch };

    expect(next.externalLeds.devices.a.hex).toBe("#00FF00");
    expect(next.externalLeds.devices.b.hex).toBe("#00FF00");
    expect(listExternalConfigDeviceIds(next)).toEqual(["a", "b"]);
  });

  it("card focus selects a single device for editing", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a", "b"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
        },
      }),
    };

    const patch = buildFocusExternalDevicePatch(settings, {
      id: "b",
      name: "B",
    });
    const next = { ...settings, ...patch };

    expect(next.externalLeds.activeDeviceId).toBe("b");
    expect(listExternalConfigDeviceIds(next)).toEqual(["b"]);
  });

  it("toggles config membership independently", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a", "b"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
        },
      }),
    };

    const patch = buildToggleExternalConfigDevicePatch(settings, "b", false);
    const next = { ...settings, ...patch };
    expect(listExternalConfigDeviceIds(next)).toEqual(["a"]);
  });

  it("clears bulk selection without changing the selected device", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
        },
      }),
    };

    const patch = buildToggleExternalConfigDevicePatch(settings, "a", false);
    const next = { ...settings, ...patch };

    expect(next.externalLeds.activeDeviceId).toBe("a");
    expect(listExternalConfigDeviceIds(next)).toEqual([]);
  });

  it("card focus selects one device into bulk config", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: [],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
        },
      }),
    };

    const patch = buildFocusExternalDevicePatch(settings, {
      id: "b",
      name: "B",
    });
    const next = { ...settings, ...patch };

    expect(next.externalLeds.activeDeviceId).toBe("b");
    expect(listExternalConfigDeviceIds(next)).toEqual(["b"]);
  });

  it("first bulk check selects connected devices of the same type", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: [],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
          c: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "C" },
        },
      }),
    };
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
      c: { id: "c", layoutKind: "strip", deviceModel: "MELK-OA21", connected: false, name: "C" },
    };

    const patch = buildToggleExternalConfigDevicePatch(settings, "a", true, devicesById);
    const next = { ...settings, ...patch };

    expect(listExternalConfigDeviceIds(next).sort()).toEqual(["a", "b"]);
  });

  it("switches bulk group when checking a different device type", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          t: { layoutKind: "triangle", deviceModel: "MELK-OA21", name: "T" },
        },
      }),
    };
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      t: { id: "t", layoutKind: "triangle", deviceModel: "MELK-OA21", connected: true, name: "T" },
    };

    const patch = buildToggleExternalConfigDevicePatch(settings, "t", true, devicesById);
    const next = { ...settings, ...patch };

    expect(next.externalLeds.activeDeviceId).toBe("t");
    expect(listExternalConfigDeviceIds(next)).toEqual(["t"]);
  });

  it("auto-adds newly connected devices to an active multi-device bulk group", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a", "c"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
          c: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "C" },
        },
      }),
    };
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
      c: { id: "c", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "C" },
    };

    const patch = buildAutoAddConnectedDeviceToBulkPatch(settings, "b", devicesById);
    const next = { ...settings, ...patch };

    expect(listExternalConfigDeviceIds(next).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not auto-add devices while editing a single-device bulk selection", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
        },
      }),
    };
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
    };

    expect(buildAutoAddConnectedDeviceToBulkPatch(settings, "b", devicesById)).toEqual({});
  });

  it("supports bulk quick selection modes", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a"],
        devices: {
          a: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "A" },
          b: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "B" },
          c: { layoutKind: "strip", deviceModel: "MELK-OA21", name: "C" },
        },
      }),
    };
    const devicesById = {
      a: { id: "a", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "A" },
      b: { id: "b", layoutKind: "strip", deviceModel: "MELK-OA21", connected: true, name: "B" },
      c: { id: "c", layoutKind: "strip", deviceModel: "MELK-OA21", connected: false, name: "C" },
    };

    const connectedPatch = buildBulkConfigSelectionPatch(settings, "connected", devicesById);
    expect(listExternalConfigDeviceIds({ ...settings, ...connectedPatch }).sort()).toEqual([
      "a",
      "b",
    ]);

    const allPatch = buildBulkConfigSelectionPatch(settings, "all", devicesById);
    expect(listExternalConfigDeviceIds({ ...settings, ...allPatch }).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("persists manual device order", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        devices: {
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
      }),
    };

    const patch = buildExternalDeviceOrderPatch(settings, ["c", "b", "a"]);
    const next = { ...settings, ...patch };

    expect(next.externalLeds.deviceOrder).toEqual(["c", "b", "a"]);
  });

  it("changes bulk focus without clearing selected devices", () => {
    const settings = {
      externalLeds: sanitizeExternalLeds({
        activeDeviceId: "a",
        configDeviceIds: ["a", "b"],
        devices: {
          a: { name: "A" },
          b: { name: "B" },
        },
      }),
    };

    const patch = buildBulkFocusDevicePatch(settings, "b");
    const next = { ...settings, ...patch };

    expect(next.externalLeds.activeDeviceId).toBe("b");
    expect(listExternalConfigDeviceIds(next)).toEqual(["a", "b"]);
  });
});
