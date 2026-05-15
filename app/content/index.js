import "./styles.css";

console.log("[content] script loaded");

let isSelecting = false;
let target = null;
let toastEl = null;

const highlight = (element) => {
  console.log("[content] highlight element:", element.tagName, element.className);
  if (target) {
    target.classList.remove("highlight");
  }

  element.classList.add("highlight");
  target = element;
};

const shot = (element) => {
  const rect = element.getBoundingClientRect();
  console.log("[content] shot rect:", {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  });
  console.log("[content] sending shot message...");
  chrome.runtime.sendMessage({
    action: "shot",
    data: {
      x: rect.left,
      y: rect.top,
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
  if (!target) return;

  console.log("[content] click target:", target.tagName);
  e.preventDefault();
  e.stopPropagation();

  target.classList.remove("highlight");
  console.log("[content] highlight removed");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.log("[content] double rAF fired, calling shot");
      shot(target);
      isSelecting = false;
      target = null;
      console.log("[content] selection reset");
    });
  });
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
