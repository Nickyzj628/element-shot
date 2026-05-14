chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, {
        action: "select"
    });
});

chrome.runtime.onMessage.addListener((message, sender) => {
    const { action, data } = message;

    if (action !== "shot") return;

    const tabId = sender.tab.id;
    const sendMessage = (action, data) => {
        chrome.tabs.sendMessage(tabId, {
            action,
            data
        });
    };

    const writeDataUrlToClipboard = async (dataUrl) => {
        try {
            // 将 data URL 转换为 Blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // 将 Blob 写入剪贴板
            const clipboardItem = new ClipboardItem({
                [blob.type]: blob
            });
            await navigator.clipboard.write([clipboardItem]);
            sendMessage("success", "写入剪贴板成功！");
        } catch (err) {
            sendMessage("error", "写入剪贴板失败：" + err.message);
        }
    };

    chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
        try {
            const { x, y, width, height } = data;

            // 将 data URL 转换为 Blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // 用 OffscreenCanvas 裁剪图像
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("无法获取OffscreenCanvas的2D上下文");
            }

            ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);

            // 转换回 data URL
            const clippedBlob = await canvas.convertToBlob({ type: "image/png" });
            const clippedDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(clippedBlob);
            });

            // 注入脚本将图像写入剪贴板
            chrome.scripting.executeScript({
                target: { tabId },
                func: writeDataUrlToClipboard,
                args: [clippedDataUrl]
            });
        } catch (err) {
            sendMessage("error", "处理图片失败：" + err.message);
        }
    });
});