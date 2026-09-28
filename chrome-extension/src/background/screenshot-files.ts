// Saves copied screenshots as files so the copied text can point at them.
// Chrome lets an extension write only inside the Downloads folder, so they go to
// ~/Downloads/vex/clipboard/<date>/ and are deleted after RETENTION_DAYS. (Chrome
// rejects a folder name that starts with a dot, so it cannot be ".vex".)

export interface ScreenshotFile {
  name: string;
  base64: string;
}

const FOLDER = "vex/clipboard";
const FOLDER_PATTERN = "[/\\\\]vex[/\\\\]clipboard[/\\\\]";
const RETENTION_DAYS = 14;
const CACHE_KEY = "vexScreenshotFiles";

/** Save the screenshots (reusing files saved earlier for the same image) and
 *  return their absolute paths, in the same order. */
export async function saveScreenshotFiles(files: ScreenshotFile[]): Promise<string[]> {
  await removeExpiredFiles();
  const cache = await readCache();
  const folder = `${FOLDER}/${stamp()}`;

  // No download bubble for these; always switch it back on
  await chrome.downloads.setUiOptions({ enabled: false });
  try {
    const paths: string[] = [];
    for (const file of files) {
      const hash = await sha1(file.base64);
      const reused = await existingPath(cache[hash]);
      const path = reused ?? (await download(`${folder}/${file.name}`, file.base64));
      cache[hash] = path;
      paths.push(path);
    }
    await chrome.storage.session.set({ [CACHE_KEY]: cache });
    return paths;
  } finally {
    await chrome.downloads.setUiOptions({ enabled: true });
  }
}

/** Delete our screenshot files older than the retention period. */
async function removeExpiredFiles(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await chrome.downloads.search({
    filenameRegex: FOLDER_PATTERN,
    endedBefore: cutoff.toISOString(),
    state: "complete",
  });
  for (const item of expired) {
    if (item.exists) await chrome.downloads.removeFile(item.id).catch(() => undefined);
    await chrome.downloads.erase({ id: item.id });
  }
}

async function download(filename: string, base64: string): Promise<string> {
  const id = await chrome.downloads.download({
    url: `data:image/jpeg;base64,${base64}`,
    filename,
    conflictAction: "uniquify",
    saveAs: false,
  });
  const item = await waitUntilDone(id);
  if (item.state !== "complete") {
    throw new Error(`Saving ${filename} failed: ${item.error ?? item.state}`);
  }
  return item.filename;
}

function waitUntilDone(id: number): Promise<chrome.downloads.DownloadItem> {
  return new Promise((resolve) => {
    const check = async () => {
      const [item] = await chrome.downloads.search({ id });
      if (item && item.state !== "in_progress") {
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve(item);
      }
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === id && delta.state) void check();
    };
    chrome.downloads.onChanged.addListener(onChanged);
    void check();
  });
}

async function existingPath(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  const [item] = await chrome.downloads.search({ filename: path, exists: true });
  return item ? path : null;
}

async function readCache(): Promise<Record<string, string>> {
  const stored = await chrome.storage.session.get(CACHE_KEY);
  return (stored[CACHE_KEY] as Record<string, string> | undefined) ?? {};
}

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "2026-09-28/143205" — a folder per day, a subfolder per copy. */
function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${day}/${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
