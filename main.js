// ─────────────────────────────────────────────────────────────
// 메모 위젯 - Electron 메인 프로세스 (3단계)
//   · 투명 창(틀 없음) — 포스트잇 탭이 화면 오른쪽 끝에 딱 붙어 보임
//   · 접힘 = 탭만(좁게) / 펼침 = 메모판 + 탭(넓게). 항상 오른쪽 끝에 재배치
//   · 메모 데이터는 이 PC의 로컬 JSON 파일에 저장(서버 없음)
//       위치: %APPDATA%\memo-widget\memos.json
// ─────────────────────────────────────────────────────────────

const { app, BrowserWindow, screen, ipcMain } = require('electron');
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

/* ── 렌더러 요청 처리 ── */
ipcMain.on('set-expanded', (_e, expanded) => dock(expanded ? EXPANDED_W : COLLAPSED_W));
ipcMain.handle('memos:load', () => loadMemos());
ipcMain.handle('memos:save', (_e, list) => saveMemos(list));
ipcMain.handle('autolaunch:get', () => getAutoLaunch());
ipcMain.handle('autolaunch:set', (_e, enable) => setAutoLaunch(enable));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
