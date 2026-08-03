import { useEffect, useState } from "react";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.windowIsMaximized().then(setMaximized);
    const cleanup = window.electronAPI.onMaximizedChange(setMaximized);
    return cleanup;
  }, []);

  return (
    <>
      {/* Invisible hover zone in top-right corner */}
      <div className="wc-zone">
        <div className="wc-buttons">
          <button
            className="wc-btn"
            onClick={() => window.electronAPI.windowMinimize()}
            aria-label="Minimize"
          >
            <svg width="10" height="10" viewBox="0 0 12 12">
              <rect y="5" width="12" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="wc-btn"
            onClick={() => window.electronAPI.windowMaximize()}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <rect
                  x="2"
                  y="0"
                  width="10"
                  height="10"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <rect
                  x="0"
                  y="2"
                  width="10"
                  height="10"
                  rx="1"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <rect
                  x="0.75"
                  y="0.75"
                  width="10.5"
                  height="10.5"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </button>
          <button
            className="wc-btn wc-btn-close"
            onClick={() => window.electronAPI.windowClose()}
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 12 12">
              <path
                d="M1 1L11 11M11 1L1 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        .wc-zone {
          position: fixed;
          top: 0;
          right: 0;
          width: 120px;
          height: 8px;
          z-index: 9999;
          transition: height 150ms ease;
        }
        .wc-zone:hover {
          height: 32px;
        }
        .wc-buttons {
          display: flex;
          justify-content: flex-end;
          height: 32px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 150ms ease;
          background: var(--surface);
          border-radius: 0 0 0 6px;
          overflow: hidden;
        }
        .wc-zone:hover .wc-buttons {
          opacity: 1;
          pointer-events: auto;
        }
        .wc-btn {
          width: 40px;
          height: 100%;
          border: none;
          background: transparent;
          color: var(--foreground-dim);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0;
          padding: 0;
          transition: background 100ms ease, color 100ms ease;
        }
        .wc-btn:hover {
          background: var(--surface-hover);
          color: var(--foreground);
        }
        .wc-btn-close:hover {
          background: var(--status-error);
          color: white;
        }
      `}</style>
    </>
  );
}
