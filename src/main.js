import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  loadManifest,
  buildNodeImageList,
  extractImageFilesFromDrop,
  filesToObjectUrls,
} from './imageLoader.js';
import { generateSpherePositions, pickRandomScales, generateInterNodeLinks } from './scene/layout.js';
import { createHub, setHubColor, setHubSize, setHubVisible } from './scene/hub.js';
import { buildImageNodes, disposeImageNodes } from './scene/imageNodes.js';
import { buildEdgeDefs, createEdgesSystem } from './scene/edges.js';
import { Motion } from './scene/motion.js';
import { buildShapePositions, ShapeMorph } from './scene/shapes.js';
import { createControlPanel } from './gui/controlPanel.js';
import { relativeLuminance, lighten, darken } from './utils/color.js';

const SHAPE_SVG = {
  a: '/shapes/1_logo_a.svg',
  r: '/shapes/2_logo_r.svg',
  k: '/shapes/3_logo_k.svg',
  o: '/shapes/4_logo_o.svg',
  arko: '/shapes/5_logo_arko.svg',
};

const state = {
  shape: {
    type: 'sphere',
    morphDuration: 1200,
  },
  layout: {
    nodeCount: 158,
    sphereRadius: 36,
    imageSize: 3,
    sizeVariance: 0.77,
    seed: 237622,
  },
  lines: {
    opacity: 0.25,
    interNodeCount: 150,
    radialColor: '#000000',
    interColor: '#000000',
    width: 0.3,
  },
  hub: {
    color: '#3a6cff',
    size: 1,
    visible: false,
  },
  motion: {
    rotationSpeed: 0.07,
    noiseStrength: 5,
    noiseSpeed: 0.2,
    introDuration: 2500,
  },
  camera: {
    autoRotate: true,
    zoom: 1.04,
  },
  display: {
    backgroundColor: '#ffffff',
    hideCursor: false,
  },
};

const app = document.getElementById('app');
const loadingOverlay = document.getElementById('loadingOverlay');
const dragOverlay = document.getElementById('dragOverlay');

const scene = new THREE.Scene();
scene.background = new THREE.Color(state.display.backgroundColor);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.9);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 7);
scene.add(ambient, dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const rootGroup = new THREE.Group();
scene.add(rootGroup);

const hub = createHub(state.hub.color);
setHubSize(hub, state.hub.size);
setHubVisible(hub, state.hub.visible);
rootGroup.add(hub);

const motion = new Motion(state.layout.seed);
const shapeMorph = new ShapeMorph();

let nodes = [];
let edgesSystem = null;
let sourceImageUrls = [];
let cameraBaseDistance = state.layout.sphereRadius * 2.8;
let usingDroppedImages = false;
let shapeCache = {};
let shapeRequestToken = 0;

function disposeCurrent() {
  if (edgesSystem) {
    rootGroup.remove(edgesSystem.lineSegments);
    edgesSystem.dispose();
    edgesSystem = null;
  }
  if (nodes.length) {
    disposeImageNodes(nodes, rootGroup);
    nodes = [];
  }
}

async function rebuild({ replayIntro = true } = {}) {
  const { nodeCount, sphereRadius, imageSize, sizeVariance, seed } = state.layout;

  disposeCurrent();

  const positions = generateSpherePositions(nodeCount, sphereRadius, seed);
  const scales = pickRandomScales(nodeCount, imageSize, sizeVariance, seed);
  const interLinks = generateInterNodeLinks(positions, state.lines.interNodeCount, seed);
  const edgeDefs = buildEdgeDefs(nodeCount, interLinks);

  edgesSystem = createEdgesSystem(
    edgeDefs,
    state.lines.opacity,
    state.lines.radialColor,
    state.lines.interColor,
    state.lines.width
  );
  rootGroup.add(edgesSystem.lineSegments);

  const imageList = buildNodeImageList(sourceImageUrls, nodeCount, seed);
  nodes = await buildImageNodes(rootGroup, imageList, positions, scales, seed);

  cameraBaseDistance = sphereRadius * 2.8;

  // Layout changes invalidate any sampled shape (point count/scale no longer match),
  // so re-sample the currently selected shape at the new nodeCount/radius/seed and
  // snap straight to it (no animation) instead of dropping back to sphere.
  shapeCache = { sphere: positions.map((p) => p.clone()) };
  if (state.shape.type !== 'sphere') {
    const target = await getShapePositions(state.shape.type);
    for (let i = 0; i < nodes.length && i < target.length; i++) {
      nodes[i].basePosition.copy(target[i]);
    }
  }

  if (replayIntro) motion.playIntro(state.motion.introDuration);
}

function refreshGuiDisplay() {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

async function getShapePositions(type) {
  if (shapeCache[type]) return shapeCache[type];
  const url = SHAPE_SVG[type];
  const positions = await buildShapePositions(url, state.layout.nodeCount, state.layout.sphereRadius, state.layout.seed);
  shapeCache[type] = positions;
  return positions;
}

// Tone-on-tone panel theme: panel background tracks the scene background
// color, with text/hamburger flipping black/white for contrast.
function applyPanelTheme(backgroundColor) {
  const isDark = relativeLuminance(backgroundColor) < 0.5;
  const textColor = isDark ? '#ffffff' : '#000000';
  const vars = {
    '--panel-bg': backgroundColor,
    '--panel-text': textColor,
    '--panel-title-bg': isDark ? lighten(backgroundColor, 0.12) : darken(backgroundColor, 0.06),
    '--panel-widget': isDark ? lighten(backgroundColor, 0.18) : darken(backgroundColor, 0.08),
    '--panel-hover': isDark ? lighten(backgroundColor, 0.28) : darken(backgroundColor, 0.14),
    '--panel-accent': isDark ? '#7fa8ff' : '#2a5ed9',
    '--panel-border': isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)',
    '--hamburger-color': textColor,
  };
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}

applyPanelTheme(state.display.backgroundColor);

// --- Video recording ---
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let recordingTimerId = null;

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function pickRecorderMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';
}

async function saveBlobWithPicker(blob, suggestedName) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled the save dialog
      console.warn('showSaveFilePicker 실패, 다운로드로 대체합니다.', err);
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = suggestedName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function startRecording() {
  const stream = renderer.domElement.captureStream(60);
  const mimeType = pickRecorderMimeType();
  recordedChunks = [];
  mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();
  isRecording = true;

  recordingStartTime = performance.now();
  setRecordingLabel(`⏱ 00:00 정지`);
  recordingTimerId = setInterval(() => {
    setRecordingLabel(`⏱ ${formatElapsed(performance.now() - recordingStartTime)} 정지`);
  }, 200);
}

function stopRecordingAndSave() {
  clearInterval(recordingTimerId);
  recordingTimerId = null;
  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      await saveBlobWithPicker(blob, `network-graph-${Date.now()}.webm`);
      resolve();
    };
    mediaRecorder.stop();
    isRecording = false;
  });
}

const { gui, setRecordingLabel } = createControlPanel(state, {
  onLayoutChange: () => rebuild({ replayIntro: false }),
  onLinesOpacityChange: (value) => edgesSystem && edgesSystem.setOpacity(value),
  onLinesColorChange: () =>
    edgesSystem && edgesSystem.setColors(state.lines.radialColor, state.lines.interColor),
  onLinesWidthChange: (value) => edgesSystem && edgesSystem.setWidth(value),
  onHubChange: () => {
    setHubColor(hub, state.hub.color);
    setHubSize(hub, state.hub.size);
    setHubVisible(hub, state.hub.visible);
  },
  onZoomChange: (value) => {
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(cameraBaseDistance / value);
    camera.position.copy(controls.target).add(dir);
  },
  onReshuffle: () => {
    state.layout.seed = Math.floor(Math.random() * 999999);
    refreshGuiDisplay();
    rebuild({ replayIntro: true });
  },
  onReplayIntro: () => motion.playIntro(state.motion.introDuration),
  onShapeChange: async (type) => {
    const token = ++shapeRequestToken;
    const from = nodes.map((n) => n.basePosition.clone());
    let to;
    try {
      to = await getShapePositions(type);
    } catch (err) {
      console.error(err);
      return;
    }
    if (token !== shapeRequestToken) return; // a newer shape change started meanwhile
    shapeMorph.start(from, to, state.shape.morphDuration);
  },
  onHideCursorChange: (value) => {
    renderer.domElement.style.cursor = value ? 'none' : '';
  },
  onBackgroundColorChange: (value) => {
    scene.background = new THREE.Color(value);
    applyPanelTheme(value);
  },
  onToggleRecording: async () => {
    if (!isRecording) {
      startRecording();
    } else {
      setRecordingLabel('저장 중...');
      await stopRecordingAndSave();
      setRecordingLabel('녹화 시작');
    }
  },
  onSavePNG: () => {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = `network-graph-${Date.now()}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  },
  onSaveSettings: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `network-graph-settings-${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  },
  onLoadSettings: (data) => {
    Object.assign(state.layout, data.layout ?? {});
    Object.assign(state.lines, data.lines ?? {});
    Object.assign(state.motion, data.motion ?? {});
    Object.assign(state.camera, data.camera ?? {});
    Object.assign(state.hub, data.hub ?? {});
    Object.assign(state.display, data.display ?? {});
    refreshGuiDisplay();
    setHubColor(hub, state.hub.color);
    setHubSize(hub, state.hub.size);
    setHubVisible(hub, state.hub.visible);
    renderer.domElement.style.cursor = state.display.hideCursor ? 'none' : '';
    scene.background = new THREE.Color(state.display.backgroundColor);
    applyPanelTheme(state.display.backgroundColor);
    rebuild({ replayIntro: true });
  },
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
  edgesSystem && edgesSystem.setResolution(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

// --- Drag & drop ---
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

  const files = await extractImageFilesFromDrop(e.dataTransfer);
  if (files.length === 0) return;

  if (usingDroppedImages) {
    sourceImageUrls.forEach((url) => URL.revokeObjectURL(url));
  }
  sourceImageUrls = filesToObjectUrls(files);
  usingDroppedImages = true;

  loadingOverlay.style.opacity = '1';
  loadingOverlay.style.display = 'flex';
  await rebuild({ replayIntro: true });
  loadingOverlay.style.display = 'none';
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  shapeMorph.update(nodes);
  motion.update(nodes, elapsed, state.motion);

  if (state.camera.autoRotate) {
    rootGroup.rotation.y += state.motion.rotationSpeed * delta;
  }

  if (edgesSystem) {
    const nodePositions = nodes.map((n) => n.sprite.position);
    edgesSystem.updatePositions(hub.position, nodePositions);
  }

  controls.update();
  renderer.render(scene, camera);
}

async function init() {
  sourceImageUrls = await loadManifest();
  await rebuild({ replayIntro: true });
  loadingOverlay.style.display = 'none';
  animate();
}

init();
