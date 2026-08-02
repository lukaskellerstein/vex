/**
 * Detect package manager from lock file and run install.
 * Sends progress via IPC clone-progress channel.
 */

import { spawn } from "child_process";
import type { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";

interface InstallResult {
  success: true;
  packageManager: string;
}

interface InstallError {
  success: false;
  error: string;
}

function sendProgress(win: BrowserWindow | null, progress: number, message: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("clone-progress", { phase: "installing", progress, message });
  }
}

function detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}

export async function installDependencies(
  projectPath: string,
  win: BrowserWindow | null,
): Promise<InstallResult | InstallError> {
  const pkgJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return { success: true, packageManager: "npm" };
  }

  const pm = detectPackageManager(projectPath);
  sendProgress(win, 0, `Installing dependencies with ${pm}...`);

  return new Promise((resolve) => {
    const child = spawn(pm, ["install"], {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });

    child.stdout?.on("data", () => {
      sendProgress(win, 50, `Installing with ${pm}...`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.toLowerCase().includes("enospc")) {
        // Will be caught on exit
      }
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({
          success: false,
          error: `Installation failed. Make sure ${pm} is installed on your computer.`,
        });
      } else if ((err as NodeJS.ErrnoException).code === "ENOSPC") {
        resolve({
          success: false,
          error: "Not enough disk space. Free up some space and try again.",
        });
      } else {
        resolve({
          success: false,
          error: "Installation failed. Make sure Node.js is installed on your computer.",
        });
      }
    });

    child.on("exit", (code) => {
      if (code === 0) {
        sendProgress(win, 100, "Dependencies installed.");
        resolve({ success: true, packageManager: pm });
      } else {
        resolve({
          success: false,
          error: "Installation failed. Make sure Node.js is installed on your computer.",
        });
      }
    });
  });
}
