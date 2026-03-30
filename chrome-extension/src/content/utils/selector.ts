const DYNAMIC_ID_RE = /^(:\w|ember|mat-|cdk-|ng-|react-|r:|\d+$)/;

/** Patterns that indicate a class name was auto-generated (CSS modules, styled-components, etc.) */
const GENERATED_CLASS_PATTERNS: RegExp[] = [
  /^css-[a-z0-9]{4,}$/,           // emotion: css-1a2b3c
  /^sc-[a-z]{5,}$/,               // styled-components: sc-abcdef
  /^_[a-zA-Z0-9]{8,}$/,           // CSS modules: _3fG8kLm2a
  /^[a-z]+-[a-z0-9]{5,}$/,        // generic hash: prefix-a1b2c3d4e
  /^[a-zA-Z]{1,3}[0-9]{4,}$/,     // short prefix + numbers: ab12345
];

export function isGeneratedClass(className: string): boolean {
  return GENERATED_CLASS_PATTERNS.some((re) => re.test(className));
}

function hasStableId(el: Element): boolean {
  return Boolean(el.id) && !DYNAMIC_ID_RE.test(el.id);
}

function isInsideShadowDom(el: Element): boolean {
  let node: Node | null = el;
  while (node) {
    if (node instanceof ShadowRoot) return true;
    node = node.parentNode;
  }
  return false;
}

function getTagName(el: Element): string {
  return el.tagName.toLowerCase();
}

export function generateSelector(el: Element): string {
  // Bail out for elements inside shadow DOM — selectors won't work across boundaries
  if (isInsideShadowDom(el)) {
    return getTagName(el);
  }

  // Strategy 1: #id
  if (hasStableId(el)) {
    const sel = "#" + CSS.escape(el.id);
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // Strategy 2: tag.class1.class2 (skip generated class names)
  if (el.classList.length > 0) {
    const tag = getTagName(el);
    const stableClasses = Array.from(el.classList).filter(
      (c) => !isGeneratedClass(c),
    );
    if (stableClasses.length > 0) {
      const classes = stableClasses
        .map((c) => "." + CSS.escape(c))
        .join("");
      const sel = tag + classes;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
  }

  // Strategy 3: ancestor path with nth-of-type
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    const tag = getTagName(current);
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === current!.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    path.unshift(tag + ":nth-of-type(" + index + ")");

    if (hasStableId(parent)) {
      path.unshift("#" + CSS.escape(parent.id));
      break;
    }
    current = parent;
  }

  const sel = path.join(" > ");
  if (sel && document.querySelectorAll(sel).length === 1) return sel;

  // Final fallback: full path from html
  const fullPath: string[] = [];
  current = el;
  while (current && current !== document.documentElement) {
    const tag = getTagName(current);
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === current!.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    fullPath.unshift(tag + ":nth-of-type(" + index + ")");
    current = parent;
  }
  fullPath.unshift("html");
  return fullPath.join(" > ");
}
