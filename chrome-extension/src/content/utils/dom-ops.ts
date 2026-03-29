export function insertElement(
  position: "after" | "before" | "firstChild" | "lastChild",
  reference: Element,
  tag: string,
  text: string,
  attrs: Record<string, string>,
): Element {
  const el = document.createElement(tag);
  el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }

  switch (position) {
    case "before":
      reference.parentElement!.insertBefore(el, reference);
      break;
    case "after":
      reference.parentElement!.insertBefore(el, reference.nextSibling);
      break;
    case "firstChild":
      reference.insertBefore(el, reference.firstChild);
      break;
    case "lastChild":
      reference.appendChild(el);
      break;
  }

  return el;
}

export function removeElement(el: Element): string {
  const html = el.outerHTML;
  el.remove();
  return html;
}

export function cloneElement(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  el.parentElement!.insertBefore(clone, el.nextSibling);
  return clone;
}

export function reorderElement(
  parent: Element,
  fromIndex: number,
  toIndex: number,
): void {
  const children = Array.from(parent.children);
  if (fromIndex < 0 || fromIndex >= children.length) return;
  if (toIndex < 0 || toIndex >= children.length) return;

  const child = children[fromIndex];
  const ref = children[toIndex];

  if (fromIndex < toIndex) {
    parent.insertBefore(child, ref.nextSibling);
  } else {
    parent.insertBefore(child, ref);
  }
}

export function wrapElement(
  el: Element,
  wrapperTag: string,
  wrapperClasses: string[],
): Element {
  const wrapper = document.createElement(wrapperTag);
  for (const cls of wrapperClasses) {
    if (cls) wrapper.classList.add(cls);
  }
  el.parentElement!.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}
