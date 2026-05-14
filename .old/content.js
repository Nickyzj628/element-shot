let isSelecting = false;
let target = null;

const highlight = (element) => {
    if (target) {
        target.classList.remove("highlight");
    }

    element.classList.add("highlight");
    target = element;
};

const shot = (element) => {
    const rect = element.getBoundingClientRect();
    chrome.runtime.sendMessage({
        action: "shot",
        data: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
        }
    });
};

document.addEventListener("mouseover", (e) => {
    if (!isSelecting) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;
    highlight(element);
});

document.addEventListener("click", (e) => {
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    target.classList.remove("highlight");

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            shot(target);
            isSelecting = false;
            target = null;
        });
    });
});

chrome.runtime.onMessage.addListener((message) => {
    const { action, data } = message;

    switch (action) {
        case "select": {
            isSelecting = true;
            break;
        }
        default: {
            console.log(data);
            break;
        }
    }
});