import "./styles.css";

console.log("[content] script loaded");

let isSelecting = false;
let target = null;
let toastEl = null;
let overlayEl = null;

const getOverlay = () => {
  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.className = "element-shot-overlay";
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
};

const removeOverlay = () => {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
};

const highlight = (element) => {
  console.log("[content] highlight element:", element.tagName, element.className);
  target = element;

  const rect = element.getBoundingClientRect();
  const overlay = getOverlay();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
};

const resetSelection = () => {
  removeOverlay();
  target = null;
  isSelecting = false;
  console.log("[content] selection reset");
};

const shot = (element) => {
  const rect = element.getBoundingClientRect();
  // 转换为文档绝对坐标，以支持超出视口的元素截图
  const docX = rect.left + window.scrollX;
  const docY = rect.top + window.scrollY;
  console.log("[content] shot rect (document coords):", {
    x: docX,
    y: docY,
    width: rect.width,
    height: rect.height,
  });
  console.log("[content] sending shot message...");
  chrome.runtime.sendMessage({
    action: "shot",
    data: {
      x: docX,
      y: docY,
      width: rect.width,
      height: rect.height,
    },
  });
};

const showToast = (message, type) => {
  console.log("[content] showToast:", type, message);
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

  setTimeout(() => {
    if (toastEl) {
      toastEl.classList.remove("show");
    }
  }, 3000);
};

document.addEventListener("mouseover", (e) => {
  if (!isSelecting) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;
  console.log("[content] mouseover:", element.tagName);
  highlight(element);
});

document.addEventListener("click", (e) => {
  if (!isSelecting || !target) return;

  console.log("[content] click target:", target.tagName);
  e.preventDefault();
  e.stopPropagation();

  removeOverlay();
  console.log("[content] overlay removed");

  shot(target);
  resetSelection();
});

document.addEventListener("keydown", (e) => {
  if (!isSelecting) return;
  if (e.key === "Escape") {
    console.log("[content] ESC pressed, canceling selection");
    e.preventDefault();
    e.stopPropagation();
    resetSelection();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  const { action, data } = message;
  console.log("[content] onMessage received:", action, data);

  switch (action) {
    case "select": {
      isSelecting = true;
      console.log("[content] selecting mode ON");
      break;
    }
    case "success": {
      showToast(data, "success");
      break;
    }
    case "error": {
      showToast(data, "error");
      break;
    }
    default: {
      console.log("[content] unhandled message data:", data);
      break;
    }
  }
});
