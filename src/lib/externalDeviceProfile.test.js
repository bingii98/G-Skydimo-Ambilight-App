import { describe, expect, it } from "vitest";
import {
  buildExternalDeviceRegistration,
  getExternalDeviceProfile,
  parseExternalDeviceModel,
} from "./externalDeviceProfile";

describe("externalDeviceProfile", () => {
  it("parses MELK model from ble name", () => {
    expect(parseExternalDeviceModel("MELK-OA21   E3")).toBe("MELK-OA21");
    expect(parseExternalDeviceModel("MELK-OC21   25")).toBe("MELK-OC21");
  });

  it("suggests default led count for known models", () => {
    expect(getExternalDeviceProfile("MELK-OA21   E3")).toMatchObject({
      model: "MELK-OA21",
      defaultLedCount: 30,
      ledCountDetectable: false,
      singleZone: true,
    });
    expect(getExternalDeviceProfile("Smart LED Triangular Honeycomb Panel")).toMatchObject({
      model: "HONEYCOMB_TRI",
      kind: "triangle",
      defaultLedCount: 12,
      singleZone: false,
    });
  });

  it("registers auto led count until user overrides", () => {
    const first = buildExternalDeviceRegistration({ name: "MELK-OA21   E3" });
    expect(first).toMatchObject({
      deviceModel: "MELK-OA21",
      ledCount: 30,
      ledCountSource: "auto",
    });

    const manual = buildExternalDeviceRegistration(
      { name: "MELK-OA21   E3" },
      { ledCount: 96, ledCountSource: "manual" }
    );
    expect(manual).toMatchObject({
      ledCount: 96,
      ledCountSource: "manual",
    });
  });
});
