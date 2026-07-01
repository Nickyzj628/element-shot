// 选择状态机：在用户进入选择模式时挂载 document 级事件监听器，
// 在退出路径（点击触发截图、Esc 取消）上解绑，使非选择期间
// 不会为高频事件（mouseover）付出性能代价。

const createSelection = () => {
  let target = null;
  let hoverOrigin = null;
  let depth = 0;
  let overlayEl = null;
  let locked = false;
  let armed = false;

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
    if (locked) return;
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };

  const onMouseDown = (e) => {
    if (!target) return;
    if (e.button !== 0) return; // 仅响应左键
    e.preventDefault();
    e.stopImmediatePropagation();
    // 锁定 target，防止后续 mouseover / wheel 事件（如 debugger 横幅
    // 导致的布局偏移触发意外 mouseover）覆盖掉用户按下的元素。
    locked = true;
    // mousedown 时即启动 chrome.debugger，让"正在调试此浏览器"横幅
    // 在用户按住期间渲染完毕，避免抬起后再等待导致明显延迟。
    // 注意：此处不移除高亮 overlay，让用户在按住期间仍能看到选中元素
    // 的高亮效果，直到 mouseup 才移除并截图。
    armed = true;
    chrome.runtime.sendMessage({ action: "attach" });
  };

  const onMouseUp = (e) => {
    if (!armed) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    armed = false;
    // 抬起时移除高亮并触发截图。
    removeOverlay();
    // debugger 横幅此时已渲染完成，直接触发截图。
    chrome.runtime.sendMessage({ action: "shot" });
  };

  // click 事件在 mouseup 之后触发，此处仅吞掉残余事件、阻止冒泡到页面元素，
  // 不再启动截图（截图已在 mouseup 中触发）。
  const onClick = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
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
      // mousedown 后的 armed 状态由 background 的 cancel 消息负责清理，
      // 这里仅在尚未 arm 时直接 teardown 选择层。
      if (armed) {
        armed = false;
        chrome.runtime.sendMessage({ action: "cancel" });
      } else {
        teardown();
      }
    }
  };

  const onWheel = (e) => {
    if (locked) return;
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
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("wheel", onWheel);
    removeOverlay();
    target = null;
    hoverOrigin = null;
    depth = 0;
    locked = false;
    armed = false;
  };

  const setup = () => {
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
  };

  return { setup, teardown, getRect };
};

export { createSelection };
