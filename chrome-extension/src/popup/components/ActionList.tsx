import {
  Copy,
  Image,
  LayoutGrid,
  Maximize2,
  MousePointer,
  Move,
  PaintBucket,
  Palette,
  Scissors,
  Trash2,
  Type,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { Action, ActionType } from "../../shared/types";

interface ActionListProps {
  actions: Action[];
  onRemove: (index: number) => void;
  onUpdateInstruction: (index: number, instruction: string) => void;
}

const TYPE_BADGE_COLORS: Record<ActionType, string> = {
  select: "#3b82f6",
  insert: "#22c55e",
  editText: "#eab308",
  delete: "#ef4444",
  duplicate: "#06b6d4",
  move: "#8b5cf6",
  wrap: "#64748b",
  resize: "#a855f7",
  styleChange: "#f97316",
  replaceImage: "#ec4899",
  generateSection: "#14b8a6",
  copyStyle: "#6366f1",
};

const TYPE_ICONS: Record<ActionType, React.ElementType> = {
  select: MousePointer,
  insert: LayoutGrid,
  editText: Type,
  delete: Trash2,
  duplicate: Copy,
  move: Move,
  wrap: Scissors,
  resize: Maximize2,
  styleChange: Palette,
  replaceImage: Image,
  generateSection: LayoutGrid,
  copyStyle: PaintBucket,
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

export function ActionList({ actions, onRemove, onUpdateInstruction }: ActionListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

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

  if (actions.length === 0) {
    return (
      <div className="selection-list">
        <div className="empty-state">
          No actions recorded. Activate the selector and interact with elements on the page.
        </div>
      </div>
    );
  }

  return (
    <div className="selection-list">
      {actions.map((action, i) => {
        const isEditing = editingIndex === i;
        const isSelect = action.type === "select";

        return (
          <div key={action.selector + i}>
            <div className="selection-item">
              <span className="action-index-badge">{i + 1}</span>
              <ActionTypeBadge type={action.type} />
              <div className="selection-info">
                <div className="selection-tag" title={action.selector}>
                  {truncate(action.selector, 40)}
                </div>
                {isSelect &&
                  (isEditing ? (
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
                      className={`selection-instruction${action.instruction ? "" : " empty"}`}
                      onClick={() => startEdit(i, action.instruction)}
                      title="Click to edit"
                    >
                      {action.instruction || "no instruction"}
                    </div>
                  ))}
              </div>
              <button
                className="selection-remove"
                onClick={() => onRemove(i)}
                title="Remove action"
              >
                {"\u00D7"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionTypeBadge({ type }: { type: ActionType }) {
  const Icon = TYPE_ICONS[type];
  const color = TYPE_BADGE_COLORS[type];
  return (
    <span className="action-type-badge" style={{ backgroundColor: color }}>
      <Icon size={10} />
      {type}
    </span>
  );
}
