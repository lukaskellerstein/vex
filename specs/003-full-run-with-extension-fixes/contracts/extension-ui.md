# Contract: Chrome Extension UI Components

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## PopupDialog (Select Mode)

### Current State
- Header: element tag + selector
- CodeMirror instruction editor
- Buttons: Cancel, Skip, Add

### After Change
- Header: element tag + selector
- **Screenshot thumbnail**: base64 JPEG, max 140px height, loading placeholder while capturing
- CodeMirror instruction editor
- Buttons: Cancel, Skip, Add

---

## ResizeMode Hover

### Current State
- No hover feedback before element selection
- Selection border appears only after click

### After Change
- **Hover border**: visible border on mouseover (similar to select mode)
- Hover suppressed when element is selected (handles visible)
- Hover label showing element tag/class

---

## StylePanel

### Current State
- Fixed position, auto-computed placement (right/left/center of element)
- Header: "Style Editor" title + close button (×)
- Not draggable
- No selection border on styled element
- No copy-style integration

### After Change
- **Draggable**: header acts as drag handle (excluding close button)
- Position constrained to viewport
- **Selection border**: visible border on the element being styled
- **Copy Style button**: in header/toolbar area, triggers two-phase copy workflow
- Close button retained

---

## Toolbar (On-Page Flowtable)

### Current State
- Mode buttons (select, edit, resize, style, copyStyle, visibility)
- Send button
- Draggable

### After Change
- Mode buttons: select, edit, resize, style, visibility (**copyStyle removed**)
- Send button
- **Expand chevron**: toggles action panel visibility
- **Action panel**: expandable panel showing recorded actions
  - Each action: type badge (colored), selector (truncated), instruction
  - Inline edit for instructions
  - Remove button per action
  - Empty state message when no actions
- Draggable (including expanded state)

---

## Popup (Extension Icon)

### Current State
- Header, ProjectSelector, Controls, ActionList, Footer

### After Change
- Header, ProjectSelector, Controls, Footer
- **ActionList removed** (relocated to on-page toolbar)
