import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { placeholder as cmPlaceholder, EditorView, keymap } from "@codemirror/view";
import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingRect } from "../../shared/types";
import { computePopupPosition } from "../utils/positioning";
import { ScreenshotThumb } from "./ScreenshotThumb";

export interface PopupElement {
  label: string;
  text: string;
}

interface PopupDialogProps {
  elementRect: BoundingRect;
  elements: PopupElement[];
  screenshots: string[];
  shadowRoot: ShadowRoot;
  /** True while the user is clicking on the page to add another element. */
  picking: boolean;
  onStartPicking: () => void;
  onStopPicking: () => void;
  onRemoveElement: (index: number) => void;
  onSubmit: (instruction: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const POPUP_WIDTH = 460;
const POPUP_HEIGHT = 420;
// Must match .cs-popup-element line-height and .cs-popup-elements max-height
const ELEMENT_ROW_HEIGHT = 20;
const ELEMENT_LIST_MAX_HEIGHT = 96;
const VIEWPORT_MARGIN = 8;

/** Extra height so each element row after the first does not squeeze the
 *  prompt; stops where the element list starts to scroll. */
function elementListGrowth(count: number): number {
  return Math.min(count * ELEMENT_ROW_HEIGHT, ELEMENT_LIST_MAX_HEIGHT) - ELEMENT_ROW_HEIGHT;
}

export function PopupDialog({
  elementRect,
  elements,
  screenshots,
  shadowRoot,
  picking,
  onStartPicking,
  onStopPicking,
  onRemoveElement,
  onSubmit,
  onSkip,
  onCancel,
}: PopupDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [size, setSize] = useState({ width: POPUP_WIDTH, height: POPUP_HEIGHT });
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(
    null,
  );

  // `size` is what the user dragged to; the element list growth comes on top
  const height = Math.min(
    size.height + elementListGrowth(elements.length),
    window.innerHeight - 2 * VIEWPORT_MARGIN,
  );
  const pos = computePopupPosition(elementRect, size.width, height);

  // GSAP entrance animation
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(containerRef.current, {
        opacity: 0,
        y: 8,
        scale: 0.97,
        duration: 0.2,
        ease: "power2.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = useCallback(() => {
    const text = editorViewRef.current?.state.doc.toString() ?? "";
    onSubmit(text);
  }, [onSubmit]);

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const submitRef = { current: handleSubmit };
    const cancelRef = { current: handleCancel };

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          keymap.of([
            {
              key: "Enter",
              run: () => {
                submitRef.current();
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                cancelRef.current();
                return true;
              },
            },
            {
              key: "Shift-Enter",
              run: () => false, // Let default newline behavior through
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          cmPlaceholder("Describe what should change… (Shift+Enter for newline)"),
          EditorView.theme({
            "&": {
              fontSize: "13px",
              fontFamily: "monospace",
              border: "1px solid #45475a",
              borderRadius: "6px",
              minHeight: "80px",
              flex: "1",
              backgroundColor: "#181825",
            },
            "&.cm-focused": {
              outline: "none",
              borderColor: "#4F46E5",
              boxShadow: "0 0 0 2px rgba(79,70,229,0.15)",
            },
            ".cm-scroller": {
              overflow: "auto",
            },
            ".cm-content": {
              padding: "8px 10px",
              color: "#cdd6f4",
              caretColor: "#cdd6f4",
            },
            ".cm-cursor": {
              borderLeftColor: "#cdd6f4",
            },
            ".cm-activeLine": {
              backgroundColor: "rgba(69, 71, 90, 0.3)",
            },
            ".cm-gutters": {
              backgroundColor: "#181825",
              borderRight: "1px solid #313244",
              color: "#6c7086",
            },
            ".cm-placeholder": {
              color: "#6c7086",
            },
            ".cm-selectionBackground": {
              backgroundColor: "rgba(79, 70, 229, 0.3) !important",
            },
          }),
          EditorView.contentAttributes.of({
            "aria-label": "Instruction editor",
          }),
        ],
      }),
      parent: editorContainerRef.current,
      root: shadowRoot,
    });

    editorViewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [shadowRoot]); // Only re-create if shadowRoot changes

  // Give the prompt back its focus once an element was added or picking ended
  useEffect(() => {
    if (!picking) editorViewRef.current?.focus();
  }, [picking, elements.length]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
      };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dw = ev.clientX - dragRef.current.startX;
        const dh = ev.clientY - dragRef.current.startY;
        setSize({
          width: Math.max(320, dragRef.current.startW + dw),
          height: Math.max(280, dragRef.current.startH + dh),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size.width, size.height],
  );

  const hiddenWhilePicking = picking ? " cs-popup-hidden" : "";
  const canRemove = elements.length > 1;

  return (
    <div
      ref={containerRef}
      className="cs-popup-container"
      style={{
        top: pos.top,
        left: pos.left,
        width: size.width,
        height: picking ? "auto" : height,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {picking && (
        <div className="cs-popup-picking">
          <span>Click an element to add it ({elements.length} selected) · Esc to stop</span>
          <button className="cs-btn cs-btn-add" onClick={onStopPicking}>
            Done
          </button>
        </div>
      )}

      <div className={"cs-popup-section" + hiddenWhilePicking}>
        <div className="cs-popup-section-label">
          {elements.length > 1 ? `Elements (${elements.length})` : "Selector"}
        </div>
        <ul className="cs-popup-elements">
          {elements.map((el, i) => (
            <li key={el.label} className="cs-popup-element">
              <span className="cs-popup-element-label">{el.label}</span>
              <span className="cs-popup-element-text" title={el.text}>
                {el.text}
              </span>
              {canRemove && (
                <button
                  className="cs-popup-element-rm"
                  onClick={() => onRemoveElement(i)}
                  title="Remove element"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="cs-popup-add-element">
          <button onClick={onStartPicking}>+ Add element</button>
          <span>or Shift+click on the page</span>
        </div>
      </div>

      <div className={"cs-popup-section" + hiddenWhilePicking}>
        <div className="cs-popup-section-label">
          {screenshots.length > 1 ? `Screenshots (${screenshots.length})` : "Screenshot"}
        </div>
        <div className="cs-popup-thumbs">
          {screenshots.map((base64) => (
            <ScreenshotThumb key={base64.slice(-32)} base64={base64} />
          ))}
        </div>
      </div>

      <div className={"cs-popup-section cs-popup-section-grow" + hiddenWhilePicking}>
        <div className="cs-popup-section-label">Prompt</div>
        <div className="cs-popup-editor" ref={editorContainerRef} />
      </div>

      <div className={"cs-popup-buttons" + hiddenWhilePicking}>
        <button className="cs-btn cs-btn-cancel" onClick={handleCancel}>
          Cancel
        </button>
        <button className="cs-btn" onClick={handleSkip}>
          Skip
        </button>
        <button className="cs-btn cs-btn-add" onClick={handleSubmit}>
          Add
        </button>
      </div>

      <div className={"cs-popup-resize-grip" + hiddenWhilePicking} onMouseDown={handleResizeStart}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M9 1L1 9M9 5L5 9M9 9L9 9"
            stroke="#6c7086"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
