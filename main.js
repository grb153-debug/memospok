// ─────────────────────────────────────────────────────────────
// 메모 위젯 - Electron 메인 프로세스 (3단계)
//   · 투명 창(틀 없음) — 포스트잇 탭이 화면 오른쪽 끝에 딱 붙어 보임
//   · 접힘 = 탭만(좁게) / 펼침 = 메모판 + 탭(넓게). 항상 오른쪽 끝에 재배치
//   · 메모 데이터는 이 PC의 로컬 JSON 파일에 저장(서버 없음)
//       위치: %APPDATA%\memo-widget\memos.json
// ─────────────────────────────────────────────────────────────

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const COLLAPSED_W = 96;    // 접힘: 세로 탭 폭(크게)
const EXPANDED_W  = 432;   // 펼침: 메모판 + 탭 폭

let win;

/* ── 로컬 저장 ── */
function dataFile() { return path.join(app.getPath('userData'), 'memos.json'); }

const SEED = [
  { id: 'm1', title: '메모1', content: '여기에 메모 내용', colorIndex: 0 },
  { id: 'm2', title: '메모2', content: '', colorIndex: 1 },
  { id: 'm3', title: '메모3', content: '', colorIndex: 2 },
];

function loadMemos() {
  try {
    const arr = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
    if (Array.isArray(arr)) return arr;
  } catch { /* 파일 없음/손상 → 시드로 시작 */ }
  return SEED;
}
function saveMemos(list) {
  try {
    fs.writeFileSync(dataFile(), JSON.stringify(Array.isArray(list) ? list : [], null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('[memo] 저장 실패:', e); return false; }
}

/* ── 창 폭 조정 + 항상 오른쪽 끝에 붙이기 (높이는 화면 가득) ── */
function dock(width) {
  if (!win) return;
  const { x, y, width: areaW, height: areaH } = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: x + areaW - width, y, width, height: areaH });
}

function createWindow() {
  const { x, y, width: areaW, height: areaH } = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width:  COLLAPSED_W,
    height: areaH,
    x:      x + areaW - COLLAPSED_W,
    y,
    frame:        false,
    transparent:  true,     // 투명 — 탭/메모판만 보이고 나머지는 바탕화면 비침
    resizable:    false,
    maximizable:  false,
    fullscreenable: false,
    hasShadow:    false,
    alwaysOnTop:  true,
    skipTaskbar:  false,    // 테스트 편의상 작업표시줄 표시
    title:        '메모쏙',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');
}

/* ── 컴퓨터 켜면 자동 실행 (Windows 로그인 시 시작) ── */
//   설정값은 OS(레지스트리)에 저장되어 재부팅 후에도 유지됨.
function getAutoLaunch() {
  try { return !!app.getLoginItemSettings().openAtLogin; }
  catch (e) { console.error('[memo] 자동실행 상태 읽기 실패:', e); return false; }
}
function setAutoLaunch(enable) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      path: process.execPath,   // 설치된 메모쏙 실행 파일 경로
      args: [],
    });
    return true;
  } catch (e) { console.error('[memo] 자동실행 설정 실패:', e); return false; }
}

/* ── 자동 업데이트 (깃허브 Release에서 새 버전 확인 → 받아서 다음 실행 시 적용) ── */
//   · 켤 때 깃허브 grb153-debug/memospok 의 최신 Release를 확인
//   · 새 버전이 있으면 조용히 내려받고, 진행 상황을 렌더러(화면)에 작게 표시
//   · 받기가 끝나면 "다음에 켤 때 적용"됨 (autoInstallOnAppQuit 기본 동작)
function sendUpdate(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setupAutoUpdate() {
  // 개발 모드(electron .)에서는 업데이트 서버가 없어 동작하지 않음 → 설치본에서만 실행
  if (!app.isPackaged) {
    console.log('[update] 개발 모드 — 자동 업데이트 건너뜀');
    return;
  }

  autoUpdater.autoDownload = true;             // 새 버전 발견 시 자동으로 내려받음
  autoUpdater.autoInstallOnAppQuit = true;     // 받은 업데이트는 앱 종료 후 다음 실행 때 적용

  autoUpdater.on('checking-for-update', () => sendUpdate('update:status', { state: 'checking' }));
  autoUpdater.on('update-available',    (info) => sendUpdate('update:status', { state: 'available', version: info && info.version }));
  autoUpdater.on('update-not-available',(info) => sendUpdate('update:status', { state: 'none', version: info && info.version }));
  autoUpdater.on('download-progress',   (p)    => sendUpdate('update:status', { state: 'downloading', percent: Math.round(p && p.percent || 0) }));
  autoUpdater.on('update-downloaded',   (info) => sendUpdate('update:status', { state: 'downloaded', version: info && info.version }));
  autoUpdater.on('error',               (err)  => {
    console.error('[update] 오류:', err);
    sendUpdate('update:status', { state: 'error', message: String(err && err.message || err) });
  });

  // 창이 준비된 뒤 한 번 확인 (네트워크 끊김 등은 error 이벤트로만 처리하고 앱은 계속 동작)
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[update] 확인 실패:', err);
    sendUpdate('update:status', { state: 'error', message: String(err && err.message || err) });
  });
}

/* ── 렌더러 요청 처리 ── */
ipcMain.on('set-expanded', (_e, expanded) => dock(expanded ? EXPANDED_W : COLLAPSED_W));
// 렌더러에서 "지금 설치(재시작)" 요청 시 즉시 적용
ipcMain.on('update:install', () => { try { autoUpdater.quitAndInstall(); } catch (e) { console.error('[update] 설치 실패:', e); } });
ipcMain.handle('memos:load', () => loadMemos());
ipcMain.handle('memos:save', (_e, list) => saveMemos(list));
ipcMain.handle('autolaunch:get', () => getAutoLaunch());
ipcMain.handle('autolaunch:set', (_e, enable) => setAutoLaunch(enable));

app.whenReady().then(() => {
  createWindow();
  // 창이 화면에 뜬 뒤 업데이트 확인 시작 (조금 늦춰 초기 실행을 가볍게)
  win.webContents.once('did-finish-load', () => setTimeout(setupAutoUpdate, 3000));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
