const capturingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { action: "select" }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action } = message;
  if (action !== "shot") return;

  const tabId = sender.tab?.id;
  if (tabId == null || capturingTabs.has(tabId)) return;
  capturingTabs.add(tabId);

  const sendMessage = (action, data) => {
    chrome.tabs.sendMessage(tabId, { action, data }, () => {
      void chrome.runtime.lastError;
    });
  };

  const writeBase64ToClipboard = async (base64Data) => {
    try {
      const response = await fetch(`data:image/png;base64,${base64Data}`);
      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([clipboardItem]);
      return { ok: true, message: "写入剪贴板成功！" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `写入剪贴板失败：${msg}` };
    }
  };

  const capture = async () => {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      // 等待一帧让 debugger 横幅渲染、页面完成重新布局
      await new Promise((r) => setTimeout(r, 150));

      // 向 content script 请求横幅出现后的元素坐标
      const rectData = await chrome.tabs.sendMessage(tabId, { action: "getRect" });
      if (!rectData) {
        sendMessage("error", "截图取消或目标元素已失效");
        return;
      }

      const { x, y, width, height } = rectData;
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: writeBase64ToClipboard,
        // @ts-expect-error sendCommand 返回类型根据命令不同而变化，@types/chrome 声明为通用 object
        args: [result.data],
      });

      const res = injectionResult?.result;
      if (res?.ok) {
        sendMessage("success", res.message);
      } else {
        sendMessage("error", res?.message || "未知错误");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[background] capture error:", msg);
      sendMessage("error", `截图失败：${msg}`);
    } finally {
      capturingTabs.delete(tabId);
      // 通知 content script 清理选择状态（无论成功或失败）
      chrome.tabs.sendMessage(tabId, { action: "teardown" }, () => {
        void chrome.runtime.lastError;
      });
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
  };

  capture();
});
