import * as THREE from 'three';
import { mulberry32, seededShuffle } from './utils/rng.js';

const MAX_TEXTURE_DIM = 1024;
const textureCache = new Map();

export async function loadManifest() {
  const res = await fetch('/images.json');
  if (!res.ok) return [];
  const manifest = await res.json(); // { "img_001.jpg": "원본파일명.jpg", ... }
  return Object.keys(manifest).map((safeName) => `/images/${safeName}`);
}

// Build a list of `count` image URLs from `sourceUrls`, repeating + shuffling
// so repeats of the same image are not clustered together.
export function buildNodeImageList(sourceUrls, count, seed) {
  if (sourceUrls.length === 0) return [];
  const rng = mulberry32(seed);
  const list = [];
  while (list.length < count) {
    const batch = seededShuffle(sourceUrls, rng);
    for (const url of batch) {
      list.push(url);
      if (list.length >= count) break;
    }
  }
  return seededShuffle(list, mulberry32(seed + 99));
}

function drawDownscaled(imgEl) {
  const { naturalWidth: w, naturalHeight: h } = imgEl;
  const scale = Math.min(1, MAX_TEXTURE_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
  return { canvas, aspect: w / h };
}

export function loadTexture(url) {
  if (textureCache.has(url)) return textureCache.get(url);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { canvas, aspect } = drawDownscaled(img);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        resolve({ texture, aspect });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });

  textureCache.set(url, promise);
  return promise;
}

export function clearDroppedTextureCache(urls) {
  for (const url of urls) {
    textureCache.delete(url);
  }
}

// --- Drag & drop folder/file support ---

function readEntryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(dirReader) {
  return new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
}

async function collectFilesFromEntry(entry, out) {
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    out.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let entries;
    do {
      entries = await readDirectoryEntries(reader);
      for (const child of entries) {
        await collectFilesFromEntry(child, out);
      }
    } while (entries.length > 0);
  }
}

const VALID_EXT = /\.(jpe?g|png|webp)$/i;

export async function extractImageFilesFromDrop(dataTransfer) {
  const files = [];
  const items = dataTransfer.items;

  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      await collectFilesFromEntry(entry, files);
    }
  } else {
    for (const file of dataTransfer.files) files.push(file);
  }

  return files.filter((f) => VALID_EXT.test(f.name));
}

export function filesToObjectUrls(files) {
  return files.map((file) => URL.createObjectURL(file));
}
