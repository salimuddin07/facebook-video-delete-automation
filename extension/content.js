(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let isRunning = false;
  let shouldStop = false;
  let deletedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // ── All known selectors (try every variant — Facebook changes HTML often) ──

  // Three-dot menu: aria-label button types (element itself is clickable)
  const THREE_DOT_BUTTON_SELECTORS = [
    'div[aria-label="Actions for this post"]',
    'div[aria-label="Action options"]',
    '[role="button"][aria-label*="Actions"]',
    '[role="button"][aria-label*="More"]',
    'div[aria-label="More"]',
    '[data-testid="post_chevron_button"]',
    '[aria-label*="option"]',
  ];

  // Three-dot menu: SVG/icon types (need findClickableParent() to get button)
  const THREE_DOT_ICON_SELECTORS = [
    'div[role="button"]:has(svg)',
    'svg[fill="currentColor"] > g[transform="translate(-446 -350)"]',
    'svg[fill="currentColor"]>g[transform="translate(-446 -350)"]',
    'svg[fill="currentColor"]',
  ];

  // Post containers: try all, use the selector returning the most elements
  const POST_SELECTORS = [
    '.x1jx94hy > div > div > div > div.html-div',
    '[data-pagelet*="FeedUnit"]',
    '[data-ft]',
    'div[id^="hyperfeed_story_id"]',
    '[data-testid="fbfeed_story"]',
    '[role="article"]',
  ];

  // Delete confirmation button: standard CSS selectors (no jQuery :contains/:has-text)
  const DELETE_CONFIRM_SELECTORS = [
    '[aria-hidden="false"] [aria-label="Delete"][role="button"]',
    '[aria-label="Delete"][role="button"]',
    '[aria-label*="Delete"][role="button"]',
    '[role="button"][aria-label*="delete" i]',
    '[data-testid="delete_confirm_button"]',
    '[aria-label*="confirm" i][role="button"]',
    'button[data-testid*="confirm"]',
  ];

  // Loading / feed-end selectors (multi-value)
  const SPINNER_SELECTOR = '[role="progressbar"], .loading, [aria-label*="Loading"], [data-testid="loading"]';
  const FEED_END_SELECTOR = '[data-testid="feed_end"], .feed_end, [aria-label*="end of feed"]';

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sendMsg(data) {
    try {
      chrome.runtime.sendMessage({ ...data, deleted: deletedCount, failed: failedCount, skipped: skippedCount, isRunning });
    } catch (e) {
      // Popup closed — ignore
    }
  }

  function log(message, type = 'log') {
    console.log(`[FB Deleter] ${message}`);
    sendMsg({ type, message });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Safe querySelector — some selectors like :has() may throw on unsupported browsers
  function safeQuery(root, sel) {
    try { return root.querySelector(sel); } catch (e) { return null; }
  }

  function safeQueryAll(root, sel) {
    try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; }
  }

  // Poll for delete confirm button across all known selectors
  async function waitForDeleteButton(timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const btn = findDeleteConfirmButton();
      if (btn) return btn;
      await delay(200);
    }
    return null;
  }

  // Get all post elements: try every selector, return the set with the most results
  function getPosts() {
    let best = [];
    for (const sel of POST_SELECTORS) {
      const found = safeQueryAll(document, sel);
      if (found.length > best.length) best = found;
    }
    return [...new Set(best)]; // deduplicate
  }

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
  }

  // Walk up from an SVG/icon element to find its clickable button ancestor
  function findClickableParent(el) {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const role = parent.getAttribute('role');
      if (parent.tagName === 'BUTTON' || role === 'button' || parent.onclick || parent.getAttribute('aria-label')) {
        return parent;
      }
      parent = parent.parentElement;
      if (parent && parent.getAttribute('role') === 'article') break;
    }
    return el.parentElement || el;
  }

  // Find the three-dot menu button inside a post element
  function findThreeDotMenu(post) {
    // 1. Try direct-button selectors (element is already the clickable button)
    for (const sel of THREE_DOT_BUTTON_SELECTORS) {
      const el = safeQuery(post, sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
      }
    }
    // 2. Try icon/SVG selectors (need to walk up the DOM to find clickable parent)
    for (const sel of THREE_DOT_ICON_SELECTORS) {
      const icons = safeQueryAll(post, sel);
      for (const icon of icons) {
        const rect = icon.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return findClickableParent(icon);
      }
    }
    return null;
  }

  // Find the "Delete" option in an open dropdown menu
  function findDeleteMenuItem() {
    // 1. Standard CSS: menuitem with aria-label containing "Delete"
    const byLabel = safeQuery(document, '[role="menuitem"][aria-label*="Delete"]');
    if (byLabel) return byLabel;

    // 2. JS text match: menuitem whose visible text is "delete" (handles any language variation)
    const menuItems = safeQueryAll(document, '[role="menuitem"]');
    const byText = menuItems.find(item => {
      const t = (item.textContent || '').trim().toLowerCase();
      return t === 'delete' || t === 'delete post' || t === 'delete video';
    });
    if (byText) return byText;

    // 3. Broader: check text inside menuitem spans and divs
    const inner = safeQueryAll(document, '[role="menuitem"] span, [role="menuitem"] div');
    return inner.find(el => (el.textContent || '').trim().toLowerCase() === 'delete') || null;
  }

  // Find the confirm-Delete button in the confirmation dialog
  function findDeleteConfirmButton() {
    // 1. Try all standard CSS selectors in priority order
    for (const sel of DELETE_CONFIRM_SELECTORS) {
      const el = safeQuery(document, sel);
      if (el) return el;
    }
    // 2. JS text fallback: scan inside open dialogs for a button with text "delete"
    for (const dSel of ['[role="dialog"]', '[aria-modal="true"]']) {
      for (const dialog of safeQueryAll(document, dSel)) {
        const buttons = safeQueryAll(dialog, '[role="button"], button');
        const match = buttons.find(b => (b.textContent || '').trim().toLowerCase() === 'delete');
        if (match) return match;
      }
    }
    return null;
  }

  // ── Scroll to let page fully load ─────────────────────────────────────────
  // NOTE: Facebook uses virtual DOM windowing (~3 posts in DOM at a time), so
  // we track page HEIGHT growth — not post count — to detect the real end.
  async function scrollToLoadAllPosts() {
    log('📜 Scrolling to load all posts…', 'progress');
    let stableAttempts = 0;
    const MAX_STABLE = 5;
    const MAX_SCROLLS = 100;

    for (let i = 0; i < MAX_SCROLLS; i++) {
      if (shouldStop) break;

      const heightBefore = document.body.scrollHeight;
      window.scrollTo(0, heightBefore);
      await delay(3500);

      if (safeQuery(document, FEED_END_SELECTOR)) {
        log('🏁 End of feed reached', 'progress');
        break;
      }

      const heightAfter = document.body.scrollHeight;
      log(`📊 Scroll ${i + 1}: ${heightAfter}px (prev: ${heightBefore}px)`);

      if (heightAfter <= heightBefore) {
        stableAttempts++;
        if (safeQuery(document, SPINNER_SELECTOR)) {
          stableAttempts = 0; // still loading — keep waiting
          await delay(5000);
        } else if (stableAttempts >= MAX_STABLE) {
          log('🏁 Page height stopped growing — reached end', 'progress');
          break;
        }
      } else {
        stableAttempts = 0;
      }
    }

    log('🎯 Initial scroll complete', 'progress');
    window.scrollTo(0, 0);
    await delay(2000);
  }

  // ── Delete a single post ───────────────────────────────────────────────────
  async function deletePost(post, index) {
    try {
      // Step 1: Scroll post into view
      post.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(2000);

      // Step 2: Find three-dot menu (tries all 11 selector variants)
      const menuBtn = findThreeDotMenu(post);
      if (!menuBtn) {
        log(`⚠️ Post ${index + 1} — no three-dot menu found, skipping`);
        skippedCount++;
        return false;
      }

      // Step 3: Click three-dot menu to open dropdown
      log(`🔍 Post ${index + 1} — clicking three-dot menu…`);
      menuBtn.click();
      await delay(3000);

      // Step 4: Find Delete option in dropdown (tries aria-label + text matching)
      const deleteItem = findDeleteMenuItem();
      if (!deleteItem) {
        log(`⚠️ Post ${index + 1} — no Delete option in menu, skipping`);
        pressEscape();
        await delay(1500);
        skippedCount++;
        return false;
      }

      // Step 5: Click Delete in dropdown
      log(`🎯 Post ${index + 1} — clicking Delete…`);
      deleteItem.click();
      await delay(2500);

      // Step 6: Wait for and click the confirm button (tries 7 CSS + dialog text fallback)
      const confirmBtn = await waitForDeleteButton(8000);
      if (!confirmBtn) {
        log(`⚠️ Post ${index + 1} — confirmation dialog not found`);
        pressEscape();
        await delay(1500);
        failedCount++;
        return false;
      }

      confirmBtn.click();
      await delay(4000);

      deletedCount++;
      log(`🎉 Post ${index + 1} — DELETED successfully`, 'progress');
      return true;

    } catch (err) {
      log(`❌ Post ${index + 1} — error: ${err.message}`);
      try { pressEscape(); } catch (_) {}
      await delay(1500);
      failedCount++;
      return false;
    }
  }

  // ── Main automation loop ───────────────────────────────────────────────────
  // Always fresh-query the DOM and delete the first visible post.
  // This handles Facebook's virtual DOM windowing — we never use a snapshot.
  async function findAndDeletePosts() {
    log('🗑️ Starting deletion loop…', 'progress');
    let totalAttempts = 0;
    let noPostRounds = 0;
    let stickyFailures = 0;

    while (!shouldStop) {
      // Go back to top so Facebook loads top posts into DOM
      window.scrollTo(0, 0);
      await delay(1500);

      const posts = getPosts();

      if (posts.length === 0) {
        noPostRounds++;
        log(`⚠️ No posts in DOM (${noPostRounds}/5)…`);
        if (noPostRounds >= 5) {
          log('✅ No more posts — all done!', 'progress');
          break;
        }
        await delay(3000);
        continue;
      }

      noPostRounds = 0;
      totalAttempts++;
      log(`\n🎯 Attempt ${totalAttempts} — ${posts.length} posts in DOM…`, 'progress');
      sendMsg({ type: 'progress', message: `Attempt ${totalAttempts} — Deleted: ${deletedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}` });

      // Always target the first visible post (fresh reference, never stale)
      const deleted = await deletePost(posts[0], totalAttempts - 1);

      if (deleted) {
        stickyFailures = 0;
        if (!shouldStop) {
          log('⏱️ Waiting 50 seconds before next deletion…', 'progress');
          for (let s = 50; s > 0; s--) {
            if (shouldStop) break;
            sendMsg({ type: 'countdown', message: `Next deletion in ${s}s…` });
            await delay(1000);
          }
        }
      } else {
        // Post couldn't be deleted — scroll past it to expose the next one
        stickyFailures++;
        if (stickyFailures >= 10) {
          log('⚠️ 10 consecutive failures — stopping', 'progress');
          break;
        }
        window.scrollBy(0, 500);
        await delay(2000);
      }
    }
  }

  // ── Entry point ────────────────────────────────────────────────────────────
  async function startAutomation() {
    isRunning = true;
    shouldStop = false;
    deletedCount = 0;
    failedCount = 0;
    skippedCount = 0;

    log('🚀 Facebook Video Deleter started!', 'progress');

    try {
      await scrollToLoadAllPosts();
      if (!shouldStop) await findAndDeletePosts();
    } catch (err) {
      log(`❌ Fatal error: ${err.message}`, 'error');
      sendMsg({ type: 'error', message: err.message });
    } finally {
      isRunning = false;
      const summary = `✅ Done! Deleted: ${deletedCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`;
      log(summary, 'done');
      sendMsg({ type: 'done', message: summary });
    }
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'start') {
      if (isRunning) {
        sendResponse({ status: 'already_running', isRunning: true });
      } else {
        startAutomation();
        sendResponse({ status: 'started', isRunning: true });
      }
    } else if (msg.action === 'stop') {
      shouldStop = true;
      sendResponse({ status: 'stopping', isRunning });
    } else if (msg.action === 'status') {
      sendResponse({ isRunning, deleted: deletedCount, failed: failedCount, skipped: skippedCount });
    }
    return true; // keep channel open for async responses
  });

  log('✅ Facebook Video Deleter content script loaded and ready.');
})();
