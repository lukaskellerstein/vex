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

/** Build a human-readable accessibility path from the element to the root. */
function buildAccessibilityPath(el: Element): string | null {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    const role = current.getAttribute("role");
    const ariaLabel = current.getAttribute("aria-label");
    const tag = current.tagName.toLowerCase();

    // Use semantic landmarks and labeled elements
    if (role || ariaLabel || ["main", "nav", "header", "footer", "aside", "section", "article", "form", "h1", "h2", "h3", "h4", "h5", "h6", "button", "a", "input", "select", "textarea"].includes(tag)) {
      let part = role || tag;
      if (ariaLabel) {
        part += `[aria-label="${ariaLabel}"]`;
      } else if (tag === "a" || tag === "button") {
        const text = (current.textContent || "").trim().slice(0, 30);
        if (text) part += ` "${text}"`;
      }
      parts.unshift(part);
    }
    current = current.parentElement;
  }
  return parts.length > 0 ? parts.join(" > ") : null;
}

/** Extract the nearest React component name from React Fiber internals. */
function getReactComponent(el: Element): string | null {
  // React attaches fiber nodes with keys like __reactFiber$xxx or __reactInternalInstance$xxx
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
  while (fiber) {
    const type = fiber.type;
    if (typeof type === "function" || typeof type === "object") {
      const name = typeof type === "function"
        ? (type as { displayName?: string; name?: string }).displayName || (type as { name?: string }).name
        : (type as { displayName?: string })?.displayName;
      // Component names start with uppercase
      if (name && /^[A-Z]/.test(name)) return name;
    }
    fiber = fiber.return as Record<string, unknown> | null;
  }
  return null;
}

/** Extract source file location from React Fiber _debugSource (dev builds only). */
function getReactSourceFile(el: Element): string | null {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
  while (fiber) {
    const source = fiber._debugSource as { fileName?: string; lineNumber?: number } | undefined;
    if (source?.fileName) {
      return source.lineNumber ? `${source.fileName}:${source.lineNumber}` : source.fileName;
    }
    fiber = fiber.return as Record<string, unknown> | null;
  }
  return null;
}

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
    type: "select",
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
    url: window.location.href,
    accessibilityPath: buildAccessibilityPath(el),
    reactComponent: getReactComponent(el),
    reactSourceFile: getReactSourceFile(el),
  };
}
