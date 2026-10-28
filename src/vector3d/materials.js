import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from '../utils/rng.js';

// Procedural grayscale grain texture used as a bump/roughness map so stone
// surfaces read as rough and pitted instead of perfectly smooth plastic.
export function generateGrainTexture({ size = 384, scale = 8, octaves = 4, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const noise2D = createNoise2D(rng);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const frequency0 = scale / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amplitude = 1;
      let frequency = frequency0;
      let sum = 0;
      let max = 0;
      for (let o = 0; o < octaves; o++) {
        sum += noise2D(x * frequency, y * frequency) * amplitude;
        max += amplitude;
        amplitude *= 0.5;
        frequency *= 2.15;
      }
      const v = Math.min(1, Math.max(0, sum / max * 0.5 + 0.5));
      const g = Math.round(v * 255);
      const idx = (y * size + x) * 4;
      imageData.data[idx] = g;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = g;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

export function createStoneMaterial({ color, roughness, bumpScale, grainTexture }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    bumpMap: grainTexture,
    bumpScale,
    roughnessMap: grainTexture,
  });
}

export function createMetalMaterial({ color, roughness, metalness, envMap, envMapIntensity }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMap,
    envMapIntensity,
  });
}
