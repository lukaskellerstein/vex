# Chrome Extension Internal Message Contract

**Protocol**: `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`

## Content Script ↔ Popup Messages

| Message Type | Direction | Payload | Purpose |
|-------------|-----------|---------|---------|
| `getState` | Popup → Content | `{}` | Get current mode, actions, page info |
| `stateUpdate` | Content → Popup | `{ mode, actions, pageUrl, pageTitle, isActive }` | Current state snapshot |
| `toggleActive` | Popup → Content | `{ active: boolean }` | Enable/disable Vex on the page |
| `setMode` | Popup → Content | `{ mode: string }` | Switch interaction mode |
| `removeAction` | Popup → Content | `{ index: number }` | Remove an action by index |
| `updateInstruction` | Popup → Content | `{ index: number, instruction: string }` | Update action instruction |
| `clearActions` | Popup → Content | `{}` | Clear all recorded actions |
| `sendBatch` | Popup → Content | `{}` | Trigger batch submission to AgentManager |
| `batchSent` | Content → Popup | `{ batchId: string, status: string }` | Batch submission result |

## Content Script ↔ Background Messages

| Message Type | Direction | Payload | Purpose |
|-------------|-----------|---------|---------|
| `captureTab` | Content → Background | `{}` | Request viewport screenshot |
| `captureTabResult` | Background → Content | `{ dataUrl: string }` | Screenshot as data URL |

## Mode Values

`select`, `edit`, `resize`, `style`, `copyStyle`, `visibility`

Keyboard shortcuts: `1` through `6` respectively.
