import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { placeholder as cmPlaceholder, EditorView, keymap } from "@codemirror/view";
import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";

interface FollowUpDialogProps {
  agentName: string;
  anchorTop: number;
  anchorLeft: number;
  shadowRoot: ShadowRoot;
  onSubmit: (message: string) => void;
  onCancel: () => void;
}

const DIALOG_WIDTH = 400;
const DIALOG_HEIGHT = 240;

export function FollowUpDialog({
  agentName,
  anchorTop,
  anchorLeft,
  shadowRoot,
  onSubmit,
  onCancel,
}: FollowUpDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);
  onSubmitRef.current = onSubmit;
  onCancelRef.current = onCancel;

  const [size, setSize] = useState({ width: DIALOG_WIDTH, height: DIALOG_HEIGHT });
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(
    null,
  );

  const top = Math.min(anchorTop + 30, window.innerHeight - size.height - 16);
  const left = Math.min(Math.max(16, anchorLeft), window.innerWidth - size.width - 16);

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

  function doSubmit() {
    const text = editorViewRef.current?.state.doc.toString().trim() ?? "";
    if (text) onSubmitRef.current(text);
  }

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          keymap.of([
            {
              key: "Enter",
              run: () => {
                doSubmit();
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                onCancelRef.current();
                return true;
              },
            },
            { key: "Shift-Enter", run: () => false },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          cmPlaceholder("Follow-up message… (Shift+Enter for newline)"),
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
            ".cm-scroller": { overflow: "auto" },
            ".cm-content": { padding: "8px 10px", color: "#cdd6f4", caretColor: "#cdd6f4" },
            ".cm-cursor": { borderLeftColor: "#cdd6f4" },
            ".cm-activeLine": { backgroundColor: "rgba(69, 71, 90, 0.3)" },
            ".cm-gutters": {
              backgroundColor: "#181825",
              borderRight: "1px solid #313244",
              color: "#6c7086",
            },
            ".cm-placeholder": { color: "#6c7086" },
            ".cm-selectionBackground": { backgroundColor: "rgba(79, 70, 229, 0.3) !important" },
          }),
          EditorView.contentAttributes.of({ "aria-label": "Follow-up message editor" }),
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
  }, [shadowRoot]);

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
        setSize({
          width: Math.max(280, dragRef.current.startW + (ev.clientX - dragRef.current.startX)),
          height: Math.max(180, dragRef.current.startH + (ev.clientY - dragRef.current.startY)),
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

  return (
    <div
      ref={containerRef}
      className="cs-popup-container"
      style={{ top, left, width: size.width, height: size.height }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cs-popup-section">
        <div className="cs-popup-section-label">Follow-up to {agentName}</div>
      </div>

      <div className="cs-popup-section cs-popup-section-grow">
        <div className="cs-popup-section-label">Message</div>
        <div className="cs-popup-editor" ref={editorContainerRef} />
      </div>

      <div className="cs-popup-buttons">
        <button className="cs-btn cs-btn-cancel" onClick={() => onCancelRef.current()}>
          Cancel
        </button>
        <button className="cs-btn cs-btn-add" onClick={doSubmit}>
          Send
        </button>
      </div>

      <div className="cs-popup-resize-grip" onMouseDown={handleResizeStart}>
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
