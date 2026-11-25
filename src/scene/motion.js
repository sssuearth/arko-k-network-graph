import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mulberry32 } from '../utils/rng.js';

export class Motion {
  constructor(seed) {
    this.noise3D = createNoise3D(mulberry32(seed));
    this._tmp = new THREE.Vector3();
  }

  // Nodes stay at their final shape position at all times; only the
  // floating noise offset is scaled, by `introFactor` (0..1), so it can be
  // silenced while the hero camera intro is holding on a fullscreen image
  // and faded back in as it zooms out (see getIntroNoiseFactor in main.js).
  update(nodes, elapsedTime, params, introFactor = 1) {
    for (const node of nodes) {
      const n = node.noiseOffset;
      const t = elapsedTime * params.noiseSpeed;
      const nx = this.noise3D(n, t, 0);
      const ny = this.noise3D(0, n, t);
      const nz = this.noise3D(t, 0, n);
      this._tmp.set(nx, ny, nz).multiplyScalar(params.noiseStrength * introFactor);
      node.sprite.position.copy(node.basePosition).add(this._tmp);
    }
  }
}
