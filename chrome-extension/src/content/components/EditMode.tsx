import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import type { Action } from "../../shared/types";
import type { NatsClient } from "../hooks/useNatsClient";
import { AGENT_MANAGER_URL } from "../../shared/messages";
import { generateSelector } from "../utils/selector";
import {
  insertElement,
  insertElementHorizontal,
  removeElement,
  cloneElement,
  reorderElement,
  wrapElement,
} from "../utils/dom-ops";
import { captureScreenshot } from "../hooks/useScreenshot";
import { useUndo } from "../hooks/useUndo";

const HOST_ID = "__web-selector-root";

const INSERT_TAGS = ["p", "div", "span", "h2", "h3", "button", "a", "img", "ul"];
const WRAP_TAGS = ["div", "section", "article", "span"];
const STYLE_HINTS = ["match existing", "minimal", "bold", "custom"];

const GENERATION_TIMEOUT_MS = 30_000;

type GenerationStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "timeout"; requestId: string; type: "section" | "image"; prompt: string; context: object; retryFn: () => void };

interface EditModeProps {
  addAction: (action: Action) => void;
  hostElement: HTMLElement;
  natsClient: NatsClient;
  shadowRoot: ShadowRoot;
}

function isOwnElement(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.id === HOST_ID) return true;
    if ((node as HTMLElement).shadowRoot) return true;
    node = node.parentElement;
  }
  return false;
}

async function takeScreenshot(el: Element, hostEl: HTMLElement): Promise<string> {
  try {
    return await captureScreenshot(el, 0, hostEl);
  } catch {
    return "";
  }
}

type VisualPosition = "above" | "below" | "left" | "right";

type PopupKind =
  | { kind: "insert"; visualPosition: VisualPosition; reference: Element }
  | { kind: "wrap"; target: Element }
  | { kind: "section"; position: "before" | "after"; reference: Element }
  | { kind: "imageReplace"; target: HTMLImageElement }
  | { kind: "imageUrl"; target: HTMLImageElement }
  | { kind: "imageGenerate"; target: HTMLImageElement };

export function EditMode({ addAction, hostElement, natsClient, shadowRoot }: EditModeProps) {
  const { pushUndo } = useUndo();

  const [hovered, setHovered] = useState<Element | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoveredRef = useRef<Element | null>(null);
  const [popup, setPopup] = useState<PopupKind | null>(null);
  const [editing, setEditing] = useState<Element | null>(null);
  const editBeforeRef = useRef<string>("");

  // Hover lock: when mouse is over the highlight overlay (buttons, padding zone), keep the current hover
  const overHighlightRef = useRef(false);
  const unhoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state
  const dragSourceRef = useRef<Element | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Insert form state
  const [insertTab, setInsertTab] = useState<"manual" | "prompt">("prompt");
  const [insertTag, setInsertTag] = useState("p");
  const [insertText, setInsertText] = useState("");
  const [insertPrompt, setInsertPrompt] = useState("");
  const insertEditorContainerRef = useRef<HTMLDivElement>(null);
  const insertEditorViewRef = useRef<EditorView | null>(null);
  const [insertPopupSize, setInsertPopupSize] = useState({ width: 300, height: 260 });
  const insertDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Insert prompt CodeMirror editor — create/destroy when prompt tab is shown
  const insertSubmitRef = useRef<(() => void) | null>(null);
  const insertCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!popup || popup.kind !== "insert" || insertTab !== "prompt") {
      if (insertEditorViewRef.current) {
        // Read value before destroying
        setInsertPrompt(insertEditorViewRef.current.state.doc.toString());
        insertEditorViewRef.current.destroy();
        insertEditorViewRef.current = null;
      }
      return;
    }

    // Wait one tick for the container div to mount
    const timer = setTimeout(() => {
      const container = insertEditorContainerRef.current;
      if (!container || insertEditorViewRef.current) return;

      const view = new EditorView({
        state: EditorState.create({
          doc: insertPrompt,
          extensions: [
            keymap.of([
              {
                key: "Enter",
                run: () => {
                  insertSubmitRef.current?.();
                  return true;
                },
              },
              {
                key: "Escape",
                run: () => {
                  insertCancelRef.current?.();
                  return true;
                },
              },
              {
                key: "Shift-Enter",
                run: () => false,
              },
              ...defaultKeymap,
              ...historyKeymap,
            ]),
            history(),
            markdown(),
            syntaxHighlighting(defaultHighlightStyle),
            EditorView.lineWrapping,
            cmPlaceholder("Describe what you want to add… (Shift+Enter for newline)"),
            EditorView.theme({
              "&": {
                fontSize: "13px",
                fontFamily: "monospace",
                border: "1px solid #45475a",
                borderRadius: "6px",
                minHeight: "80px",
                flex: "1",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#181825",
              },
              ".cm-scroller": {
                flex: "1",
                overflow: "auto",
              },
              "&.cm-focused": {
                outline: "none",
                borderColor: "#4F46E5",
                boxShadow: "0 0 0 2px rgba(79,70,229,0.15)",
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
              ".cm-placeholder": {
                color: "#6c7086",
              },
              ".cm-selectionBackground": {
                backgroundColor: "rgba(79, 70, 229, 0.3) !important",
              },
            }),
            EditorView.contentAttributes.of({
              "aria-label": "Insert prompt editor",
            }),
          ],
        }),
        parent: container,
        root: shadowRoot,
      });

      insertEditorViewRef.current = view;
      view.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (insertEditorViewRef.current) {
        setInsertPrompt(insertEditorViewRef.current.state.doc.toString());
        insertEditorViewRef.current.destroy();
        insertEditorViewRef.current = null;
      }
    };
  }, [popup, insertTab, shadowRoot]);

  // Wrap form state
  const [wrapTag, setWrapTag] = useState("div");
  const [wrapClasses, setWrapClasses] = useState("");

  // Section form state
  const [sectionPrompt, setSectionPrompt] = useState("");
  const [sectionStyle, setSectionStyle] = useState("match existing");

  // Image URL state
  const [imageUrl, setImageUrl] = useState("");
  // Image generate prompt state
  const [imagePrompt, setImagePrompt] = useState("");

  // Generation flow state (T043/T044)
  const [genStatus, setGenStatus] = useState<GenerationStatus>({ state: "idle" });
  const genTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genSubIdRef = useRef<string | null>(null);
  const projectId = ""; // placeholder — wired via chrome messaging later

  const clearGenTimer = useCallback(() => {
    if (genTimeoutRef.current !== null) {
      clearTimeout(genTimeoutRef.current);
      genTimeoutRef.current = null;
    }
  }, []);

  const cleanupGenSubscription = useCallback(() => {
    if (genSubIdRef.current) {
      natsClient.unsubscribe(genSubIdRef.current);
      genSubIdRef.current = null;
    }
  }, [natsClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearGenTimer();
      cleanupGenSubscription();
    };
  }, [clearGenTimer, cleanupGenSubscription]);

  // Hover tracking with debounced unhover and highlight lock
  useEffect(() => {
    if (popup || editing) return;

    const clearUnhoverTimer = () => {
      if (unhoverTimerRef.current !== null) {
        clearTimeout(unhoverTimerRef.current);
        unhoverTimerRef.current = null;
      }
    };

    const scheduleUnhover = () => {
      clearUnhoverTimer();
      unhoverTimerRef.current = setTimeout(() => {
        // Only unhover if mouse is NOT over the highlight overlay
        if (!overHighlightRef.current) {
          setHovered(null);
          setHoverRect(null);
          hoveredRef.current = null;
        }
      }, 80);
    };

    const onMouseMove = (e: MouseEvent) => {
      // If mouse is over the highlight overlay (buttons/padding), keep the current hover locked
      if (overHighlightRef.current) {
        clearUnhoverTimer();
        return;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnElement(el)) {
        scheduleUnhover();
        return;
      }
      clearUnhoverTimer();
      hoveredRef.current = el;
      setHovered(el);
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
      clearUnhoverTimer();
      overHighlightRef.current = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [popup, editing]);

  // Text editing via double-click
  useEffect(() => {
    if (popup) return;

    const onDblClick = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnElement(el)) return;
      if (el.children.length > 0 && el.textContent !== (el as HTMLElement).innerText) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      editBeforeRef.current = (el as HTMLElement).innerText || "";
      (el as HTMLElement).contentEditable = "true";
      (el as HTMLElement).focus();
      setEditing(el);
      setHovered(null);
    };

    document.addEventListener("dblclick", onDblClick, true);
    return () => document.removeEventListener("dblclick", onDblClick, true);
  }, [popup]);

  // Finish editing on blur/enter
  useEffect(() => {
    if (!editing) return;

    const el = editing as HTMLElement;
    let finishing = false;

    const finish = async () => {
      if (finishing) return;
      finishing = true;
      el.contentEditable = "false";

      // Strip browser artifacts
      el.querySelectorAll("br").forEach((br) => {
        if (!br.nextSibling && !br.previousSibling) return;
        if (!br.nextSibling) br.remove();
      });
      el.innerHTML = el.innerHTML.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

      const afterText = el.innerText || "";
      const beforeText = editBeforeRef.current;

      if (beforeText !== afterText) {
        const screenshotAfter = await takeScreenshot(el, hostElement);
        const selector = generateSelector(el);

        addAction({
          type: "editText",
          selector,
          timestamp: new Date().toISOString(),
          screenshotBefore: null,
          screenshotAfter,
          before: beforeText,
          after: afterText,
        });

        const savedBefore = beforeText;
        pushUndo(() => {
          el.innerText = savedBefore;
        });
      }

      setEditing(null);
    };

    const onBlur = () => finish();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        finish();
      }
      if (e.key === "Escape") {
        el.innerText = editBeforeRef.current;
        el.contentEditable = "false";
        setEditing(null);
      }
    };

    el.addEventListener("blur", onBlur);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("keydown", onKeyDown);
      // Revert text and disable contentEditable on unmount (e.g. global Escape deactivation)
      if (el.contentEditable === "true") {
        el.innerText = editBeforeRef.current;
        el.contentEditable = "false";
      }
    };
  }, [editing, addAction, hostElement, pushUndo]);

  // Keyboard shortcuts: Delete, Ctrl+D, Ctrl+W
  useEffect(() => {
    if (popup || editing) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const el = hoveredRef.current;
      if (!el || isOwnElement(el)) return;

      // Delete key
      if (e.key === "Delete") {
        e.preventDefault();
        handleDelete(el);
      }

      // Ctrl+D: Duplicate
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        handleDuplicate(el);
      }

      // Ctrl+W: Wrap
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        setWrapTag("div");
        setWrapClasses("");
        setPopup({ kind: "wrap", target: el });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [popup, editing]);

  // Delete handler
  const handleDelete = useCallback(async (el: Element) => {
    const selector = generateSelector(el);
    const screenshotBefore = await takeScreenshot(el, hostElement);
    const deletedHTML = removeElement(el);
    const screenshotAfter = await takeScreenshot(document.body, hostElement);

    addAction({
      type: "delete",
      selector,
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      deletedOuterHTML: deletedHTML,
    });

    const parent = el.parentElement;
    pushUndo(() => {
      const temp = document.createElement("div");
      temp.innerHTML = deletedHTML;
      const restored = temp.firstElementChild;
      if (restored && parent) {
        parent.appendChild(restored);
      }
    });

    setHovered(null);
    setHoverRect(null);
    hoveredRef.current = null;
  }, [addAction, hostElement, pushUndo]);

  // Duplicate handler
  const handleDuplicate = useCallback(async (el: Element) => {
    const selector = generateSelector(el);
    const screenshotBefore = await takeScreenshot(el, hostElement);
    const clone = cloneElement(el);
    const screenshotAfter = await takeScreenshot(clone, hostElement);

    addAction({
      type: "duplicate",
      selector,
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      insertedAfter: selector,
    });

    pushUndo(() => {
      clone.remove();
    });
  }, [addAction, hostElement, pushUndo]);

  // Insert handler — supports all 4 visual directions
  const handleInsert = useCallback(async (
    visualPosition: VisualPosition,
    reference: Element,
    tag: string,
    text: string,
    prompt?: string,
  ) => {
    const refSelector = generateSelector(reference);
    const screenshotBefore = await takeScreenshot(reference, hostElement);

    let newEl: Element;
    let wasWrapped = false;
    let domPosition: "before" | "after";

    if (visualPosition === "above" || visualPosition === "below") {
      domPosition = visualPosition === "above" ? "before" : "after";
      newEl = insertElement(domPosition, reference, tag, text, {});
    } else {
      domPosition = visualPosition === "left" ? "before" : "after";
      const result = insertElementHorizontal(visualPosition, reference, tag, text, {});
      newEl = result.newEl;
      wasWrapped = result.wasWrapped;
    }

    const screenshotAfter = await takeScreenshot(newEl, hostElement);

    addAction({
      type: "insert",
      selector: generateSelector(newEl),
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      position: domPosition,
      visualPosition,
      referenceSelector: refSelector,
      content: { tag, text, attributes: {} },
      wasWrapped,
      ...(prompt ? { prompt } : {}),
    });

    if (wasWrapped) {
      const wrapper = newEl.parentElement!;
      pushUndo(() => {
        const parent = wrapper.parentElement!;
        parent.insertBefore(reference, wrapper);
        wrapper.remove();
      });
    } else {
      pushUndo(() => {
        newEl.remove();
      });
    }

    setPopup(null);
    setInsertTag("p");
    setInsertText("");
    setInsertPrompt("");
  }, [addAction, hostElement, pushUndo]);

  // Wrap handler
  const handleWrap = useCallback(async (
    target: Element,
    tag: string,
    classes: string[],
  ) => {
    const selector = generateSelector(target);
    const screenshotBefore = await takeScreenshot(target, hostElement);
    const wrapper = wrapElement(target, tag, classes);
    const screenshotAfter = await takeScreenshot(wrapper, hostElement);

    addAction({
      type: "wrap",
      selector,
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      wrapper: { tag, classList: classes },
    });

    pushUndo(() => {
      const parent = wrapper.parentElement;
      if (parent) {
        parent.insertBefore(target, wrapper);
        wrapper.remove();
      }
    });

    setPopup(null);
  }, [addAction, hostElement, pushUndo]);

  // Fire a generation request (shared by section + image flows)
  const fireGenerationRequest = useCallback((
    requestId: string,
    type: "section" | "image",
    prompt: string,
    context: object,
    onResult: (data: object) => void,
    onTimeout: () => void,
  ) => {
    // 1. POST to Agent Manager
    fetch(`${AGENT_MANAGER_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, type, prompt, context }),
    }).catch(() => {
      // Fire-and-forget; NATS is the primary channel
    });

    // 2. Publish via NATS
    if (natsClient.connected) {
      natsClient.publish(`vex.generate.request.${projectId}`, {
        requestId,
        projectId,
        type,
        prompt,
        context,
      });
    }

    // 3. Subscribe for result
    cleanupGenSubscription();
    const subId = natsClient.subscribe(
      `vex.generate.result.${requestId}`,
      (data) => {
        clearGenTimer();
        cleanupGenSubscription();
        setGenStatus({ state: "idle" });
        onResult(data);
      },
    );
    genSubIdRef.current = subId;

    // 4. Start timeout
    clearGenTimer();
    setGenStatus({ state: "loading" });
    genTimeoutRef.current = setTimeout(() => {
      cleanupGenSubscription();
      onTimeout();
    }, GENERATION_TIMEOUT_MS);
  }, [natsClient, projectId, clearGenTimer, cleanupGenSubscription]);

  // Section generation handler
  const handleGenerateSection = useCallback(async (
    position: "before" | "after",
    reference: Element,
    prompt: string,
    styleHint: string,
  ) => {
    const requestId = crypto.randomUUID();
    const refSelector = generateSelector(reference);
    const screenshotBefore = await takeScreenshot(reference, hostElement);

    const surroundingHTML = reference.outerHTML.slice(0, 500);
    const rect = reference.getBoundingClientRect();
    const context = {
      pageUrl: location.href,
      surroundingHTML,
      dimensions: { width: rect.width, height: rect.height },
      position,
      styleHint,
    };

    const doRequest = () => {
      fireGenerationRequest(
        requestId,
        "section",
        prompt,
        context,
        (data) => {
          const generatedHTML = (data as { html?: string }).html ?? "";
          if (generatedHTML) {
            const temp = document.createElement("div");
            temp.innerHTML = generatedHTML;
            const fragment = document.createDocumentFragment();
            while (temp.firstChild) fragment.appendChild(temp.firstChild);
            if (position === "before") {
              reference.parentElement?.insertBefore(fragment, reference);
            } else {
              reference.parentElement?.insertBefore(fragment, reference.nextSibling);
            }
          }

          addAction({
            type: "generateSection",
            selector: refSelector,
            timestamp: new Date().toISOString(),
            screenshotBefore,
            screenshotAfter: screenshotBefore,
            position,
            referenceSelector: refSelector,
            prompt,
            styleHint,
            generatedHTML,
          });
        },
        () => {
          setGenStatus({
            state: "timeout",
            requestId,
            type: "section",
            prompt,
            context,
            retryFn: doRequest,
          });
        },
      );
    };

    doRequest();
    setSectionPrompt("");
    setSectionStyle("match existing");
  }, [addAction, hostElement, fireGenerationRequest]);

  // Image replace handlers
  const handleImageUpload = useCallback((target: HTMLImageElement) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const originalSrc = target.src;
        const selector = generateSelector(target);
        const screenshotBefore = await takeScreenshot(target, hostElement);
        const dims = { width: target.naturalWidth, height: target.naturalHeight };

        target.src = dataUrl;
        const screenshotAfter = await takeScreenshot(target, hostElement);

        addAction({
          type: "replaceImage",
          selector,
          timestamp: new Date().toISOString(),
          screenshotBefore,
          screenshotAfter,
          originalSrc,
          method: "upload",
          dimensions: dims,
        });

        pushUndo(() => {
          target.src = originalSrc;
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
    setPopup(null);
  }, [addAction, hostElement, pushUndo]);

  const handleImageUrl = useCallback(async (target: HTMLImageElement, url: string) => {
    const originalSrc = target.src;
    const selector = generateSelector(target);
    const screenshotBefore = await takeScreenshot(target, hostElement);
    const dims = { width: target.naturalWidth, height: target.naturalHeight };

    target.src = url;
    const screenshotAfter = await takeScreenshot(target, hostElement);

    addAction({
      type: "replaceImage",
      selector,
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      originalSrc,
      method: "url",
      dimensions: dims,
    });

    pushUndo(() => {
      target.src = originalSrc;
    });

    setPopup(null);
    setImageUrl("");
  }, [addAction, hostElement, pushUndo]);

  const handleImageGenerate = useCallback(async (target: HTMLImageElement, prompt: string) => {
    const requestId = crypto.randomUUID();
    const originalSrc = target.src;
    const selector = generateSelector(target);
    const screenshotBefore = await takeScreenshot(target, hostElement);
    const dims = { width: target.naturalWidth, height: target.naturalHeight };

    const context = {
      pageUrl: location.href,
      surroundingHTML: target.parentElement?.innerHTML?.slice(0, 500) ?? "",
      dimensions: dims,
    };

    const doRequest = () => {
      fireGenerationRequest(
        requestId,
        "image",
        prompt,
        context,
        (data) => {
          const generatedUrl = (data as { url?: string }).url ?? "";
          if (generatedUrl) {
            target.src = generatedUrl;
          }

          addAction({
            type: "replaceImage",
            selector,
            timestamp: new Date().toISOString(),
            screenshotBefore,
            screenshotAfter: screenshotBefore,
            originalSrc,
            method: "generate",
            prompt,
            dimensions: dims,
            generatedUrl: generatedUrl || undefined,
          });

          pushUndo(() => {
            target.src = originalSrc;
          });
        },
        () => {
          setGenStatus({
            state: "timeout",
            requestId,
            type: "image",
            prompt,
            context,
            retryFn: doRequest,
          });
        },
      );
    };

    doRequest();
    setPopup(null);
    setImagePrompt("");
  }, [addAction, hostElement, pushUndo, fireGenerationRequest]);

  // Drag handlers
  const onDragStart = useCallback((e: React.DragEvent, el: Element) => {
    dragSourceRef.current = el;
    (el as HTMLElement).style.opacity = "0.4";
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const source = dragSourceRef.current;
    if (!source) return;
    (source as HTMLElement).style.opacity = "";

    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    if (!dropTarget || !source.parentElement || isOwnElement(dropTarget)) return;

    const parent = source.parentElement;
    const siblings = Array.from(parent.children);
    const fromIndex = siblings.indexOf(source);
    const toIndex = siblings.indexOf(dropTarget);

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const parentSelector = generateSelector(parent);
    const selector = generateSelector(source);
    const screenshotBefore = await takeScreenshot(parent, hostElement);

    reorderElement(parent, fromIndex, toIndex);

    const screenshotAfter = await takeScreenshot(parent, hostElement);

    addAction({
      type: "move",
      selector,
      timestamp: new Date().toISOString(),
      screenshotBefore,
      screenshotAfter,
      parentSelector,
      fromIndex,
      toIndex,
    });

    pushUndo(() => {
      reorderElement(parent, toIndex, fromIndex);
    });

    dragSourceRef.current = null;
    setDragOverIndex(null);
  }, [addAction, hostElement, pushUndo]);

  const onDragEnd = useCallback(() => {
    if (dragSourceRef.current) {
      (dragSourceRef.current as HTMLElement).style.opacity = "";
    }
    dragSourceRef.current = null;
    setDragOverIndex(null);
  }, []);

  // Make hovered elements draggable
  useEffect(() => {
    if (!hovered || popup || editing || isOwnElement(hovered)) return;
    const el = hovered as HTMLElement;
    const wasDraggable = el.draggable;
    el.draggable = true;

    const handleDragStart = (e: DragEvent) => {
      dragSourceRef.current = el;
      el.style.opacity = "0.4";
      e.dataTransfer!.effectAllowed = "move";
    };

    const handleDragEnd = () => {
      el.style.opacity = "";
      dragSourceRef.current = null;
    };

    el.addEventListener("dragstart", handleDragStart);
    el.addEventListener("dragend", handleDragEnd);

    return () => {
      el.draggable = wasDraggable;
      el.removeEventListener("dragstart", handleDragStart);
      el.removeEventListener("dragend", handleDragEnd);
    };
  }, [hovered, popup, editing]);

  // Drop zone on document
  useEffect(() => {
    if (!dragSourceRef.current) return;

    const onDragOverDoc = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };

    const onDropDoc = async (e: DragEvent) => {
      e.preventDefault();
      const source = dragSourceRef.current;
      if (!source) return;
      (source as HTMLElement).style.opacity = "";

      const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
      if (!dropTarget || !source.parentElement || isOwnElement(dropTarget)) return;

      // Find sibling relationship
      const parent = source.parentElement;
      const siblings = Array.from(parent.children);
      const fromIndex = siblings.indexOf(source);

      let toIndex = -1;
      let current: Element | null = dropTarget;
      while (current && current !== parent) {
        const idx = siblings.indexOf(current);
        if (idx !== -1) { toIndex = idx; break; }
        current = current.parentElement;
      }

      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const parentSelector = generateSelector(parent);
      const selector = generateSelector(source);
      const screenshotBefore = await takeScreenshot(parent, hostElement);

      reorderElement(parent, fromIndex, toIndex);

      const screenshotAfter = await takeScreenshot(parent, hostElement);

      addAction({
        type: "move",
        selector,
        timestamp: new Date().toISOString(),
        screenshotBefore,
        screenshotAfter,
        parentSelector,
        fromIndex,
        toIndex,
      });

      pushUndo(() => {
        reorderElement(parent, toIndex, fromIndex);
      });

      dragSourceRef.current = null;
    };

    document.addEventListener("dragover", onDragOverDoc, true);
    document.addEventListener("drop", onDropDoc, true);
    return () => {
      document.removeEventListener("dragover", onDragOverDoc, true);
      document.removeEventListener("drop", onDropDoc, true);
    };
  }, [addAction, hostElement, pushUndo]);

  // Click to prevent default in edit mode
  useEffect(() => {
    if (popup || editing) return;

    const onClick = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnElement(el)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [popup, editing]);

  // Render popup
  const renderPopup = () => {
    if (!popup) return null;

    const popupStyle: React.CSSProperties = {
      position: "fixed",
      zIndex: 2147483647,
      background: "#1e1e2e",
      border: "1px solid #313244",
      borderRadius: "8px",
      padding: "12px",
      color: "#cdd6f4",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "12px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      pointerEvents: "auto",
    };

    if (popup.kind === "insert") {
      const ref = popup.reference;
      const rect = ref.getBoundingClientRect();
      const vp = popup.visualPosition;
      const popupTop = vp === "above" ? rect.top - 10
        : vp === "below" ? rect.bottom + 10
        : rect.top;
      const popupLeft = vp === "left" ? rect.left - insertPopupSize.width - 10
        : vp === "right" ? rect.right + 10
        : rect.left;

      const tabStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: "5px 0",
        background: active ? "#4f46e5" : "transparent",
        color: active ? "#fff" : "#a6adc8",
        border: "none",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      });

      const handlePromptSubmit = () => {
        const text = insertEditorViewRef.current?.state.doc.toString().trim() ?? "";
        if (text) handleInsert(vp, ref, "div", "", text);
      };
      const handlePromptCancel = () => setPopup(null);

      // Keep refs in sync for CodeMirror keymap
      insertSubmitRef.current = handlePromptSubmit;
      insertCancelRef.current = handlePromptCancel;

      const handleInsertResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        insertDragRef.current = { startX: e.clientX, startY: e.clientY, startW: insertPopupSize.width, startH: insertPopupSize.height };
        const onMove = (ev: MouseEvent) => {
          if (!insertDragRef.current) return;
          setInsertPopupSize({
            width: Math.max(260, insertDragRef.current.startW + (ev.clientX - insertDragRef.current.startX)),
            height: Math.max(200, insertDragRef.current.startH + (ev.clientY - insertDragRef.current.startY)),
          });
        };
        const onUp = () => {
          insertDragRef.current = null;
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };

      return (
        <div
          style={{
            ...popupStyle,
            left: popupLeft,
            top: popupTop,
            width: insertTab === "prompt" ? insertPopupSize.width : undefined,
            height: insertTab === "prompt" ? insertPopupSize.height : undefined,
            minWidth: 260,
            display: "flex",
            flexDirection: "column",
          }}
          className="cs-edit-popup"
        >
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Insert {vp}</div>
          {/* Tab toggle */}
          <div style={{ display: "flex", gap: 2, background: "#313244", borderRadius: 4, padding: 2, marginBottom: 8 }}>
            <button style={tabStyle(insertTab === "prompt")} onClick={() => setInsertTab("prompt")}>Prompt</button>
            <button style={tabStyle(insertTab === "manual")} onClick={() => setInsertTab("manual")}>Manual</button>
          </div>

          {insertTab === "manual" ? (
            <>
              <select
                value={insertTag}
                onChange={(e) => setInsertTag(e.target.value)}
                style={selectStyle}
              >
                {INSERT_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                placeholder="Text content..."
                value={insertText}
                onChange={(e) => setInsertText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInsert(vp, ref, insertTag, insertText);
                  if (e.key === "Escape") setPopup(null);
                }}
                autoFocus
                style={{ ...inputStyle, marginTop: 6 }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setPopup(null)} style={btnCancelStyle}>Cancel</button>
                <button onClick={() => handleInsert(vp, ref, insertTag, insertText)} style={btnPrimaryStyle}>Insert</button>
              </div>
            </>
          ) : (
            <>
              <div ref={insertEditorContainerRef} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={handlePromptCancel} style={btnCancelStyle}>Cancel</button>
                <button onClick={handlePromptSubmit} style={btnPrimaryStyle}>Insert</button>
              </div>
            </>
          )}
          {/* Resize grip — only in prompt tab */}
          {insertTab === "prompt" && (
            <div
              onMouseDown={handleInsertResize}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                cursor: "nwse-resize",
                padding: 6,
                opacity: 0.5,
                lineHeight: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="#6c7086" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    if (popup.kind === "wrap") {
      const rect = popup.target.getBoundingClientRect();
      return (
        <div style={{ ...popupStyle, left: rect.left, top: rect.top - 10, minWidth: 240 }} className="cs-edit-popup">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Wrap element</div>
          <select
            value={wrapTag}
            onChange={(e) => setWrapTag(e.target.value)}
            style={selectStyle}
          >
            {WRAP_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="text"
            placeholder="CSS classes (space-separated)"
            value={wrapClasses}
            onChange={(e) => setWrapClasses(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleWrap(popup.target, wrapTag, wrapClasses.split(/\s+/).filter(Boolean));
              if (e.key === "Escape") setPopup(null);
            }}
            autoFocus
            style={{ ...inputStyle, marginTop: 6 }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setPopup(null)} style={btnCancelStyle}>Cancel</button>
            <button onClick={() => handleWrap(popup.target, wrapTag, wrapClasses.split(/\s+/).filter(Boolean))} style={btnPrimaryStyle}>Wrap</button>
          </div>
        </div>
      );
    }

    if (popup.kind === "section") {
      const rect = popup.reference.getBoundingClientRect();
      const top = popup.position === "before" ? rect.top - 10 : rect.bottom + 10;
      const isGenerating = genStatus.state === "loading";
      return (
        <div style={{ ...popupStyle, left: rect.left, top, minWidth: 320 }} className="cs-edit-popup">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Generate Section</div>
          {isGenerating ? (
            <div style={{ padding: "12px 0", textAlign: "center", color: "#a6adc8" }}>Generating...</div>
          ) : (
            <>
              <textarea
                placeholder="Describe the section you want..."
                value={sectionPrompt}
                onChange={(e) => setSectionPrompt(e.target.value)}
                autoFocus
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              />
              <select
                value={sectionStyle}
                onChange={(e) => setSectionStyle(e.target.value)}
                style={{ ...selectStyle, marginTop: 6 }}
              >
                {STYLE_HINTS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setPopup(null)} style={btnCancelStyle}>Cancel</button>
                <button
                  onClick={() => handleGenerateSection(popup.position, popup.reference, sectionPrompt, sectionStyle)}
                  disabled={!sectionPrompt.trim()}
                  style={btnPrimaryStyle}
                >
                  Generate
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    if (popup.kind === "imageReplace") {
      const rect = popup.target.getBoundingClientRect();
      return (
        <div style={{ ...popupStyle, left: rect.left, top: rect.top - 10, minWidth: 200 }} className="cs-edit-popup">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Replace Image</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => handleImageUpload(popup.target)} style={btnOptionStyle}>Upload File</button>
            <button onClick={() => { setPopup({ kind: "imageUrl", target: popup.target }); setImageUrl(""); }} style={btnOptionStyle}>Paste URL</button>
            <button onClick={() => { setPopup({ kind: "imageGenerate", target: popup.target }); setImagePrompt(""); }} style={btnOptionStyle}>Generate</button>
          </div>
          <button onClick={() => setPopup(null)} style={{ ...btnCancelStyle, marginTop: 8, width: "100%" }}>Cancel</button>
        </div>
      );
    }

    if (popup.kind === "imageUrl") {
      const rect = popup.target.getBoundingClientRect();
      return (
        <div style={{ ...popupStyle, left: rect.left, top: rect.top - 10, minWidth: 280 }} className="cs-edit-popup">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Image URL</div>
          <input
            type="text"
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && imageUrl.trim()) handleImageUrl(popup.target, imageUrl.trim());
              if (e.key === "Escape") setPopup(null);
            }}
            autoFocus
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setPopup(null)} style={btnCancelStyle}>Cancel</button>
            <button onClick={() => handleImageUrl(popup.target, imageUrl.trim())} disabled={!imageUrl.trim()} style={btnPrimaryStyle}>Apply</button>
          </div>
        </div>
      );
    }

    if (popup.kind === "imageGenerate") {
      const rect = popup.target.getBoundingClientRect();
      const isGenerating = genStatus.state === "loading";
      return (
        <div style={{ ...popupStyle, left: rect.left, top: rect.top - 10, minWidth: 280 }} className="cs-edit-popup">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Generate Image</div>
          {isGenerating ? (
            <div style={{ padding: "12px 0", textAlign: "center", color: "#a6adc8" }}>Generating...</div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Describe the image..."
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && imagePrompt.trim()) handleImageGenerate(popup.target, imagePrompt.trim());
                  if (e.key === "Escape") setPopup(null);
                }}
                autoFocus
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setPopup(null)} style={btnCancelStyle}>Cancel</button>
                <button onClick={() => handleImageGenerate(popup.target, imagePrompt.trim())} disabled={!imagePrompt.trim()} style={btnPrimaryStyle}>Generate</button>
              </div>
            </>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="cs-overlay" style={{ pointerEvents: popup ? "auto" : "none" }}>
      {/* Hover highlight — pointer-events: none so elementFromPoint always sees page elements.
           Buttons use pointer-events: auto + expanded ::before hit areas (CSS) + onMouseEnter lock
           so they stay reachable without blocking child-element selection. */}
      {hoverRect && hovered && !popup && !editing && (
        <div
          className="cs-edit-highlight"
          style={{
            position: "fixed",
            left: hoverRect.x,
            top: hoverRect.y,
            width: hoverRect.width,
            height: hoverRect.height,
            border: "2px dashed #3b82f6",
            cursor: "crosshair",
            pointerEvents: "none",
            borderRadius: 2,
            boxSizing: "border-box",
          }}
        >
          {/* Label */}
          <span className="cs-edit-label">
            {hovered.tagName.toLowerCase()}
            {hovered.id ? `#${hovered.id}` : ""}
            {hovered.classList.length > 0 ? `.${hovered.classList[0]}` : ""}
          </span>

          {/* Delete button */}
          <button
            className="cs-edit-delete-btn"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={() => { overHighlightRef.current = true; }}
            onMouseLeave={() => { overHighlightRef.current = false; }}
            onClick={(e) => { e.stopPropagation(); handleDelete(hovered); }}
            title="Delete element"
          >
            x
          </button>

          {/* "+" insertion handles — all 4 directions on every element */}
          <button
            className="cs-edit-insert-btn cs-edit-insert-top"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={() => { overHighlightRef.current = true; }}
            onMouseLeave={() => { overHighlightRef.current = false; }}
            onClick={(e) => {
              e.stopPropagation();
              setInsertTag("p");
              setInsertText("");
              setInsertPrompt("");
              setInsertTab("prompt");
              setPopup({ kind: "insert", visualPosition: "above", reference: hovered });
            }}
            title="Insert above"
          >
            +
          </button>
          <button
            className="cs-edit-insert-btn cs-edit-insert-bottom"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={() => { overHighlightRef.current = true; }}
            onMouseLeave={() => { overHighlightRef.current = false; }}
            onClick={(e) => {
              e.stopPropagation();
              setInsertTag("p");
              setInsertText("");
              setInsertPrompt("");
              setInsertTab("prompt");
              setPopup({ kind: "insert", visualPosition: "below", reference: hovered });
            }}
            title="Insert below"
          >
            +
          </button>
          <button
            className="cs-edit-insert-btn cs-edit-insert-left"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={() => { overHighlightRef.current = true; }}
            onMouseLeave={() => { overHighlightRef.current = false; }}
            onClick={(e) => {
              e.stopPropagation();
              setInsertTag("p");
              setInsertText("");
              setInsertPrompt("");
              setInsertTab("prompt");
              setPopup({ kind: "insert", visualPosition: "left", reference: hovered });
            }}
            title="Insert left"
          >
            +
          </button>
          <button
            className="cs-edit-insert-btn cs-edit-insert-right"
            style={{ pointerEvents: "auto" }}
            onMouseEnter={() => { overHighlightRef.current = true; }}
            onMouseLeave={() => { overHighlightRef.current = false; }}
            onClick={(e) => {
              e.stopPropagation();
              setInsertTag("p");
              setInsertText("");
              setInsertPrompt("");
              setInsertTab("prompt");
              setPopup({ kind: "insert", visualPosition: "right", reference: hovered });
            }}
            title="Insert right"
          >
            +
          </button>

          {/* Image overlay buttons */}
          {hovered.tagName === "IMG" && (
            <div className="cs-edit-img-overlay" style={{ pointerEvents: "auto" }}>
              <button
                className="cs-edit-img-btn"
                onMouseEnter={() => { overHighlightRef.current = true; }}
                onMouseLeave={() => { overHighlightRef.current = false; }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPopup({ kind: "imageReplace", target: hovered as HTMLImageElement });
                }}
                title="Replace image"
              >
                Replace
              </button>
            </div>
          )}
        </div>
      )}

      {/* Popups */}
      {renderPopup()}

      {/* Generation timeout overlay */}
      {genStatus.state === "timeout" && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2147483647,
            background: "#1e1e2e",
            border: "1px solid #313244",
            borderRadius: 8,
            padding: 20,
            color: "#cdd6f4",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: 13,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxWidth: 380,
            textAlign: "center",
            pointerEvents: "auto",
          }}
        >
          <div style={{ marginBottom: 12, color: "#f38ba8", fontWeight: 600 }}>
            Agent didn't respond. Make sure Vex is running and an agent is connected.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => {
                const { retryFn } = genStatus as Extract<GenerationStatus, { state: "timeout" }>;
                retryFn();
              }}
              style={btnPrimaryStyle}
            >
              Retry
            </button>
            <button
              onClick={() => {
                clearGenTimer();
                cleanupGenSubscription();
                setGenStatus({ state: "idle" });
                setPopup(null);
              }}
              style={btnCancelStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline style constants for popup form elements
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "#313244",
  border: "1px solid #45475a",
  borderRadius: 4,
  color: "#cdd6f4",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "5px 14px",
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnCancelStyle: React.CSSProperties = {
  padding: "5px 14px",
  background: "transparent",
  color: "#a6adc8",
  border: "1px solid #45475a",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnOptionStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#313244",
  color: "#cdd6f4",
  border: "1px solid #45475a",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left" as const,
};
