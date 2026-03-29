import type { Selection } from "../../shared/types";
import { generateSelector } from "./selector";

const COMPUTED_PROPS = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "padding",
  "margin",
  "border",
  "borderRadius",
  "display",
  "position",
  "width",
  "height",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "boxShadow",
  "opacity",
  "transform",
  "gap",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gridTemplateColumns",
] as const;

export function collectMetadata(el: Element): Selection {
  const htmlEl = el as HTMLElement;
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);

  const computedStyles: Record<string, string> = {};
  for (const prop of COMPUTED_PROPS) {
    computedStyles[prop] = computed.getPropertyValue(
      prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()),
    );
  }

  const attributes: Record<string, string> = {};
  for (const attr of el.attributes) {
    attributes[attr.name] = attr.value;
  }

  return {
    selector: generateSelector(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || null,
    classList: Array.from(el.classList),
    textContent: (htmlEl.textContent || "").trim().slice(0, 300),
    attributes,
    computedStyles,
    boundingRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    parentTag: el.parentElement
      ? el.parentElement.tagName.toLowerCase()
      : null,
    childCount: el.children.length,
    instruction: "",
    screenshot: "",
  };
}
