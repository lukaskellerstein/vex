import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Action,
  StyleChangeAction,
  StyleChange,
  HoverChange,
} from "../../shared/types";
import { generateSelector } from "../utils/selector";
import { captureScreenshot } from "../hooks/useScreenshot";
import { registerVisualRevert } from "../hooks/useUndo";

interface StylePanelProps {
  addAction: (action: Action) => void;
  hostElement: HTMLElement;
}

// --- Section collapse helper ---

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cs-style-section">
      <button
        className="cs-style-section-header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cs-style-section-arrow">{open ? "\u25BC" : "\u25B6"}</span>
        {title}
      </button>
      {open && <div className="cs-style-section-body">{children}</div>}
    </div>
  );
}

// --- Small input components ---

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="cs-style-row">
      <label className="cs-style-label">{label}</label>
      <div className="cs-style-color-group">
        <input
          type="color"
          className="cs-style-color-picker"
          value={toHex(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="cs-style-color-value">{value}</span>
      </div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="cs-style-row">
      <label className="cs-style-label">{label}</label>
      <input
        type="number"
        className="cs-style-number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && <span className="cs-style-suffix">{suffix}</span>}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="cs-style-row">
      <label className="cs-style-label">{label}</label>
      <input
        type="range"
        className="cs-style-slider"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <input
        type="number"
        className="cs-style-number cs-style-number-sm"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && <span className="cs-style-suffix">{suffix}</span>}
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="cs-style-row">
      <label className="cs-style-label">{label}</label>
      <select
        className="cs-style-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ButtonGroupRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="cs-style-row">
      <label className="cs-style-label">{label}</label>
      <div className="cs-style-btn-group">
        {options.map((o) => (
          <button
            key={o.value}
            className={`cs-style-btn-option ${value === o.value ? "cs-style-btn-option-active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FourValueRow({
  label,
  values,
  linked,
  onToggleLink,
  onChange,
}: {
  label: string;
  values: [number, number, number, number];
  linked: boolean;
  onToggleLink: () => void;
  onChange: (index: number, v: number) => void;
}) {
  const labels = ["T", "R", "B", "L"];
  return (
    <div className="cs-style-row cs-style-row-col">
      <div className="cs-style-row-header">
        <label className="cs-style-label">{label}</label>
        <button
          className={`cs-style-link-btn ${linked ? "cs-style-link-btn-active" : ""}`}
          onClick={onToggleLink}
          title={linked ? "Unlink sides" : "Link all sides"}
        >
          {linked ? "\u{1F517}" : "\u{26D3}"}
        </button>
      </div>
      <div className="cs-style-four-inputs">
        {labels.map((l, i) => (
          <div key={l} className="cs-style-four-input-item">
            <span className="cs-style-four-label">{l}</span>
            <input
              type="number"
              className="cs-style-number cs-style-number-sm"
              value={values[i]}
              min={0}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                if (linked) {
                  onChange(0, v);
                  onChange(1, v);
                  onChange(2, v);
                  onChange(3, v);
                } else {
                  onChange(i, v);
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Utilities ---

function toHex(color: string): string {
  if (color.startsWith("#")) return color.slice(0, 7);
  const match = color.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)/,
  );
  if (!match) return "#000000";
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function detectPageFonts(): string[] {
  const fonts = new Set<string>();
  const bodyFont = getComputedStyle(document.body).fontFamily;
  bodyFont.split(",").forEach((f) => fonts.add(f.trim().replace(/"/g, "")));

  const popular = [
    "Arial",
    "Helvetica",
    "Georgia",
    "Times New Roman",
    "Verdana",
    "Roboto",
    "Open Sans",
    "Lato",
    "Inter",
    "Montserrat",
    "Source Sans Pro",
    "Poppins",
  ];
  popular.forEach((f) => fonts.add(f));
  return Array.from(fonts);
}

const FONT_WEIGHT_OPTIONS = [
  { value: "100", label: "100 - Thin" },
  { value: "200", label: "200 - Extra Light" },
  { value: "300", label: "300 - Light" },
  { value: "400", label: "400 - Normal" },
  { value: "500", label: "500 - Medium" },
  { value: "600", label: "600 - Semi Bold" },
  { value: "700", label: "700 - Bold" },
  { value: "800", label: "800 - Extra Bold" },
  { value: "900", label: "900 - Black" },
];

const BORDER_STYLE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const EASING_OPTIONS = [
  { value: "ease", label: "Ease" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease In Out" },
  { value: "linear", label: "Linear" },
];

const TRACKED_STYLE_PROPS = [
  "color",
  "backgroundColor",
  "borderColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textAlign",
  "textDecoration",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "borderWidth",
  "borderStyle",
  "borderRadius",
  "display",
  "opacity",
  "visibility",
];

function captureTrackedStyles(el: Element): Record<string, string> {
  const computed = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of TRACKED_STYLE_PROPS) {
    const cssProp = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    styles[prop] = computed.getPropertyValue(cssProp);
  }
  return styles;
}

function describeChange(prop: string, before: string, after: string): string {
  return `${prop}: "${before}" -> "${after}"`;
}

// --- Main Component ---

export function StylePanel({ addAction, hostElement }: StylePanelProps) {
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({
    top: 100,
    left: 100,
  });

  // Style state
  const [color, setColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [borderColor, setBorderColor] = useState("#000000");

  const [fontFamily, setFontFamily] = useState("Arial");
  const [customFont, setCustomFont] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState("400");
  const [lineHeight, setLineHeight] = useState(1.5);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [textTransform, setTextTransform] = useState("none");
  const [textAlign, setTextAlign] = useState("left");
  const [textDecoration, setTextDecoration] = useState("none");

  const [padding, setPadding] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [paddingLinked, setPaddingLinked] = useState(false);
  const [margin, setMargin] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [marginLinked, setMarginLinked] = useState(false);

  const [borderWidth, setBorderWidth] = useState(0);
  const [borderStyle, setBorderStyle] = useState("none");
  const [borderRadius, setBorderRadius] = useState(0);
  const [borderRadiusValues, setBorderRadiusValues] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [borderRadiusLinked, setBorderRadiusLinked] = useState(true);

  const [displayNone, setDisplayNone] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [visibilityHidden, setVisibilityHidden] = useState(false);

  // Hover state
  const [hoverPreset, setHoverPreset] = useState<string | null>(null);
  const [hoverTransform, setHoverTransform] = useState("");
  const [hoverBoxShadow, setHoverBoxShadow] = useState("");
  const [transitionDuration, setTransitionDuration] = useState(200);
  const [transitionEasing, setTransitionEasing] = useState("ease");

  // Drag state
  const [dragPos, setDragPos] = useState<{ top: number; left: number } | null>(null);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const initialStylesRef = useRef<Record<string, string>>({});
  const initialCssTextRef = useRef<string>("");
  const screenshotBeforeRef = useRef<string | null>(null);
  const hoverStyleElRef = useRef<HTMLStyleElement | null>(null);
  const selectedElRef = useRef(selectedEl);
  selectedElRef.current = selectedEl;
  const pageFontsRef = useRef<string[]>([]);

  // Load page fonts once
  useEffect(() => {
    pageFontsRef.current = detectPageFonts();
  }, []);

  // Read current styles from selected element
  const loadStylesFromElement = useCallback((el: HTMLElement) => {
    const cs = getComputedStyle(el);
    setColor(cs.color);
    setBgColor(cs.backgroundColor);
    setBorderColor(cs.borderColor);
    setFontFamily(cs.fontFamily.split(",")[0].trim().replace(/"/g, ""));
    setFontSize(parseFloat(cs.fontSize) || 16);
    setFontWeight(cs.fontWeight);
    setLineHeight(parseFloat(cs.lineHeight) / (parseFloat(cs.fontSize) || 16) || 1.5);
    setLetterSpacing(parseFloat(cs.letterSpacing) || 0);
    setTextTransform(cs.textTransform);
    setTextAlign(cs.textAlign);
    setTextDecoration(cs.textDecorationLine || cs.textDecoration?.split(" ")[0] || "none");
    setPadding([
      parseFloat(cs.paddingTop) || 0,
      parseFloat(cs.paddingRight) || 0,
      parseFloat(cs.paddingBottom) || 0,
      parseFloat(cs.paddingLeft) || 0,
    ]);
    setMargin([
      parseFloat(cs.marginTop) || 0,
      parseFloat(cs.marginRight) || 0,
      parseFloat(cs.marginBottom) || 0,
      parseFloat(cs.marginLeft) || 0,
    ]);
    setBorderWidth(parseFloat(cs.borderWidth) || 0);
    setBorderStyle(cs.borderStyle);
    const br = parseFloat(cs.borderRadius) || 0;
    setBorderRadius(br);
    setBorderRadiusValues([br, br, br, br]);
    setDisplayNone(cs.display === "none");
    setOpacity(parseFloat(cs.opacity) || 1);
    setVisibilityHidden(cs.visibility === "hidden");

    // Reset hover
    setHoverPreset(null);
    setHoverTransform("");
    setHoverBoxShadow("");
    setTransitionDuration(200);
    setTransitionEasing("ease");
  }, []);

  // Compute panel position
  const computePanelPosition = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const panelWidth = 280;
    const panelHeight = 500;

    let left = rect.right + 12;
    if (left + panelWidth > window.innerWidth) {
      left = rect.left - panelWidth - 12;
    }
    if (left < 4) {
      left = window.innerWidth - panelWidth - 12;
    }

    let top = rect.top;
    if (top + panelHeight > window.innerHeight) {
      top = Math.max(4, window.innerHeight - panelHeight - 4);
    }

    return { top, left };
  }, []);

  // Click to select element
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || hostElement.contains(el) || el === hostElement) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const htmlEl = el as HTMLElement;

      // If clicking same element, ignore
      if (htmlEl === selectedElRef.current) return;

      // If already have a selection, revert unsaved changes
      if (selectedElRef.current) {
        revertStyles();
        cleanupHoverStyle();
      }

      // Capture before screenshot
      try {
        screenshotBeforeRef.current = await captureScreenshot(
          htmlEl,
          0,
          hostElement,
        );
      } catch {
        screenshotBeforeRef.current = null;
      }

      initialStylesRef.current = captureTrackedStyles(htmlEl);
      initialCssTextRef.current = htmlEl.style.cssText;
      loadStylesFromElement(htmlEl);
      setPanelPos(computePanelPosition(htmlEl));
      setSelectedEl(htmlEl);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [hostElement, loadStylesFromElement, computePanelPosition]);

  // Finalize action on deselect
  const finalizeAction = useCallback(async () => {
    const el = selectedElRef.current;
    if (!el) return;

    const afterStyles = captureTrackedStyles(el);
    const changes: StyleChange[] = [];

    for (const prop of TRACKED_STYLE_PROPS) {
      const before = initialStylesRef.current[prop] ?? "";
      const after = afterStyles[prop] ?? "";
      if (before !== after) {
        changes.push({
          property: prop,
          before,
          after,
          description: describeChange(prop, before, after),
        });
      }
    }

    // Collect hover changes
    const hoverChanges: HoverChange[] = [];
    if (hoverPreset || hoverTransform || hoverBoxShadow) {
      if (hoverPreset === "scale" || hoverTransform) {
        const val =
          hoverPreset === "scale"
            ? "scale(1.05)"
            : hoverPreset === "lift"
              ? "translateY(-2px)"
              : hoverTransform;
        if (val) {
          hoverChanges.push({
            property: "transform",
            value: val,
            description: `hover transform: ${val}`,
          });
        }
      }
      if (hoverPreset === "shadow" || hoverPreset === "lift" || hoverBoxShadow) {
        const val =
          hoverPreset === "shadow" || hoverPreset === "lift"
            ? "0 4px 12px rgba(0,0,0,0.15)"
            : hoverBoxShadow;
        if (val) {
          hoverChanges.push({
            property: "box-shadow",
            value: val,
            description: `hover box-shadow: ${val}`,
          });
        }
      }
    }

    if (changes.length === 0 && hoverChanges.length === 0) return;

    let screenshotAfter = "";
    try {
      screenshotAfter = await captureScreenshot(el, 0, hostElement);
    } catch {
      screenshotAfter = "";
    }

    const action: StyleChangeAction = {
      type: "styleChange",
      selector: generateSelector(el),
      timestamp: new Date().toISOString(),
      screenshotBefore: screenshotBeforeRef.current,
      screenshotAfter,
      changes,
    };

    if (hoverChanges.length > 0) {
      action.hoverChanges = hoverChanges;
      action.transition = {
        duration: `${transitionDuration}ms`,
        easing: transitionEasing,
      };
    }

    addAction(action);
  }, [
    addAction,
    hostElement,
    hoverPreset,
    hoverTransform,
    hoverBoxShadow,
    transitionDuration,
    transitionEasing,
  ]);

  // Hover highlight for style mode
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoveredRef = useRef<Element | null>(null);

  useEffect(() => {
    if (selectedEl) {
      setHoverRect(null);
      return;
    }

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || hostElement.contains(el) || el === hostElement) {
        setHoverRect(null);
        hoveredRef.current = null;
        return;
      }
      hoveredRef.current = el;
      setHoverRect(el.getBoundingClientRect());
    };

    const onScroll = () => {
      if (hoveredRef.current) {
        setHoverRect(hoveredRef.current.getBoundingClientRect());
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [selectedEl, hostElement]);

  // Revert styles to initial state by restoring original inline styles
  const revertStyles = useCallback(() => {
    const el = selectedElRef.current;
    if (!el) return;
    el.style.cssText = initialCssTextRef.current;
  }, []);

  // Apply style to element live
  const applyStyle = useCallback(
    (prop: string, value: string) => {
      if (!selectedEl) return;
      selectedEl.style.setProperty(prop, value);
    },
    [selectedEl],
  );

  // Hover style injection
  const injectHoverStyle = useCallback(
    (transform: string, boxShadow: string, duration: number, easing: string) => {
      cleanupHoverStyle();
      if (!selectedEl) return;

      const selector = generateSelector(selectedEl);
      const rules: string[] = [];
      if (transform) rules.push(`transform: ${transform} !important`);
      if (boxShadow) rules.push(`box-shadow: ${boxShadow} !important`);
      if (rules.length === 0) return;

      const style = document.createElement("style");
      style.setAttribute("data-vex-hover", "true");
      style.textContent = `
        ${selector} { transition: transform ${duration}ms ${easing}, box-shadow ${duration}ms ${easing} !important; }
        ${selector}:hover { ${rules.join("; ")}; }
      `;
      document.head.appendChild(style);
      hoverStyleElRef.current = style;
    },
    [selectedEl],
  );

  const cleanupHoverStyle = useCallback(() => {
    if (hoverStyleElRef.current) {
      hoverStyleElRef.current.remove();
      hoverStyleElRef.current = null;
    }
  }, []);

  // Cleanup on unmount — revert unsaved styles and remove hover CSS
  useEffect(() => {
    return () => {
      const el = selectedElRef.current;
      if (el) {
        el.style.cssText = initialCssTextRef.current;
      }
      cleanupHoverStyle();
    };
  }, [cleanupHoverStyle]);

  // Apply and commit styles, then close panel
  const handleApply = useCallback(async () => {
    const el = selectedElRef.current;
    const initialCssText = initialCssTextRef.current;
    await finalizeAction();
    if (el) {
      registerVisualRevert(() => {
        el.style.cssText = initialCssText;
      });
    }
    cleanupHoverStyle();
    setSelectedEl(null);
  }, [finalizeAction, cleanupHoverStyle]);

  // Cancel: revert styles and close panel
  const handleCancel = useCallback(() => {
    revertStyles();
    cleanupHoverStyle();
    setSelectedEl(null);
  }, [revertStyles, cleanupHoverStyle]);

  // Drag handlers for panel header
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't drag from close button or copy-style button
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      const pos = dragPos ?? panelPos;
      dragRef.current = {
        dragging: true,
        offsetX: e.clientX - pos.left,
        offsetY: e.clientY - pos.top,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [dragPos, panelPos],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 280, e.clientX - dragRef.current.offsetX));
      const newTop = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragRef.current.offsetY));
      setDragPos({ top: newTop, left: newLeft });
    };
    const onPointerUp = () => {
      dragRef.current.dragging = false;
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Reset drag position when element changes
  useEffect(() => {
    setDragPos(null);
  }, [selectedEl]);

  // --- Change handlers that apply live ---

  const handleColorChange = useCallback(
    (v: string) => {
      setColor(v);
      applyStyle("color", v);
    },
    [applyStyle],
  );

  const handleBgColorChange = useCallback(
    (v: string) => {
      setBgColor(v);
      applyStyle("background-color", v);
    },
    [applyStyle],
  );

  const handleBorderColorChange = useCallback(
    (v: string) => {
      setBorderColor(v);
      applyStyle("border-color", v);
    },
    [applyStyle],
  );

  const handleFontFamilyChange = useCallback(
    (v: string) => {
      setFontFamily(v);
      setCustomFont("");
      applyStyle("font-family", v);
    },
    [applyStyle],
  );

  const handleCustomFontChange = useCallback(
    (v: string) => {
      setCustomFont(v);
      if (v.trim()) {
        setFontFamily(v.trim());
        applyStyle("font-family", v.trim());
      }
    },
    [applyStyle],
  );

  const handleFontSizeChange = useCallback(
    (v: number) => {
      setFontSize(v);
      applyStyle("font-size", `${v}px`);
    },
    [applyStyle],
  );

  const handleFontWeightChange = useCallback(
    (v: string) => {
      setFontWeight(v);
      applyStyle("font-weight", v);
    },
    [applyStyle],
  );

  const handleLineHeightChange = useCallback(
    (v: number) => {
      setLineHeight(v);
      applyStyle("line-height", String(v));
    },
    [applyStyle],
  );

  const handleLetterSpacingChange = useCallback(
    (v: number) => {
      setLetterSpacing(v);
      applyStyle("letter-spacing", `${v}px`);
    },
    [applyStyle],
  );

  const handleTextTransformChange = useCallback(
    (v: string) => {
      setTextTransform(v);
      applyStyle("text-transform", v);
    },
    [applyStyle],
  );

  const handleTextAlignChange = useCallback(
    (v: string) => {
      setTextAlign(v);
      applyStyle("text-align", v);
    },
    [applyStyle],
  );

  const handleTextDecorationChange = useCallback(
    (v: string) => {
      setTextDecoration(v);
      applyStyle("text-decoration", v);
    },
    [applyStyle],
  );

  const handlePaddingChange = useCallback(
    (index: number, v: number) => {
      setPadding((prev) => {
        const next = [...prev] as [number, number, number, number];
        if (paddingLinked) {
          next[0] = v;
          next[1] = v;
          next[2] = v;
          next[3] = v;
        } else {
          next[index] = v;
        }
        const props = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
        props.forEach((p, i) => {
          if (selectedEl) selectedEl.style.setProperty(p, `${next[i]}px`);
        });
        return next;
      });
    },
    [paddingLinked, selectedEl],
  );

  const handleMarginChange = useCallback(
    (index: number, v: number) => {
      setMargin((prev) => {
        const next = [...prev] as [number, number, number, number];
        if (marginLinked) {
          next[0] = v;
          next[1] = v;
          next[2] = v;
          next[3] = v;
        } else {
          next[index] = v;
        }
        const props = ["margin-top", "margin-right", "margin-bottom", "margin-left"];
        props.forEach((p, i) => {
          if (selectedEl) selectedEl.style.setProperty(p, `${next[i]}px`);
        });
        return next;
      });
    },
    [marginLinked, selectedEl],
  );

  const handleBorderWidthChange = useCallback(
    (v: number) => {
      setBorderWidth(v);
      applyStyle("border-width", `${v}px`);
    },
    [applyStyle],
  );

  const handleBorderStyleChange = useCallback(
    (v: string) => {
      setBorderStyle(v);
      applyStyle("border-style", v);
    },
    [applyStyle],
  );

  const handleBorderRadiusChange = useCallback(
    (index: number, v: number) => {
      setBorderRadiusValues((prev) => {
        const next = [...prev] as [number, number, number, number];
        if (borderRadiusLinked) {
          next[0] = v;
          next[1] = v;
          next[2] = v;
          next[3] = v;
          setBorderRadius(v);
          if (selectedEl)
            selectedEl.style.setProperty("border-radius", `${v}px`);
        } else {
          next[index] = v;
          if (selectedEl)
            selectedEl.style.setProperty(
              "border-radius",
              `${next[0]}px ${next[1]}px ${next[2]}px ${next[3]}px`,
            );
        }
        return next;
      });
    },
    [borderRadiusLinked, selectedEl],
  );

  const handleDisplayToggle = useCallback(() => {
    const next = !displayNone;
    setDisplayNone(next);
    applyStyle("display", next ? "none" : "");
  }, [displayNone, applyStyle]);

  const handleOpacityChange = useCallback(
    (v: number) => {
      setOpacity(v);
      applyStyle("opacity", String(v));
    },
    [applyStyle],
  );

  const handleVisibilityToggle = useCallback(() => {
    const next = !visibilityHidden;
    setVisibilityHidden(next);
    applyStyle("visibility", next ? "hidden" : "visible");
  }, [visibilityHidden, applyStyle]);

  // Hover presets
  const applyHoverPreset = useCallback(
    (preset: string) => {
      setHoverPreset((prev) => (prev === preset ? null : preset));
      let transform = "";
      let shadow = "";
      if (preset === "scale") {
        transform = "scale(1.05)";
      } else if (preset === "shadow") {
        shadow = "0 4px 12px rgba(0,0,0,0.15)";
      } else if (preset === "lift") {
        transform = "translateY(-2px)";
        shadow = "0 4px 12px rgba(0,0,0,0.15)";
      }
      setHoverTransform(transform);
      setHoverBoxShadow(shadow);
      injectHoverStyle(transform, shadow, transitionDuration, transitionEasing);
    },
    [injectHoverStyle, transitionDuration, transitionEasing],
  );

  const handleHoverTransformChange = useCallback(
    (v: string) => {
      setHoverTransform(v);
      setHoverPreset(null);
      injectHoverStyle(v, hoverBoxShadow, transitionDuration, transitionEasing);
    },
    [injectHoverStyle, hoverBoxShadow, transitionDuration, transitionEasing],
  );

  const handleHoverBoxShadowChange = useCallback(
    (v: string) => {
      setHoverBoxShadow(v);
      setHoverPreset(null);
      injectHoverStyle(hoverTransform, v, transitionDuration, transitionEasing);
    },
    [injectHoverStyle, hoverTransform, transitionDuration, transitionEasing],
  );

  const handleTransitionDurationChange = useCallback(
    (v: number) => {
      setTransitionDuration(v);
      injectHoverStyle(hoverTransform, hoverBoxShadow, v, transitionEasing);
    },
    [injectHoverStyle, hoverTransform, hoverBoxShadow, transitionEasing],
  );

  const handleTransitionEasingChange = useCallback(
    (v: string) => {
      setTransitionEasing(v);
      injectHoverStyle(hoverTransform, hoverBoxShadow, transitionDuration, v);
    },
    [injectHoverStyle, hoverTransform, hoverBoxShadow, transitionDuration],
  );

  // Close panel — revert unsaved changes
  const handleClose = useCallback(() => {
    revertStyles();
    cleanupHoverStyle();
    setSelectedEl(null);
  }, [revertStyles, cleanupHoverStyle]);

  if (!selectedEl) {
    // Show hover highlight when no element is selected
    return hoverRect ? (
      <div
        className="cs-edit-highlight"
        style={{
          position: "fixed",
          left: hoverRect.x,
          top: hoverRect.y,
          width: hoverRect.width,
          height: hoverRect.height,
          border: "2px dashed #a855f7",
          pointerEvents: "none",
          borderRadius: 2,
          boxSizing: "border-box",
          zIndex: 2147483646,
        }}
      >
        <span className="cs-edit-label" style={{ background: "#a855f7" }}>
          {hoveredRef.current?.tagName.toLowerCase() ?? ""}
        </span>
      </div>
    ) : null;
  }

  const fontOptions = pageFontsRef.current.map((f) => ({ value: f, label: f }));
  const effectivePos = dragPos ?? panelPos;
  const selRect = selectedEl.getBoundingClientRect();

  return (
    <>
      {/* T028: Selection border on styled element */}
      <div
        className="cs-style-selection-border"
        style={{
          position: "fixed",
          top: selRect.top,
          left: selRect.left,
          width: selRect.width,
          height: selRect.height,
          pointerEvents: "none",
          border: "3px solid #4f46e5",
          borderRadius: 2,
          zIndex: 2147483646,
        }}
      />

      <div
        className="cs-style-panel"
        style={{
          position: "fixed",
          top: effectivePos.top,
          left: effectivePos.left,
          pointerEvents: "auto",
          zIndex: 2147483647,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="cs-style-panel-header"
          onPointerDown={onHeaderPointerDown}
          style={{ cursor: dragRef.current.dragging ? "grabbing" : "grab" }}
        >
          <span className="cs-style-panel-title">Style Editor</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              className="cs-style-panel-copystyle"
              onClick={() => {
                // TODO: Wire copy-style flow from CopyStyle.tsx
              }}
              title="Copy style from another element"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy Style</span>
            </button>
            <button
              className="cs-style-panel-apply"
              onClick={handleApply}
              title="Apply styles"
            >
              Apply
            </button>
            <button className="cs-style-panel-close" onClick={handleClose} title="Cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

      <div className="cs-style-panel-body">
        {/* Colors */}
        <Section title="Colors">
          <ColorRow label="Color" value={color} onChange={handleColorChange} />
          <ColorRow
            label="Background"
            value={bgColor}
            onChange={handleBgColorChange}
          />
          <ColorRow
            label="Border Color"
            value={borderColor}
            onChange={handleBorderColorChange}
          />
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <SelectRow
            label="Font Family"
            value={fontFamily}
            options={fontOptions}
            onChange={handleFontFamilyChange}
          />
          <div className="cs-style-row">
            <label className="cs-style-label">Custom</label>
            <input
              type="text"
              className="cs-style-text-input"
              value={customFont}
              placeholder="Custom font..."
              onChange={(e) => handleCustomFontChange(e.target.value)}
            />
          </div>
          <SliderRow
            label="Size"
            value={fontSize}
            min={8}
            max={72}
            suffix="px"
            onChange={handleFontSizeChange}
          />
          <SelectRow
            label="Weight"
            value={fontWeight}
            options={FONT_WEIGHT_OPTIONS}
            onChange={handleFontWeightChange}
          />
          <NumberRow
            label="Line Height"
            value={lineHeight}
            min={0.5}
            max={5}
            step={0.1}
            onChange={handleLineHeightChange}
          />
          <NumberRow
            label="Letter Spacing"
            value={letterSpacing}
            min={-5}
            max={20}
            step={0.5}
            suffix="px"
            onChange={handleLetterSpacingChange}
          />
          <ButtonGroupRow
            label="Transform"
            value={textTransform}
            options={[
              { value: "none", label: "Aa" },
              { value: "uppercase", label: "AA" },
              { value: "lowercase", label: "aa" },
              { value: "capitalize", label: "Ab" },
            ]}
            onChange={handleTextTransformChange}
          />
          <ButtonGroupRow
            label="Align"
            value={textAlign}
            options={[
              { value: "left", label: "\u2190" },
              { value: "center", label: "\u2194" },
              { value: "right", label: "\u2192" },
              { value: "justify", label: "\u2550" },
            ]}
            onChange={handleTextAlignChange}
          />
          <ButtonGroupRow
            label="Decoration"
            value={textDecoration}
            options={[
              { value: "none", label: "None" },
              { value: "underline", label: "U" },
              { value: "line-through", label: "S" },
            ]}
            onChange={handleTextDecorationChange}
          />
        </Section>

        {/* Spacing */}
        <Section title="Spacing" defaultOpen={false}>
          <FourValueRow
            label="Padding"
            values={padding}
            linked={paddingLinked}
            onToggleLink={() => setPaddingLinked((v) => !v)}
            onChange={handlePaddingChange}
          />
          <FourValueRow
            label="Margin"
            values={margin}
            linked={marginLinked}
            onToggleLink={() => setMarginLinked((v) => !v)}
            onChange={handleMarginChange}
          />
        </Section>

        {/* Borders */}
        <Section title="Borders" defaultOpen={false}>
          <NumberRow
            label="Width"
            value={borderWidth}
            min={0}
            max={20}
            suffix="px"
            onChange={handleBorderWidthChange}
          />
          <SelectRow
            label="Style"
            value={borderStyle}
            options={BORDER_STYLE_OPTIONS}
            onChange={handleBorderStyleChange}
          />
          <ColorRow
            label="Color"
            value={borderColor}
            onChange={handleBorderColorChange}
          />
          <FourValueRow
            label="Radius"
            values={borderRadiusValues}
            linked={borderRadiusLinked}
            onToggleLink={() => setBorderRadiusLinked((v) => !v)}
            onChange={handleBorderRadiusChange}
          />
        </Section>

        {/* Visibility */}
        <Section title="Visibility" defaultOpen={false}>
          <div className="cs-style-row">
            <label className="cs-style-label">Display None</label>
            <button
              className={`cs-style-toggle ${displayNone ? "cs-style-toggle-on" : ""}`}
              onClick={handleDisplayToggle}
            >
              {displayNone ? "ON" : "OFF"}
            </button>
          </div>
          <SliderRow
            label="Opacity"
            value={opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={handleOpacityChange}
          />
          <div className="cs-style-row">
            <label className="cs-style-label">Hidden</label>
            <button
              className={`cs-style-toggle ${visibilityHidden ? "cs-style-toggle-on" : ""}`}
              onClick={handleVisibilityToggle}
            >
              {visibilityHidden ? "ON" : "OFF"}
            </button>
          </div>
        </Section>

        {/* Hover Effects */}
        <Section title="Hover Effects" defaultOpen={false}>
          <div className="cs-style-row">
            <label className="cs-style-label">Presets</label>
            <div className="cs-style-btn-group">
              <button
                className={`cs-style-btn-option ${hoverPreset === "scale" ? "cs-style-btn-option-active" : ""}`}
                onClick={() => applyHoverPreset("scale")}
              >
                Scale
              </button>
              <button
                className={`cs-style-btn-option ${hoverPreset === "shadow" ? "cs-style-btn-option-active" : ""}`}
                onClick={() => applyHoverPreset("shadow")}
              >
                Shadow
              </button>
              <button
                className={`cs-style-btn-option ${hoverPreset === "lift" ? "cs-style-btn-option-active" : ""}`}
                onClick={() => applyHoverPreset("lift")}
              >
                Lift
              </button>
            </div>
          </div>
          <div className="cs-style-row">
            <label className="cs-style-label">Transform</label>
            <input
              type="text"
              className="cs-style-text-input"
              value={hoverTransform}
              placeholder="e.g. scale(1.1)"
              onChange={(e) => handleHoverTransformChange(e.target.value)}
            />
          </div>
          <div className="cs-style-row">
            <label className="cs-style-label">Box Shadow</label>
            <input
              type="text"
              className="cs-style-text-input"
              value={hoverBoxShadow}
              placeholder="e.g. 0 4px 12px rgba(0,0,0,0.2)"
              onChange={(e) => handleHoverBoxShadowChange(e.target.value)}
            />
          </div>
          <SliderRow
            label="Duration"
            value={transitionDuration}
            min={0}
            max={1000}
            step={50}
            suffix="ms"
            onChange={handleTransitionDurationChange}
          />
          <SelectRow
            label="Easing"
            value={transitionEasing}
            options={EASING_OPTIONS}
            onChange={handleTransitionEasingChange}
          />
        </Section>
      </div>
    </div>
    </>
  );
}
