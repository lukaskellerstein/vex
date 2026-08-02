import { useCallback, useState } from "react";
import type { Selection } from "../../shared/types";

interface SelectionListProps {
  selections: Selection[];
  onRemove: (index: number) => void;
  onUpdateInstruction: (index: number, instruction: string) => void;
}

export function SelectionList({ selections, onRemove, onUpdateInstruction }: SelectionListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // unused state removed

  const startEdit = useCallback((index: number, currentText: string) => {
    setEditingIndex(index);
    setEditText(currentText);
  }, []);

  const saveEdit = useCallback(
    (index: number) => {
      onUpdateInstruction(index, editText);
      setEditingIndex(null);
    },
    [editText, onUpdateInstruction],
  );

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  if (selections.length === 0) {
    return (
      <div className="selection-list">
        <div className="empty-state">
          No elements selected. Activate the selector and click elements on the page.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="selection-list">
        {selections.map((sel, i) => {
          const label =
            sel.tagName +
            (sel.id ? "#" + sel.id : sel.classList.length ? "." + sel.classList[0] : "");
          const isExpanded = expandedIndex === i;
          const isEditing = editingIndex === i;

          return (
            <div key={sel.selector + i}>
              <div className="selection-item">
                <div className="selection-badge">{i + 1}</div>
                <div className="selection-info">
                  <div className="selection-tag">{label}</div>
                  {isEditing ? (
                    <div className="selection-edit">
                      <textarea
                        className="selection-edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(i);
                          } else if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        autoFocus
                      />
                      <div className="selection-edit-actions">
                        <button className="selection-edit-btn save" onClick={() => saveEdit(i)}>
                          Save
                        </button>
                        <button className="selection-edit-btn" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`selection-instruction${sel.instruction ? "" : " empty"}`}
                      onClick={() => startEdit(i, sel.instruction)}
                      title="Click to edit"
                    >
                      {sel.instruction || "no instruction"}
                    </div>
                  )}
                </div>
                {sel.screenshot && (
                  <span
                    className={`selection-screenshot${isExpanded ? " active" : ""}`}
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    title="View screenshot"
                  >
                    {"\uD83D\uDCF7"}
                  </span>
                )}
                <button
                  className="selection-remove"
                  onClick={() => onRemove(i)}
                  title="Remove selection"
                >
                  {"\u00D7"}
                </button>
              </div>
              {isExpanded && sel.screenshot && (
                <div className="selection-preview">
                  <img
                    src={`data:image/jpeg;base64,${sel.screenshot}`}
                    alt={`Screenshot of ${label}`}
                    onClick={() => {
                      const w = window.open();
                      if (w) {
                        w.document.title = `Screenshot - ${label}`;
                        w.document.body.style.cssText =
                          "margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh";
                        const img = w.document.createElement("img");
                        img.src = `data:image/jpeg;base64,${sel.screenshot}`;
                        img.style.maxWidth = "100%";
                        w.document.body.appendChild(img);
                      }
                    }}
                    title="Click for full resolution"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
