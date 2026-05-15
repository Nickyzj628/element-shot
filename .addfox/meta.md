---
ai_context: addfox_extension_metadata
description: Structured metadata about the Addfox browser extension project
when_to_use:
  - Initial project exploration - understand extension structure, entries, permissions
  - Build debugging - check entry configuration, output paths, dependencies
  - Architecture review - analyze entry relationships and code organization
  - Before modifying entries - see current configuration and generated outputs
structure:
  - Section 1: Basic project info (name, version, manifest version)
  - Section 2: Permissions (required, host, optional)
  - Section 3: Entries (source files, build outputs, configuration flags)
related_files:
  - error.md: Runtime errors (use when debugging extension errors)
  - llms.txt: This project's AI guide (always read first)
---

# Extension Meta

## 1. Basic information

- Framework: addfox
- Name: Element Shot
- Description: 仿Firefox内置截图功能
- Version: 1.0.0
- Framework version: 0.1.1
- Manifest version: 3

## 2. Permissions

### 2.1 Permissions
- activeTab
- scripting
- clipboardWrite
- debugger
- sidePanel

### 2.2 Host permissions
- <all_urls>

### 2.3 Optional permissions
- None

## 3. Entries

```text
background/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/background/index.js
└── 📁 JS/
    └── background/index.js
    ⚙️  html: false

content/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/content/index.js
├── 📁 JS/
│   └── content/index.js
└── 📁 CSS/
    └── static/css/content.b649f80102.css
    ⚙️  html: false

options/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/options/index.js
└── 📁 JS/
    └── options/index.js
    ⚙️  html: true

sidepanel/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/sidepanel/index.js
└── 📁 JS/
    └── sidepanel/index.js
    ⚙️  html: true
```
