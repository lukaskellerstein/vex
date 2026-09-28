import type { BoundingRect } from "../../shared/types";
import { type RawCapture, renderMarks } from "../hooks/useScreenshot";

/** One screenshot of a group: a raw capture and the group elements it shows,
 *  with their rects at capture time. Marks are drawn at render time, so labels
 *  stay correct when an element is removed and the rest are renumbered. */
export interface GroupView {
  raw: RawCapture;
  marks: { el: Element; rect: BoundingRect }[];
}

export function toRect(r: DOMRect): BoundingRect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function isInViewport(el: Element): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < window.innerHeight &&
    r.left < window.innerWidth
  );
}

/** Add a fresh view. Each element lives in exactly one view — the newest one
 *  that shows it — so older views lose the elements it shows, and an older
 *  view left with no elements is dropped. */
export function addView(views: GroupView[], view: GroupView): GroupView[] {
  const shown = new Set(view.marks.map((m) => m.el));
  const older = views
    .map((v) => ({ ...v, marks: v.marks.filter((m) => !shown.has(m.el)) }))
    .filter((v) => v.marks.length > 0);
  return [...older, view];
}

/** Keep only marks of elements still in the group, ordered so that view 1
 *  holds element 1, and so on. */
export function pruneViews(views: GroupView[], elements: Element[]): GroupView[] {
  const firstIndex = (v: GroupView) => Math.min(...v.marks.map((m) => elements.indexOf(m.el)));
  return views
    .map((v) => ({ ...v, marks: v.marks.filter((m) => elements.includes(m.el)) }))
    .filter((v) => v.marks.length > 0)
    .sort((a, b) => firstIndex(a) - firstIndex(b));
}

/** Render every view with the current labels; returns base64 JPEGs. */
export function renderViews(
  views: GroupView[],
  elements: Element[],
  labels: string[],
): Promise<string[]> {
  return Promise.all(
    views.map((v) =>
      renderMarks(
        v.raw,
        v.marks.map((m) => ({ rect: m.rect, label: labels[elements.indexOf(m.el)] })),
      ),
    ),
  );
}

/** The rect each element had in the view that shows it. */
export function rectInViews(views: GroupView[], el: Element): BoundingRect | null {
  for (const v of views) {
    const mark = v.marks.find((m) => m.el === el);
    if (mark) return mark.rect;
  }
  return null;
}
