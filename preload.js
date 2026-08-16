// ============================================================
// 桌宠 · preload.js
// 安全桥：把 main 进程的能力以小而安全的 API 暴露给页面
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petAPI", {
  // 把窗口移动到指定坐标（屏幕绝对坐标）
  moveWindow: (x, y) => ipcRenderer.send("pet:move", x, y),

  // 取到屏幕工作区尺寸（不含任务栏），用于让宠物"落地"
  getScreenSize: () => ipcRenderer.invoke("pet:screen"),

  // 在宠物上点右键时，让主进程弹出一个原生菜单（含"退出桌宠"）
  showContextMenu: () => ipcRenderer.send("pet:context-menu"),

  // 直接退出程序
  quit: () => ipcRenderer.send("pet:quit")
});
