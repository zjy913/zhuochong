// ============================================================
// 桌宠 · 主进程 (main.js)
// Electron 的"后端"，负责创建和控制桌宠窗口
// ============================================================

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

// 桌宠窗口的"逻辑尺寸"（像素）。
// 实际窗口会比这大一圈，留出透明边缘方便鼠标操作，稍后由 renderer 处理。
const PET_W = 300;
const PET_H = 350;

function createPetWindow() {
  const win = new BrowserWindow({
    width: PET_W,
    height: PET_H,

    // ---- 桌宠关键三项：无边框 + 透明 + 置顶 ----
    frame: false,            // 去掉系统边框
    transparent: true,       // 窗口背景透明，才能看到桌面
    alwaysOnTop: true,       // 始终在最上层
    resizable: false,        // 禁止调整大小（桌宠通常是固定大小）
    skipTaskbar: true,       // 不在任务栏显示图标

    // 窗口默认出现在屏幕右下角
    x: undefined,
    y: undefined,
    center: false,

    // 关闭硬件加速的画布崩溃问题可不加，这里保持默认即可

    webPreferences: {
      // 允许 main 与 renderer 通过 IPC 通信
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  // 加载宠物页面
  win.loadFile("index.html");

  return win;
}

// ---- 桌宠图标（用于托盘和右键菜单），纯代码生成，避免额外图片文件 ----
function petIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="17" r="13" fill="#ffd54f" stroke="#e0a020" stroke-width="2"/>
    <circle cx="12" cy="15" r="2.2" fill="#3a3a3a"/>
    <circle cx="20" cy="15" r="2.2" fill="#3a3a3a"/>
    <ellipse cx="16" cy="20" rx="2" ry="1.4" fill="#e07030"/>
    <path d="M13 22 q3 2.6 6 0" stroke="#a05a20" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL("data:image/svg+xml;base64," +
    Buffer.from(svg).toString("base64"));
}

// 系统托盘：右键退出、左键显示/隐藏宠物
function createTray() {
  const tray = new Tray(petIcon());
  tray.setToolTip("桌宠 DesktopPet");

  const menu = Menu.buildFromTemplate([
    {
      label: "显示 / 隐藏桌宠",
      click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return;
        if (win.isVisible()) win.hide(); else win.show();
      },
    },
    { type: "separator" },
    {
      label: "退出桌宠",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  // 左键单击托盘图标也当作"显示/隐藏"
  tray.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isVisible()) win.hide(); else win.show();
  });
  return tray;
}

// ---- IPC：让页面能移动窗口、查询屏幕尺寸 ----
// 维护每个窗口"待移动的最新坐标"，用微定时器合并高频 IPC，
// 避免每帧多次 setPosition 造成滞后/积压，让拖动更顺滑。
const pendingMoves = new WeakMap(); // win -> { x, y, timer }

function scheduleMove(win, x, y) {
  let rec = pendingMoves.get(win);
  if (!rec) {
    rec = { x, y, timer: null };
    pendingMoves.set(win, rec);
  }
  // 记住最新目标
  rec.x = x;
  rec.y = y;
  // 若已有定时器在排队，就不再重复开——保证每次屏幕刷新只落位一次
  if (rec.timer) return;
  rec.timer = setTimeout(() => {
    rec.timer = null;
    // 用 setBounds 一次性应用最新坐标
    win.setBounds({ x: Math.round(rec.x), y: Math.round(rec.y) });
  }, 0);
}

// 把窗口移动到屏幕绝对坐标 (x, y)
ipcMain.on("pet:move", (event, x, y) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  scheduleMove(win, x, y);
});

// 返回"可用屏幕区域"（不含任务栏）—— 宠物据此贴着屏幕底部"落"下来
ipcMain.handle("pet:screen", () => {
  const wa = screen.getPrimaryDisplay().workArea;
  return { width: wa.width, height: wa.height, x: wa.x, y: wa.y };
});

// 宠物上点右键 → 在鼠标位置弹出一个原生菜单（显示/退出）
ipcMain.on("pet:context-menu", (event) => {
  const menu = Menu.buildFromTemplate([
    {
      label: "退出桌宠",
      click: () => app.quit(),
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});

// 直接退出（页面内调用）
ipcMain.on("pet:quit", () => {
  app.quit();
});

// Electron 就绪后创建窗口
app.whenReady().then(() => {
  // 默认把桌宠放到屏幕右下角（在加载页面后由页面自己定位更精确，
  // 这里先创建窗口）
  createPetWindow();

  // 系统托盘：提供"退出桌宠"入口（见 createTray）
  createTray();

  // ---- 开机自启（Windows）----
  // 打包成 exe 后，默认让桌宠随系统登录自动启动，这样无需任何终端。
  // 若想关闭自启，用命令行以 --no-autostart 启动一次即可。
  if (process.platform === "win32") {
    const Autostart = require("./autostart");
    Autostart.setup();
  }

  // macOS 上点击 Dock 图标时若无窗口则重建（桌宠在其它平台不需要）
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

// 所有窗口关闭时退出（Linux 等平台行为）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
