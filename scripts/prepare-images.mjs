import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_DIR = '/Users/ep_sui/Documents/Sui_iMac/16_arko 브랜드모션/00_src/arko media';
const OUT_DIR = path.join(projectRoot, 'public', 'images');
const MANIFEST_PATH = path.join(projectRoot, 'public', 'images.json');

const VALID_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`원본 폴더를 찾을 수 없습니다: ${SOURCE_DIR}`);
    console.error('macOS가 이 터미널에 폴더 접근 권한을 주지 않았을 수 있습니다.');
    console.error('시스템 설정 > 개인정보 보호 및 보안 > 전체 디스크 접근 권한에서 터미널 앱을 허용해주세요.');
    process.exit(1);
  }

  let entries;
  try {
    entries = await fsp.readdir(SOURCE_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`원본 폴더를 읽을 수 없습니다: ${SOURCE_DIR}`);
    console.error(`(${err.code}: ${err.message})`);
    console.error('macOS 권한 문제일 수 있습니다. 기존 public/images는 그대로 두고 종료합니다.');
    process.exit(1);
  }

  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => VALID_EXT.has(path.extname(name).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.error('원본 폴더에 jpg/png/webp 파일이 없습니다. 기존 public/images는 그대로 둡니다.');
    process.exit(1);
  }

  await fsp.mkdir(OUT_DIR, { recursive: true });

  // Only clear previously generated copies once we know we have fresh files to replace them with.
  const existing = await fsp.readdir(OUT_DIR).catch(() => []);
  await Promise.all(
    existing.map((name) => fsp.unlink(path.join(OUT_DIR, name)).catch(() => {}))
  );

  const manifest = {};
  let index = 1;
  for (const name of files) {
    const ext = path.extname(name).toLowerCase();
    const safeName = `img_${String(index).padStart(3, '0')}${ext}`;
    await fsp.copyFile(path.join(SOURCE_DIR, name), path.join(OUT_DIR, safeName));
    manifest[safeName] = name;
    index++;
  }

  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`${files.length}개 이미지를 ${OUT_DIR} 로 복사했습니다.`);
  console.log(`매핑 정보: ${MANIFEST_PATH}`);
}

main();
