// Bookmarklet generators. Each produces a self-contained `javascript:` snippet
// that can be dragged to a bookmarks bar and run on any site.
//
// The reading one applies ONLY the original Letter scramble (typoglycemia) —
// the behaviour of the 2016 demo. The other effects here are deliberately left
// out: per-glyph wrapping is fragile on arbitrary pages, and the rest aren't
// part of the original demo. Speed and Intensity still tune the scramble.
//
// The colour vision one needs no text handling at all: it filters the whole
// page through the same matrices the gallery uses, and cycles on each click.

import type { Settings, SettingsStore } from "../state";
import {
  KINDS,
  KIND_LABELS,
  MATRICES,
  toFeMatrix,
} from "../engine/colorVisionMatrices";

interface BookmarkletParts {
  link: HTMLAnchorElement;
  code: HTMLTextAreaElement;
}

/** The shared furniture: draggable link, explanatory note, copyable source. */
function render(
  root: HTMLElement,
  options: { title: string; noteId: string; note: string; codeId: string },
): BookmarkletParts {
  root.replaceChildren();

  const link = document.createElement("a");
  link.className = "bookmarklet-link";
  // A stable accessible name (also the saved bookmark's title), so it satisfies
  // Label in Name and doesn't shift under voice control as settings change.
  link.textContent = options.title;
  link.setAttribute("aria-describedby", options.noteId);
  // Clicking it inside this app shouldn't try to run it here.
  link.addEventListener("click", (event) => event.preventDefault());

  const note = document.createElement("p");
  note.className = "control-hint";
  note.id = options.noteId;
  note.textContent = options.note;

  const codeWrap = document.createElement("div");
  codeWrap.className = "bookmarklet-code";

  const codeLabel = document.createElement("label");
  codeLabel.setAttribute("for", options.codeId);
  codeLabel.textContent = "Or copy the code";

  const code = document.createElement("textarea");
  code.id = options.codeId;
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
  return { link, code };
}

export function buildBookmarklet(root: HTMLElement, store: SettingsStore): void {
  const { link, code } = render(root, {
    title: "Dyslexia simulator",
    noteId: "bookmarklet-note",
    note: "Drag the button to your bookmarks bar, then click it on any page to start the letter scramble; click again to stop. Some sites block bookmarklets with a strict content-security-policy.",
    codeId: "bookmarklet-source",
  });

  const update = (settings: Settings): void => {
    const href = `javascript:${encodeURIComponent(buildPayload(settings))}`;
    link.href = href;
    code.value = href;
  };

  store.subscribe(update);
  update(store.get());
}

export function buildColorVisionBookmarklet(root: HTMLElement): void {
  const { link, code } = render(root, {
    title: "Colour blindness simulator",
    noteId: "bookmarklet-cvd-note",
    note: "Drag the button to your bookmarks bar, then click it on any page to filter it through a colour vision deficiency. Each click moves to the next one — protanopia, deuteranopia, tritanopia, achromatopsia — and a fifth click clears it. Because a CSS filter makes its element the containing block, a page's fixed headers may scroll with the content while the filter is on.",
    codeId: "bookmarklet-cvd-source",
  });

  const href = `javascript:${encodeURIComponent(buildColorVisionPayload())}`;
  link.href = href;
  code.value = href;
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
  // not follow the page's other effects. The scramble's own Speed and Intensity
  // still tune it.
  const intensity = settings.scrambleIntensity.toFixed(2);
  const speed = String(settings.scrambleSpeed);

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

function buildColorVisionPayload(): string {
  // [id, feColorMatrix values, spoken name] per deficiency, straight from the
  // shared matrices so the bookmarklet and the gallery always agree.
  const table = KINDS.map(
    (kind) =>
      `["${kind}","${toFeMatrix(MATRICES[kind])}","${KIND_LABELS[kind]}"]`,
  ).join(",");

  // Hand-compacted IIFE. The filter goes on <html>, so it covers the page
  // background as well as its content. The toast is deliberately black and
  // white: it sits inside the filtered element, and greys survive all four
  // matrices unchanged, so it stays legible whichever one is active.
  return (
    "(function(){var D=document,E=D.documentElement,W=window," +
    `M=[${table}];` +
    "if(!W.__cvd){" +
    "var NS='http://www.w3.org/2000/svg',s=D.createElementNS(NS,'svg');" +
    "s.setAttribute('aria-hidden','true');" +
    "s.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden');" +
    "var d=D.createElementNS(NS,'defs');" +
    "for(var i=0;i<M.length;i++){" +
    "var f=D.createElementNS(NS,'filter');" +
    "f.setAttribute('id','cvdbm-'+M[i][0]);" +
    "f.setAttribute('color-interpolation-filters','linearRGB');" +
    "var m=D.createElementNS(NS,'feColorMatrix');" +
    "m.setAttribute('type','matrix');m.setAttribute('values',M[i][1]);" +
    "f.appendChild(m);d.appendChild(f);}" +
    "s.appendChild(d);D.body.appendChild(s);W.__cvd={i:-1};}" +
    "var c=W.__cvd;c.i=c.i+1;" +
    "var off=c.i>=M.length;if(off)c.i=-1;" +
    "E.style.filter=off?'':'url(#cvdbm-'+M[c.i][0]+')';" +
    "var t=D.getElementById('cvdbm-toast');" +
    "if(!t){t=D.createElement('div');t.id='cvdbm-toast';" +
    "t.setAttribute('role','status');" +
    "t.setAttribute('style','position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);" +
    "background:#000;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:999px;border:2px solid #fff');" +
    "E.appendChild(t);}" +
    "t.textContent=off?'Colour vision simulation off':'Simulating '+M[c.i][2];" +
    "clearTimeout(W.__cvdT);W.__cvdT=setTimeout(function(){t.remove();},2600);" +
    "})();"
  );
}
