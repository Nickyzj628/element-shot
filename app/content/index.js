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

chrome.runtime.onMessage.addListener((message) => {
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
  }
});
