import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export async function loadSvgText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SVG를 불러올 수 없습니다: ${url}`);
  return res.text();
}

function parseViewBox(svgText) {
  const vbMatch = svgText.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vbMatch) {
    const [minX, minY, width, height] = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if ([minX, minY, width, height].every((n) => Number.isFinite(n)) && width > 0 && height > 0) {
      return { minX, minY, width, height };
    }
  }
  const widthMatch = svgText.match(/\bwidth\s*=\s*"([\d.]+)/);
  const heightMatch = svgText.match(/\bheight\s*=\s*"([\d.]+)/);
  const width = widthMatch ? parseFloat(widthMatch[1]) : 100;
  const height = heightMatch ? parseFloat(heightMatch[1]) : 100;
  return { minX: 0, minY: 0, width, height };
}

function isClosed(points) {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y) < 1e-3 * Math.max(1, Math.abs(first.x) + Math.abs(first.y));
}

// Walks a polyline and emits points evenly spaced by `spacing`.
function resamplePolyline(points, spacing, closed) {
  const pts = closed ? points.slice(0, -1).concat(points[0]) : points;
  if (pts.length < 2) return points.slice();

  const result = [{ x: pts[0].x, y: pts[0].y }];
  let prev = pts[0];
  let carry = 0;

  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i];
    let segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    while (carry + segLen >= spacing && segLen > 1e-9) {
      const t = (spacing - carry) / segLen;
      const nx = prev.x + (cur.x - prev.x) * t;
      const ny = prev.y + (cur.y - prev.y) * t;
      result.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      carry = 0;
    }
    carry += segLen;
    prev = cur;
  }

  if (closed && result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < spacing * 0.5) result.pop();
  }
  return result;
}

// The curve boundary points are exactly the original path's anchor/corner
// vertices (SVG M/L/C command endpoints) — the vector file's actual "꼭짓점",
// as opposed to the densely-flattened curve points used for rendering.
function extractAnchors(subPath) {
  if (!subPath.curves || subPath.curves.length === 0) return [];
  const anchors = [subPath.curves[0].getPoint(0)];
  for (const curve of subPath.curves) anchors.push(curve.getPoint(1));

  const deduped = [];
  for (const p of anchors) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) deduped.push(p);
  }
  return deduped;
}

function extractRawChains(svgText) {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);
  const chains = [];

  data.paths.forEach((path) => {
    path.subPaths.forEach((subPath) => {
      if (!subPath.curves || subPath.curves.length === 0) return;
      const divisions = Math.max(24, subPath.curves.length * 10);
      const raw = subPath.getPoints(divisions);
      if (raw.length < 3) return;
      const closed = isClosed(raw);
      const anchors = extractAnchors(subPath).map((p) => ({ x: p.x, y: p.y }));
      chains.push({ points: raw.map((p) => ({ x: p.x, y: p.y })), closed, anchors });
    });
  });
  return chains;
}

// Finds, for each true vertex, the nearest sample on the resampled chain and
// locally triples the point density on its adjacent edges. Growth starts
// from an even outline, so this gives the original corners a denser cluster
// to kick off folding there first — instead of growth starting uniformly
// everywhere and ignoring the source file's actual geometry.
function seedVertexDensity(points, closed, anchors) {
  if (anchors.length === 0 || points.length < 3) return points;
  const n = points.length;
  const vertexIndices = new Set();
  for (const a of anchors) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(points[i].x - a.x, points[i].y - a.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    vertexIndices.add(bestIdx);
  }

  const result = [];
  const limit = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    result.push(a);
    if (i >= limit) continue;
    const nextIdx = (i + 1) % n;
    const b = points[nextIdx];
    if (vertexIndices.has(i) || vertexIndices.has(nextIdx)) {
      result.push({ x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 });
      result.push({ x: a.x + (b.x - a.x) * (2 / 3), y: a.y + (b.y - a.y) * (2 / 3) });
    }
  }
  return result;
}

// Builds a stack of masks at increasing outward margins, approximated by
// blurring the rasterized glyph and re-thresholding its alpha (a Gaussian
// blur of radius R spreads non-zero alpha roughly R world-units past the
// original silhouette). Growth can then be let out past the original SVG
// boundary gradually by indexing further into this stack once the interior
// has filled up, instead of staying hard-clipped to the source shape forever.
async function buildDilatedMasks(svgText, viewBox, worldWidth, worldHeight, margins) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('SVG 이미지를 디코딩하지 못했습니다.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const maskW = Math.max(1, Math.round(worldWidth));
  const maskH = Math.max(1, Math.round(worldHeight));

  const levels = margins.map((margin) => {
    const canvas = document.createElement('canvas');
    canvas.width = maskW;
    canvas.height = maskH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, maskW, maskH);
    if (margin > 0) ctx.filter = `blur(${margin}px)`;
    ctx.drawImage(img, 0, 0, maskW, maskH);
    ctx.filter = 'none';
    return ctx.getImageData(0, 0, maskW, maskH).data;
  });

  return {
    width: maskW,
    height: maskH,
    levelCount: levels.length,
    isInside(x, y) {
      return this.isInsideAtLevel(x, y, 0);
    },
    isInsideAtLevel(x, y, levelIndex) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= maskW || py >= maskH) return false;
      const idx = Math.max(0, Math.min(levels.length - 1, levelIndex));
      return levels[idx][(py * maskW + px) * 4 + 3] > 5;
    },
  };
}

// Parses an SVG and returns growth-ready chains (world-space, evenly resampled)
// plus a fill mask stack that growth can be constrained against. World space
// maps the SVG's viewBox so that its longer side equals `worldSize`.
export async function buildWorldChains(
  svgText,
  { worldSize = 800, spacing = 6, maxSpreadMargin = 40, spreadLevels = 8 } = {}
) {
  const viewBox = parseViewBox(svgText);
  const scale = worldSize / Math.max(viewBox.width, viewBox.height);
  const worldWidth = viewBox.width * scale;
  const worldHeight = viewBox.height * scale;

  const toWorld = (p) => ({
    x: (p.x - viewBox.minX) * scale,
    y: (p.y - viewBox.minY) * scale,
  });

  const rawChains = extractRawChains(svgText);
  const chains = rawChains
    .map(({ points, closed, anchors }) => {
      const resampled = resamplePolyline(points.map(toWorld), spacing, closed);
      return {
        closed,
        points: seedVertexDensity(resampled, closed, anchors.map(toWorld)),
      };
    })
    .filter((c) => c.points.length >= 3);

  if (chains.length === 0) {
    throw new Error('SVG에서 윤곽선을 찾지 못했습니다.');
  }

  const margins = Array.from({ length: Math.max(1, spreadLevels) }, (_, i) =>
    spreadLevels <= 1 ? 0 : (i / (spreadLevels - 1)) * maxSpreadMargin
  );
  const mask = await buildDilatedMasks(svgText, viewBox, worldWidth, worldHeight, margins);

  return { chains, mask, worldWidth, worldHeight };
}
