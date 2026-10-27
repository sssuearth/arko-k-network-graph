import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Edge definitions: { a, b } where a === -1 means "hub".
export function buildEdgeDefs(nodeCount, interNodeLinks) {
  const defs = [];
  for (let i = 0; i < nodeCount; i++) defs.push({ a: -1, b: i, type: 'radial' });
  for (const [a, b] of interNodeLinks) defs.push({ a, b, type: 'inter' });
  return defs;
}

export function createEdgesSystem(edgeDefs, opacity, radialColorHex, interColorHex, width) {
  const positions = new Float32Array(edgeDefs.length * 2 * 3);
  const colors = new Float32Array(edgeDefs.length * 2 * 3);

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);

  const material = new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    linewidth: width, // pixels
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  const lineSegments = new LineSegments2(geometry, material);
  lineSegments.computeLineDistances();

  function setColors(radialHex, interHex) {
    const radialColor = new THREE.Color(radialHex);
    const interColor = new THREE.Color(interHex);
    const arr = new Float32Array(edgeDefs.length * 2 * 3);
    edgeDefs.forEach((def, i) => {
      const color = def.type === 'radial' ? radialColor : interColor;
      for (let v = 0; v < 2; v++) {
        const idx = (i * 2 + v) * 3;
        arr[idx] = color.r;
        arr[idx + 1] = color.g;
        arr[idx + 2] = color.b;
      }
    });
    geometry.setColors(arr);
  }
  setColors(radialColorHex, interColorHex);

  function updatePositions(hubPosition, nodePositions) {
    const arr = new Float32Array(edgeDefs.length * 2 * 3);
    edgeDefs.forEach((def, i) => {
      const pA = def.a === -1 ? hubPosition : nodePositions[def.a];
      const pB = nodePositions[def.b];
      const idx = i * 2 * 3;
      arr[idx] = pA.x;
      arr[idx + 1] = pA.y;
      arr[idx + 2] = pA.z;
      arr[idx + 3] = pB.x;
      arr[idx + 4] = pB.y;
      arr[idx + 5] = pB.z;
    });
    geometry.setPositions(arr);
    lineSegments.computeLineDistances();
  }

  function setOpacity(value) {
    material.opacity = value;
  }

  function setWidth(value) {
    material.linewidth = value;
  }

  function setResolution(width, height) {
    material.resolution.set(width, height);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return {
    lineSegments,
    updatePositions,
    setOpacity,
    setWidth,
    setColors,
    setResolution,
    dispose,
    edgeDefs,
  };
}
