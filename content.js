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

  function expandInPlainField(el, key, expansion) {
    const cursor = el.selectionEnd;
    const start = cursor - key.length;
    el.setSelectionRange(start, cursor);
    isExpanding = true;
    document.execCommand("insertText", false, expansion);
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

  function handleContentEditable() {
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
    document.execCommand("insertText", false, match.expansion);
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
        handleContentEditable();
      }
    },
    true
  );
})();
