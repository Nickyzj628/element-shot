chrome.runtime.onInstalled.addListener(() => {
  console.log("[background] Extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  console.log("[background] action.onClicked, tabId:", tab.id);
  chrome.tabs.sendMessage(tab.id, {
    action: "select",
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("[background] sendMessage 'select' failed:", chrome.runtime.lastError.message);
    } else {
      console.log("[background] sendMessage 'select' success");
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const { action, data } = message;
  console.log("[background] onMessage received:", action, data);

  if (action !== "shot") return;

  const tabId = sender.tab.id;
  console.log("[background] sender tabId:", tabId);

  const sendMessage = (action, data) => {
    console.log("[background] sendMessage back to content:", action, data);
    chrome.tabs.sendMessage(tabId, {
      action,
      data,
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("[background] sendMessage back failed:", chrome.runtime.lastError.message);
      } else {
        console.log("[background] sendMessage back success");
      }
    });
  };

  const writeDataUrlToClipboard = async (dataUrl) => {
    console.log("[injected] writeDataUrlToClipboard started, dataUrl length:", dataUrl.length);
    try {
      const response = await fetch(dataUrl);
      console.log("[injected] fetch dataUrl response ok:", response.ok);
      const blob = await response.blob();
      console.log("[injected] blob type:", blob.type, "size:", blob.size);

      const clipboardItem = new ClipboardItem({
        [blob.type]: blob,
      });
      await navigator.clipboard.write([clipboardItem]);
      console.log("[injected] clipboard.write success");
      return { ok: true, message: "写入剪贴板成功！" };
    } catch (err) {
      console.error("[injected] clipboard.write failed:", err.message);
      return { ok: false, message: "写入剪贴板失败：" + err.message };
    }
  };

  console.log("[background] calling captureVisibleTab...");
  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    console.log("[background] captureVisibleTab callback, dataUrl length:", dataUrl ? dataUrl.length : "null");
    if (chrome.runtime.lastError) {
      console.error("[background] captureVisibleTab error:", chrome.runtime.lastError.message);
      sendMessage("error", "截图失败：" + chrome.runtime.lastError.message);
      return;
    }
    try {
      const { x, y, width, height } = data;
      console.log("[background] crop rect:", { x, y, width, height });

      const response = await fetch(dataUrl);
      console.log("[background] fetch full screenshot response ok:", response.ok);
      const blob = await response.blob();
      console.log("[background] full screenshot blob size:", blob.size);

      const bitmap = await createImageBitmap(blob);
      console.log("[background] createImageBitmap success");

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("无法获取OffscreenCanvas的2D上下文");
      }

      ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      console.log("[background] canvas drawImage done");

      const clippedBlob = await canvas.convertToBlob({ type: "image/png" });
      console.log("[background] convertToBlob done, clipped size:", clippedBlob.size);

      const clippedDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(clippedBlob);
      });
      console.log("[background] FileReader done, clippedDataUrl length:", clippedDataUrl.length);

      console.log("[background] executing script into tab:", tabId);
      chrome.scripting.executeScript({
        target: { tabId },
        func: writeDataUrlToClipboard,
        args: [clippedDataUrl],
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("[background] executeScript error:", chrome.runtime.lastError.message);
          sendMessage("error", "注入脚本失败：" + chrome.runtime.lastError.message);
          return;
        }
        console.log("[background] executeScript result:", results);
        const result = results[0]?.result;
        if (result?.ok) {
          sendMessage("success", result.message);
        } else {
          sendMessage("error", result?.message || "未知错误");
        }
      });
    } catch (err) {
      console.error("[background] process image error:", err.message);
      sendMessage("error", "处理图片失败：" + err.message);
    }
  });
});
