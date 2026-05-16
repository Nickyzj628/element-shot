const capturingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "select" });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action, data } = message;
  if (action !== "shot") return;

  const tabId = sender.tab.id;
  if (capturingTabs.has(tabId)) return;
  capturingTabs.add(tabId);

  const sendMessage = (action, data) => {
    chrome.tabs.sendMessage(tabId, { action, data });
  };

  const writeBase64ToClipboard = async (base64Data) => {
    try {
      const response = await fetch(`data:image/png;base64,${base64Data}`);
      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([clipboardItem]);
      return { ok: true, message: "写入剪贴板成功！" };
    } catch (err) {
      return { ok: false, message: "写入剪贴板失败：" + err.message };
    }
  };

  const capture = async () => {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      const { x, y, width, height } = data;
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: writeBase64ToClipboard,
        args: [result.data],
      });

      const res = injectionResult?.result;
      if (res?.ok) {
        sendMessage("success", res.message);
      } else {
        sendMessage("error", res?.message || "未知错误");
      }
    } catch (err) {
      console.error("[background] capture error:", err.message);
      sendMessage("error", "截图失败：" + err.message);
    } finally {
      capturingTabs.delete(tabId);
      try {
        await chrome.debugger.detach({ tabId });
      } catch (e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
  };

  capture();
});
