chrome.runtime.onInstalled.addListener(() => {
  console.log("[background] Extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  console.log("[background] action.onClicked, tabId:", tab.id);
  chrome.tabs.sendMessage(
    tab.id,
    { action: "select" },
    () => {
      if (chrome.runtime.lastError) {
        console.error("[background] sendMessage 'select' failed:", chrome.runtime.lastError.message);
      } else {
        console.log("[background] sendMessage 'select' success");
      }
    }
  );
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action, data } = message;
  console.log("[background] onMessage received:", action, data);

  if (action !== "shot") return;

  const tabId = sender.tab.id;
  console.log("[background] sender tabId:", tabId);

  const sendMessage = (action, data) => {
    console.log("[background] sendMessage back to content:", action, data);
    chrome.tabs.sendMessage(
      tabId,
      { action, data },
      () => {
        if (chrome.runtime.lastError) {
          console.error("[background] sendMessage back failed:", chrome.runtime.lastError.message);
        } else {
          console.log("[background] sendMessage back success");
        }
      }
    );
  };

  const writeBase64ToClipboard = async (base64Data) => {
    console.log("[injected] writeBase64ToClipboard started");
    try {
      const response = await fetch(`data:image/png;base64,${base64Data}`);
      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([clipboardItem]);
      return { ok: true, message: "写入剪贴板成功！" };
    } catch (err) {
      console.error("[injected] clipboard.write failed:", err.message);
      return { ok: false, message: "写入剪贴板失败：" + err.message };
    }
  };

  const target = { tabId };

  const capture = async () => {
    try {
      console.log("[background] debugger attaching...");
      await chrome.debugger.attach(target, "1.3");
      console.log("[background] debugger attached");

      console.log("[background] enabling Page domain...");
      await chrome.debugger.sendCommand(target, "Page.enable");
      console.log("[background] Page domain enabled");

      const { x, y, width, height } = data;
      console.log("[background] capturing screenshot with clip:", { x, y, width, height });

      const result = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
        format: "png",
        clip: {
          x,
          y,
          width,
          height,
          scale: 1,
        },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      console.log("[background] captureScreenshot done, data length:", result.data?.length);

      console.log("[background] executing script into tab:", tabId);
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: writeBase64ToClipboard,
          args: [result.data],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error("[background] executeScript error:", chrome.runtime.lastError.message);
            sendMessage("error", "注入脚本失败：" + chrome.runtime.lastError.message);
            return;
          }
          console.log("[background] executeScript result:", results);
          const res = results[0]?.result;
          if (res?.ok) {
            sendMessage("success", res.message);
          } else {
            sendMessage("error", res?.message || "未知错误");
          }
        }
      );
    } catch (err) {
      console.error("[background] capture error:", err.message);
      sendMessage("error", "截图失败：" + err.message);
    } finally {
      try {
        await chrome.debugger.detach(target);
        console.log("[background] debugger detached");
      } catch (e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
  };

  capture();
});
