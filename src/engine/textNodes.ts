// Collect the visible text nodes inside a container, skipping anything that
// should stay literally readable (code, form fields, scripts, etc.).

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
]);

export function collectTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      const value = node.nodeValue;
      if (!value || !/\S/.test(value)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    nodes.push(current as Text);
  }
  return nodes;
}
