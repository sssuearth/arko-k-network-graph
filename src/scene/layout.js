import * as THREE from 'three';
import { mulberry32, randomRange } from '../utils/rng.js';

// Uniform random point distribution inside a sphere volume (not just on the surface).
export function generateSpherePositions(count, radius, seed) {
  const rng = mulberry32(seed);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(rng()); // cube root for uniform volume density
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions.push(new THREE.Vector3(x, y, z));
  }
  return positions;
}

export function pickRandomScales(count, baseSize, variance, seed) {
  const rng = mulberry32(seed + 777);
  const scales = [];
  for (let i = 0; i < count; i++) {
    const factor = 1 + randomRange(rng, -variance, variance);
    scales.push(Math.max(0.15, baseSize * factor));
  }
  return scales;
}

// Each node connects to a handful of its spatial neighbors (not the hub).
export function generateInterNodeLinks(positions, linkCount, seed) {
  const rng = mulberry32(seed + 1234);
  const n = positions.length;
  if (n < 2 || linkCount <= 0) return [];
  const links = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = linkCount * 20;

  while (links.length < linkCount && attempts < maxAttempts) {
    attempts++;
    const a = Math.floor(rng() * n);
    // bias toward nearby nodes: sample a few candidates, keep the closest
    let best = -1;
    let bestDist = Infinity;
    for (let k = 0; k < 5; k++) {
      const b = Math.floor(rng() * n);
      if (b === a) continue;
      const d = positions[a].distanceToSquared(positions[b]);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (best === -1) continue;
    const key = a < best ? `${a}_${best}` : `${best}_${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push([a, best]);
  }
  return links;
}
