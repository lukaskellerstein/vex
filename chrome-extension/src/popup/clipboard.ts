import type { ImagePanel } from "../shared/format-edits";

const PANEL_MAX_WIDTH = 1200;
const TITLE_HEIGHT = 40;
const GAP = 16;

/** Put the edits on the clipboard for a coding agent.
 *
 *  The screenshots are saved as files (~/Downloads/vex/clipboard/…) and the
 *  text names their paths, so one plain-text paste carries everything. The
 *  clipboard also gets one PNG with all screenshots, titled; if saving the
 *  files fails, the text points at that image instead. */
export async function copyEdit(
  panels: ImagePanel[],
  render: (panels: ImagePanel[]) => string,
): Promise<void> {
  if (panels.length === 0) {
    await navigator.clipboard.writeText(render(panels));
    return;
  }
  const text = saveScreenshots(panels).then(
    (saved) => new Blob([render(saved)], { type: "text/plain" }),
  );
  // Pass promises so write() runs inside the click's user activation
  await navigator.clipboard.write([
    new ClipboardItem({ "text/plain": text, "image/png": composePanels(panels) }),
  ]);
}

/** The panels with their file paths, or unchanged when saving failed. */
async function saveScreenshots(panels: ImagePanel[]): Promise<ImagePanel[]> {
  const files = panels.map((p) => ({ name: p.fileName, base64: p.base64 }));
  const response = (await chrome.runtime.sendMessage({ action: "saveScreenshots", files })) as
    | { paths: string[] }
    | { error: string }
    | undefined;
  if (!response || "error" in response) {
    console.warn("Vex: saving screenshots failed:", response?.error ?? "no response");
    return panels;
  }
  return panels.map((p, i) => ({ ...p, path: response.paths[i] }));
}

async function composePanels(panels: ImagePanel[]): Promise<Blob> {
  const images = await Promise.all(panels.map((p) => loadImage(p.base64)));
  const columns = panels.length > 1 ? 2 : 1;
  const sizes = images.map((img) => {
    const scale = Math.min(1, PANEL_MAX_WIDTH / img.width);
    return { width: Math.round(img.width * scale), height: Math.round(img.height * scale) };
  });

  const columnWidth = Math.max(...sizes.map((s) => s.width));
  const rowHeights: number[] = [];
  sizes.forEach((s, i) => {
    const row = Math.floor(i / columns);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, TITLE_HEIGHT + s.height);
  });

  const canvas = document.createElement("canvas");
  canvas.width = columns * columnWidth + (columns + 1) * GAP;
  canvas.height = rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length + 1) * GAP;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = GAP;
  rowHeights.forEach((rowHeight, row) => {
    for (let col = 0; col < columns; col++) {
      const i = row * columns + col;
      if (i >= images.length) break;
      const x = GAP + col * (columnWidth + GAP);
      ctx.fillStyle = "#cdd6f4";
      ctx.font = "bold 22px -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(panels[i].title, x, y + TITLE_HEIGHT / 2);
      ctx.drawImage(images[i], x, y + TITLE_HEIGHT, sizes[i].width, sizes[i].height);
    }
    y += rowHeight + GAP;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))));
  });
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Cannot load screenshot"));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}
