import { defineConfig } from "addfox";

const manifest = {
  name: "Element Shot",
  version: "1.0.5",
  manifest_version: 3,
  description: "仿Firefox内置截图功能",
  // debugger 用于捕获可超出视口的元素；其余权限分别覆盖注入脚本和页面剪贴板写入。
  permissions: ["scripting", "clipboardWrite", "debugger"],
  host_permissions: ["<all_urls>"],
  icons: {
    16: "icons/icon_128.png",
    48: "icons/icon_128.png",
    128: "icons/icon_128.png",
  },
  action: {
    default_icon: {
      16: "icons/icon_128.png",
      48: "icons/icon_128.png",
      128: "icons/icon_128.png",
    },
  },
  // 必须注入所有 frame，才能让 iframe 内的元素也能被选中并逐级换算坐标。
  content_scripts: [
    {
      matches: ["<all_urls>"],
      all_frames: true,
      match_about_blank: true,
    },
  ],
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
});
