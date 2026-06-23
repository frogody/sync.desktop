/**
 * Hexagon geometry helpers (pointy-top orientation)
 *
 * Shared by the SYNC avatar ring (SyncAvatarMini) and the login ring
 * (LoginScreen) so the geometry stays identical in both places.
 */

const HEX_ANGLES = [270, 330, 30, 90, 150, 210].map((d) => (d * Math.PI) / 180);

export function hexVertex(cx: number, cy: number, r: number, i: number) {
  const a = HEX_ANGLES[i % 6];
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function hexPointsStr(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const v = hexVertex(cx, cy, r, i);
    return `${v.x},${v.y}`;
  }).join(' ');
}

// Map a 0-1 fraction to a point on the hexagon perimeter
export function hexPerimeterPoint(cx: number, cy: number, r: number, frac: number) {
  const f = ((frac % 1) + 1) % 1;
  const totalEdges = 6;
  const edgeProgress = f * totalEdges;
  const edgeIndex = Math.floor(edgeProgress);
  const t = edgeProgress - edgeIndex;
  const v0 = hexVertex(cx, cy, r, edgeIndex);
  const v1 = hexVertex(cx, cy, r, (edgeIndex + 1) % 6);
  return {
    x: v0.x + (v1.x - v0.x) * t,
    y: v0.y + (v1.y - v0.y) * t,
  };
}

// Build SVG path along hex perimeter from frac0 to frac1
export function hexEdgePath(cx: number, cy: number, r: number, frac0: number, frac1: number) {
  const f0 = ((frac0 % 1) + 1) % 1;
  const f1 = ((frac1 % 1) + 1) % 1;
  const totalEdges = 6;

  const points: { x: number; y: number }[] = [];
  points.push(hexPerimeterPoint(cx, cy, r, f0));

  const startEdge = Math.floor(f0 * totalEdges);
  const span = f1 > f0 ? f1 - f0 : 1 - f0 + f1;
  const endFrac = f0 + span;
  let nextVertexFrac = (startEdge + 1) / totalEdges;
  if (nextVertexFrac <= f0) nextVertexFrac += 1;

  while (nextVertexFrac < endFrac - 0.0001) {
    points.push(hexPerimeterPoint(cx, cy, r, nextVertexFrac));
    nextVertexFrac += 1 / totalEdges;
  }

  points.push(hexPerimeterPoint(cx, cy, r, f1));
  return 'M ' + points.map((p) => `${p.x} ${p.y}`).join(' L ');
}

// CSS clip-path for pointy-top hexagon
export const HEX_CLIP = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)';
