import * as THREE from 'three';
import { loadTexture } from '../imageLoader.js';

// Builds one Sprite per node (always faces the camera). Returns node descriptors
// used by motion.js / interaction.js, plus adds the sprites to `group`.
export async function buildImageNodes(group, imageUrls, basePositions, baseScales, noiseSeedBase) {
  const nodes = [];

  const results = await Promise.allSettled(
    imageUrls.map((url) => loadTexture(url))
  );

  for (let i = 0; i < imageUrls.length; i++) {
    const result = results[i];
    const material = new THREE.SpriteMaterial({
      transparent: true,
      depthWrite: false,
    });

    let aspect = 1;
    if (result.status === 'fulfilled') {
      material.map = result.value.texture;
      aspect = result.value.aspect;
    } else {
      material.color = new THREE.Color(0xcccccc);
    }

    const sprite = new THREE.Sprite(material);
    const baseSize = baseScales[i];
    const width = aspect >= 1 ? baseSize : baseSize * aspect;
    const height = aspect >= 1 ? baseSize / aspect : baseSize;
    sprite.scale.set(width, height, 1);
    sprite.position.copy(basePositions[i]);
    sprite.userData.nodeIndex = i;

    group.add(sprite);

    nodes.push({
      sprite,
      basePosition: basePositions[i].clone(),
      baseWidth: width,
      baseHeight: height,
      noiseOffset: noiseSeedBase + i * 13.37,
    });
  }

  return nodes;
}

export function disposeImageNodes(nodes, group) {
  for (const node of nodes) {
    group.remove(node.sprite);
    node.sprite.material.map?.dispose();
    node.sprite.material.dispose();
  }
}
