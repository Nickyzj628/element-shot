// 记录已 attach debugger 的标签页，防止重复 attach。
const armedTabs = new Map();
// 记录正在截图的标签页，防止并发请求叠加。
const capturingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  void chrome.scripting
    .executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.dispatchEvent(new Event("element-shot-select")),
    })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action } = message;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (tabId == null) return;

  // mousedown：提前 attach debugger，让"正在调试此浏览器"横幅在用户按住期间渲染好。
  if (action === "attach") {
    if (armedTabs.has(tabId) || capturingTabs.has(tabId)) return;
    armedTabs.set(tabId, frameId);
    armDebugger(tabId);
    return;
  }

  // mouseup：横幅已就位，直接截图。
  if (action === "shot") {
    if (capturingTabs.has(tabId)) return;
    capturingTabs.add(tabId);
    const armedFrameId = armedTabs.get(tabId);
    const wasArmed = armedTabs.delete(tabId);
    capture(tabId, wasArmed, armedFrameId ?? frameId);
    return;
  }

  // Esc 取消（mousedown 之后、mouseup 之前）：detach debugger 并清理。
  if (action === "cancel") {
    const armedFrameId = armedTabs.get(tabId);
    if (!armedTabs.delete(tabId)) return;
    sendMessage(tabId, "teardown", undefined, armedFrameId);
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;
    });
  }
});

const sendMessage = (tabId, action, data, frameId) => {
  chrome.tabs.sendMessage(tabId, { action, data }, { frameId }, () => {
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

const capture = async (tabId, wasArmed, frameId) => {
  try {
    if (!wasArmed) {
      // 未提前 attach（兼容旧路径），现在补上。
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");
      // 等待一帧让 debugger 横幅渲染、页面完成重新布局
      await new Promise((r) => setTimeout(r, 150));
    }

    // 顶层 frame 保留滚动条空间；目标 frame 返回换算后的顶层页面坐标。
    await chrome.tabs.sendMessage(tabId, { action: "prepareCapture" }, { frameId: 0 });
    const rectData = await chrome.tabs.sendMessage(tabId, { action: "getRect" }, { frameId });
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
    sendMessage(tabId, "teardown", undefined, frameId);
    sendMessage(tabId, "teardown", undefined, 0);
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_e) {
      // 可能已经是 detached 状态，忽略错误
    }
  }
};
