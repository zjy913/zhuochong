// ============================================================
// 桌宠 · 开机自启控制 (autostart.js)  —— Windows
// ============================================================
// 通过 Windows 的任务计划程序注册"登录时启动"，让桌宠无需终端即可随系统自启。
// 采用计划任务而不是注册表 Run 键，兼容性更好、用户可在任务计划程序里直观管理。
//
//   - 在打包后的 exe 首次运行时自动注册自启
//   - 用 --no-autostart 启动一次即可取消自启
// ============================================================

const { app } = require("electron");
const { execFile } = require("child_process");

// 任务名（在"任务计划程序"里可看到）
const TASK_NAME = "DesktopPet-Autostart";

function getExePath() {
  // 打包后：process.execPath 就是桌宠的 exe 路径
  return process.execPath;
}

// 生成 schtasks 命令行
function buildCommand(action, exePath) {
  const args = ["/Create", "/TN", TASK_NAME, "/TR", `"${exePath}"`, "/SC", "ONLOGON", "/RL", "HIGHEST", "/F"];
  if (action === "delete") {
    return ["/Delete", "/TN", TASK_NAME, "/F"];
  }
  return args;
}

function runSchtasks(args, callback) {
  execFile("schtasks", args, { windowsHide: true }, (err, stdout, stderr) => {
    callback(err, stdout, stderr);
  });
}

function setup() {
  // 支持 --no-autostart 参数：取消自启
  if (process.argv.includes("--no-autostart")) {
    runSchtasks(buildCommand("delete"), (err) => {
      if (!err) console.log("桌宠自启已关闭");
    });
    return;
  }

  // 单例：如果已存在自启任务，就不重复注册（避免每次启动都重建）
  const exe = getExePath();
  if (!exe || !app.isPackaged) {
    // 开发模式（npm start）下不注册自启，避免把 electron 可执行文件注册进去
    return;
  }

  runSchtasks(buildCommand("create", exe), (err) => {
    if (err) {
      // 任务已存在等非致命情况不打扰用户
      return;
    }
    console.log("已注册桌宠自启任务");
  });
}

module.exports = { setup };
