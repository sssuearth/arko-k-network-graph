import GUI from 'lil-gui';

export function createControlPanel(state, callbacks) {
  const gui = new GUI({ title: 'Vector → 3D Controls' });
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = '64px';
  gui.domElement.style.right = '16px';
  gui.domElement.style.zIndex = '20';
  gui.domElement.style.maxHeight = 'calc(100vh - 96px)';
  gui.domElement.style.overflowY = 'auto';

  const fileFolder = gui.addFolder('파일');
  fileFolder.add({ load: () => triggerFileLoad(callbacks.onLoadSvg) }, 'load').name('SVG 불러오기');
  fileFolder.open();

  const shapeFolder = gui.addFolder('입체 형태');
  shapeFolder.add(state.shape, 'depth', 0.5, 25, 0.1).name('돌출 두께').onChange(callbacks.onShapeChange);
  shapeFolder.add(state.shape, 'bevelEnabled').name('모서리 깎기(베벨)').onChange(callbacks.onShapeChange);
  const bevelThicknessCtrl = shapeFolder
    .add(state.shape, 'bevelThickness', 0, 4, 0.05)
    .name('베벨 깊이')
    .onChange(callbacks.onShapeChange);
  const bevelSizeCtrl = shapeFolder
    .add(state.shape, 'bevelSize', 0, 4, 0.05)
    .name('베벨 폭')
    .onChange(callbacks.onShapeChange);
  shapeFolder.open();

  const materialFolder = gui.addFolder('재질');
  materialFolder
    .add(state.material, 'type', { 돌: 'stone', 메탈: 'metal' })
    .name('재질 종류')
    .onChange((value) => {
      callbacks.onMaterialTypeChange(value);
      updateMaterialFolderVisibility(value);
    });
  materialFolder.addColor(state.material, 'color').name('오브젝트 색상').onChange(callbacks.onMaterialChange);
  materialFolder.open();

  const stoneFolder = materialFolder.addFolder('돌 세부 설정');
  stoneFolder.add(state.stone, 'roughness', 0.2, 1, 0.01).name('거칠기').onChange(callbacks.onMaterialChange);
  stoneFolder.add(state.stone, 'bumpScale', 0, 2, 0.01).name('표면 요철 강도').onChange(callbacks.onMaterialChange);
  stoneFolder
    .add(state.stone, 'grainScale', 1, 40, 1)
    .name('입자 크기(디테일)')
    .onFinishChange(callbacks.onStoneTextureChange);
  stoneFolder.open();

  const metalFolder = materialFolder.addFolder('메탈 세부 설정');
  metalFolder.add(state.metal, 'roughness', 0, 1, 0.01).name('거칠기').onChange(callbacks.onMaterialChange);
  metalFolder.add(state.metal, 'metalness', 0, 1, 0.01).name('금속성').onChange(callbacks.onMaterialChange);
  metalFolder
    .add(state.metal, 'envIntensity', 0, 3, 0.05)
    .name('반사 강도')
    .onChange(callbacks.onMaterialChange);
  metalFolder.open();

  function updateMaterialFolderVisibility(type) {
    stoneFolder.show(type === 'stone');
    metalFolder.show(type === 'metal');
    bevelThicknessCtrl.show(true);
    bevelSizeCtrl.show(true);
  }
  updateMaterialFolderVisibility(state.material.type);

  const lightFolder = gui.addFolder('조명');
  lightFolder.add(state.light, 'ambientIntensity', 0, 2, 0.01).name('전체 밝기(앰비언트)').onChange(callbacks.onLightChange);
  lightFolder.add(state.light, 'keyIntensity', 0, 4, 0.01).name('주광 세기').onChange(callbacks.onLightChange);
  lightFolder.add(state.light, 'keyAzimuth', 0, 360, 1).name('주광 방향(각도)').onChange(callbacks.onLightChange);
  lightFolder.add(state.light, 'keyElevation', 5, 90, 1).name('주광 높이(각도)').onChange(callbacks.onLightChange);
  lightFolder.addColor(state.light, 'keyColor').name('주광 색상').onChange(callbacks.onLightChange);
  lightFolder.add(state.light, 'fillIntensity', 0, 2, 0.01).name('보조광 세기').onChange(callbacks.onLightChange);
  lightFolder.open();

  const displayFolder = gui.addFolder('배경');
  displayFolder.addColor(state.display, 'backgroundColor').name('배경색').onChange(callbacks.onBackgroundColorChange);
  displayFolder.add(state.display, 'autoRotate').name('자동 회전').onChange(callbacks.onDisplayChange);
  displayFolder.open();

  return { gui };
}

function triggerFileLoad(onLoadSvg) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoadSvg(reader.result);
    reader.readAsText(file);
  };
  input.click();
}
