import type { CaptureTabResponse } from "../../shared/messages";
import type { BoundingRect } from "../../shared/types";

/** An element to outline on a screenshot, with the text of its badge. */
export interface ScreenshotMark {
  rect: BoundingRect;
  label: string;
}

/** A plain capture of the visible tab, before any marks are drawn on it. */
export interface RawCapture {
  dataUrl: string;
  dpr: number;
}

export function captureScreenshot(
  el: Element,
  selectionNumber: number,
  hostEl: HTMLElement,
): Promise<string> {
  return captureMarkedScreenshot([{ el, label: String(selectionNumber) }], hostEl);
}

/** Capture the visible tab once and outline every element on it. */
export async function captureMarkedScreenshot(
  marks: { el: Element; label: string }[],
  hostEl: HTMLElement,
): Promise<string> {
  const raw = await captureViewport(hostEl);
  return renderMarks(
    raw,
    marks.map((m) => ({ rect: m.el.getBoundingClientRect(), label: m.label })),
  );
}

/** Capture the visible tab with the Vex overlay hidden. */
export function captureViewport(hostEl: HTMLElement): Promise<RawCapture> {
  return new Promise((resolve, reject) => {
    hostEl.style.display = "none";

    // Wait for the browser to repaint with overlay hidden before capturing
    requestAnimationFrame(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: "captureTab" }, (response: CaptureTabResponse) => {
          hostEl.style.display = "";

          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || "error" in response) {
            return reject(
              new Error(("error" in response ? response.error : null) ?? "Capture failed"),
            );
          }
          resolve({ dataUrl: response.dataUrl, dpr: window.devicePixelRatio || 1 });
        });
      }, 50);
    });
  });
}

/** Draw the marks on a raw capture; returns base64 JPEG. Rects are in the
 *  viewport coordinates of the moment the capture was taken. */
export function renderMarks(raw: RawCapture, marks: ScreenshotMark[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      for (const mark of marks) {
        drawMark(ctx, mark.rect, mark.label, raw.dpr);
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      resolve(dataUrl.replace(/^data:image\/jpeg;base64,/, ""));
    };
    img.onerror = () => reject(new Error("Failed to load screenshot"));
    img.src = raw.dataUrl;
  });
}

function drawMark(ctx: CanvasRenderingContext2D, rect: BoundingRect, label: string, dpr: number) {
  const x = rect.x * dpr;
  const y = rect.y * dpr;
  const w = rect.width * dpr;
  const h = rect.height * dpr;

  ctx.setLineDash([8 * dpr, 4 * dpr]);
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 3 * dpr;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Badge: a circle for short labels, a pill for longer ones ("2.3")
  ctx.font = `bold ${12 * dpr}px -apple-system, sans-serif`;
  const badgeR = 14 * dpr;
  const halfWidth = Math.max(0, ctx.measureText(label).width / 2 - badgeR * 0.5);
  const badgeX = x + w + badgeR * 0.3;
  const badgeY = y - badgeR * 0.3;
  ctx.beginPath();
  ctx.arc(badgeX - halfWidth, badgeY, badgeR, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.arc(badgeX + halfWidth, badgeY, badgeR, (Math.PI * 3) / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "#EF4444";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, badgeX, badgeY);
}
