import * as THREE from 'three';
import { mulberry32, seededShuffle } from '../utils/rng.js';

const RASTER_SIZE = 420;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function rasterizeSvgToFillPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SVG를 불러올 수 없습니다: ${url}`);
  const svgText = await res.text();
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const objectUrl = URL.createObjectURL(blob);

  let img;
  try {
    img = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const aspect = img.naturalWidth / img.naturalHeight || 1;
  const w = aspect >= 1 ? RASTER_SIZE : Math.max(1, Math.round(RASTER_SIZE * aspect));
  const h = aspect >= 1 ? Math.max(1, Math.round(RASTER_SIZE / aspect)) : RASTER_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 10) continue;
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luminance < 140) pixels.push({ x, y });
    }
  }
  return { pixels, w, h };
}

const fillCache = new Map();

async function getFillPixels(url) {
  if (!fillCache.has(url)) {
    fillCache.set(url, rasterizeSvgToFillPixels(url));
  }
  return fillCache.get(url);
}

// Builds `count` target positions (Vector3) sampled from the filled area of
// an SVG's rasterized silhouette, centered at the origin and scaled to fit
// within roughly `targetRadius`. Flat in Z with a small depth jitter.
export async function buildShapePositions(url, count, targetRadius, seed) {
  const { pixels, w, h } = await getFillPixels(url);
  if (pixels.length === 0) {
    throw new Error(`SVG에서 채워진 영역을 찾지 못했습니다: ${url}`);
  }

  const rng = mulberry32(seed + 9001);
  const shuffled = seededShuffle(pixels, rng);

  const maxDim = Math.max(w, h);
  const scale = (targetRadius * 1.7) / maxDim;
  const cx = w / 2;
  const cy = h / 2;
  const depthJitter = targetRadius * 0.1;

  const positions = [];
  for (let i = 0; i < count; i++) {
    const p = shuffled[i % shuffled.length];
    const nx = (p.x - cx) * scale;
    const ny = -(p.y - cy) * scale;
    const nz = (rng() - 0.5) * depthJitter;
    positions.push(new THREE.Vector3(nx, ny, nz));
  }
  return positions;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Smoothly interpolates each node's basePosition from one shape's target
// positions to another's over `duration` ms.
export class ShapeMorph {
  constructor() {
    this.active = false;
    this.from = null;
    this.to = null;
    this.startTime = 0;
    this.duration = 1200;
  }

  start(fromPositions, toPositions, duration) {
    this.from = fromPositions;
    this.to = toPositions;
    this.duration = Math.max(50, duration);
    this.startTime = performance.now();
    this.active = true;
  }

  update(nodes) {
    if (!this.active) return;
    const t = Math.min(1, (performance.now() - this.startTime) / this.duration);
    const eased = easeInOutCubic(t);
    const n = Math.min(nodes.length, this.from.length, this.to.length);
    for (let i = 0; i < n; i++) {
      nodes[i].basePosition.lerpVectors(this.from[i], this.to[i], eased);
    }
    if (t >= 1) this.active = false;
  }
}
