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

  const left = Math.max(
    4,
    Math.min(elementRect.x, window.innerWidth - popupWidth - 4),
  );

  return { top, left };
}
