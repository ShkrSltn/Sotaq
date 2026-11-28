export type Vec2 = {
  x: number;
  y: number;
};

export type VoronoiDayCell = {
  day: number;
  site: Vec2;
  center: Vec2;
  rawPolygon: Vec2[];
  insetPolygon: Vec2[];
  pathD: string;
};

/**
 * Deterministic 32-bit PRNG (Mulberry32) so each (year, month) keeps a stable organic layout.
 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Clips a convex polygon against the half-plane { p : p.x * nx + p.y * ny <= c }
 * using Sutherland–Hodgman clipping.
 */
function clipPolygonByLinearHalfPlane(
  poly: Vec2[],
  nx: number,
  ny: number,
  c: number,
): Vec2[] {
  if (poly.length === 0) {
    return poly;
  }

  const inside = (p: Vec2) => p.x * nx + p.y * ny <= c + 1e-6;

  const intersect = (p1: Vec2, p2: Vec2): Vec2 => {
    const d1 = p1.x * nx + p1.y * ny - c;
    const d2 = p2.x * nx + p2.y * ny - c;
    const denom = d1 - d2;
    if (Math.abs(denom) < 1e-9) {
      return { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
    }
    const t = d1 / denom;
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  };

  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const curr = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const currIn = inside(curr);
    const prevIn = inside(prev);

    if (currIn) {
      if (!prevIn) {
        out.push(intersect(prev, curr));
      }
      out.push(curr);
    } else if (prevIn) {
      out.push(intersect(prev, curr));
    }
  }

  return out;
}

/**
 * Clips a convex polygon against the Voronoi bisector { p : |p - a| <= |p - b| }.
 */
function clipPolygonByBisector(poly: Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const midX = (a.x + b.x) * 0.5;
  const midY = (a.y + b.y) * 0.5;
  const c = midX * nx + midY * ny;
  return clipPolygonByLinearHalfPlane(poly, nx, ny, c);
}

function polygonCentroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) {
    return { x: 50, y: 50 };
  }
  let area2 = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < poly.length; i += 1) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    area2 += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }

  if (Math.abs(area2) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / poly.length, y: sy / poly.length };
  }

  const inv = 1 / (3 * area2);
  return { x: cx * inv, y: cy * inv };
}

function dedupeVertices(poly: Vec2[], minDist = 0.35): Vec2[] {
  if (poly.length <= 3) {
    return poly;
  }
  const cleaned: Vec2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= minDist) {
      cleaned.push(p);
    }
  }
  if (
    cleaned.length > 3 &&
    Math.hypot(
      cleaned[0].x - cleaned[cleaned.length - 1].x,
      cleaned[0].y - cleaned[cleaned.length - 1].y,
    ) < minDist
  ) {
    cleaned.pop();
  }
  return cleaned.length >= 3 ? cleaned : poly;
}

/**
 * Offsets every edge of a convex polygon inward by `inset` units, creating uniform
 * channels between neighboring Voronoi cells while keeping boundary edges flush/clean.
 */
function insetConvexPolygon(poly: Vec2[], inset: number): Vec2[] {
  if (poly.length < 3) {
    return poly;
  }
  const center = polygonCentroid(poly);
  let result = poly;

  for (let i = 0; i < poly.length; i += 1) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) {
      continue;
    }

    // Outward unit normal pointing away from centroid
    let nx = -dy / len;
    let ny = dx / len;
    const toEdge = (p0.x - center.x) * nx + (p0.y - center.y) * ny;
    if (toEdge < 0) {
      nx = -nx;
      ny = -ny;
    }

    const c = p0.x * nx + p0.y * ny - inset;
    result = clipPolygonByLinearHalfPlane(result, nx, ny, c);
    if (result.length < 3) {
      break;
    }
  }

  if (result.length < 3) {
    return poly.map((p) => ({
      x: center.x + (p.x - center.x) * 0.88,
      y: center.y + (p.y - center.y) * 0.88,
    }));
  }

  return dedupeVertices(result);
}

/**
 * Converts a convex polygon into a smooth pebble-like SVG path with quadratic Bezier rounded corners.
 */
function buildRoundedPolygonPath(poly: Vec2[], cornerRadius: number): string {
  const pts = dedupeVertices(poly);
  const n = pts.length;
  if (n < 3) {
    return '';
  }

  const commands: string[] = [];

  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const vx1 = prev.x - curr.x;
    const vy1 = prev.y - curr.y;
    const vx2 = next.x - curr.x;
    const vy2 = next.y - curr.y;

    const len1 = Math.hypot(vx1, vy1);
    const len2 = Math.hypot(vx2, vy2);

    const r = Math.min(cornerRadius, len1 * 0.42, len2 * 0.42);
    if (r < 0.08 || len1 < 1e-4 || len2 < 1e-4) {
      commands.push(`${i === 0 ? 'M' : 'L'}${curr.x.toFixed(2)},${curr.y.toFixed(2)}`);
      continue;
    }

    const ax = curr.x + (vx1 / len1) * r;
    const ay = curr.y + (vy1 / len1) * r;
    const bx = curr.x + (vx2 / len2) * r;
    const by = curr.y + (vy2 / len2) * r;

    commands.push(`${i === 0 ? 'M' : 'L'}${ax.toFixed(2)},${ay.toFixed(2)}`);
    commands.push(
      `Q${curr.x.toFixed(2)},${curr.y.toFixed(2)} ${bx.toFixed(2)},${by.toFixed(2)}`,
    );
  }

  commands.push('Z');
  return commands.join(' ');
}

function computeVoronoiCells(sites: Vec2[], boxSize: number): Vec2[][] {
  const baseBox: Vec2[] = [
    { x: 0, y: 0 },
    { x: boxSize, y: 0 },
    { x: boxSize, y: boxSize },
    { x: 0, y: boxSize },
  ];

  return sites.map((site, i) => {
    let cell = baseBox;
    for (let j = 0; j < sites.length; j += 1) {
      if (i === j) continue;
      cell = clipPolygonByBisector(cell, site, sites[j]);
      if (cell.length === 0) break;
    }
    return cell;
  });
}

function generateInitialSites(count: number, boxSize: number, rng: () => number): Vec2[] {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = boxSize / cols;
  const cellH = boxSize / rows;

  const indices = Array.from({ length: cols * rows }, (_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  const sites: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const slot = indices[i];
    const r = Math.floor(slot / cols);
    const c = slot % cols;
    const x = (c + 0.18 + rng() * 0.64) * cellW;
    const y = (r + 0.18 + rng() * 0.64) * cellH;
    sites.push({ x, y });
  }

  return sites;
}

/**
 * Orders relaxed Voronoi cells in a natural serpentine path from top to bottom
 * (row 0: left→right, row 1: right→left, row 2: left→right...) so:
 * 1) Dates 1..31 are intuitive to locate visually.
 * 2) Consecutive streak days are always adjacent neighbors forming a connected territory.
 */
function sortCellsSerpentine(
  sites: Vec2[],
  rawPolys: Vec2[][],
): { site: Vec2; rawPoly: Vec2[] }[] {
  const combined = rawPolys.map((rawPoly, idx) => ({
    site: sites[idx],
    rawPoly,
    centroid: polygonCentroid(rawPoly),
  }));

  combined.sort((a, b) => a.centroid.y - b.centroid.y);

  const bandCount = 5;
  const total = combined.length;
  const ordered: { site: Vec2; rawPoly: Vec2[] }[] = [];

  let cursor = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const remainingBands = bandCount - band;
    const remainingItems = total - cursor;
    const take = Math.ceil(remainingItems / remainingBands);
    const slice = combined.slice(cursor, cursor + take);
    cursor += take;

    slice.sort((a, b) =>
      band % 2 === 0 ? a.centroid.x - b.centroid.x : b.centroid.x - a.centroid.x,
    );

    for (const item of slice) {
      ordered.push({ site: item.site, rawPoly: item.rawPoly });
    }
  }

  return ordered;
}

const VORONOI_VIEWBOX_SIZE = 100;
const CELL_INSET = 1.05;
const CORNER_RADIUS = 2.15;
const MONTH_CACHE = new Map<string, VoronoiDayCell[]>();

/**
 * Returns organic rounded Voronoi cells for (year, monthIndex 0..11) in 0..100 SVG space.
 */
export function getMonthVoronoi(
  year: number,
  monthIndex: number,
  dayCount: number,
): VoronoiDayCell[] {
  const cacheKey = `v2-${year}-${monthIndex}-${dayCount}`;
  const cached = MONTH_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const seed = year * 101 + (monthIndex + 1) * 37;
  const rng = mulberry32(seed);
  let sites = generateInitialSites(dayCount, VORONOI_VIEWBOX_SIZE, rng);
  let rawCells = computeVoronoiCells(sites, VORONOI_VIEWBOX_SIZE);

  // 5 iterations of Lloyd's relaxation for balanced, stone-like proportions
  for (let iter = 0; iter < 5; iter += 1) {
    sites = rawCells.map((poly, idx) => {
      const c = polygonCentroid(poly);
      return {
        x: Math.max(4, Math.min(VORONOI_VIEWBOX_SIZE - 4, c.x || sites[idx].x)),
        y: Math.max(4, Math.min(VORONOI_VIEWBOX_SIZE - 4, c.y || sites[idx].y)),
      };
    });
    rawCells = computeVoronoiCells(sites, VORONOI_VIEWBOX_SIZE);
  }

  const ordered = sortCellsSerpentine(sites, rawCells);

  const result: VoronoiDayCell[] = ordered.map((entry, idx) => {
    const insetPoly = insetConvexPolygon(entry.rawPoly, CELL_INSET);
    const center = polygonCentroid(insetPoly);
    const pathD = buildRoundedPolygonPath(insetPoly, CORNER_RADIUS);

    return {
      day: idx + 1,
      site: entry.site,
      center,
      rawPolygon: entry.rawPoly,
      insetPolygon: insetPoly,
      pathD,
    };
  });

  MONTH_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Finds the exact Voronoi cell at normalized coordinates (vx, vy in 0..100).
 * Since rawCells are the exact Voronoi partition of `site`, minimum squared distance
 * to `cell.site` is mathematically exact across the entire 100×100 square.
 */
export function findDayCellAtPoint(
  cells: VoronoiDayCell[],
  vx: number,
  vy: number,
): VoronoiDayCell | null {
  if (cells.length === 0) {
    return null;
  }
  let closest = cells[0];
  let bestDist = Infinity;
  for (let i = 0; i < cells.length; i += 1) {
    const dx = vx - cells[i].site.x;
    const dy = vy - cells[i].site.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      closest = cells[i];
    }
  }
  return closest;
}
