import { loadSvgText, buildWorldChains } from './svgSample.js';
import { DifferentialGrowth, defaultOptions } from './simulation.js';
import { createControlPanel } from './controlPanel.js';

const DEFAULT_SVG_URL = '/shapes/5_logo_arko.svg';

const state = {
  init: {
    spacing: 6,
    maxSpreadMargin: 40,
  },
  sim: {
    ...defaultOptions,
    stepsPerFrame: 3,
  },
  render: {
    backgroundColor: '#f4f3ee',
    lineColor: '#141414',
    autoThicken: true,
    lineWidth: 2.2,
    startLineWidth: 1.2,
    endLineWidth: 7,
    thicknessRampSteps: 900,
    showPoints: false,
  },
  stats: {
    nodeCountLabel: '0',
  },
};

const app = document.getElementById('app');
const loadingOverlay = document.getElementById('loadingOverlay');
const dragOverlay = document.getElementById('dragOverlay');

const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d');

let worldWidth = 800;
let worldHeight = 800;
let growth = null;
let running = true;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function getDisplayTransform() {
  const padding = 60;
  // Leave room on every side for growth that spreads past the original
  // SVG bounds once the interior fills up (see spreadEnabled in simulation.js).
  const margin = state.init.maxSpreadMargin;
  const fitWidth = worldWidth + margin * 2;
  const fitHeight = worldHeight + margin * 2;
  const availW = window.innerWidth - padding * 2;
  const availH = window.innerHeight - padding * 2;
  const scale = Math.min(availW / fitWidth, availH / fitHeight);
  const offsetX = (window.innerWidth - worldWidth * scale) / 2;
  const offsetY = (window.innerHeight - worldHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}

function currentLineWidth() {
  if (!state.render.autoThicken || !growth) return state.render.lineWidth;
  const t = Math.min(1, growth.stepCount / Math.max(1, state.render.thicknessRampSteps));
  return state.render.startLineWidth + (state.render.endLineWidth - state.render.startLineWidth) * t;
}

function render() {
  ctx.fillStyle = state.render.backgroundColor;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  if (!growth) return;

  const { scale, offsetX, offsetY } = getDisplayTransform();
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.lineWidth = currentLineWidth() / scale;
  ctx.strokeStyle = state.render.lineColor;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const chain of growth.chains) {
    const nodes = chain.nodes;
    if (nodes.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
    if (chain.closed) ctx.closePath();
    ctx.stroke();
  }

  if (state.render.showPoints) {
    ctx.fillStyle = state.render.lineColor;
    const r = 1.2 / scale;
    for (const chain of growth.chains) {
      for (const node of chain.nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

function animate() {
  requestAnimationFrame(animate);
  if (growth && running) {
    for (let i = 0; i < state.sim.stepsPerFrame; i++) growth.step();
    state.stats.nodeCountLabel = String(growth.totalNodes);
    refreshStats?.();
  }
  render();
}

async function loadSvg(svgText) {
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.opacity = '1';
  try {
    const built = await buildWorldChains(svgText, {
      worldSize: 800,
      spacing: state.init.spacing,
      maxSpreadMargin: state.init.maxSpreadMargin,
      spreadLevels: 8,
    });
    worldWidth = built.worldWidth;
    worldHeight = built.worldHeight;
    growth = new DifferentialGrowth(built.chains, { ...state.sim, mask: built.mask });
    growth.mask = built.mask;
  } catch (err) {
    console.error(err);
    window.alert(`SVG를 불러오지 못했습니다: ${err.message}`);
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function applySimParams() {
  if (!growth) return;
  Object.assign(growth.options, {
    separationRadius: state.sim.separationRadius,
    separationStrength: state.sim.separationStrength,
    springStrength: state.sim.springStrength,
    alignStrength: state.sim.alignStrength,
    maxEdgeLength: state.sim.maxEdgeLength,
    growthProbability: state.sim.growthProbability,
    minEdgeLength: state.sim.minEdgeLength,
    growthInterval: state.sim.growthInterval,
    maxNodes: state.sim.maxNodes,
    jitter: state.sim.jitter,
    constrainToShape: state.sim.constrainToShape,
    spreadEnabled: state.sim.spreadEnabled,
    spreadStartSteps: state.sim.spreadStartSteps,
    spreadRampSteps: state.sim.spreadRampSteps,
  });
}

let currentSvgText = null;

const { gui, refreshStats } = createControlPanel(state, {
  onLoadSvg: (svgText) => {
    currentSvgText = svgText;
    loadSvg(svgText);
  },
  onReload: () => {
    if (currentSvgText) loadSvg(currentSvgText);
  },
  onToggleRun: () => {
    running = !running;
  },
  onReset: () => {
    if (currentSvgText) loadSvg(currentSvgText);
  },
  onParamsChange: () => applySimParams(),
  onRenderChange: () => {},
  onSavePNG: () => {
    const link = document.createElement('a');
    link.download = `differential-growth-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },
});

const guiToggle = document.getElementById('guiToggle');
let guiVisible = true;
guiToggle.addEventListener('click', () => {
  guiVisible = !guiVisible;
  gui.show(guiVisible);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    running = !running;
  }
});

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
  currentSvgText = text;
  await loadSvg(text);
});

async function init() {
  currentSvgText = await loadSvgText(DEFAULT_SVG_URL);
  await loadSvg(currentSvgText);
  animate();
}

init();
