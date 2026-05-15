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
- Name: My Extension
- Description: Browser extension built with addfox
- Version: 1.0.0
- Framework version: 0.1.1
- Manifest version: 3

## 2. Permissions

### 2.1 Permissions
- activeTab
- sidePanel

### 2.2 Host permissions
- None

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
└── 📁 JS/
    └── content/index.js
    ⚙️  html: false

popup/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/popup/index.js
└── 📁 JS/
    ├── popup/index.js
    └── static/js/shared-vendor.js
    ⚙️  html: true

options/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/options/index.js
└── 📁 JS/
    ├── options/index.js
    └── static/js/shared-vendor.js
    ⚙️  html: true

sidepanel/
├── 📄 Source: C:/Users/Administrator/Documents/element-shot/app/sidepanel/index.js
└── 📁 JS/
    ├── sidepanel/index.js
    └── static/js/shared-vendor.js
    ⚙️  html: true
```
