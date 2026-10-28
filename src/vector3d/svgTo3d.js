import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TARGET_SIZE = 40;

export async function loadSvgText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SVG를 불러올 수 없습니다: ${url}`);
  return res.text();
}

// Parses SVG path data, extrudes every filled subpath into a solid, merges
// them into one geometry centered at the origin and scaled to TARGET_SIZE.
export function buildExtrudedGeometry(svgText, extrudeOptions) {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);

  const extrudeSettings = {
    depth: extrudeOptions.depth,
    bevelEnabled: extrudeOptions.bevelEnabled,
    bevelThickness: extrudeOptions.bevelThickness,
    bevelSize: extrudeOptions.bevelSize,
    bevelSegments: extrudeOptions.bevelSegments ?? 3,
    curveSegments: 12,
  };

  const geometries = [];
  data.paths.forEach((path) => {
    const shapes = SVGLoader.createShapes(path);
    shapes.forEach((shape) => {
      geometries.push(new THREE.ExtrudeGeometry(shape, extrudeSettings));
    });
  });

  if (geometries.length === 0) {
    throw new Error('SVG에서 채워진 도형을 찾지 못했습니다.');
  }

  geometries.forEach((g) => {
    delete g.attributes.uv2;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());

  // SVG coordinates are y-down; flip to match screen/world orientation.
  merged.scale(1, -1, 1);
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const center = new THREE.Vector3();
  box.getCenter(center);
  merged.translate(-center.x, -center.y, -center.z);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, 1e-6);
  const scale = TARGET_SIZE / maxDim;
  merged.scale(scale, scale, scale);

  merged.computeVertexNormals();
  return merged;
}
