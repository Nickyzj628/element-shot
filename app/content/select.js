// 选择状态机：在用户进入选择模式时挂载 document 级事件监听器，
// 在退出路径（pointerup 触发截图、Esc 取消）上解绑，使非选择期间
// 不会为高频事件（mouseover）付出性能代价。

const createSelection = () => {
  // target 是最终截图对象，hoverOrigin 保留鼠标最初经过的元素，供滚轮层级切换使用。
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

  const hideOverlayHighlight = () => {
    // 截图等待期间遮罩仍需作为命中屏障，只有在 teardown 时才可移除节点。
    overlayEl?.classList.add("element-shot-overlay-hidden");
  };

  const highlight = (element) => {
    target = element;
    const rect = element.getBoundingClientRect();
    const overlay = getOverlay();
    overlay.classList.remove("element-shot-overlay-hidden");
    overlay.classList.remove("element-shot-overlay-shield");
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

  const onPointerDown = (e) => {
    // 仅处理鼠标指针，忽略触摸、触控笔等其他指针类型
    if (e.pointerType !== "mouse") return;
    if (!target) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const overlay = getOverlay();
    // Capture 只重定向当前指针序列；启用命中屏障才能阻止视频根据 :hover 显示控件。
    overlay.setPointerCapture(e.pointerId);
    overlay.classList.add("element-shot-overlay-shield");
    // 锁定 target，防止后续事件覆盖掉用户按下的元素。
    locked = true;
    // 祖先 frame 可能仍高亮整个 iframe，先清理其遮罩，避免截图包含高亮层。
    if (window.parent !== window) {
      window.parent.postMessage({ action: "element-shot:clear-frame-selection" }, "*");
    }
    // 启动 chrome.debugger，让横幅在用户按住期间就渲染完毕。
    armed = true;
    chrome.runtime.sendMessage({ action: "attach" });
  };

  const onPointerUp = (e) => {
    // 仅处理鼠标指针
    if (e.pointerType !== "mouse") return;
    if (!armed) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    armed = false;
    // 仅隐藏高亮，保留命中屏障，避免目标视频等控件在截图完成前重新收到鼠标事件。
    hideOverlayHighlight();
    // debugger 横幅此时已渲染完成，直接触发截图。
    chrome.runtime.sendMessage({ action: "shot" });
  };

  // pointercancel：当指针交互被系统取消（如浏览器判定为滚屏/缩放手势）时的兜底清理。
  // 若已经 arm 过（即已 attach debugger），需要通知 background 取消并 detach，
  // 避免"正在调试此浏览器"横幅一直残留；若尚未 arm，则直接 teardown 选择层。
  const onPointerCancel = (e) => {
    if (e.pointerType !== "mouse") return;
    if (armed) {
      armed = false;
      locked = false;
      chrome.runtime.sendMessage({ action: "cancel" });
    } else {
      teardown();
    }
  };

  // click 事件在 pointerup 之后触发，此处仅吞掉残余事件、阻止冒泡到页面元素，
  // 不再启动截图（截图已在 pointerup 中触发）。
  const onClick = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const getRect = () => {
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      // 坐标相对于当前 frame 的视口；由上层 frame 逐级换算到顶层页面坐标。
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // pointerdown 后的 armed 状态由 background 的 cancel 消息负责清理，
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
    // 移除 Pointer Events 监听器
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerCancel);
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
    // 注册 Pointer Events，在捕获阶段拦截，确保优先于页面的 pointerdown 监听器。
    // 为什么不用 mousedown：pointerdown 比 mousedown 更早触发，能抢到更多主动权。
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
  };

  return { setup, teardown, getRect };
};

export { createSelection };
