// 记录已 attach debugger 的标签页，防止重复 attach。
const armedTabs = new Set();
// 记录正在截图的标签页，防止并发请求叠加。
const capturingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { action: "select" }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action } = message;
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  // mousedown：提前 attach debugger，让"正在调试此浏览器"横幅在用户按住期间渲染好。
  if (action === "attach") {
    if (armedTabs.has(tabId) || capturingTabs.has(tabId)) return;
    armedTabs.add(tabId);
    armDebugger(tabId);
    return;
  }

  // mouseup：横幅已就位，直接截图。
  if (action === "shot") {
    if (capturingTabs.has(tabId)) return;
    capturingTabs.add(tabId);
    const wasArmed = armedTabs.delete(tabId);
    capture(tabId, wasArmed);
    return;
  }

  // Esc 取消（mousedown 之后、mouseup 之前）：detach debugger 并清理。
  if (action === "cancel") {
    if (!armedTabs.delete(tabId)) return;
    sendMessage(tabId, "teardown");
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;
    });
  }
});

const sendMessage = (tabId, action, data) => {
  chrome.tabs.sendMessage(tabId, { action, data }, () => {
    void chrome.runtime.lastError;
  });
};

const armDebugger = async (tabId) => {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    // 等待横幅渲染、页面重新布局，随后即处于就绪状态，等待 mouseup 触发截图。
    await new Promise((r) => setTimeout(r, 150));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[background] arm error:", msg);
    armedTabs.delete(tabId);
    sendMessage(tabId, "error", `启动调试失败：${msg}`);
  }
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

const capture = async (tabId, wasArmed) => {
  try {
    if (!wasArmed) {
      // 未提前 attach（兼容旧路径），现在补上。
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");
      // 等待一帧让 debugger 横幅渲染、页面完成重新布局
      await new Promise((r) => setTimeout(r, 150));
    }

    // 向 content script 请求横幅出现后的元素坐标
    const rectData = await chrome.tabs.sendMessage(tabId, { action: "getRect" });
    if (!rectData) {
      sendMessage(tabId, "error", "截图取消或目标元素已失效");
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
      sendMessage(tabId, "success", res.message);
    } else {
      sendMessage(tabId, "error", res?.message || "未知错误");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[background] capture error:", msg);
    sendMessage(tabId, "error", `截图失败：${msg}`);
  } finally {
    capturingTabs.delete(tabId);
    // 通知 content script 清理选择状态（无论成功或失败）
    sendMessage(tabId, "teardown");
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_e) {
      // 可能已经是 detached 状态，忽略错误
    }
  }
};
