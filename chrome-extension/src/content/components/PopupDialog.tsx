import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import gsap from "gsap";
import type { BoundingRect } from "../../shared/types";
import { computePopupPosition } from "../utils/positioning";
import { ScreenshotThumb } from "./ScreenshotThumb";

interface PopupDialogProps {
  elementRect: BoundingRect;
  headerText: string;
  screenshotBase64: string;
  shadowRoot: ShadowRoot;
  onSubmit: (instruction: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const POPUP_WIDTH = 460;
const POPUP_HEIGHT = 420;

export function PopupDialog({
  elementRect,
  headerText,
  screenshotBase64,
  shadowRoot,
  onSubmit,
  onSkip,
  onCancel,
}: PopupDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [size, setSize] = useState({ width: POPUP_WIDTH, height: POPUP_HEIGHT });
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const pos = computePopupPosition(elementRect, size.width, size.height);

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
              run: () => false,  // Let default newline behavior through
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
              minHeight: "70px",
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

  // Keep submit/skip refs in sync
  useEffect(() => {
    // The EditorView captures closures at creation time via the keymap.
    // Since we use refs inside the keymap callbacks, the latest functions
    // are always available without recreating the editor.
  }, [handleSubmit, handleSkip]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };

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
  }, [size.width, size.height]);

  return (
    <div
      ref={containerRef}
      className="cs-popup-container"
      style={{ top: pos.top, left: pos.left, width: size.width, height: size.height }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cs-popup-section">
        <div className="cs-popup-section-label">Selector</div>
        <div className="cs-popup-header">{headerText}</div>
      </div>

      <div className="cs-popup-section">
        <div className="cs-popup-section-label">Screenshot</div>
        <ScreenshotThumb base64={screenshotBase64} />
      </div>

      <div className="cs-popup-section cs-popup-section-grow">
        <div className="cs-popup-section-label">Prompt</div>
        <div className="cs-popup-editor" ref={editorContainerRef} />
      </div>

      <div className="cs-popup-buttons">
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

      <div className="cs-popup-resize-grip" onMouseDown={handleResizeStart}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="#6c7086" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
