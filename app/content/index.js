import "./styles.css";
import { createSelection } from "./select.js";

let toastEl = null;
let toastTimer = null;
let origScrollbarGutter = "";

const showToast = (message, type) => {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "element-shot-toast";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.className = `element-shot-toast ${type}`;

  requestAnimationFrame(() => {
    toastEl.classList.add("show");
  });

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    if (toastEl) {
      toastEl.classList.remove("show");
    }
    toastTimer = null;
  }, 3000);
};

const selection = createSelection();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, data } = message;

  switch (action) {
    case "select":
      selection.setup();
      break;
    case "success":
      showToast(data, "success");
      break;
    case "error":
      showToast(data, "error");
      break;
    case "getRect": {
      // 注入 scrollbar-gutter: stable，强制浏览器始终为滚动条保留空间。
      // 这样 Page.captureScreenshot 隐藏滚动条时，页面内容不会膨胀移位，
      // getBoundingClientRect 测量到的 x 坐标与截图时的实际布局一致。
      origScrollbarGutter = document.documentElement.style.scrollbarGutter;
      document.documentElement.style.scrollbarGutter = "stable";
      // 双 rAF：确保 scrollbar-gutter 生效 + debugger 横幅渲染等异步布局变更完成。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = selection.getRect();
          sendResponse(rect);
          selection.teardown();
        });
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
    }
    case "teardown":
      // background 在截图完成后发送此消息，此时恢复 scrollbar-gutter。
      document.documentElement.style.scrollbarGutter = origScrollbarGutter;
      selection.teardown();
      break;
  }
});
