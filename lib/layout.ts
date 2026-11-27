/**
 * Moves screen points apart until no two are closer than `gap` pixels, so map markers never cover each other.
 * Deterministic: points on the exact same spot are split along fixed angles by their index.
 */
export function spreadApart(points: [number, number][], gap: number): [number, number][] {
  const p = points.map(([x, y]) => [x, y] as [number, number]);
  const n = p.length;
  // Split exact duplicates first, around their shared spot, so the relaxation below has a direction to push.
  const groups = new Map<string, number[]>();
  p.forEach(([x, y], i) => {
    const k = `${x},${y}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, j) => {
      const a = (2 * Math.PI * j) / idx.length;
      p[i][0] += Math.cos(a) * 0.5;
      p[i][1] += Math.sin(a) * 0.5;
    });
  }
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = p[j][0] - p[i][0];
        const dy = p[j][1] - p[i][1];
        const dist = Math.hypot(dx, dy);
        if (dist >= gap) continue;
        const push = (gap - dist) / 2 + 0.01;
        const ux = dist > 0 ? dx / dist : 1;
        const uy = dist > 0 ? dy / dist : 0;
        p[i][0] -= ux * push;
        p[i][1] -= uy * push;
        p[j][0] += ux * push;
        p[j][1] += uy * push;
        moved = true;
      }
    if (!moved) break;
  }
  return n && p.every(([x, y], i) => x === points[i][0] && y === points[i][1]) ? points : p;
}
