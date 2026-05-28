import { describe, expect, it } from "vitest";
import {
  buildChamferedTriangleGeometry,
  formatPolygonPoints,
} from "./externalTriangleCornerChamfer";

describe("externalTriangleCornerChamfer", () => {
  it("returns six-point polygon and inset corner handles", () => {
    const corners = [
      { x: 50, y: 10 },
      { x: 10, y: 90 },
      { x: 90, y: 90 },
    ];
    const geometry = buildChamferedTriangleGeometry(corners, 12);

    expect(geometry.polygon).toHaveLength(6);
    expect(geometry.cornerHandles).toHaveLength(3);
    expect(formatPolygonPoints(geometry.polygon).split(" ")).toHaveLength(6);

    for (const handle of geometry.cornerHandles) {
      const corner = corners[handle.cornerIndex];
      const dist = Math.hypot(handle.x - corner.x, handle.y - corner.y);
      expect(dist).toBeGreaterThan(0.5);
      expect(dist).toBeLessThan(12);
    }
  });

  it("separates shared corner handles when panels meet at one vertex", () => {
    const shared = { x: 100, y: 100 };
    const panelA = [
      shared,
      { x: 40, y: 100 },
      { x: 100, y: 40 },
    ];
    const panelB = [
      { x: 160, y: 100 },
      shared,
      { x: 100, y: 160 },
    ];

    const handleA = buildChamferedTriangleGeometry(panelA).cornerHandles[0];
    const handleB = buildChamferedTriangleGeometry(panelB).cornerHandles[1];

    expect(Math.hypot(handleA.x - handleB.x, handleA.y - handleB.y)).toBeGreaterThan(4);
  });
});
