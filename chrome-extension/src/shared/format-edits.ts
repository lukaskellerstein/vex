import { actionElements, elementLabel } from "./select-elements";
import type { Action, ElementTarget } from "./types";

/** One screenshot of an edit. `path` is set once it was saved as a file. */
export interface ImagePanel {
  edit: number;
  title: string;
  fileName: string;
  base64: string;
  path?: string;
}

export interface PageInfo {
  url: string;
  title: string;
}

const MAX_TEXT = 100;
const MAX_STYLES = 10;
const MAX_HTML = 500;

/** Markdown for a single edit, for pasting into a coding agent. */
export function formatSingleEdit(
  action: Action,
  number: number,
  page: PageInfo,
  panels: ImagePanel[],
): string {
  return [
    "# Visual edit from Vex",
    "",
    "Apply the visual edit below to the code of this app.",
    ...screenshotHint(panels),
    "",
    pageLine(page),
    "",
    ...editSection(action, number, panels),
  ].join("\n");
}

/** Markdown for every edit, for pasting into a coding agent. */
export function formatAllEdits(actions: Action[], page: PageInfo, panels: ImagePanel[]): string {
  const sections = actions.flatMap((action, i) => [
    "",
    ...editSection(
      action,
      i + 1,
      panels.filter((p) => p.edit === i + 1),
    ),
  ]);
  return [
    "# Visual edits from Vex",
    "",
    `Apply the ${actions.length} visual edits below to the code of this app.`,
    ...screenshotHint(panels),
    "",
    pageLine(page),
    ...sections,
  ].join("\n");
}

/** The screenshots of one edit: one per view, or before/after. */
export function editPanels(action: Action, number: number): ImagePanel[] {
  if (action.type === "select") {
    const shots = [action.screenshot, ...(action.extraScreenshots ?? [])].filter(Boolean);
    const multi = shots.length > 1;
    return shots.map((base64, i) => ({
      edit: number,
      title: multi ? `Edit ${number} — view ${i + 1}` : `Edit ${number}`,
      fileName: multi ? `edit-${number}-view-${i + 1}.jpg` : `edit-${number}.jpg`,
      base64,
    }));
  }
  const panels: ImagePanel[] = [];
  if (action.screenshotBefore) {
    panels.push({
      edit: number,
      title: `Edit ${number} — before`,
      fileName: `edit-${number}-before.jpg`,
      base64: action.screenshotBefore,
    });
  }
  if (action.screenshotAfter) {
    panels.push({
      edit: number,
      title: `Edit ${number} — after`,
      fileName: `edit-${number}-after.jpg`,
      base64: action.screenshotAfter,
    });
  }
  return panels;
}

const MARKS_HINT =
  "A dashed outline with a numbered badge marks every element; the numbers match the elements below.";

function screenshotHint(panels: ImagePanel[]): string[] {
  if (panels.length === 0) return [];
  if (panels.every((p) => p.path)) {
    return [
      `Each edit lists its screenshots as image files; open them to see the page. ${MARKS_HINT}`,
    ];
  }
  return [`The attached image holds the screenshots, each under its title. ${MARKS_HINT}`];
}

function pageLine(page: PageInfo): string {
  return page.title ? `**Page**: ${page.title} — ${page.url}` : `**Page**: ${page.url}`;
}

function screenshotLines(panels: ImagePanel[]): string[] {
  if (panels.length === 0) return [];
  if (panels.every((p) => p.path)) {
    return ["", "**Screenshots**:", ...panels.map((p) => `- ${p.title}: \`${p.path}\``)];
  }
  return ["", `**Screenshots**: ${panels.map((p) => `"${p.title}"`).join(", ")}`];
}

function editSection(action: Action, number: number, panels: ImagePanel[]): string[] {
  const lines = [`## Edit ${number} — ${action.type}`, ""];
  const instruction = editInstruction(action);
  if (instruction) lines.push(`**Instruction**: ${instruction}`, "");

  if (action.type === "select") {
    lines.push(...elementsSection(number, actionElements(action)));
  } else {
    lines.push(`**Element**: \`${action.selector}\``, ...actionDetails(action));
  }
  lines.push(...screenshotLines(panels));
  return lines;
}

function editInstruction(action: Action): string {
  if (action.type === "select") return action.instruction.trim();
  if ("prompt" in action && action.prompt) return action.prompt.trim();
  return "";
}

function elementsSection(number: number, elements: ElementTarget[]): string[] {
  const heading = elements.length > 1 ? `**Elements** (${elements.length}):` : "**Element**:";
  const lines = [heading];
  elements.forEach((el, i) => {
    lines.push(`- **${elementLabel(number, i, elements.length)}** \`${el.selector}\``);
    lines.push(...elementDetails(el).map((d) => `  - ${d}`));
  });
  return lines;
}

function elementDetails(el: ElementTarget): string[] {
  const details: string[] = [];
  const classes = el.classList.length > 0 ? ` class="${el.classList.join(" ")}"` : "";
  details.push(
    `Tag: \`<${el.tagName}${classes}>\`` + (el.parentTag ? ` in \`<${el.parentTag}>\`` : ""),
  );
  if (el.textContent) details.push(`Text: \`${truncate(el.textContent, MAX_TEXT)}\``);
  if (el.reactComponent) details.push(`React component: \`${el.reactComponent}\``);
  if (el.reactSourceFile) details.push(`Source file: \`${el.reactSourceFile}\``);
  if (el.accessibilityPath) details.push(`Accessibility path: ${el.accessibilityPath}`);
  const styles = Object.entries(el.computedStyles)
    .filter(([, v]) => v && !["none", "normal", "0px"].includes(v))
    .slice(0, MAX_STYLES)
    .map(([k, v]) => `${k}: ${v}`);
  if (styles.length > 0) details.push(`Current styles: \`${styles.join("; ")}\``);
  return details;
}

function actionDetails(action: Exclude<Action, { type: "select" }>): string[] {
  switch (action.type) {
    case "editText":
      return [`**Text change**: \`${action.before}\` → \`${action.after}\``];
    case "styleChange":
      return [
        "**Style changes**:",
        ...action.changes.map((c) => `  - \`${c.property}\`: \`${c.before}\` → \`${c.after}\``),
        ...(action.hoverChanges?.length
          ? [
              "**Hover state changes**:",
              ...action.hoverChanges.map(
                (h) => `  - \`${h.property}\`: \`${h.value}\` — ${h.description}`,
              ),
            ]
          : []),
        ...(action.transition
          ? [
              `**Transition**: duration=${action.transition.duration}, easing=${action.transition.easing}`,
            ]
          : []),
      ];
    case "resize":
      return [
        "**Resize deltas**:",
        ...action.deltas.map((d) => `  - \`${d.property}\`: \`${d.before}\` → \`${d.after}\``),
      ];
    case "insert":
      return [
        `**Position**: ${action.position} (visually ${action.visualPosition}) relative to \`${action.referenceSelector}\``,
        `**Content**: tag=\`${action.content.tag}\`, text=\`${action.content.text}\``,
      ];
    case "delete":
      return ["**Deleted HTML**:", "```html", truncate(action.deletedOuterHTML, MAX_HTML), "```"];
    case "duplicate":
      return [`**Inserted after**: \`${action.insertedAfter}\``];
    case "move":
      return [
        `**Parent**: \`${action.parentSelector}\``,
        `**Move**: index ${action.fromIndex} → ${action.toIndex}`,
      ];
    case "wrap": {
      const classes = action.wrapper.classList.join(" ");
      return [`**Wrapper**: \`<${action.wrapper.tag}${classes ? ` class="${classes}"` : ""}>\``];
    }
    case "replaceImage":
      return [
        `**Original src**: \`${action.originalSrc}\``,
        `**Method**: ${action.method}`,
        `**Dimensions**: ${action.dimensions.width}x${action.dimensions.height}px`,
        ...(action.generatedUrl ? [`**Generated URL**: \`${action.generatedUrl}\``] : []),
      ];
    case "generateSection":
      return [
        `**Position**: ${action.position} relative to \`${action.referenceSelector}\``,
        ...(action.styleHint ? [`**Style hint**: ${action.styleHint}`] : []),
      ];
    case "copyStyle":
      return [
        `**Copy from**: \`${action.fromSelector}\``,
        `**Apply to**: \`${action.toSelector}\``,
        "**Copied properties**:",
        ...Object.entries(action.copiedProperties).map(([k, v]) => `  - \`${k}\`: \`${v}\``),
      ];
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
