import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mulberry32 } from '../utils/rng.js';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export class Motion {
  constructor(seed) {
    this.noise3D = createNoise3D(mulberry32(seed));
    this.introDuration = 2500;
    this.introStart = performance.now();
    this._tmp = new THREE.Vector3();
  }

  playIntro(durationMs) {
    this.introDuration = Math.max(100, durationMs);
    this.introStart = performance.now();
  }

  getIntroProgress() {
    const t = (performance.now() - this.introStart) / this.introDuration;
    return Math.min(1, Math.max(0, t));
  }

  update(nodes, elapsedTime, params) {
    const eased = easeOutCubic(this.getIntroProgress());
    for (const node of nodes) {
      const n = node.noiseOffset;
      const t = elapsedTime * params.noiseSpeed;
      const nx = this.noise3D(n, t, 0);
      const ny = this.noise3D(0, n, t);
      const nz = this.noise3D(t, 0, n);
      this._tmp.set(nx, ny, nz).multiplyScalar(params.noiseStrength * eased);
      node.sprite.position
        .copy(node.basePosition)
        .multiplyScalar(eased)
        .add(this._tmp);
    }
  }
}
