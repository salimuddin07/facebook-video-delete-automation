# Facebook Video Deleter — Chrome Extension

A Chrome extension that bulk-deletes all videos from your Facebook profile using your existing browser session. No cookies to export, no scripts to run — just install and click Start.

---

## Features

- **No setup required** — uses your existing Facebook login in Chrome
- **Auto-scroll** — scrolls the page to load all posts before processing
- **Smart selector fallback** — tries 11+ known Facebook HTML selectors so it keeps working even when Facebook changes its UI
- **Live progress** — popup shows deleted / failed / skipped counts in real time
- **Stop anytime** — Stop button cancels the process immediately
- **Rate-limit safe** — 50-second delay between deletions to avoid triggering Facebook's bot detection

---

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository

The extension icon will appear in your Chrome toolbar.

---

## Usage

1. Log in to Facebook in Chrome
2. Navigate to your Facebook profile's Videos tab
3. Click the extension icon to open the popup
4. Click **▶ Start Deleting**
5. The extension will scroll to load all posts, then delete them one by one
6. Click **⏹ Stop** at any time to cancel

Progress (deleted / failed / skipped) and a live activity log are shown in the popup while the automation runs.

---

## How It Works

1. The content script is injected into all `facebook.com` pages
2. On Start, it scrolls the page repeatedly until no new posts load
3. For each post it finds the three-dot menu, clicks **Delete**, then confirms in the dialog
4. A 50-second cooldown runs between each deletion
5. Posts that don't have a Delete option (e.g. shared posts you don't own) are skipped automatically

---

## Project Structure

```
extension/
├── manifest.json       Chrome MV3 extension manifest
├── content.js          Automation logic (runs inside the Facebook tab)
├── popup.html          Extension popup UI
├── popup.css           Popup styles
├── popup.js            Popup logic and messaging
├── background.js       Service worker
└── icons/              Extension icons (16×16, 48×48, 128×128)
```

---

## Troubleshooting

**Start button is disabled**
Make sure the active tab is on `https://www.facebook.com/`. The extension only activates on Facebook pages.

**Posts are being skipped**
Facebook may have updated its HTML. Open DevTools on the Facebook page and inspect the three-dot menu element — the `aria-label` or SVG structure may have changed. Update `THREE_DOT_BUTTON_SELECTORS` or `THREE_DOT_ICON_SELECTORS` in `content.js` accordingly.

**Automation stops after a few deletions**
Facebook may have triggered a rate-limit or security check. Check the Facebook tab for any dialogs or CAPTCHA prompts.

---

## ⚠️ Warning

Deleted videos cannot be recovered. Back up any videos you want to keep before running the extension. Use at your own risk and in accordance with Facebook's Terms of Service.

