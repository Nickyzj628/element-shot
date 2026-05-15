import { defineConfig } from "addfox";

const manifest = {
  name: "Element Shot",
  version: "1.0.0",
  manifest_version: 3,
  description: "仿Firefox内置截图功能",
  permissions: ["activeTab", "scripting", "clipboardWrite", "debugger"],
  host_permissions: ["<all_urls>"],
  icons: {
    "16": "icons/icon_128.png",
    "48": "icons/icon_128.png",
    "128": "icons/icon_128.png",
  },
  action: {
    default_icon: {
      "16": "icons/icon_128.png",
      "48": "icons/icon_128.png",
      "128": "icons/icon_128.png",
    },
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
    },
  ],
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
  browserPath: {
    chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe`,
  },
  entry: {
    popup: "popup-disabled",
  },
});
