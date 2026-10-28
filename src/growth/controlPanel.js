import GUI from 'lil-gui';

export function createControlPanel(state, callbacks) {
  const gui = new GUI({ title: 'Differential Growth Controls' });
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = '64px';
  gui.domElement.style.right = '16px';
  gui.domElement.style.zIndex = '20';
  gui.domElement.style.maxHeight = 'calc(100vh - 96px)';
  gui.domElement.style.overflowY = 'auto';

  const fileFolder = gui.addFolder('파일');
  fileFolder.add({ load: () => triggerFileLoad(callbacks.onLoadSvg) }, 'load').name('SVG 불러오기');
  fileFolder.add(state.init, 'spacing', 2, 20, 0.5).name('초기 윤곽선 점 간격').onFinishChange(callbacks.onReload);
  fileFolder.add(state.init, 'maxSpreadMargin', 0, 150, 1).name('최대 확산 거리').onFinishChange(callbacks.onReload);
  fileFolder.open();

  const simFolder = gui.addFolder('시뮬레이션');
  simFolder.add({ toggle: () => callbacks.onToggleRun() }, 'toggle').name('실행 / 정지 (Space)');
  simFolder.add({ reset: () => callbacks.onReset() }, 'reset').name('리셋');
  simFolder.add(state.sim, 'stepsPerFrame', 1, 10, 1).name('프레임당 스텝 수');
  simFolder.add(state.sim, 'constrainToShape').name('글자 영역 안에서만 성장').onChange(callbacks.onParamsChange);
  simFolder.add(state.sim, 'spreadEnabled').name('가득 차면 바깥으로 확산').onChange(callbacks.onParamsChange);
  simFolder.add(state.sim, 'spreadStartSteps', 50, 5000, 10).name('확산 시작 스텝').onChange(callbacks.onParamsChange);
  simFolder.add(state.sim, 'spreadRampSteps', 50, 5000, 10).name('확산 진행 스텝').onChange(callbacks.onParamsChange);
  simFolder.open();

  const growthFolder = gui.addFolder('성장(Growth) 파라미터');
  growthFolder.add(state.sim, 'separationRadius', 2, 30, 0.5).name('분리 반경').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'separationStrength', 0, 3, 0.01).name('분리 강도').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'springStrength', 0, 1, 0.01).name('응집력').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'alignStrength', 0, 1, 0.01).name('정렬(스무딩) 강도').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'maxEdgeLength', 2, 40, 0.5).name('성장 임계 길이').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'growthProbability', 0, 1, 0.01).name('성장 확률').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'minEdgeLength', 0.5, 20, 0.5).name('최소 간격(병합)').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'growthInterval', 1, 30, 1).name('성장 주기(프레임)').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'jitter', 0, 0.5, 0.01).name('노이즈').onChange(callbacks.onParamsChange);
  growthFolder.add(state.sim, 'maxNodes', 500, 20000, 100).name('최대 노드 수').onChange(callbacks.onParamsChange);
  growthFolder.open();

  const renderFolder = gui.addFolder('렌더링');
  renderFolder.addColor(state.render, 'backgroundColor').name('배경색').onChange(callbacks.onRenderChange);
  renderFolder.addColor(state.render, 'lineColor').name('선 색상').onChange(callbacks.onRenderChange);
  renderFolder.add(state.render, 'autoThicken').name('자동 굵기 증가').onChange((value) => {
    callbacks.onRenderChange();
    lineWidthCtrl.show(!value);
    startWidthCtrl.show(value);
    endWidthCtrl.show(value);
    rampStepsCtrl.show(value);
  });
  const lineWidthCtrl = renderFolder
    .add(state.render, 'lineWidth', 0.5, 10, 0.1)
    .name('선 굵기(고정)')
    .onChange(callbacks.onRenderChange);
  const startWidthCtrl = renderFolder
    .add(state.render, 'startLineWidth', 0.3, 6, 0.1)
    .name('시작 굵기')
    .onChange(callbacks.onRenderChange);
  const endWidthCtrl = renderFolder
    .add(state.render, 'endLineWidth', 1, 14, 0.1)
    .name('최종 굵기')
    .onChange(callbacks.onRenderChange);
  const rampStepsCtrl = renderFolder
    .add(state.render, 'thicknessRampSteps', 50, 3000, 10)
    .name('두께 증가 구간(스텝)')
    .onChange(callbacks.onRenderChange);
  renderFolder.add(state.render, 'showPoints').name('노드 점 표시').onChange(callbacks.onRenderChange);
  renderFolder.add({ save: () => callbacks.onSavePNG() }, 'save').name('PNG 저장');
  renderFolder.open();
  lineWidthCtrl.show(!state.render.autoThicken);
  startWidthCtrl.show(state.render.autoThicken);
  endWidthCtrl.show(state.render.autoThicken);
  rampStepsCtrl.show(state.render.autoThicken);

  const statsFolder = gui.addFolder('상태');
  const nodeCountCtrl = statsFolder.add(state.stats, 'nodeCountLabel').name('노드 수').disable();
  statsFolder.open();

  function refreshStats() {
    nodeCountCtrl.updateDisplay();
  }

  return { gui, refreshStats };
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
