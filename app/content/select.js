// 选择状态机：在用户进入选择模式时挂载 document 级事件监听器，
// 在退出路径（点击触发截图、Esc 取消）上解绑，使非选择期间
// 不会为高频事件（mouseover）付出性能代价。

const createSelection = () => {
  let target = null;
  let hoverOrigin = null;
  let depth = 0;
  let overlayEl = null;

  const getAncestor = (element, levels) => {
    let el = element;
    for (let i = 0; i < levels && el; i++) {
      el = el.parentElement;
    }
    return el;
  };

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
    target = element;
    const rect = element.getBoundingClientRect();
    const overlay = getOverlay();
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };

  const onMouseOver = (e) => {
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };

  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    // 仅发送触发信号，坐标由 background 稍后通过 getRect 消息主动获取。
    // 这样可以在 debugger 横幅出现、页面重新布局之后再测量元素位置。
    chrome.runtime.sendMessage({ action: "shot" });
  };

  const getRect = () => {
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      teardown();
    }
  };

  const onWheel = (e) => {
    if (!hoverOrigin) return;

    e.stopPropagation();

    if (e.deltaY < 0) {
      e.preventDefault();
      // 向上滚动 → 父元素
      const nextDepth = depth + 1;
      const parent = getAncestor(hoverOrigin, nextDepth);
      if (parent) {
        depth = nextDepth;
        highlight(parent);
      }
    } else if (e.deltaY > 0) {
      e.preventDefault();
      // 向下滚动 → 子元素
      if (depth > 0) {
        depth--;
        const child = getAncestor(hoverOrigin, depth);
        if (child) {
          highlight(child);
        }
      }
    }
    // deltaY === 0：纯水平 / 缩放 / 惯性 — 让页面自行处理。
  };

  const teardown = () => {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("wheel", onWheel);
    removeOverlay();
    target = null;
    hoverOrigin = null;
    depth = 0;
  };

  const setup = () => {
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
  };

  return { setup, teardown, getRect };
};

export { createSelection };
