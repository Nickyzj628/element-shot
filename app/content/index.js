import "./styles.css";
import { createSelection } from "./select.js";

let toastEl = null;
let toastTimer = null;

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
    case "getRect":
      // 等待一帧（requestAnimationFrame），确保 debugger 横幅已渲染、
      // 页面已完成重新布局，再测量元素位置。
      requestAnimationFrame(() => {
        const rect = selection.getRect();
        sendResponse(rect);
        selection.teardown();
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
    case "teardown":
      selection.teardown();
      break;
  }
});
