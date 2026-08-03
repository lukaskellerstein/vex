export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  tagName: string;
  id: string | null;
  classList: string[];
  attributes: Record<string, string>;
  textContent: string;
  computedStyles: Record<string, string>;
  boundingRect: BoundingRect;
  parentTag: string | null;
  childCount: number;
}

// --- Action Types ---

export type ActionType =
  | "select"
  | "insert"
  | "editText"
  | "delete"
  | "duplicate"
  | "move"
  | "wrap"
  | "resize"
  | "styleChange"
  | "replaceImage"
  | "generateSection"
  | "copyStyle";

interface BaseAction {
  type: ActionType;
  selector: string;
  timestamp: string;
  screenshotBefore: string | null;
  screenshotAfter: string;
}

export interface SelectAction {
  type: "select";
  selector: string;
  tagName: string;
  id: string | null;
  classList: string[];
  textContent: string;
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  boundingRect: BoundingRect;
  parentTag: string | null;
  childCount: number;
  instruction: string;
  screenshot: string;
  url: string;
  accessibilityPath: string | null;
  reactComponent: string | null;
  reactSourceFile: string | null;
}

export interface InsertAction extends BaseAction {
  type: "insert";
  position: "after" | "before" | "firstChild" | "lastChild";
  visualPosition: "above" | "below" | "left" | "right";
  referenceSelector: string;
  content: { tag: string; text: string; attributes: Record<string, string> };
  wasWrapped: boolean;
  prompt?: string;
}

export interface EditTextAction extends BaseAction {
  type: "editText";
  before: string;
  after: string;
}

export interface DeleteAction extends BaseAction {
  type: "delete";
  deletedOuterHTML: string;
}

export interface DuplicateAction extends BaseAction {
  type: "duplicate";
  insertedAfter: string;
}

export interface MoveAction extends BaseAction {
  type: "move";
  parentSelector: string;
  fromIndex: number;
  toIndex: number;
}

export interface WrapAction extends BaseAction {
  type: "wrap";
  wrapper: { tag: string; classList: string[] };
}

export interface ResizeDelta {
  property: string;
  before: string;
  after: string;
  ratio: number;
  description: string;
}

export interface ResizeAction extends BaseAction {
  type: "resize";
  beforeStyles: Record<string, string>;
  afterStyles: Record<string, string>;
  deltas: ResizeDelta[];
}

export interface StyleChange {
  property: string;
  before: string;
  after: string;
  ratio?: number;
  description: string;
}

export interface HoverChange {
  property: string;
  value: string;
  description: string;
}

export interface StyleChangeAction extends BaseAction {
  type: "styleChange";
  changes: StyleChange[];
  hoverChanges?: HoverChange[];
  transition?: { duration: string; easing: string };
}

export interface ReplaceImageAction extends BaseAction {
  type: "replaceImage";
  originalSrc: string;
  method: "upload" | "url" | "generate";
  prompt?: string;
  dimensions: { width: number; height: number };
  generatedUrl?: string;
}

export interface GenerateSectionAction extends BaseAction {
  type: "generateSection";
  position: "after" | "before";
  referenceSelector: string;
  prompt: string;
  styleHint: string;
  generatedHTML: string;
}

export interface CopyStyleAction extends BaseAction {
  type: "copyStyle";
  fromSelector: string;
  toSelector: string;
  copiedProperties: Record<string, string>;
}

export type Action =
  | SelectAction
  | InsertAction
  | EditTextAction
  | DeleteAction
  | DuplicateAction
  | MoveAction
  | WrapAction
  | ResizeAction
  | StyleChangeAction
  | ReplaceImageAction
  | GenerateSectionAction
  | CopyStyleAction;

// --- Modes ---

export type InteractionMode = "idle" | "select" | "edit" | "resize" | "style";

// --- Batch ---

export interface Batch {
  pageUrl: string;
  pageTitle: string;
  actions: Action[];
  timestamp: string;
}

// --- Legacy compat (to be removed in T060) ---

export type Selection = SelectAction;
export type SelectionState = "idle" | "selected" | "inactive";
