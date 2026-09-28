# Spec 010: Multi-Element Selection and Clipboard Handoff in the Chrome Extension

## Problem

In Select mode every click opens the prompt popup for exactly one element, so a change that spans several elements ("make these three cards the same height") has to be split into separate prompts. Also, the only way to hand collected edits to an agent is **Send to project**, which needs the Vex Electron app and the agent-orchestrator running. Users who already work in their own Claude Code session in a terminal have no way to take the edits there.

## Goal

1. Select several elements and write **one** prompt for all of them.
2. Copy edits to the clipboard — one at a time or all at once — as text plus a screenshot, ready to paste into any Claude Code session.
3. Keep **Send to project** working for multi-element edits.

## Design

### Multi-select UX — the open popup is the group

- A plain click opens the popup, as before.
- While the popup is open, **Shift+click** on the page adds an element to the group; Shift+click on an element already in the group removes it. Holding Shift shows the hover highlight.
- **"+ Add element"** in the popup enters *picking* mode: the popup collapses to a bar `Click an element to add it (N selected) · Esc to stop` with a **Done** button, and every plain click adds an element. **Escape** during picking only ends picking; outside picking it still closes Vex.
- The popup lists the elements with a × each (shown when there are two or more). It grows by one row (20 px) per extra element until the list scrolls, on top of any size the user dragged, and never beyond the window. It sits below the element if it fits, else above, else on the roomier side kept on screen.
- Labels: a single element stays `N`; a group uses `N.1`, `N.2`, … — the same label in the popup list, on the pending green outlines, on the persistent action markers, and on the screenshot badges (pill-shaped for longer labels).

Alternatives rejected: hold ⌥/Shift and open the popup on key release (hard to discover, surprising); a separate "Multi-select" toolbar mode (one more mode, you must choose it before you know you need it).

### Screenshots — one per view

Every element of an edit is outlined, with its badge, on exactly one screenshot (a *view*):

- Elements that are visible together (same scroll position) share one view.
- An element reached by scrolling gets another view; there can be as many views as needed.
- On each **add**, the current viewport is captured once and every group element visible in it is marked there. Those elements leave their older views; an older view left with no elements is dropped. So scrolling back up and adding one more card produces one fresh top view that holds all visible cards.
- On **remove**, nothing is captured: the element's mark disappears and the rest are renumbered (`1.3` → `1.2`). This works because a view stores the *raw* capture plus each element's rect at capture time, and badges are drawn at render time (`content/utils/group-views.ts`).
- Views are ordered so view 1 holds element 1, and so on. Each element's `boundingRect` is the rect on its view.
- An SPA route change keeps the views of elements that left the DOM; the popup closes only when every element of the group is gone. (A full page reload loses the open popup, so a group cannot span reloads.)
- The popup shows one thumbnail per view (`Screenshots (N)`); the pending green outlines follow their elements while the page scrolls.

### Data model

- New `ElementTarget` (selector, tag, id, classes, text, attributes, computed styles, bounding rect, parent tag, child count, accessibility path, React component, React source file).
- `SelectAction extends ElementTarget` and gains optional `extraElements?: ElementTarget[]` and `extraScreenshots?: string[]`. The first element and view 1 stay in the top-level fields (`screenshot`), so every existing single-element consumer keeps working.
- Backend: `ActionData.extra_elements: list[ElementTarget] | None` and `extra_screenshots: list[str] | None` (Pydantic, camelCase aliases). Extra views are saved as files like any screenshot; their paths go into the action's JSON `data` column as `extra_screenshot_paths` — **no DB schema change, no migration**. View 1 uses the existing `screenshot_before_path` slot. Deleting a batch deletes the extra view files too.

### Clipboard handoff

- A copy icon on every row of the extension popup's action list, and a **Copy all** button next to Clear. The button shows ✓ / "Copied" (or "Copy failed") for 1.5 s.
- One `ClipboardItem` with two types:
  - `text/plain` — markdown: page title + URL, then per edit the instruction, each element (label, selector, tag + classes, parent, text, React component, source file, accessibility path, up to 10 key styles) or, for Edit/Resize/Style actions, the action-specific details (text change, style/resize deltas, move, wrap, …), and the titles of its screenshots.
  - `image/png` — all screenshots of the copied edits composed into **one** titled grid (`Edit N`, `Edit N — view k` for a multi-view group, or `Edit N — before` / `Edit N — after`; 1 column for one panel, 2 columns otherwise, panels scaled to max 1200 px wide).
- **Screenshots as files.** A plain-text paste (`Cmd+V`, or into an editor) carries no image, so on copy the service worker saves each screenshot with `chrome.downloads` to `~/Downloads/vex/clipboard/<YYYY-MM-DD>/<HHMMSS>/edit-N[-view-k].jpg` and the text lists the absolute path of each, under its title ("Edit 2 — view 1"); the agent opens them with its Read tool. Chrome lets an extension write only inside Downloads, so `~/.vex/` is not reachable without a native helper, and `chrome.downloads` rejects a folder name that starts with a dot ("Invalid filename"), so it is `vex`, not `.vex`.
  - The same image copied again reuses its file (SHA-1 cache in `chrome.storage.session`).
  - Files older than 14 days are deleted on the next copy (`downloads.search` by folder pattern + `removeFile`); files whose download-history entry was cleared are no longer tracked.
  - The download bubble is switched off while saving (`downloads.setUiOptions`).
  - If saving fails, the text falls back to "the attached image" and the PNG below.
  - New permissions: `downloads`, `downloads.ui` (background/screenshot-files.ts).
- The composed PNG stays on the clipboard as well (`Ctrl+V` in Claude Code): a clipboard entry holds one text and one image at most, and Chrome writes a single item.
- The image is passed to `ClipboardItem` as a promise so `clipboard.write()` runs inside the click's user activation.

### Send to project

`_build_prompt` in the agent-orchestrator renders a group as an action line `[select] 3 elements: …` that lists every selector, followed by an `## Elements` section with one `### Element 1.k` block per element (same context lines as the single-element `## Element Context`). The screenshot list names every view (`View 1`, `View 2`, …) when there is more than one. `_action_to_dict` propagates `extra_elements` and `extra_screenshot_paths`. Single-element prompts are unchanged.

## Phases

1. Shared types + label helpers (`ElementTarget`, `extraElements`, `actionElements`, `elementLabel`)
2. Content script: pending group, Shift+click, picking mode, one screenshot per view, numbered overlays
3. Markdown formatter + clipboard composer + popup copy UI
4. Backend model + prompt builder + tests

## Files

| File | Change |
|------|--------|
| `chrome-extension/src/shared/types.ts` | `ElementTarget`; `SelectAction.extraElements` |
| `chrome-extension/src/shared/select-elements.ts` | **New** — `actionElements`, `elementLabel` |
| `chrome-extension/src/shared/format-edits.ts` | **New** — markdown for one edit / all edits + screenshot panels |
| `chrome-extension/src/content/App.tsx` | Pending group, Shift+click, picking, Escape handling |
| `chrome-extension/src/content/components/PopupDialog.tsx` | Element list, "+ Add element", picking bar |
| `chrome-extension/src/content/components/Overlay.tsx` | Labelled pending outlines that follow scrolling; a marker per group element |
| `chrome-extension/src/content/hooks/useScreenshot.ts` | `captureViewport` (raw) + `renderMarks` (badges) |
| `chrome-extension/src/content/utils/group-views.ts` | **New** — assign elements to views, prune, render |
| `chrome-extension/src/content/hooks/useHoverHighlight.ts` | Takes an `enabled` flag instead of the selection state |
| `chrome-extension/src/content/utils/metadata.ts` | `collectElementTarget` replaces `collectMetadata` |
| `chrome-extension/src/content/styles/content.css` | Popup group styles, pill badge |
| `chrome-extension/src/popup/clipboard.ts` | **New** — compose PNG grid, write `ClipboardItem` |
| `chrome-extension/src/popup/useCopyFeedback.ts` | **New** — copy button state |
| `chrome-extension/src/popup/App.tsx` | Row copy icon, `+N` badge, element list and all views in row detail |
| `chrome-extension/src/popup/components/Controls.tsx` | Copy all button |
| `chrome-extension/src/popup/styles/popup.css` | Copy button styles |
| `agent-orchestrator/.../models/batch.py` | `ElementTarget`; `ActionData.extra_elements`, `extra_screenshots` |
| `agent-orchestrator/.../api/batches.py` | Save extra views to files; delete them with the batch |
| `agent-orchestrator/.../services/batch_processor.py` | Group-aware prompt, view list; propagate `extra_elements`, `extra_screenshot_paths` |
| `agent-orchestrator/tests/test_multi_element_select.py` | **New** — parsing, prompt, and save/delete tests |

## Verification

- `npm run typecheck` in `chrome-extension/`; `uv run pytest` in `agent-orchestrator/` (5 new tests, including a submit → files saved → delete → files removed round trip on a temporary DB).
- Headless Playwright run against the built extension on a test page: popup opens, Shift+click adds and removes, picking mode adds, Escape ends picking only, stored action has `extraElements`, group screenshot exists, popup row shows `+2`, row copy writes `text/plain` + `image/png`, Copy all contains every edit.
- A second headless run on a page with a far-below footer: two visible elements share one view; the scrolled-to footer gets view 2; scrolling back up and adding a third card keeps 2 views; removing an element renumbers the labels with no new capture; the stored action has `extraScreenshots`; the copied text names both views.

## Known Limits / Follow-ups

- Electron `BatchCard.tsx` shows only view 1; extra elements and extra views appear only in the agent prompt.
- "Copy all" with many edits makes a large grid that Claude downscales; copy edits one by one for detail.
