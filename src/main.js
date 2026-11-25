import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  loadManifest,
  buildNodeImageList,
  extractImageFilesFromDrop,
  filesToObjectUrls,
} from './imageLoader.js';
import { generateSpherePositions, pickRandomScales, generateInterNodeLinks } from './scene/layout.js';
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
    type: 'o',
    morphDuration: 600,
  },
  layout: {
    nodeCount: 600,
    sphereRadius: 59.5,
    imageSize: 2.4,
    sizeVariance: 0.51,
    seed: 238709,
  },
  lines: {
    opacity: 0.12,
    interNodeCount: 161,
    radialColor: '#000000',
    interColor: '#000000',
    width: 0.5,
  },
  motion: {
    rotationSpeed: 0.07,
    noiseStrength: 2.35,
    noiseSpeed: 0.2,
    introDuration: 7000,
    introHoldMs: 3000,
    introEasePower: 2.4,
    heroZoomPadding: 1,
    heroOffsetX: 0,
    heroOffsetY: 0,
    outroDuration: 4000,
    outroSpeed: 1,
    outroEasePower: 2,
    outroZoom: 6,
  },
  camera: {
    autoRotate: true,
    zoom: 1.92,
  },
  display: {
    backgroundColor: '#ffffff',
    hideCursor: false,
    showFrameGuide: true,
  },
};

// Persist every panel value across reloads. Loaded immediately (before
// anything below reads `state`), saved on every GUI change.
const SETTINGS_STORAGE_KEY = 'network-graph-settings-v1';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const key of ['shape', 'layout', 'lines', 'motion', 'camera', 'display']) {
      if (saved[key]) Object.assign(state[key], saved[key]);
    }
  } catch (err) {
    console.warn('저장된 설정을 불러오지 못했습니다.', err);
  }
}

function persistState() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('설정 저장 실패', err);
  }
}

loadPersistedState();

const FRAME_WIDTH = 3840;
const FRAME_HEIGHT = 2160;
const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

// Largest FRAME_ASPECT rectangle that fits centered inside a containerW x containerH box.
function computeFitRect(containerW, containerH) {
  const containerAspect = containerW / containerH;
  let w, h;
  if (containerAspect > FRAME_ASPECT) {
    h = containerH;
    w = h * FRAME_ASPECT;
  } else {
    w = containerW;
    h = w / FRAME_ASPECT;
  }
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h };
}

const app = document.getElementById('app');
const loadingOverlay = document.getElementById('loadingOverlay');
const dragOverlay = document.getElementById('dragOverlay');
const frameGuide = document.getElementById('frameGuide');

function updateFrameGuide() {
  const rect = computeFitRect(window.innerWidth, window.innerHeight);
  frameGuide.style.left = `${rect.x}px`;
  frameGuide.style.top = `${rect.y}px`;
  frameGuide.style.width = `${rect.w}px`;
  frameGuide.style.height = `${rect.h}px`;
  frameGuide.classList.toggle('active', state.display.showFrameGuide);
}

// Offscreen canvas used to crop the centered 16:9 frame out of the full
// window render, at a fixed 1920x1080, for PNG/video export.
const exportCanvas = document.createElement('canvas');
exportCanvas.width = FRAME_WIDTH;
exportCanvas.height = FRAME_HEIGHT;
const exportCtx = exportCanvas.getContext('2d');
exportCtx.imageSmoothingEnabled = true;
exportCtx.imageSmoothingQuality = 'high';

// The shape always sits dead-center on the true canvas — the GUI panel
// floats on top of it rather than nudging the camera's frustum, so opening
// or collapsing the panel (or the hamburger toggle itself) never moves the
// shape. Exports simply crop the centered 16:9 frame out of the render.
function updateExportCanvas() {
  const srcW = renderer.domElement.width;
  const srcH = renderer.domElement.height;
  const rect = computeFitRect(srcW, srcH);
  exportCtx.drawImage(renderer.domElement, rect.x, rect.y, rect.w, rect.h, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(state.display.backgroundColor);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
const DEFAULT_CAMERA_DIR = new THREE.Vector3(0, 10, 90).normalize();
camera.position.set(0, 10, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.position = 'absolute';
app.appendChild(renderer.domElement);

let edgesSystem = null;

// The live canvas is locked to a true 16:9 box, centered in the window with
// letterbox margins on whichever axis doesn't match — "contain", never
// "cover", so nothing is ever cropped — so what's on screen while editing
// is always framed exactly like the exported video, regardless of the
// browser window's own shape.
function updateCanvasFrame() {
  const rect = computeFitRect(window.innerWidth, window.innerHeight);
  renderer.domElement.style.left = `${rect.x}px`;
  renderer.domElement.style.top = `${rect.y}px`;
  renderer.domElement.style.width = `${rect.w}px`;
  renderer.domElement.style.height = `${rect.h}px`;
  renderer.setSize(rect.w, rect.h);
  camera.aspect = rect.w / rect.h;
  camera.updateProjectionMatrix();
  edgesSystem && edgesSystem.setResolution(rect.w, rect.h);
}
updateCanvasFrame();

const ambient = new THREE.AmbientLight(0xffffff, 0.9);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 7);
scene.add(ambient, dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// Mouse/touch drag on the canvas no longer rotates, pans, or zooms the
// camera — too easy to bump by accident. Camera movement now only ever
// comes from the GUI's 줌 slider, 자동 회전, and the hero-zoom intro.
controls.enabled = false;

const rootGroup = new THREE.Group();
scene.add(rootGroup);

// Radial lines always converge on the rootGroup's local origin (there's no
// visible hub object there any more, just the reference point for edges).
const ORIGIN = new THREE.Vector3(0, 0, 0);

const motion = new Motion(state.layout.seed);
const shapeMorph = new ShapeMorph();

let nodes = [];
let sourceImageUrls = [];
let cameraBaseDistance = state.layout.sphereRadius * 2.8;
let usingDroppedImages = false;
let shapeCache = {};
let shapeRequestToken = 0;

// --- Hero-zoom intro: one random node fills the screen, then the camera
// slowly pulls back to its resting pose, revealing the full shape. ---
let restCameraDir = camera.position.clone().normalize();
const introCamera = {
  active: false,
  startTime: 0,
  fromPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
};

// --- Outro: once the intro's zoom-out settles on the full shape, the
// camera keeps going — zooming back IN, always straight at the shape's own
// center (the origin), never at wherever the hero happened to be — until
// individual photos are too close/large to read as photos any more. ---
const outroCamera = {
  active: false,
  startTime: 0,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
};

// Slow-start, slow-end: the zoom-out gradually picks up speed, then
// gradually settles instead of snapping to a stop.
function easeInOutPower(t, power) {
  return t < 0.5 ? Math.pow(2 * t, power) / 2 : 1 - Math.pow(2 * (1 - t), power) / 2;
}

const HERO_TARGET_ASPECT = 16 / 9;

// "Cover" fit (like CSS background-size: cover): the closer of the two
// per-axis fit distances, so the image overflows the frame instead of
// leaving letterbox margins.
function computeHeroCameraPoseFromWorldPos(worldPos, width, height) {
  const dir = worldPos.lengthSq() > 1e-6 ? worldPos.clone().normalize() : new THREE.Vector3(0, 0, 1);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distForHeight = height / 2 / Math.tan(vFov / 2);
  const distForWidth = width / 2 / (Math.tan(vFov / 2) * camera.aspect);
  const distance = Math.min(distForHeight, distForWidth) * state.motion.heroZoomPadding;

  const camPos = worldPos.clone().add(dir.multiplyScalar(distance));
  return { camPos, target: worldPos };
}

function computeHeroCameraPose(node) {
  rootGroup.updateMatrixWorld();
  const worldPos = node.basePosition.clone().applyMatrix4(rootGroup.matrixWorld);
  return computeHeroCameraPoseFromWorldPos(worldPos, node.baseWidth, node.baseHeight);
}

// Where the intro's hero photo should sit within the shape, as a left/right
// and up/down offset (state.motion.heroOffsetX/Y, -1..1) from the camera's
// resting view axis. (0, 0) means "no preference" — picks anywhere at
// random. Shared by both the auto-picked node and the uploaded overlay
// image, so the two behave consistently.
function computeHeroWorldPos() {
  const dir = restCameraDir.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, dir);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();

  const depth = state.layout.sphereRadius * 0.35;
  const spread = state.layout.sphereRadius * 0.9;
  return dir
    .multiplyScalar(depth)
    .add(right.multiplyScalar(state.motion.heroOffsetX * spread))
    .add(up.multiplyScalar(state.motion.heroOffsetY * spread));
}

// Only a node whose source photo is itself ~16:9 should ever open the
// intro fullscreen, so the cover-fit crop never has to fight a mismatched
// (portrait/square) image. Among those, prefer whichever sits closest to
// the hero position sliders (falls back to fully random when they're both 0).
function pickHeroNode() {
  // A custom hero photo/video overrides whichever node hosts it with its
  // own forced-16:9 crop regardless of that node's original image, so the
  // "must already look like 16:9" filter below only matters for the
  // no-custom-media case (picking among the graph's own images).
  let candidates = nodes;
  if (!customHeroTexture) {
    const aspectOf = (n) => n.baseWidth / n.baseHeight;
    const tolerance = 0.12;
    candidates = nodes.filter((n) => Math.abs(aspectOf(n) / HERO_TARGET_ASPECT - 1) <= tolerance);
    if (!candidates.length) {
      // No close-enough match in this image set: fall back to the closest aspect ratio available.
      candidates = [
        nodes.reduce((best, n) =>
          Math.abs(aspectOf(n) - HERO_TARGET_ASPECT) < Math.abs(aspectOf(best) - HERO_TARGET_ASPECT) ? n : best
        ),
      ];
    }
  }

  if (state.motion.heroOffsetX === 0 && state.motion.heroOffsetY === 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  rootGroup.updateMatrixWorld();
  const targetWorld = computeHeroWorldPos();
  return candidates.reduce((best, n) => {
    const d = n.basePosition.clone().applyMatrix4(rootGroup.matrixWorld).distanceToSquared(targetWorld);
    const bestD = best.basePosition.clone().applyMatrix4(rootGroup.matrixWorld).distanceToSquared(targetWorld);
    return d < bestD ? n : best;
  });
}

// --- User-uploaded hero photo or video: NOT a separate overlay. It
// replaces one real graph node's own texture, so it is a normal node the
// whole time — connected by the same radial/inter-node lines as every
// other image, moved by the same noise, and still there after the intro
// zooms out. The intro just happens to start with the camera pushed in
// close on that one node. Its sprite is always sized to a true 16:9 box
// in world space (with the source media center-cropped into it via UV
// repeat/offset, like CSS background-size:cover), so what's on screen is
// exactly 16:9 regardless of the browser window's own aspect ratio — a
// perspective camera with the correct aspect never distorts that.
// Persisted as a Blob in IndexedDB (not localStorage, which is capped
// around 5-10MB — nowhere near enough for video). ---
const HERO_DB_NAME = 'network-graph-hero-db';
const HERO_DB_STORE = 'media';
const HERO_DB_KEY = 'current';
const heroVideoSource = document.getElementById('heroVideoSource');
let customHeroType = null; // 'image' | 'video' | null
let customHeroObjectUrl = null;
let customHeroTexture = null;
let customHeroMediaAspect = 1;
let heroNode = null;

// Crops `texture` to `targetAspect` the way CSS background-size: cover
// would, via UV repeat/offset, instead of letting the sprite show the
// source media's own (possibly non-16:9) aspect ratio.
function applyCoverUV(texture, mediaAspect, targetAspect) {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (mediaAspect > targetAspect) {
    const scale = targetAspect / mediaAspect;
    texture.repeat.set(scale, 1);
    texture.offset.set((1 - scale) / 2, 0);
  } else {
    const scale = mediaAspect / targetAspect;
    texture.repeat.set(1, scale);
    texture.offset.set(0, (1 - scale) / 2);
  }
  texture.needsUpdate = true;
}

function openHeroDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HERO_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HERO_DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHeroBlobToDb(blob) {
  const db = await openHeroDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_DB_STORE, 'readwrite');
    tx.objectStore(HERO_DB_STORE).put({ blob, mimeType: blob.type }, HERO_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHeroBlobFromDb() {
  const db = await openHeroDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(HERO_DB_STORE, 'readonly').objectStore(HERO_DB_STORE).get(HERO_DB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearHeroBlobFromDb() {
  const db = await openHeroDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_DB_STORE, 'readwrite');
    tx.objectStore(HERO_DB_STORE).delete(HERO_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function disposeCustomHeroObjectUrl() {
  if (customHeroObjectUrl) {
    URL.revokeObjectURL(customHeroObjectUrl);
    customHeroObjectUrl = null;
  }
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Builds (or rebuilds) `customHeroTexture` from the given object URL and
// stores the source media's own aspect ratio, then applies it to whichever
// node is currently hosting the hero (if any) so an in-progress graph
// already reflects a freshly uploaded file.
async function applyHeroMediaUrl(url, isVideo) {
  disposeCustomHeroObjectUrl();
  customHeroObjectUrl = url;
  customHeroType = isVideo ? 'video' : 'image';
  customHeroTexture?.dispose();

  if (isVideo) {
    await new Promise((resolve, reject) => {
      heroVideoSource.onloadedmetadata = () => resolve();
      heroVideoSource.onerror = reject;
      heroVideoSource.src = url;
      heroVideoSource.load();
    });
    customHeroMediaAspect = heroVideoSource.videoWidth / heroVideoSource.videoHeight || HERO_TARGET_ASPECT;
    customHeroTexture = new THREE.VideoTexture(heroVideoSource);
    customHeroTexture.colorSpace = THREE.SRGBColorSpace;
    heroVideoSource.play().catch(() => {});
  } else {
    const img = await loadImageElement(url);
    customHeroMediaAspect = img.naturalWidth / img.naturalHeight || HERO_TARGET_ASPECT;
    customHeroTexture = new THREE.Texture(img);
    customHeroTexture.colorSpace = THREE.SRGBColorSpace;
    customHeroTexture.needsUpdate = true;
  }
  applyCoverUV(customHeroTexture, customHeroMediaAspect, HERO_TARGET_ASPECT);
  applyHeroToCurrentNode();
}

async function setCustomHeroMedia(file) {
  const isVideo = file.type.startsWith('video/');
  await applyHeroMediaUrl(URL.createObjectURL(file), isVideo);
  try {
    await saveHeroBlobToDb(file);
  } catch (err) {
    console.warn('히어로 미디어를 저장하지 못했습니다(브라우저 저장 공간 문제일 수 있음).', err);
  }
}

// Restores whichever node is currently hosting the hero back to a normal
// graph node (its own image, its own aspect), then forgets the custom
// media entirely. A full rebuild is the simplest way to get every node's
// original texture back without having to track and re-fetch it per node.
async function clearCustomHeroMedia() {
  customHeroType = null;
  customHeroTexture?.dispose();
  customHeroTexture = null;
  disposeCustomHeroObjectUrl();
  heroVideoSource.pause();
  heroVideoSource.removeAttribute('src');
  try {
    await clearHeroBlobFromDb();
  } catch (err) {
    console.warn('히어로 미디어 저장 삭제 실패', err);
  }
  await rebuild({ replayIntro: true });
}

async function loadPersistedHeroMedia() {
  try {
    const record = await loadHeroBlobFromDb();
    if (!record) return;
    const mimeType = record.mimeType || record.blob.type || '';
    await applyHeroMediaUrl(URL.createObjectURL(record.blob), mimeType.startsWith('video/'));
  } catch (err) {
    console.warn('저장된 히어로 미디어를 불러오지 못했습니다.', err);
  }
}

// Picks which live node hosts the hero for this intro, and — if a custom
// photo/video is set — swaps that one node's sprite to show it (forced to
// a true 16:9 box, cover-cropped). The node stays a completely normal node
// otherwise: same position, same noise motion, same radial/inter-node
// lines, so it never "disappears" once the intro zooms out.
function applyHeroToCurrentNode() {
  if (!nodes.length) return null;
  const newHeroNode = pickHeroNode();
  // If a different node is taking over as hero (e.g. a replay picked a new
  // one), give the old one back its normal depth behavior first.
  if (heroNode && heroNode !== newHeroNode) {
    heroNode.sprite.renderOrder = 0;
    heroNode.sprite.material.depthTest = true;
    heroNode.sprite.material.needsUpdate = true;
  }
  heroNode = newHeroNode;
  if (customHeroTexture && heroNode) {
    const baseSize = Math.max(heroNode.baseWidth, heroNode.baseHeight);
    const width = baseSize;
    const height = baseSize / HERO_TARGET_ASPECT;
    heroNode.sprite.scale.set(width, height, 1);
    heroNode.baseWidth = width;
    heroNode.baseHeight = height;
    heroNode.sprite.material.map = customHeroTexture;
    heroNode.sprite.material.color.set(0xffffff);
    // Being so much larger than a normal node, it would otherwise z-fight
    // / get clipped by nearby node sprites while zooming past them —
    // render it above every other node unconditionally.
    heroNode.sprite.renderOrder = 999;
    heroNode.sprite.material.depthTest = false;
    heroNode.sprite.material.needsUpdate = true;
  }
  return heroNode;
}

// The hero reveal is purely a camera move: push in close on one real graph
// node (one already carrying the custom photo/video, if set) so it fills
// the screen, hold, then pull back out to the resting view. Nothing is
// added or hidden — that node was always part of the shape and stays part
// of it, connected by its lines, once the camera settles.
function playIntroCamera() {
  if (!nodes.length) return;

  const node = applyHeroToCurrentNode();
  if (!node) return;
  const { camPos, target } = computeHeroCameraPose(node);

  introCamera.fromPos.copy(camPos);
  introCamera.fromTarget.copy(target);
  introCamera.toPos.copy(restCameraDir).multiplyScalar(cameraBaseDistance / state.camera.zoom);
  introCamera.toTarget.set(0, 0, 0);
  introCamera.startTime = performance.now();
  introCamera.active = true;
  outroCamera.active = false;

  if (customHeroType === 'video') {
    heroVideoSource.currentTime = 0;
    heroVideoSource.play().catch(() => {});
  }
}

// Shared hold/zoom timing so the camera move and the noise fade-in
// (getIntroNoiseFactor, used by Motion.update) stay perfectly in sync.
function getIntroTiming() {
  const elapsed = performance.now() - introCamera.startTime;
  const holdMs = state.motion.introHoldMs;
  if (elapsed <= holdMs) return { holding: true, eased: 0, rawT: 0 };
  const zoomMs = Math.max(100, state.motion.introDuration);
  const rawT = Math.min(1, (elapsed - holdMs) / zoomMs);
  return { holding: false, eased: easeInOutPower(rawT, state.motion.introEasePower), rawT };
}

function updateIntroCamera() {
  if (!introCamera.active) return;
  const { holding, eased, rawT } = getIntroTiming();
  if (holding) {
    camera.position.copy(introCamera.fromPos);
    controls.target.copy(introCamera.fromTarget);
    return;
  }
  // Once the zoom-out is halfway through (by elapsed time, not the eased
  // curve), pause the hero video right where it is — it stays a frozen
  // frame on its node for the rest of the zoom and afterward, and only
  // starts playing again the next time the intro is replayed.
  if (customHeroType === 'video' && rawT >= 0.5 && !heroVideoSource.paused) {
    heroVideoSource.pause();
  }
  camera.position.lerpVectors(introCamera.fromPos, introCamera.toPos, eased);
  controls.target.lerpVectors(introCamera.fromTarget, introCamera.toTarget, eased);
  if (rawT >= 1) {
    introCamera.active = false;
    startOutroCamera();
  }
}

// Starts right where the intro's zoom-out ended (the resting pose), and
// zooms further in along that same view axis toward the origin — the
// shape's own center point, not the hero's position — until it's at
// `state.motion.outroZoom`. controls.target never moves off (0,0,0), so
// it stays locked on the shape's center the whole time.
function startOutroCamera() {
  outroCamera.fromPos.copy(camera.position);
  outroCamera.toPos.copy(restCameraDir).multiplyScalar(cameraBaseDistance / state.motion.outroZoom);
  outroCamera.startTime = performance.now();
  outroCamera.active = true;
}

function updateOutroCamera() {
  if (!outroCamera.active) return;
  const elapsed = performance.now() - outroCamera.startTime;
  // Speed is a direct multiplier on top of the base duration — 2x speed
  // means it gets there in half the time, independent of the curve shape.
  const durationMs = Math.max(100, state.motion.outroDuration / Math.max(0.05, state.motion.outroSpeed));
  const rawT = Math.min(1, elapsed / durationMs);
  const eased = easeInOutPower(rawT, state.motion.outroEasePower);
  camera.position.lerpVectors(outroCamera.fromPos, outroCamera.toPos, eased);
  controls.target.set(0, 0, 0);
  if (rawT >= 1) outroCamera.active = false;
}

function getIntroNoiseFactor() {
  if (!introCamera.active) return 1;
  const { holding, eased } = getIntroTiming();
  return holding ? 0 : eased;
}

// Smoothly spins the shape back to its front-facing (rotation.y === 0)
// orientation whenever auto-rotate is switched off. The shape's own spin is
// only half the picture: if the user had manually orbited the camera (drag),
// the camera's own viewing angle also has to snap back to the default
// front-on direction, or "front" ends up meaning nothing in particular.
const rotationReset = {
  active: false,
  fromRotation: 0,
  fromCameraDir: new THREE.Vector3(),
  startTime: 0,
  duration: 800,
};

function startRotationReset() {
  let current = rootGroup.rotation.y % (Math.PI * 2);
  if (current > Math.PI) current -= Math.PI * 2;
  if (current < -Math.PI) current += Math.PI * 2;
  rootGroup.rotation.y = current;

  const offset = camera.position.clone().sub(controls.target);
  rotationReset.fromCameraDir = offset.lengthSq() > 1e-6 ? offset.normalize() : DEFAULT_CAMERA_DIR.clone();
  rotationReset.fromRotation = current;
  rotationReset.active = true;
  rotationReset.startTime = performance.now();
}

function disposeCurrent() {
  if (edgesSystem) {
    rootGroup.remove(edgesSystem.lineSegments);
    edgesSystem.dispose();
    edgesSystem = null;
  }
  if (nodes.length) {
    // The hero node's map is the shared, reused customHeroTexture (if any) —
    // detach it first so disposeImageNodes doesn't dispose a texture we
    // intend to keep using on whichever node hosts the hero next.
    if (heroNode) heroNode.sprite.material.map = null;
    disposeImageNodes(nodes, rootGroup);
    nodes = [];
  }
  heroNode = null;
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

  if (replayIntro) playIntroCamera();
  else applyHeroToCurrentNode();
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
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';
}

async function saveBlobWithPicker(blob, mimeType, baseName) {
  const isMp4 = mimeType.includes('mp4');
  const ext = isMp4 ? 'mp4' : 'webm';
  const suggestedName = `${baseName}.${ext}`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          isMp4
            ? { description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }
            : { description: 'WebM Video', accept: { 'video/webm': ['.webm'] } },
        ],
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

let activeRecordingMimeType = '';

function startRecording() {
  updateExportCanvas(); // seed the first frame before the stream starts
  const stream = exportCanvas.captureStream(60);
  activeRecordingMimeType = pickRecorderMimeType();
  recordedChunks = [];
  const recorderOptions = { videoBitsPerSecond: 20_000_000 };
  if (activeRecordingMimeType) recorderOptions.mimeType = activeRecordingMimeType;
  mediaRecorder = new MediaRecorder(stream, recorderOptions);
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
      const mimeType = mediaRecorder.mimeType || activeRecordingMimeType || 'video/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      await saveBlobWithPicker(blob, mimeType, `network-graph-${Date.now()}`);
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
  onZoomChange: (value) => {
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(cameraBaseDistance / value);
    camera.position.copy(controls.target).add(dir);
  },
  onAutoRotateChange: (value) => {
    if (!value) startRotationReset();
  },
  onReshuffle: () => {
    state.layout.seed = Math.floor(Math.random() * 999999);
    refreshGuiDisplay();
    persistState();
    rebuild({ replayIntro: true });
  },
  onReplayIntro: () => playIntroCamera(),
  onHeroOffsetChange: () => playIntroCamera(),
  onManualSave: () => persistState(),
  onUploadHeroImage: async (file) => {
    try {
      await setCustomHeroMedia(file);
      playIntroCamera();
    } catch (err) {
      console.error('히어로 미디어를 불러오지 못했습니다.', err);
    }
  },
  onClearHeroImage: () => clearCustomHeroMedia(),
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
  onFrameGuideChange: () => updateFrameGuide(),
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
    updateExportCanvas();
    const link = document.createElement('a');
    link.download = `network-graph-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
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
    Object.assign(state.display, data.display ?? {});
    refreshGuiDisplay();
    renderer.domElement.style.cursor = state.display.hideCursor ? 'none' : '';
    scene.background = new THREE.Color(state.display.backgroundColor);
    applyPanelTheme(state.display.backgroundColor);
    updateFrameGuide();
    persistState();
    rebuild({ replayIntro: true });
  },
});

// Catches every slider/checkbox/color/dropdown change across the whole
// panel (including folders with no dedicated callback above), so reloading
// the page always comes back to whatever was last left on screen.
gui.onChange(() => persistState());

const guiToggle = document.getElementById('guiToggle');
let guiVisible = true;

// The panel is a plain floating overlay on top of the canvas (see #guiToggle
// and the GUI's own fixed positioning in index.html) — it never nudges the
// camera, so opening/collapsing it (or clicking the hamburger button) can't
// move the shape. The shape is always centered on the true canvas.
guiToggle.addEventListener('click', () => {
  guiVisible = !guiVisible;
  gui.show(guiVisible);
});

function onWindowResize() {
  updateCanvasFrame();
  updateFrameGuide();
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
  motion.update(nodes, elapsed, state.motion, getIntroNoiseFactor());

  // Rotation is frozen while the hero camera is animating, so the reveal
  // doesn't have to chase a moving target.
  if (state.camera.autoRotate) {
    rotationReset.active = false;
    if (!introCamera.active) rootGroup.rotation.y += state.motion.rotationSpeed * delta;
  } else if (rotationReset.active) {
    const t = Math.min(1, (performance.now() - rotationReset.startTime) / rotationReset.duration);
    const eased = easeInOutPower(t, 3);
    rootGroup.rotation.y = THREE.MathUtils.lerp(rotationReset.fromRotation, 0, eased);

    const radius = camera.position.clone().sub(controls.target).length();
    const dir = rotationReset.fromCameraDir.clone().lerp(DEFAULT_CAMERA_DIR, eased).normalize();
    camera.position.copy(controls.target).add(dir.multiplyScalar(radius));

    if (t >= 1) rotationReset.active = false;
  }

  if (edgesSystem) {
    const nodePositions = nodes.map((n) => n.sprite.position);
    edgesSystem.updatePositions(ORIGIN, nodePositions);
  }

  updateIntroCamera();
  updateOutroCamera();
  controls.update();
  renderer.render(scene, camera);

  // Track the user's/zoom-slider's current orbit direction as the resting
  // pose to return to once the hero-zoom intro reaches its end. Frozen
  // during the outro too, since that's also a programmatic camera move.
  if (!introCamera.active && !outroCamera.active) {
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() > 1e-6) restCameraDir = offset.normalize();
  }

  if (isRecording) updateExportCanvas();
}

async function init() {
  updateFrameGuide();
  await loadPersistedHeroMedia();
  sourceImageUrls = await loadManifest();
  await rebuild({ replayIntro: true });
  loadingOverlay.style.display = 'none';
  animate();
}

init();
