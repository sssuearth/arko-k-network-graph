import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { loadSvgText, buildExtrudedGeometry } from './svgTo3d.js';
import { generateGrainTexture, createStoneMaterial, createMetalMaterial } from './materials.js';
import { createControlPanel } from './controlPanel.js';

const DEFAULT_SVG_URL = '/shapes/5_logo_arko.svg';

const state = {
  shape: {
    depth: 8,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 0.8,
  },
  material: {
    type: 'stone',
    color: '#9a9a92',
  },
  stone: {
    roughness: 0.85,
    bumpScale: 0.6,
    grainScale: 10,
  },
  metal: {
    roughness: 0.35,
    metalness: 1,
    envIntensity: 1.4,
  },
  light: {
    ambientIntensity: 0.55,
    keyIntensity: 2.2,
    keyAzimuth: 35,
    keyElevation: 55,
    keyColor: '#ffffff',
    fillIntensity: 0.4,
  },
  display: {
    backgroundColor: '#2b2b2b',
    autoRotate: true,
  },
};

const app = document.getElementById('app');
const loadingOverlay = document.getElementById('loadingOverlay');
const dragOverlay = document.getElementById('dragOverlay');

const scene = new THREE.Scene();
scene.background = new THREE.Color(state.display.backgroundColor);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const rootGroup = new THREE.Group();
scene.add(rootGroup);

let mesh = null;
let currentSvgText = null;
let grainTexture = generateGrainTexture({ scale: state.stone.grainScale, seed: 7 });

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, state.light.ambientIntensity);
const keyLight = new THREE.DirectionalLight(state.light.keyColor, state.light.keyIntensity);
const fillLight = new THREE.DirectionalLight(0xffffff, state.light.fillIntensity);
fillLight.position.set(-30, 10, -20);
scene.add(ambientLight, keyLight, fillLight);

function updateKeyLightPosition() {
  const azimuth = THREE.MathUtils.degToRad(state.light.keyAzimuth);
  const elevation = THREE.MathUtils.degToRad(state.light.keyElevation);
  const radius = 60;
  const x = radius * Math.cos(elevation) * Math.sin(azimuth);
  const y = radius * Math.sin(elevation);
  const z = radius * Math.cos(elevation) * Math.cos(azimuth);
  keyLight.position.set(x, y, z);
}
updateKeyLightPosition();

function applyLightState() {
  ambientLight.intensity = state.light.ambientIntensity;
  keyLight.intensity = state.light.keyIntensity;
  keyLight.color.set(state.light.keyColor);
  fillLight.intensity = state.light.fillIntensity;
  updateKeyLightPosition();
}

function buildMaterial() {
  if (state.material.type === 'stone') {
    return createStoneMaterial({
      color: state.material.color,
      roughness: state.stone.roughness,
      bumpScale: state.stone.bumpScale,
      grainTexture,
    });
  }
  return createMetalMaterial({
    color: state.material.color,
    roughness: state.metal.roughness,
    metalness: state.metal.metalness,
    envMap: envTexture,
    envMapIntensity: state.metal.envIntensity,
  });
}

function applyMaterial() {
  if (!mesh) return;
  mesh.material.dispose();
  mesh.material = buildMaterial();
}

async function rebuildGeometry() {
  if (!currentSvgText) return;
  const geometry = buildExtrudedGeometry(currentSvgText, state.shape);
  if (mesh) {
    rootGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  const material = buildMaterial();
  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = 0;
  rootGroup.add(mesh);
}

async function loadSvg(svgText) {
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.opacity = '1';
  try {
    currentSvgText = svgText;
    await rebuildGeometry();
  } catch (err) {
    console.error(err);
    window.alert(`SVG를 불러오지 못했습니다: ${err.message}`);
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

const { gui } = createControlPanel(state, {
  onLoadSvg: (svgText) => loadSvg(svgText),
  onShapeChange: () => rebuildGeometry(),
  onMaterialTypeChange: () => applyMaterial(),
  onMaterialChange: () => applyMaterial(),
  onStoneTextureChange: () => {
    grainTexture.dispose();
    grainTexture = generateGrainTexture({ scale: state.stone.grainScale, seed: 7 });
    applyMaterial();
  },
  onLightChange: () => applyLightState(),
  onBackgroundColorChange: (value) => {
    scene.background = new THREE.Color(value);
  },
  onDisplayChange: () => {},
});

const guiToggle = document.getElementById('guiToggle');
let guiVisible = true;
guiToggle.addEventListener('click', () => {
  guiVisible = !guiVisible;
  gui.show(guiVisible);
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

// --- Drag & drop SVG files ---
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dragOverlay.classList.add('active');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOverlay.classList.remove('active');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dragOverlay.classList.remove('active');

  const file = Array.from(e.dataTransfer.files || []).find((f) => /\.svg$/i.test(f.name));
  if (!file) return;
  const text = await file.text();
  await loadSvg(text);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (state.display.autoRotate) {
    rootGroup.rotation.y += 0.25 * delta;
  }

  controls.update();
  renderer.render(scene, camera);
}

async function init() {
  const svgText = await loadSvgText(DEFAULT_SVG_URL);
  await loadSvg(svgText);
  animate();
}

init();
