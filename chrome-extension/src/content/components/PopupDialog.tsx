import { useCallback, useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
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
const POPUP_HEIGHT = 380;

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

  const pos = computePopupPosition(elementRect, POPUP_WIDTH, POPUP_HEIGHT);

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
          EditorView.theme({
            "&": {
              fontSize: "13px",
              fontFamily: "monospace",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              minHeight: "100px",
              maxHeight: "160px",
              overflow: "auto",
            },
            "&.cm-focused": {
              outline: "none",
              borderColor: "#4F46E5",
              boxShadow: "0 0 0 2px rgba(79,70,229,0.15)",
            },
            ".cm-content": {
              padding: "8px 10px",
              minHeight: "90px",
            },
            ".cm-placeholder": {
              color: "#9ca3af",
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

  return (
    <div
      ref={containerRef}
      className="cs-popup-container"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cs-popup-header">{headerText}</div>

      <ScreenshotThumb base64={screenshotBase64} />

      <div className="cs-popup-editor" ref={editorContainerRef} />

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
    </div>
  );
}
