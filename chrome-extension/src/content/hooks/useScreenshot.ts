import type { CaptureTabResponse } from "../../shared/messages";

export function captureScreenshot(
  el: Element,
  selectionNumber: number,
  hostEl: HTMLElement,
): Promise<string> {
  return new Promise((resolve, reject) => {
    hostEl.style.display = "none";

    // Wait for the browser to repaint with overlay hidden before capturing
    requestAnimationFrame(() => { setTimeout(() => {
    chrome.runtime.sendMessage(
      { action: "captureTab" },
      (response: CaptureTabResponse) => {
        hostEl.style.display = "";

        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || "error" in response) {
          return reject(
            new Error(
              ("error" in response ? response.error : null) ??
                "Capture failed",
            ),
          );
        }

        const img = new Image();
        img.onload = () => {
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);

          const rect = el.getBoundingClientRect();
          const x = rect.x * dpr;
          const y = rect.y * dpr;
          const w = rect.width * dpr;
          const h = rect.height * dpr;

          ctx.setLineDash([8 * dpr, 4 * dpr]);
          ctx.strokeStyle = "#F59E0B";
          ctx.lineWidth = 3 * dpr;
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);

          const badgeR = 14 * dpr;
          const badgeX = x + w + badgeR * 0.3;
          const badgeY = y - badgeR * 0.3;
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = "#EF4444";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${12 * dpr}px -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(selectionNumber), badgeX, badgeY);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
          resolve(base64);
        };
        img.onerror = () => reject(new Error("Failed to load screenshot"));
        img.src = response.dataUrl;
      },
    );
    }, 50); });
  });
}
