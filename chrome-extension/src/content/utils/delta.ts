import type { ResizeDelta } from "../../shared/types";

const UNIT_RE = /^([+-]?\d*\.?\d+)\s*(px|rem|em|%|)$/;

function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(UNIT_RE);
  if (match) return parseFloat(match[1]);
  const num = parseFloat(trimmed);
  return Number.isNaN(num) ? null : num;
}

function roundTo4px(value: number): number {
  return Math.round(value / 4) * 4;
}

function describeRatio(ratio: number): string | null {
  if (ratio >= 0.95 && ratio <= 1.05) return null; // unchanged
  if (ratio < 0.5) return "reduced to less than half";
  if (ratio >= 0.48 && ratio <= 0.52) return "halved";
  if (ratio < 0.95) {
    const pct = Math.round((1 - ratio) * 20) * 5; // round to nearest 5%
    return `reduced by ~${pct}%`;
  }
  if (ratio > 1.05 && ratio < 1.5) {
    const pct = Math.round((ratio - 1) * 20) * 5;
    return `increased by ~${pct}%`;
  }
  if (ratio >= 1.9 && ratio <= 2.1) return "doubled";
  if (ratio > 2.0) return "more than doubled";
  // ratio between 1.5 and 1.9
  const pct = Math.round((ratio - 1) * 20) * 5;
  return `increased by ~${pct}%`;
}

const ROUNDABLE_PROPS = new Set([
  "width",
  "height",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
]);

export function computeDeltas(
  beforeStyles: Record<string, string>,
  afterStyles: Record<string, string>,
): ResizeDelta[] {
  const deltas: ResizeDelta[] = [];

  const allProps = new Set([...Object.keys(beforeStyles), ...Object.keys(afterStyles)]);

  for (const prop of allProps) {
    const before = beforeStyles[prop] ?? "";
    const after = afterStyles[prop] ?? "";
    if (before === after) continue;

    const beforeNum = parseNumeric(before);
    const afterNum = parseNumeric(after);

    if (beforeNum === null || afterNum === null) {
      // Non-numeric change
      deltas.push({
        property: prop,
        before,
        after,
        ratio: 0,
        description: `changed from "${before}" to "${after}"`,
      });
      continue;
    }

    if (beforeNum === 0) {
      if (afterNum === 0) continue;
      const rounded = ROUNDABLE_PROPS.has(prop) ? roundTo4px(afterNum) : afterNum;
      deltas.push({
        property: prop,
        before,
        after: ROUNDABLE_PROPS.has(prop) ? `${rounded}px` : after,
        ratio: Infinity,
        description: `added ${rounded}px (was 0)`,
      });
      continue;
    }

    const ratio = afterNum / beforeNum;
    const description = describeRatio(ratio);
    if (!description) continue; // unchanged

    let targetAfter = after;
    if (ROUNDABLE_PROPS.has(prop)) {
      const rounded = roundTo4px(afterNum);
      targetAfter = `${rounded}px`;
    }

    deltas.push({
      property: prop,
      before,
      after: targetAfter,
      ratio,
      description,
    });
  }

  return deltas;
}

export function isSmallChange(delta: ResizeDelta): boolean {
  return delta.ratio >= 0.95 && delta.ratio <= 1.05;
}
