/**
 * @typedef {{ frameId: number, attached: boolean, cancelled: boolean, ready: Promise<boolean> | null }} ArmedTab
 */

/** @type {Map<number, ArmedTab>} */
const armedTabs = new Map();
// armedTabs 覆盖 attach 到 shot；capturingTabs 只覆盖实际截图阶段，二者均阻止同 tab 重入。
const capturingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  // 在所有 frame 派发事件，比只给某个 frame 发 runtime 消息更适合 all_frames 选择器。
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
  const frameId = sender.frameId ?? 0;
  if (tabId == null) return;

  // pointerdown：提前 attach debugger，让调试横幅在用户按住期间渲染好。
  if (action === "attach") {
    if (armedTabs.has(tabId) || capturingTabs.has(tabId)) return;
    /** @type {ArmedTab} */
    const armedTab = { frameId, attached: false, cancelled: false, ready: null };
    armedTabs.set(tabId, armedTab);
    armedTab.ready = armDebugger(tabId, armedTab);
    return;
  }

  // pointerup：只接受已由 pointerdown 建立的会话，避免绕过布局稳定阶段。
  if (action === "shot") {
    const armedTab = armedTabs.get(tabId);
    if (!armedTab || capturingTabs.has(tabId)) return;
    armedTabs.delete(tabId);
    capturingTabs.add(tabId);
    capture(tabId, armedTab);
    return;
  }

  // Esc 或 pointercancel 取消：detach debugger 并清理。
  if (action === "cancel") {
    const armedTab = armedTabs.get(tabId);
    armedTabs.delete(tabId);
    sendMessage(tabId, "teardown", undefined, armedTab?.frameId ?? frameId);
    if (armedTab) {
      armedTab.cancelled = true;
      void detachDebugger(tabId, armedTab);
    }
  }
});

/**
 * @param {number} tabId
 * @param {string} action
 * @param {unknown} data
 * @param {number} frameId
 */
const sendMessage = (tabId, action, data, frameId) => {
  // 忽略目标 frame 已销毁等发送错误；截图 finally 仍需继续清理 debugger。
  chrome.tabs.sendMessage(tabId, { action, data }, { frameId }, () => {
    void chrome.runtime.lastError;
  });
};

/**
 * @param {number} tabId
 * @param {ArmedTab} armedTab
 */
const detachDebugger = async (tabId, armedTab) => {
  if (!armedTab.attached) return;
  armedTab.attached = false;
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_e) {
    // 已由浏览器释放调试会话时无需处理，清理流程仍然可以结束。
  }
};

/**
 * @param {number} tabId
 * @param {ArmedTab} armedTab
 */
const armDebugger = async (tabId, armedTab) => {
  let failed = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    armedTab.attached = true;
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    // 等待调试横幅和页面布局稳定，随后允许 pointerup 触发截图。
    await new Promise((r) => setTimeout(r, 150));
    return !armedTab.cancelled;
  } catch (err) {
    failed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[background] arm error:", msg);
    if (!armedTab.cancelled) {
      armedTabs.delete(tabId);
      sendMessage(tabId, "error", `启动调试失败：${msg}`, armedTab.frameId);
      sendMessage(tabId, "teardown", undefined, armedTab.frameId);
    }
    return false;
  } finally {
    if (armedTab.cancelled || failed) {
      await detachDebugger(tabId, armedTab);
    }
  }
};

/** @param {string} base64Data */
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

/**
 * @param {number} tabId
 * @param {ArmedTab} armedTab
 */
const capture = async (tabId, armedTab) => {
  const { frameId } = armedTab;
  try {
    const ready = await armedTab.ready;
    if (!ready) return;

    // 顶层 frame 固定滚动条布局；目标 frame 再返回换算后的顶层页面坐标。
    await chrome.tabs.sendMessage(tabId, { action: "prepareCapture" }, { frameId: 0 });
    const rectData = await chrome.tabs.sendMessage(tabId, { action: "getRect" }, { frameId });
    if (!rectData) {
      sendMessage(tabId, "error", "截图取消或目标元素已失效", frameId);
      return;
    }

    const { x, y, width, height } = rectData;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      sendMessage(tabId, "error", "目标元素尺寸无效", frameId);
      return;
    }
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
      sendMessage(tabId, "success", res.message, frameId);
    } else {
      sendMessage(tabId, "error", res?.message || "未知错误", frameId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[background] capture error:", msg);
    sendMessage(tabId, "error", `截图失败：${msg}`, frameId);
  } finally {
    capturingTabs.delete(tabId);
    // 通知 content script 清理选择状态（无论成功或失败）
    sendMessage(tabId, "teardown", undefined, frameId);
    if (frameId !== 0) {
      sendMessage(tabId, "teardown", undefined, 0);
    }
    await detachDebugger(tabId, armedTab);
  }
};
