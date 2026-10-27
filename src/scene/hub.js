import * as THREE from 'three';

export function createHub(colorHex = '#3a6cff') {
  const geometry = new THREE.IcosahedronGeometry(1.2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: 0x1a2a55,
    metalness: 0.2,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const glowGeometry = new THREE.SphereGeometry(1.9, 24, 24);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  mesh.add(glow);
  mesh.userData.glow = glow;

  return mesh;
}

export function setHubColor(mesh, colorHex) {
  mesh.material.color.set(colorHex);
  mesh.userData.glow.material.color.set(colorHex);
}

export function setHubSize(mesh, size) {
  mesh.scale.setScalar(size);
}

export function setHubVisible(mesh, visible) {
  mesh.visible = visible;
}
