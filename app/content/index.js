import "./styles.css";

console.log("[content] script loaded");

let isSelecting = false;
let target = null;
let hoverOrigin = null;
let depth = 0;
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

const getAncestor = (element, levels) => {
  let el = element;
  for (let i = 0; i < levels && el; i++) {
    el = el.parentElement;
  }
  return el;
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
  hoverOrigin = null;
  depth = 0;
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
  if (element === target) return;

  console.log("[content] mouseover:", element.tagName);
  hoverOrigin = element;
  depth = 0;
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

document.addEventListener("wheel", (e) => {
  if (!isSelecting || !hoverOrigin) return;

  e.preventDefault();
  e.stopPropagation();

  if (e.deltaY < 0) {
    // 向上滚动 → 父元素
    const nextDepth = depth + 1;
    const parent = getAncestor(hoverOrigin, nextDepth);
    if (parent) {
      depth = nextDepth;
      console.log("[content] wheel up, depth:", depth, "→", parent.tagName);
      highlight(parent);
    }
  } else if (e.deltaY > 0) {
    // 向下滚动 → 子元素
    if (depth > 0) {
      depth--;
      const child = getAncestor(hoverOrigin, depth);
      if (child) {
        console.log("[content] wheel down, depth:", depth, "→", child.tagName);
        highlight(child);
      }
    }
  }
}, { passive: false });

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
