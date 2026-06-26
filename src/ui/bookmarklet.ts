// Bookmarklet generator. Produces a self-contained `javascript:` snippet that
// applies ONLY the original Letter scramble (typoglycemia) to any site — the
// behaviour of the 2016 demo. The other effects on this page are deliberately
// left out: per-glyph wrapping is fragile on arbitrary pages, and the rest
// aren't part of the original demo. Speed and Intensity still tune the scramble.

import type { Settings, SettingsStore } from "../state";

export function buildBookmarklet(root: HTMLElement, store: SettingsStore): void {
  root.replaceChildren();

  const link = document.createElement("a");
  link.className = "bookmarklet-link";
  // A stable accessible name (also the saved bookmark's title), so it satisfies
  // Label in Name and doesn't shift under voice control as settings change.
  link.textContent = "Dyslexia simulator";
  link.setAttribute("aria-describedby", "bookmarklet-note");
  // Clicking it inside this app shouldn't try to run it here.
  link.addEventListener("click", (event) => event.preventDefault());

  const note = document.createElement("p");
  note.className = "control-hint";
  note.id = "bookmarklet-note";
  note.textContent =
    "Drag the button to your bookmarks bar, then click it on any page to start the letter scramble; click again to stop. Some sites block bookmarklets with a strict content-security-policy.";

  const codeWrap = document.createElement("div");
  codeWrap.className = "bookmarklet-code";

  const codeLabel = document.createElement("label");
  codeLabel.setAttribute("for", "bookmarklet-source");
  codeLabel.textContent = "Or copy the code";

  const code = document.createElement("textarea");
  code.id = "bookmarklet-source";
  code.readOnly = true;
  code.rows = 3;
  code.spellcheck = false;

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn";
  copy.textContent = "Copy code";
  copy.addEventListener("click", () => {
    void copyToClipboard(code, copy);
  });

  codeWrap.append(codeLabel, code, copy);
  root.append(link, note, codeWrap);

  const update = (settings: Settings): void => {
    const href = `javascript:${encodeURIComponent(buildPayload(settings))}`;
    link.href = href;
    code.value = href;
  };

  store.subscribe(update);
  update(store.get());
}

async function copyToClipboard(
  code: HTMLTextAreaElement,
  button: HTMLButtonElement,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(code.value);
    flash(button, "Copied!");
  } catch {
    code.select();
    flash(button, "Press Ctrl/Cmd + C");
  }
}

function flash(button: HTMLButtonElement, message: string): void {
  const original = "Copy code";
  button.textContent = message;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function buildPayload(settings: Settings): string {
  // Always the letter scramble — this bookmarklet is the original demo and does
  // not follow the page's other effects. Speed and Intensity still tune it.
  const intensity = settings.intensity.toFixed(2);
  const speed = String(settings.speedMs);

  // Hand-compacted IIFE. A second click clears the interval AND restores every
  // text node's original value, so the same bookmarklet cleanly toggles on and
  // off without leaving the page scrambled.
  return (
    "(function(){var W=window;" +
    "if(W.__dsx){clearInterval(W.__dsx.t);" +
    "for(var k=0;k<W.__dsx.ns.length;k++)W.__dsx.ns[k].n.nodeValue=W.__dsx.ns[k].o;" +
    "W.__dsx=null;return;}" +
    "var SK={SCRIPT:1,STYLE:1,NOSCRIPT:1,TEXTAREA:1,INPUT:1,SELECT:1,OPTION:1,CODE:1,PRE:1,KBD:1,SAMP:1};" +
    "var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n,ns=[];" +
    "while(n=w.nextNode()){var pa=n.parentNode;" +
    "if(pa&&!SK[pa.nodeName]&&/\\S/.test(n.nodeValue))ns.push({n:n,o:n.nodeValue});}" +
    "function ri(a,b){return Math.floor(Math.random()*(b-a+1)+a);}" +
    "function tick(){for(var i=0;i<ns.length;i++){" +
    "ns[i].n.nodeValue=ns[i].n.nodeValue.replace(/[A-Za-z\\u00C0-\\u024F]{4,}/g,function(wd){" +
    `if(Math.random()>${intensity})return wd;` +
    "var a=wd.split(''),x=ri(1,a.length-2),y=ri(1,a.length-2),t=a[x];a[x]=a[y];a[y]=t;return a.join('');" +
    "});}}" +
    `W.__dsx={t:setInterval(tick,${speed}),ns:ns};` +
    "})();"
  );
}
