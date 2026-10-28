import GUI from 'lil-gui';

export function createControlPanel(state, callbacks) {
  const gui = new GUI({ title: 'Network Graph Controls' });
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = '64px';
  gui.domElement.style.right = '16px';
  gui.domElement.style.zIndex = '20';

  const shapeFolder = gui.addFolder('Shape');
  shapeFolder
    .add(state.shape, 'type', { '구형 (기본)': 'sphere', a: 'a', r: 'r', k: 'k', o: 'o', arko: 'arko' })
    .name('모양')
    .onChange(callbacks.onShapeChange);
  shapeFolder.add(state.shape, 'morphDuration', 200, 5000, 50).name('전환 시간(ms)');
  shapeFolder.open();

  const layoutFolder = gui.addFolder('Layout');
  layoutFolder.add(state.layout, 'nodeCount', 10, 600, 1).name('노드 수').onFinishChange(callbacks.onLayoutChange);
  layoutFolder.add(state.layout, 'sphereRadius', 5, 100, 0.5).name('구 반경').onChange(callbacks.onLayoutChange);
  layoutFolder.add(state.layout, 'imageSize', 0.2, 10, 0.1).name('이미지 크기').onFinishChange(callbacks.onLayoutChange);
  layoutFolder.add(state.layout, 'sizeVariance', 0, 1, 0.01).name('크기 랜덤 편차').onFinishChange(callbacks.onLayoutChange);
  layoutFolder.add(state.layout, 'seed', 0, 999999, 1).name('랜덤 seed').onFinishChange(callbacks.onLayoutChange);
  layoutFolder.open();

  const linesFolder = gui.addFolder('Lines');
  linesFolder.add(state.lines, 'opacity', 0, 1, 0.01).name('선 투명도').onChange(callbacks.onLinesOpacityChange);
  linesFolder.add(state.lines, 'interNodeCount', 0, 1000, 1).name('노드 간 연결 개수').onFinishChange(callbacks.onLayoutChange);
  linesFolder.add(state.lines, 'width', 0.1, 10, 0.1).name('선 두께').onChange(callbacks.onLinesWidthChange);
  linesFolder.addColor(state.lines, 'radialColor').name('중심선 색상').onChange(callbacks.onLinesColorChange);
  linesFolder.addColor(state.lines, 'interColor').name('노드 간 선 색상').onChange(callbacks.onLinesColorChange);
  linesFolder.open();

  const hubFolder = gui.addFolder('Hub');
  hubFolder.addColor(state.hub, 'color').name('허브 색상').onChange(callbacks.onHubChange);
  hubFolder.add(state.hub, 'size', 0, 3, 0.01).name('허브 크기').onChange(callbacks.onHubChange);
  hubFolder.add(state.hub, 'visible').name('허브 보이기').onChange(callbacks.onHubChange);
  hubFolder.open();

  const motionFolder = gui.addFolder('Motion');
  motionFolder.add(state.motion, 'rotationSpeed', 0, 0.5, 0.001).name('회전 속도');
  motionFolder.add(state.motion, 'noiseStrength', 0, 5, 0.05).name('노이즈 세기');
  motionFolder.add(state.motion, 'noiseSpeed', 0, 2, 0.01).name('노이즈 속도');
  motionFolder.add(state.motion, 'introDuration', 300, 8000, 50).name('인트로 재생시간(ms)');
  motionFolder.open();

  const cameraFolder = gui.addFolder('Camera');
  cameraFolder.add(state.camera, 'zoom', 0.3, 3, 0.01).name('줌').onChange(callbacks.onZoomChange);
  cameraFolder.add(state.camera, 'autoRotate').name('자동 회전');
  cameraFolder.open();

  const displayFolder = gui.addFolder('Display');
  displayFolder.addColor(state.display, 'backgroundColor').name('배경색').onChange(callbacks.onBackgroundColorChange);
  displayFolder.add(state.display, 'hideCursor').name('마우스 커서 숨기기').onChange(callbacks.onHideCursorChange);
  displayFolder.open();

  const actions = gui.addFolder('Actions');
  actions.add({ reshuffle: () => callbacks.onReshuffle() }, 'reshuffle').name('Reshuffle');
  actions.add({ replay: () => callbacks.onReplayIntro() }, 'replay').name('Replay Intro');
  actions.add({ savePNG: () => callbacks.onSavePNG() }, 'savePNG').name('PNG 저장');
  const recordController = actions
    .add({ record: () => callbacks.onToggleRecording() }, 'record')
    .name('녹화 시작');
  actions.add({ saveSettings: () => callbacks.onSaveSettings() }, 'saveSettings').name('설정 JSON 저장');
  actions.add({ loadSettings: () => triggerFileLoad(callbacks.onLoadSettings) }, 'loadSettings').name('설정 JSON 불러오기');
  actions.open();

  function setRecordingLabel(label) {
    recordController.name(label);
  }

  return { gui, setRecordingLabel };
}

function triggerFileLoad(onLoadSettings) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        onLoadSettings(data);
      } catch (err) {
        console.error('설정 JSON 파싱 실패', err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
