import { describe, expect, it } from "vitest";
import { spreadApart } from "@/lib/layout";

const minGap = (pts: [number, number][]) => {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return m;
};

describe("spreadApart", () => {
  it("leaves markers alone when none overlap", () => {
    const pts: [number, number][] = [
      [0, 0],
      [100, 0],
      [0, 100],
    ];
    expect(spreadApart(pts, 44)).toEqual(pts);
  });

  it("separates two markers on the same spot", () => {
    expect(minGap(spreadApart([[10, 10], [10, 10]], 44))).toBeGreaterThanOrEqual(44 - 0.5);
  });

  it("separates 25 markers piled on one spot", () => {
    const pts = Array.from({ length: 25 }, () => [200, 200] as [number, number]);
    expect(minGap(spreadApart(pts, 44))).toBeGreaterThanOrEqual(44 - 0.5);
  });

  it("separates a pinned site from a nearby crowd", () => {
    const crowd = Array.from({ length: 12 }, (_, i) => [300 + (i % 4) * 10, 300 + Math.floor(i / 4) * 10] as [number, number]);
    expect(minGap(spreadApart([...crowd, [330, 320]], 44))).toBeGreaterThanOrEqual(44 - 0.5);
  });

  it("gives the same answer every time, so markers don't jump around", () => {
    const pts = Array.from({ length: 9 }, () => [50, 50] as [number, number]);
    expect(spreadApart(pts, 44)).toEqual(spreadApart(pts, 44));
  });

  it("keeps the group centered where it was", () => {
    const out = spreadApart(Array.from({ length: 6 }, () => [100, 100] as [number, number]), 44);
    const cx = out.reduce((a, p) => a + p[0], 0) / out.length;
    const cy = out.reduce((a, p) => a + p[1], 0) / out.length;
    expect(Math.abs(cx - 100)).toBeLessThan(1);
    expect(Math.abs(cy - 100)).toBeLessThan(1);
  });
});
