import "./styles.css";
import { createSelection } from "./select.js";

/** @typedef {{ x: number, y: number, width: number, height: number }} FrameRect */

/** @type {HTMLDivElement | null} */
let toastEl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;
let origScrollbarGutter = "";
const frameRectMessage = "element-shot:resolve-frame-rect";
const clearFrameSelectionMessage = "element-shot:clear-frame-selection";
const frameRectTimeoutMs = 5000;

// debugger 横幅和滚动条布局都会引起重排，连续两帧后再测量才能拿到稳定 rect。
/** @param {() => void} callback */
const afterLayout = (callback) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
};

const stabilizeScrollbar = () => {
  origScrollbarGutter = document.documentElement.style.scrollbarGutter;
  document.documentElement.style.scrollbarGutter = "stable";
};

/** @param {FrameRect} rect */
const resolveDocumentRect = async (rect) => {
  if (window.parent === window) {
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  // 每个 iframe 只负责加上自己的 frame 边界，再把结果交给父 frame 继续处理。
  const channel = new MessageChannel();
  /** @type {Promise<FrameRect>} */
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error("iframe 坐标换算超时"));
    }, frameRectTimeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(/** @type {FrameRect} */ (event.data));
    };
  });
  window.parent.postMessage({ action: frameRectMessage, rect }, "*", [channel.port2]);
  return response;
};

window.addEventListener("message", (event) => {
  /** @type {HTMLIFrameElement | HTMLFrameElement | null} */
  let frame = null;
  for (const element of document.querySelectorAll("iframe, frame")) {
    if (
      (element instanceof HTMLIFrameElement || element instanceof HTMLFrameElement) &&
      element.contentWindow === event.source
    ) {
      frame = element;
      break;
    }
  }
  if (!frame) return;

  if (event.data?.action === clearFrameSelectionMessage) {
    selection.teardown();
    if (window.parent !== window) {
      window.parent.postMessage({ action: clearFrameSelectionMessage }, "*");
    }
    return;
  }

  if (event.data?.action !== frameRectMessage || !event.ports[0]) return;

  // postMessage 没有 frameId，只接受实际 contentWindow 对应的 iframe，避免串 frame。
  const frameRect = frame.getBoundingClientRect();
  const scaleX = frame.offsetWidth ? frameRect.width / frame.offsetWidth : 1;
  const scaleY = frame.offsetHeight ? frameRect.height / frame.offsetHeight : 1;
  /** @type {FrameRect} */
  const rect = event.data.rect;

  void resolveDocumentRect({
    x: frameRect.left + frame.clientLeft * scaleX + rect.x * scaleX,
    y: frameRect.top + frame.clientTop * scaleY + rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  })
    .then((documentRect) => event.ports[0].postMessage(documentRect))
    .catch(() => event.ports[0].postMessage(null));
});

/**
 * @param {string} message
 * @param {"success" | "error"} type
 */
const showToast = (message, type) => {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "element-shot-toast";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.className = `element-shot-toast ${type}`;

  const currentToast = toastEl;
  requestAnimationFrame(() => {
    currentToast.classList.add("show");
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

window.addEventListener("element-shot-select", () => {
  selection.setup();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, data } = message;

  switch (action) {
    case "success":
      showToast(data, "success");
      break;
    case "error":
      showToast(data, "error");
      break;
    case "getRect": {
      afterLayout(() => {
        const rect = selection.getRect();
        if (!rect) {
          sendResponse(null);
          return;
        }
        void resolveDocumentRect(rect)
          .then((documentRect) => sendResponse(documentRect))
          .catch(() => sendResponse(null))
          .finally(() => selection.teardown());
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
    }
    case "prepareCapture":
      // 截图 API 隐藏滚动条时不让顶层页面内容横向移位。
      stabilizeScrollbar();
      afterLayout(() => sendResponse());
      return true;
    case "teardown":
      // background 在截图完成后发送此消息，此时恢复 scrollbar-gutter。
      document.documentElement.style.scrollbarGutter = origScrollbarGutter;
      selection.teardown();
      break;
  }
});
