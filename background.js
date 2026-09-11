chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") return;

  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  if (!shortcuts) {
    await chrome.storage.sync.set({
      shortcuts: {
        zx: "This text was expanded automatically by Text Shortcuts."
      }
    });
  }
});
