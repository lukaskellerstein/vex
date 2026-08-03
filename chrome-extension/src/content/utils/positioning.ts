import type { BoundingRect } from "../../shared/types";

export interface PopupPosition {
  top: number;
  left: number;
}

export function computePopupPosition(
  elementRect: BoundingRect,
  popupWidth: number,
  popupHeight: number,
): PopupPosition {
  const spaceBelow = window.innerHeight - elementRect.y - elementRect.height;

  const top =
    spaceBelow > popupHeight + 12
      ? elementRect.y + elementRect.height + 8
      : Math.max(4, elementRect.y - popupHeight - 8);

  const left = Math.max(4, Math.min(elementRect.x, window.innerWidth - popupWidth - 4));

  return { top, left };
}

/**
 * Clamp a popup position so it stays fully visible within the viewport.
 * Uses an estimated height when the actual popup height is unknown.
 */
export function clampToViewport(
  top: number,
  left: number,
  width: number,
  height: number,
  margin = 8,
): PopupPosition {
  const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
  return { top: clampedTop, left: clampedLeft };
}
