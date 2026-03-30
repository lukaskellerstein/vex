/**
 * Clone a GitHub repository to ~/.vex/projects/.
 * Parses git clone --progress stderr for progress percentage.
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { BrowserWindow } from "electron";

const PROJECTS_DIR = path.join(os.homedir(), ".vex", "projects");
const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

interface CloneResult {
  success: true;
  projectPath: string;
  repoName: string;
}

interface CloneError {
  success: false;
  error: string;
}

function sendProgress(win: BrowserWindow | null, phase: string, progress: number, message: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("clone-progress", { phase, progress, message });
  }
}

function ensureProjectsDir(): void {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function isGitAvailable(): boolean {
  try {
    execSync("git --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function extractRepoName(url: string): string {
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1].replace(/\.git$/, "");
}

function resolveDestPath(repoName: string): string {
  let destPath = path.join(PROJECTS_DIR, repoName);
  if (!fs.existsSync(destPath)) return destPath;

  let suffix = 2;
  while (fs.existsSync(path.join(PROJECTS_DIR, `${repoName}-${suffix}`))) {
    suffix++;
  }
  return path.join(PROJECTS_DIR, `${repoName}-${suffix}`);
}

export async function cloneRepo(
  url: string,
  win: BrowserWindow | null
): Promise<CloneResult | CloneError> {
  if (!isGitAvailable()) {
    return { success: false, error: "Git is not installed on your computer." };
  }

  if (!GITHUB_URL_RE.test(url)) {
    return { success: false, error: "Invalid GitHub URL. Expected format: https://github.com/owner/repo" };
  }

  ensureProjectsDir();

  const repoName = extractRepoName(url);
  const destPath = resolveDestPath(repoName);

  sendProgress(win, "cloning", 0, "Starting clone...");

  return new Promise((resolve) => {
    const child = spawn("git", ["clone", "--progress", url, destPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1], 10);
        sendProgress(win, "cloning", pct, text.trim().split("\n").pop() ?? "Cloning...");
      }
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOSPC") {
        resolve({ success: false, error: "Not enough disk space. Free up some space and try again." });
      } else {
        resolve({ success: false, error: "Could not access this repository. Check the URL and try again." });
      }
    });

    child.on("exit", (code) => {
      if (code === 0) {
        sendProgress(win, "cloning", 100, "Clone complete.");
        resolve({ success: true, projectPath: destPath, repoName });
      } else {
        resolve({ success: false, error: "Could not access this repository. Check the URL and try again." });
      }
    });
  });
}
