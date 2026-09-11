(() => {
  let shortcuts = {};
  let pattern = null;
  let isExpanding = false;

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rebuildPattern() {
    const keys = Object.keys(shortcuts).filter(Boolean);
    if (keys.length === 0) {
      pattern = null;
      return;
    }
    // Longest keys first so e.g. "zxy" is preferred over "zx" when both exist.
    keys.sort((a, b) => b.length - a.length);
    const alternation = keys.map(escapeRegExp).join("|");
    pattern = new RegExp(`(?:^|\\s)(${alternation})$`);
  }

  function loadShortcuts() {
    chrome.storage.sync.get("shortcuts", (data) => {
      shortcuts = data.shortcuts || {};
      rebuildPattern();
    });
  }
  loadShortcuts();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.shortcuts) {
      shortcuts = changes.shortcuts.newValue || {};
      rebuildPattern();
    }
  });

  function matchShortcut(textBeforeCursor) {
    if (!pattern) return null;
    const m = pattern.exec(textBeforeCursor);
    if (!m) return null;
    const key = m[1];
    const expansion = shortcuts[key];
    if (!expansion) return null;
    return { key, expansion };
  }

  function isPlainTextField(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const type = (el.type || "text").toLowerCase();
      return ["text", "search", "email", "url", "tel", "password"].includes(type);
    }
    return false;
  }

  // Cached native value setters, so we can write .value directly instead of
  // going through execCommand (which simulates keystrokes and gets slow for
  // large strings). This is also the standard way to update a React-controlled
  // input/textarea from outside React.
  const nativeValueSetters = new WeakMap();
  function getNativeValueSetter(el) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    let setter = nativeValueSetters.get(proto);
    if (!setter) {
      setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      nativeValueSetters.set(proto, setter);
    }
    return setter;
  }

  function expandInPlainField(el, key, expansion) {
    const cursor = el.selectionEnd;
    const start = cursor - key.length;
    const value = el.value;
    const newValue = value.slice(0, start) + expansion + value.slice(cursor);

    isExpanding = true;
    getNativeValueSetter(el).call(el, newValue);
    const newCursor = start + expansion.length;
    el.setSelectionRange(newCursor, newCursor);
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: expansion })
    );
    isExpanding = false;
  }

  function handlePlainField(el) {
    const cursor = el.selectionEnd;
    if (cursor == null || cursor !== el.selectionStart) return;
    const before = el.value.slice(0, cursor);
    const match = matchShortcut(before);
    if (!match) return;
    expandInPlainField(el, match.key, match.expansion);
  }

  // Rich editors (ProseMirror on chatgpt.com, Slate, Draft.js, Gmail, Notion, ...)
  // register their own "paste" handler that inserts a whole clipboard chunk in a
  // single, optimized operation. Simulating a paste is far faster for long
  // snippets than execCommand('insertText'), which mimics character-by-character
  // typing and forces the editor's full per-keystroke pipeline to run.
  function dispatchPaste(target, text) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    // dispatchEvent returns false if a listener called preventDefault(),
    // which is how these editors signal "I handled the paste myself".
    const defaultNotPrevented = target.dispatchEvent(event);
    return !defaultNotPrevented;
  }

  function handleContentEditable(target) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const offset = range.startOffset;
    const before = node.textContent.slice(0, offset);
    const match = matchShortcut(before);
    if (!match) return;

    const newRange = document.createRange();
    newRange.setStart(node, offset - match.key.length);
    newRange.setEnd(node, offset);
    selection.removeAllRanges();
    selection.addRange(newRange);

    isExpanding = true;
    const handled = dispatchPaste(target, match.expansion);
    if (!handled) {
      // No framework paste handler intercepted it (e.g. a plain contenteditable
      // div) — fall back to the slower but universally-supported approach.
      document.execCommand("insertText", false, match.expansion);
    }
    isExpanding = false;
  }

  document.addEventListener(
    "input",
    (e) => {
      if (isExpanding || e.isComposing) return;

      const target = e.target;
      if (isPlainTextField(target)) {
        handlePlainField(target);
      } else if (target && target.isContentEditable) {
        handleContentEditable(target);
      }
    },
    true
  );
})();
