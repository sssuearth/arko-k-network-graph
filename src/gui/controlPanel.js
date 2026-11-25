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

  const introFolder = gui.addFolder('Intro');
  introFolder.add(state.motion, 'introHoldMs', 0, 8000, 50).name('정지 시간(ms)');
  introFolder.add(state.motion, 'introDuration', 500, 15000, 100).name('줌아웃 시간(ms)');
  introFolder.add(state.motion, 'introEasePower', 0.5, 6, 0.1).name('줌아웃 커브 세기');
  introFolder.add(state.camera, 'zoom', 0.3, 10, 0.01).name('줌아웃 수치').onChange(callbacks.onZoomChange);
  introFolder.add(state.motion, 'heroZoomPadding', 0.6, 1.6, 0.02).name('히어로 확대 여백');
  introFolder
    .add(state.motion, 'heroOffsetX', -1, 1, 0.01)
    .name('히어로 위치(가로)')
    .onFinishChange(callbacks.onHeroOffsetChange);
  introFolder
    .add(state.motion, 'heroOffsetY', -1, 1, 0.01)
    .name('히어로 위치(세로)')
    .onFinishChange(callbacks.onHeroOffsetChange);
  introFolder
    .add({ uploadHero: () => triggerMediaFileLoad(callbacks.onUploadHeroImage) }, 'uploadHero')
    .name('히어로 사진/영상 업로드(16:9 권장)');
  introFolder.add({ clearHero: () => callbacks.onClearHeroImage() }, 'clearHero').name('히어로 미디어 초기화(자동 선택)');
  introFolder.open();

  const outroFolder = gui.addFolder('Outro');
  outroFolder.add(state.motion, 'outroDuration', 500, 15000, 100).name('줌인 소요 시간(ms, 클수록 느림)');
  outroFolder.add(state.motion, 'outroSpeed', 0.1, 5, 0.05).name('줌인 속도(클수록 빠름)');
  outroFolder.add(state.motion, 'outroEasePower', 0.5, 6, 0.1).name('줌인 가속 커브');
  outroFolder.add(state.motion, 'outroZoom', 0.3, 20, 0.1).name('줌인 수치');
  outroFolder.open();

  const layoutFolder = gui.addFolder('Layout');
  layoutFolder.add(state.layout, 'nodeCount', 10, 1000, 1).name('노드 수').onFinishChange(callbacks.onLayoutChange);
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

  const motionFolder = gui.addFolder('Motion');
  motionFolder.add(state.motion, 'rotationSpeed', 0, 0.5, 0.001).name('회전 속도');
  motionFolder.add(state.motion, 'noiseStrength', 0, 5, 0.05).name('노이즈 세기');
  motionFolder.add(state.motion, 'noiseSpeed', 0, 2, 0.01).name('노이즈 속도');
  motionFolder.open();

  const cameraFolder = gui.addFolder('Camera');
  cameraFolder.add(state.camera, 'autoRotate').name('자동 회전').onChange(callbacks.onAutoRotateChange);
  cameraFolder.open();

  const displayFolder = gui.addFolder('Display');
  displayFolder.addColor(state.display, 'backgroundColor').name('배경색').onChange(callbacks.onBackgroundColorChange);
  displayFolder.add(state.display, 'hideCursor').name('마우스 커서 숨기기').onChange(callbacks.onHideCursorChange);
  displayFolder.add(state.display, 'showFrameGuide').name('16:9 프레임 가이드').onChange(callbacks.onFrameGuideChange);
  displayFolder.open();

  const actions = gui.addFolder('Actions');
  const saveNowController = actions
    .add(
      {
        saveNow: () => {
          callbacks.onManualSave();
          saveNowController.name('저장됨 ✓');
          setTimeout(() => saveNowController.name('현재 설정 저장'), 1200);
        },
      },
      'saveNow'
    )
    .name('현재 설정 저장');
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

function triggerMediaFileLoad(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.onchange = () => {
    const file = input.files[0];
    if (file) onFile(file);
  };
  input.click();
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
