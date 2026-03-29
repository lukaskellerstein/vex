import { createRoot } from "react-dom/client";
import { App } from "./App";
import contentStyles from "./styles/content.css?inline";

if (!(window as unknown as Record<string, boolean>).__webSelectorInjected) {
  (window as unknown as Record<string, boolean>).__webSelectorInjected = true;

  const HOST_ID = "__web-selector-root";
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyles;
  shadow.appendChild(styleEl);

  const container = document.createElement("div");
  shadow.appendChild(container);

  const root = createRoot(container);
  root.render(<App hostElement={host} shadowRoot={shadow} />);
}
