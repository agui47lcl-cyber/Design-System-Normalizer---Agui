/**
 * [INPUT]: 依赖 node:child_process/fs/os/path、assets 下的素材 HTML，以及 macOS 的 Chrome 与 sips
 * [OUTPUT]: 对外生成 assets 目录下的插件图标、社区封面与三张轮播图 PNG
 * [POS]: scripts 的素材渲染器，用无头浏览器把 HTML 版式固化为 Figma 发布用位图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const assetsDir = path.join(rootDir, "assets");

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chrome) {
  process.stderr.write(`找不到无头浏览器，已尝试:\n${chromeCandidates.join("\n")}\n`);
  process.exit(1);
}

const jobs = [
  { source: "icon.html", output: "icon-512.png", size: [512, 512] },
  { source: "cover.html", output: "cover-1920x1080.png", size: [1920, 1080] },
  { source: "slide-workflow.html", output: "slide-02-workflow.png", size: [1920, 1080] },
  { source: "slide-rules.html", output: "slide-03-rules.png", size: [1920, 1080] },
  { source: "slide-prereq.html", output: "slide-04-prereq.png", size: [1920, 1080] },
];

mkdirSync(assetsDir, { recursive: true });
const profileDir = mkdtempSync(path.join(tmpdir(), "figma-asset-render-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// headless=new 截图完成后进程可能不退出：截图文件大小连续两次稳定即认为完成并强杀
async function renderOnce(args, target) {
  rmSync(target, { force: true });
  const child = spawn(chrome, args, { stdio: "ignore" });
  const deadline = Date.now() + 20000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(target)) {
      const size = statSync(target).size;
      if (size > 0 && size === lastSize) break;
      lastSize = size;
    }
    await delay(300);
  }
  child.kill("SIGKILL");
  if (!existsSync(target) || statSync(target).size === 0) {
    throw new Error(`截图未生成: ${target}`);
  }
}

for (const job of jobs) {
  const [width, height] = job.size;
  const target = path.join(assetsDir, job.output);
  await renderOnce(
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--force-device-scale-factor=1",
      "--force-color-profile=srgb",
      "--virtual-time-budget=600",
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      `--screenshot=${target}`,
      pathToFileURL(path.join(assetsDir, job.source)).href,
    ],
    target,
  );
  process.stdout.write(`${job.output} ${Math.round(statSync(target).size / 1024)}KB\n`);
}

// 图标由 512 母版下采样，保证 128px 边缘干净
spawn("sips", ["-z", "128", "128", path.join(assetsDir, "icon-512.png"), "--out", path.join(assetsDir, "icon-128.png")], {
  stdio: "ignore",
});
await delay(1500);
process.stdout.write("icon-128.png 已从 512px 母版下采样\n");
