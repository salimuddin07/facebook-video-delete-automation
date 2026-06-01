(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let isRunning = false;
  let shouldStop = false;
  let deletedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let deleteMode = 'videos'; // 'videos' | 'posts' | 'both'

  // ── Page validation ────────────────────────────────────────────────────────
  // CRITICAL: Prevent running on non-profile pages (like friend requests)
  function isValidProfilePage() {
    const url = window.location.href;
    console.log(`[FB Deleter] PAGE CHECK: Current URL: ${url}`);
    
    // ❌ ABSOLUTELY BLOCK these pages
    const BLOCKED_KEYWORDS = [
      'friends/requests',     // Friend requests - DO NOT RUN
      'find/friends',         // Find friends
      'messages',             // Messenger
      'notifications',        // Notifications
      'groups',               // Groups
      'pages',                // Pages
      'login',                // Login
      'help.facebook',        // Help
      'jobs',                 // Jobs
      'gaming',               // Gaming
      'shop',                 // Marketplace
      'watch',                // Watch (unless specifically MY videos)
      'reel',                 // Reels (not profile videos)
      'search',               // Search results
    ];
    
    for (const blocked of BLOCKED_KEYWORDS) {
      if (url.includes(blocked)) {
        console.log(`[FB Deleter] ❌ BLOCKED: Detected "${blocked}" in URL - STOPPING`);
        return false;
      }
    }
    
    // ✅ ONLY ALLOW these specific profile paths
    const ALLOWED_KEYWORDS = [
      '/me/',                 // My profile (/me/*, /me/videos, /me/posts)
      'facebook.com/me',      // My profile
      '/profile.php',         // Profile (any user)
      '/videos_home',         // Videos feed
    ];
    
    // Check if URL matches allowed keywords
    let isAllowed = ALLOWED_KEYWORDS.some(kw => url.includes(kw));
    
    // ALSO ALLOW: Any username-based profile (facebook.com/username or facebook.com/username/)
    // This catches URLs like facebook.com/salimuddin007
    if (!isAllowed) {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        // Match /username or /username/ patterns (but NOT root /)
        // Avoid matching /api/ or other system paths
        if (pathname.match(/^\/[a-zA-Z0-9._-]+\/?$/) && !pathname.includes('api')) {
          isAllowed = true;
          console.log(`[FB Deleter] ✅ ALLOWED: Username-based profile URL`);
        }
      } catch (e) {
        console.log(`[FB Deleter] URL parsing error: ${e.message}`);
      }
    }
    
    if (!isAllowed) {
      console.log(`[FB Deleter] ❌ NOT ALLOWED: URL doesn't match allowed profile pages`);
      return false;
    }
    
    console.log(`[FB Deleter] ✅ ALLOWED: Valid profile page`);
    return true;
  }

  // ── All known selectors (comprehensive list - try each in order) ────────────

  // Profile page detection selectors
  const PROFILE_PAGE_SELECTORS = [
    '[data-pagelet*="ProfileTimeline"]',
    '[data-pagelet="ProfileTimeline"]',
    'div[id*="profile"]',
    '#timeline_tab_content',
    '[data-pagelet="ProfileCover"]',
    '[role="banner"]',
    'h1[data-selenium-id="ProfileHeader"]',
    'h1[dir="auto"]',
  ];

  // Three-dot menu: aria-label button types (element itself is clickable)
  const THREE_DOT_BUTTON_SELECTORS = [
    'div[aria-label="Actions for this post"]',
    'div[aria-label="Action options"]',
    '[role="button"][aria-label*="Actions"]',
    '[role="button"][aria-label*="More"]',
    'div[aria-label="More"]',
    '[data-testid="post_chevron_button"]',
    '[aria-label*="option"]',
    '[aria-label*="option"]',
    'div[role="button"]:has(svg)',
  ];

  // Three-dot menu: SVG/icon types (need findClickableParent() to get button)
  const THREE_DOT_ICON_SELECTORS = [
    'svg[fill="currentColor"] > g[transform="translate(-446 -350)"]',
    'svg[fill="currentColor"]>g[transform="translate(-446 -350)"]',
    'svg[fill="currentColor"]',
    'div[role="button"]:has(svg)',
  ];

  // Post containers: prioritize direct feed post selectors + video-specific ones
  const POST_SELECTORS = [
    '[data-testid="fbfeed_story"]',              // Primary: Facebook feed story
    '[role="article"]',                         // Article role
    'div[id^="hyperfeed_story_id"]',             // Hyperfeed post ID
    '[data-pagelet*="FeedUnit"]',                // Feed unit pagelet
    '[data-ft]',                                // data-ft attribute
    '.x1jx94hy > div > div > div > div.html-div', // Class-based
    '[aria-label*="video"]',                    // Video specific
    '[data-store*="video"]',                    // Video store data
    'video',                                    // Video element
    '[aria-label*="video player"]',             // Video player
    '[data-video-id]',                          // Video ID attribute
    'div[id*="story"]',                         // Story ID div
  ];

  // Delete confirmation button: standard CSS selectors
  const DELETE_CONFIRM_SELECTORS = [
    '[aria-hidden="false"] [aria-label="Delete"][role="button"]',
    '[aria-label="Delete"][role="button"]',
    '[aria-label*="Delete"][role="button"]',
    '[role="button"][aria-label*="delete" i]',
    '[data-testid="delete_confirm_button"]',
    '[aria-label*="confirm" i][role="button"]',
    'button[data-testid*="confirm"]',
    '[role="dialog"] [role="button"]',
    '[aria-modal="true"] [role="button"]',
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
  // Prioritize video posts when in 'videos' mode
  function getPosts() {
    let candidates = [];
    const debugInfo = [];
    
    console.log(`[FB Deleter] ===== getPosts() DEBUG START =====`);
    console.log(`[FB Deleter] Mode: ${deleteMode}`);
    console.log(`[FB Deleter] Viewport height: ${window.innerHeight}px`);
    console.log(`[FB Deleter] Document scroll height: ${document.documentElement.scrollHeight}px`);
    console.log(`[FB Deleter] Current scroll position: ${window.scrollY}px`);
    
    // STRATEGY 1: Try standard post container selectors
    if (deleteMode === 'videos' || deleteMode === 'both') {
      console.log(`[FB Deleter] Searching for video posts...`);
      const videoSelectors = [
        '[aria-label*="video"]',
        '[data-store*="video"]',
        'video',
        '[aria-label*="video player"]',
        '[data-video-id]',
        '[role="article"]:has(video)',
      ];
      
      for (const sel of videoSelectors) {
        try {
          const found = safeQueryAll(document, sel);
          if (found.length > 0) {
            debugInfo.push(`✅ ${sel}: ${found.length} found`);
            candidates = candidates.concat(found);
          } else {
            debugInfo.push(`❌ ${sel}: 0`);
          }
        } catch (e) {
          debugInfo.push(`⚠️ ${sel}: error`);
        }
      }
    }
    
    // Always search primary post selectors
    console.log(`[FB Deleter] Searching for posts via PRIMARY selectors...`);
    for (const sel of POST_SELECTORS) {
      try {
        const found = safeQueryAll(document, sel);
        if (found.length > 0) {
          debugInfo.push(`✅ ${sel}: ${found.length} found`);
          if (found.length > candidates.length) {
            candidates = found;
          }
        } else {
          debugInfo.push(`❌ ${sel}: 0`);
        }
      } catch (e) {
        debugInfo.push(`⚠️ ${sel}: error`);
      }
    }
    
    // Log all attempts
    console.log(`[FB Deleter] DEBUG getPosts() standard selectors:\n${debugInfo.join('\n')}`);
    
    // STRATEGY 2: If standard selectors found nothing, search for elements with three-dot menus
    // The presence of a three-dot menu is a strong signal that we found a post
    if (candidates.length === 0) {
      console.log(`[FB Deleter] No posts via standard selectors. Searching for elements with menu buttons...`);
      
      // Find all potential menu buttons (these definitely exist if there are posts)
      const menuButtons = document.querySelectorAll('[aria-label*="more" i], [aria-label*="action" i], [aria-label*="option" i], [data-testid*="menu"], [data-testid*="chevron"]');
      console.log(`[FB Deleter] Found ${menuButtons.length} potential menu buttons`);
      
      if (menuButtons.length > 0) {
        // Walk up from each menu button to find its parent post container
        for (const btn of menuButtons) {
          let parent = btn.parentElement;
          while (parent && parent !== document.body) {
            const rect = parent.getBoundingClientRect();
            const text = parent.textContent?.trim() || '';
            
            // Look for a parent that's reasonably sized and has content
            if (rect.width > 150 && rect.height > 100 && rect.width < 1000 && text.length > 30) {
              candidates.push(parent);
              console.log(`[FB Deleter] Found post via menu button parent: ${rect.width}x${rect.height}`);
              break;
            }
            
            parent = parent.parentElement;
          }
        }
      }
      
      if (candidates.length > 0) {
        console.log(`[FB Deleter] ✅ Found ${candidates.length} posts by walking up from menu buttons`);
      }
    }
    
    // STRATEGY 3: Last resort - look for any large visible container with significant content
    if (candidates.length === 0) {
      console.log(`[FB Deleter] FALLBACK: Scanning DOM structure for post-like containers...`);
      
      const allElements = document.querySelectorAll('div, section, article, main, [data-pagelet], [data-testid]');
      const structuralPosts = [];
      
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        
        // Must be visible and reasonably sized
        if (rect.width < 150 || rect.height < 100) continue;
        if (rect.top < -2000 || rect.top > window.innerHeight * 3) continue;
        if (rect.width > 1000 || rect.height > 3000) continue;
        
        // Must have substantial content
        if (text.length < 50) continue;
        
        // Must NOT be unwanted content
        const lowerText = text.toLowerCase();
        if (lowerText.includes('friend request') || lowerText.includes('add friend') || lowerText.includes('respond to')) continue;
        if (lowerText.includes('message') && lowerText.length < 100) continue;
        
        // Good signals: has button, has media, is in feed area
        const hasButton = !!el.querySelector('[role="button"], button');
        const hasMedia = !!el.querySelector('img, video, [role="img"]');
        const inFeedArea = rect.left < window.innerWidth && rect.right > 0;
        
        if (hasButton && hasMedia && inFeedArea) {
          structuralPosts.push(el);
        }
      }
      
      if (structuralPosts.length > 0) {
        console.log(`[FB Deleter] ✅ FALLBACK: Found ${structuralPosts.length} posts via DOM structure`);
        candidates = structuralPosts;
      } else {
        console.log(`[FB Deleter] ❌ FALLBACK: No posts found via any method`);
        console.log(`[FB Deleter] Page info: innerWidth=${window.innerWidth}, body.scrollHeight=${document.body.scrollHeight}`);
        return [];
      }
    }
    
    if (candidates.length === 0) {
      return [];
    }
    
    // Filter to only visible posts that have actual content
    // This prevents matching friend requests, ads, or empty containers
    const validated = candidates.filter(post => {
      // Check if visible
      const rect = post.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      
      // SKIP friend request related elements
      if (post.textContent.includes('Confirm') && post.textContent.includes('Delete')) {
        console.log(`[FB Deleter] DEBUG: Skipping friend request confirmation element`);
        return false;
      }
      
      // SKIP elements with friend-related text
      const text = post.textContent.toLowerCase();
      if (text.includes('friend request') || text.includes('add friend') || text.includes('respond to')) {
        console.log(`[FB Deleter] DEBUG: Skipping friend request element`);
        return false;
      }
      
      // Should have some actual content
      let hasContent = false;
      
      // Check for video content first (highest priority)
      if (deleteMode === 'videos' || deleteMode === 'both') {
        const hasVideo = post.querySelector('video');
        const hasVideoLabel = post.getAttribute('aria-label')?.toLowerCase().includes('video');
        if (hasVideo || hasVideoLabel) {
          hasContent = true;
        }
      }
      
      // Check for image content
      if (!hasContent && (deleteMode === 'posts' || deleteMode === 'both')) {
        const hasImage = post.querySelector('img, [role="img"]');
        if (hasImage) hasContent = true;
      }
      
      // Check for text content
      if (!hasContent && post.textContent && post.textContent.trim().length > 20) {
        hasContent = true;
      }
      
      // Should have a menu-like structure (at least one button or clickable element in header area)
      const hasMenuStructure = post.querySelector('[role="button"], [aria-label*="More"], [aria-label*="Actions"]');
      
      return hasContent && hasMenuStructure;
    });
    
    // Deduplicate
    const unique = [...new Set(validated)];
    console.log(`[FB Deleter] DEBUG: Found ${candidates.length} candidates, ${unique.length} with valid content`);
    return unique;
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
  // CRITICAL: Only find the POST's menu, not comment menus or other nested elements
  function findThreeDotMenu(post) {
    console.log(`[FB Deleter] DEBUG: Searching for three-dot menu in post...`);
    
    // Exclude these known non-post selectors
    const EXCLUDED_SELECTORS = [
      '.xf7dkkf.xdt5ytf .xamitd3 svg.x1lliihq', // Comment/reaction menu - DO NOT CLICK
      '[data-testid*="comment"]',
      '[data-testid*="reaction"]',
      '.x1a6qonf', // Often used for comment sections
    ];
    
    const postRect = post.getBoundingClientRect();
    const postRight = postRect.right;
    const postLeft = postRect.left;
    const postCenterX = postLeft + (postRect.width / 2);
    
    // Get ALL clickable elements in the post
    const allClickable = post.querySelectorAll('[role="button"], button, [role="menubutton"], div[role="button"], [data-testid*="button"]');
    console.log(`[FB Deleter] DEBUG: Found ${allClickable.length} clickable elements in post`);
    
    // Log all clickable elements for debugging
    for (let i = 0; i < Math.min(allClickable.length, 5); i++) {
      const btn = allClickable[i];
      console.log(`[FB Deleter] DEBUG [${i}] aria-label="${btn.getAttribute('aria-label')}" data-testid="${btn.getAttribute('data-testid')}" title="${btn.getAttribute('title')}" svg=${!!btn.querySelector('svg')}`);
    }
    
    // Find buttons that match the "three-dot menu" pattern
    const candidates = [];
    
    for (const btn of allClickable) {
      // Skip excluded selectors
      let isExcluded = false;
      for (const excludeSel of EXCLUDED_SELECTORS) {
        if (btn.matches(excludeSel)) {
          console.log(`[FB Deleter] DEBUG: Skipping excluded selector`);
          isExcluded = true;
          break;
        }
        // Also skip if this button is inside an excluded element
        if (btn.closest(excludeSel)) {
          console.log(`[FB Deleter] DEBUG: Button is inside excluded element`);
          isExcluded = true;
          break;
        }
      }
      if (isExcluded) continue;
      
      // Skip if it's a link or has href-like attributes
      if (btn.tagName === 'A' || btn.href) continue;
      
      // Skip profile/friend-related buttons
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const dataTestid = (btn.getAttribute('data-testid') || '').toLowerCase();
      const dataAction = (btn.getAttribute('data-action') || '').toLowerCase();
      
      if (ariaLabel.includes('profile') || ariaLabel.includes('friend') || ariaLabel.includes('request') ||
          dataTestid.includes('profile') || dataTestid.includes('friend') || 
          dataAction.includes('profile') || dataAction.includes('friend')) {
        console.log(`[FB Deleter] DEBUG: Skipping profile/friend button: ${ariaLabel}`);
        continue;
      }
      
      const rect = btn.getBoundingClientRect();
      
      // Must be visible
      if (rect.width <= 0 || rect.height <= 0) continue;
      
      // Must be roughly in the top area of the post (allow up to 200px for posts with headers)
      const topOffset = rect.top - postRect.top;
      if (topOffset < -10 || topOffset > 200) continue;
      
      // Should be small (icon button) - be more lenient
      if (rect.width > 100 || rect.height > 100) continue;
      
      // Should be on the right side - be more lenient
      const fromRight = postRight - rect.right;
      if (fromRight < -100 || fromRight > 250) continue;

      // Should have SVG or be a very minimal button, OR have specific aria-labels
      const hasSvg = btn.querySelector('svg');
      const hasMinimalText = !btn.textContent || btn.textContent.trim().length < 3;
      const hasMenuLabel = btn.getAttribute('aria-label')?.toLowerCase().includes('option') ||
                          btn.getAttribute('aria-label')?.toLowerCase().includes('more') ||
                          btn.getAttribute('aria-label')?.toLowerCase().includes('action');
      
      if (!hasSvg && !hasMinimalText && !hasMenuLabel) continue;
      
      candidates.push({
        element: btn,
        score: (250 - fromRight) + (150 - topOffset) + (hasSvg ? 50 : 0) + (hasMenuLabel ? 50 : 0),
        fromRight,
        topOffset
      });
    }
    
    if (candidates.length === 0) {
      console.log(`[FB Deleter] DEBUG: No matching button pattern found - trying fallback strategies`);
      
      // ALTERNATE STRATEGY 1: Look for ANY small button on the right with SVG
      // BUT: Exclude profile/navigation buttons
      const rightButtons = Array.from(allClickable).filter(btn => {
        const rect = btn.getBoundingClientRect();
        const fromRight = postRight - rect.right;
        
        // Skip profile/user link buttons
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const dataTestid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (ariaLabel.includes('profile') || ariaLabel.includes('friend') || ariaLabel.includes('view') ||
            dataTestid.includes('profile') || dataTestid.includes('friend')) {
          return false;
        }
        
        // More lenient size and position
        return rect.width > 0 && rect.height > 0 && fromRight < 150 && fromRight > -50 && rect.width < 100 && rect.height < 100;
      });
      
      if (rightButtons.length > 0) {
        // Filter for buttons with menu-like attributes
        const menuBtn = rightButtons.find(btn => {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          const testid = (btn.getAttribute('data-testid') || '').toLowerCase();
          return label.includes('action') || label.includes('option') || label.includes('more') ||
                 testid.includes('menu') || testid.includes('action') || testid.includes('chevron');
        }) || rightButtons[rightButtons.length - 1];
        console.log(`[FB Deleter] DEBUG: Found ${rightButtons.length} right-side buttons - using: aria-label="${menuBtn.getAttribute('aria-label')}"`);
        return menuBtn;
      }
      
      // ALTERNATE STRATEGY 2: Look for elements with specific data-testid patterns
      const testidBtns = post.querySelectorAll('[data-testid*="menu"], [data-testid*="action"], [data-testid*="chevron"]');
      if (testidBtns.length > 0) {
        console.log(`[FB Deleter] DEBUG: Found button via data-testid: ${testidBtns[0].getAttribute('data-testid')}`);
        return testidBtns[0];
      }
      
      return null;
    }
    
    // Sort by score (highest first) and return the best match
    candidates.sort((a, b) => b.score - a.score);
    const menuBtn = candidates[0].element;
    console.log(`[FB Deleter] DEBUG: Found three-dot menu with score ${candidates[0].score}, fromRight=${candidates[0].fromRight}, topOffset=${candidates[0].topOffset}`);
    return menuBtn;
  }

  // Find the "Delete" option in an open dropdown menu, filtered by deleteMode
  function findDeleteMenuItem() {
    const wantDelete  = deleteMode === 'videos' || deleteMode === 'both';
    const wantBin     = deleteMode === 'posts'  || deleteMode === 'both';

    function isMatch(t) {
      t = t.trim().toLowerCase();
      // Match various Delete option texts
      if (wantDelete && (
        t === 'delete' || 
        t === 'delete post' || 
        t === 'delete video' ||
        t === 'remove' ||
        t === 'remove post' ||
        t === 'delete from timeline' ||
        t.includes('delete')
      )) return true;
      // Match Move to Bin and other archive options
      if (wantBin && (
        t === 'move to bin' ||
        t === 'archive' ||
        t === 'hide' ||
        t.includes('bin')
      )) return true;
      return false;
    }

    // Strategy 1: Try aria-label selectors (most reliable)
    const DELETE_ARIA_SELECTORS = [
      '[role="menuitem"][aria-label*="Delete"]',
      '[role="menuitem"][aria-label*="delete" i]',
      'div[aria-label*="Delete"]',
      'span[aria-label*="Delete"]',
    ];
    
    for (const sel of DELETE_ARIA_SELECTORS) {
      try {
        const el = safeQuery(document, sel);
        if (el && isMatch(el.textContent || el.getAttribute('aria-label') || '')) {
          console.log(`[FB Deleter] DEBUG: Found delete via aria-label selector: ${sel}`);
          return el;
        }
      } catch (e) {}
    }

    // Strategy 2: Search menuitem text content
    const allMenuItems = safeQueryAll(document, '[role="menuitem"]');
    if (allMenuItems.length > 0) {
      const menuTexts = allMenuItems.map(m => `"${(m.textContent || '').trim()}"`).join(', ');
      console.log(`[FB Deleter] DEBUG: Found ${allMenuItems.length} menuitems: ${menuTexts}`);
      
      const byText = allMenuItems.find(item => isMatch(item.textContent || ''));
      if (byText) {
        console.log(`[FB Deleter] DEBUG: Found delete via menuitem text match`);
        return byText;
      }
    }

    // Strategy 3: Inner spans/divs inside menuitems
    const inner = safeQueryAll(document, '[role="menuitem"] span, [role="menuitem"] div');
    const byInner = inner.find(el => isMatch(el.textContent || ''));
    if (byInner) {
      console.log(`[FB Deleter] DEBUG: Found delete via inner element`);
      return byInner;
    }

    // Strategy 4: Search in any visible menu/popup
    const menus = safeQueryAll(document, '[role="menu"], [role="listbox"], [role="dialog"]');
    for (const menu of menus) {
      const buttons = safeQueryAll(menu, '[role="button"], div[role="none"], li');
      const found = buttons.find(el => isMatch(el.textContent || ''));
      if (found) {
        console.log(`[FB Deleter] DEBUG: Found delete in menu popup`);
        return found;
      }
    }

    // Strategy 5: Fallback - scan all divs/spans for delete text
    const allElements = safeQueryAll(document, 'div, span, li, button');
    const byGeneric = allElements.find(el => {
      const text = (el.textContent || '').trim().toLowerCase();
      const isVisible = el.offsetParent !== null;
      return isVisible && isMatch(text) && text.length < 30;
    });
    
    if (byGeneric) {
      console.log(`[FB Deleter] DEBUG: Found delete via generic fallback search`);
      return byGeneric;
    }

    console.log(`[FB Deleter] DEBUG: Delete option not found in any menu`);
    return null;
  }

  // Find the confirm-Delete button in the confirmation dialog
  function findDeleteConfirmButton() {
    console.log(`[FB Deleter] DEBUG: Searching for delete confirmation button...`);
    
    // Strategy 1: Try all standard CSS selectors in priority order
    for (const sel of DELETE_CONFIRM_SELECTORS) {
      try {
        const el = safeQuery(document, sel);
        if (el) {
          console.log(`[FB Deleter] DEBUG: Found via selector: ${sel}`);
          return el;
        }
      } catch (e) {}
    }
    
    // Strategy 2: Search in dialogs for button with "delete" text
    const dialogSelectors = ['[role="dialog"]', '[aria-modal="true"]', '[role="alertdialog"]'];
    for (const dSel of dialogSelectors) {
      for (const dialog of safeQueryAll(document, dSel)) {
        // Look for buttons with "delete" text
        const buttons = safeQueryAll(dialog, '[role="button"], button, div[role="button"]');
        
        // First try exact "Delete" match
        let match = buttons.find(b => (b.textContent || '').trim().toLowerCase() === 'delete');
        if (match) {
          console.log(`[FB Deleter] DEBUG: Found delete button via dialog text match`);
          return match;
        }
        
        // Then try any text containing "delete"
        match = buttons.find(b => (b.textContent || '').trim().toLowerCase().includes('delete'));
        if (match) {
          console.log(`[FB Deleter] DEBUG: Found delete button via partial text match`);
          return match;
        }
      }
    }
    
    // Strategy 3: Look for any button with aria-label containing Delete
    const byAriaLabel = safeQuery(document, '[role="button"][aria-label*="Delete"], button[aria-label*="Delete"]');
    if (byAriaLabel) {
      console.log(`[FB Deleter] DEBUG: Found via aria-label`);
      return byAriaLabel;
    }
    
    // Strategy 4: Scan all visible buttons for delete-like text
    const allButtons = safeQueryAll(document, 'button, [role="button"], div[role="button"]');
    const found = allButtons.find(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const isVisible = btn.offsetParent !== null;
      return isVisible && text === 'delete';
    });
    if (found) {
      console.log(`[FB Deleter] DEBUG: Found via generic button search`);
      return found;
    }
    
    console.log(`[FB Deleter] DEBUG: Delete confirmation button not found`);
    return null;
  }

  // ── Scroll to let page fully load ─────────────────────────────────────────
  async function scrollToLoadAllPosts() {
    log('📜 Scrolling to load all posts…', 'progress');
    let stableCount = 0;
    const MAX_STABLE = 3;

    for (let i = 0; i < 60; i++) {
      if (shouldStop) break;

      const heightBefore = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight); // scroll to bottom
      await delay(3000);

      if (safeQuery(document, FEED_END_SELECTOR)) {
        log('🏁 End of feed reached', 'progress');
        break;
      }

      const heightAfter = document.body.scrollHeight;

      if (heightAfter > heightBefore) {
        stableCount = 0;
        log(`📊 Scroll ${i + 1}: loaded +${heightAfter - heightBefore}px more content`);
      } else {
        stableCount++;
        log(`📊 Scroll ${i + 1}: no new content (${stableCount}/${MAX_STABLE})`);
        if (stableCount >= MAX_STABLE) {
          log('🏁 No more content — scrolling done', 'progress');
          break;
        }
      }
    }

    log('🎯 Scroll complete — ready to process posts', 'progress');
    // DO NOT scroll back to top - this causes posts to be removed from DOM
    // Instead, we'll scroll up gradually while deleting posts as they appear
  }

  // ── Delete a single post ───────────────────────────────────────────────────
  async function deletePost(post, index) {
    try {
      // Validate this is actually a post, not a comment or other element
      const postRect = post.getBoundingClientRect();
      if (postRect.width < 200 || postRect.height < 100) {
        log(`⚠️ Post ${index + 1} — element too small (${postRect.width}x${postRect.height}), likely a comment, skipping`);
        skippedCount++;
        return false;
      }
      
      // CRITICAL: Check if we're still on the correct page (prevent navigation)
      if (!isValidProfilePage()) {
        log(`❌ Post ${index + 1} — navigation detected! Stopping immediately`);
        shouldStop = true;
        return false;
      }
      
      // Validate it has actual post content
      const hasVideo = post.querySelector('video');
      const hasImage = post.querySelector('img[role="img"], [data-testid*="image"]');
      const hasMediaContent = hasVideo || hasImage;
      const hasTextContent = post.textContent && post.textContent.trim().length > 30;
      
      if (!hasMediaContent && !hasTextContent) {
        log(`⚠️ Post ${index + 1} — no media or text content, likely a comment, skipping`);
        skippedCount++;
        return false;
      }
      
      log(`✅ Post ${index + 1} — validated as real post, size: ${postRect.width}x${postRect.height}`);

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
      
      // CRITICAL: Validate the menu button is safe to click
      // Should NOT be a link (href, onclick with navigation)
      if (menuBtn.tagName === 'A' || menuBtn.href) {
        log(`⚠️ Post ${index + 1} — menu button is a link, NOT clicking (would navigate)`);
        skippedCount++;
        return false;
      }
      
      // Validate the menu button is actually within the post
      const menuRect = menuBtn.getBoundingClientRect();
      const isWithinPost = menuRect.top >= postRect.top && menuRect.top <= postRect.bottom;
      if (!isWithinPost) {
        log(`⚠️ Post ${index + 1} — menu button not within post area`);
        skippedCount++;
        return false;
      }

      // Step 3: Click three-dot menu to open dropdown
      log(`🔍 Post ${index + 1} — clicking three-dot menu…`);
      menuBtn.click();
      await delay(4000);
      
      // CRITICAL: Check page again after clicking
      if (!isValidProfilePage()) {
        log(`❌ Post ${index + 1} — NAVIGATION DETECTED after menu click! Stopping`);
        shouldStop = true;
        return false;
      }

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
    
    // Start from bottom (where all posts are loaded) and scroll UP
    const totalHeight = document.body.scrollHeight;
    window.scrollTo(0, totalHeight);
    await delay(2000);

    while (!shouldStop) {
      // CRITICAL: Check page before each iteration
      if (!isValidProfilePage()) {
        log('❌ NAVIGATION DETECTED! You were redirected away from your profile. Stopping immediately.', 'error');
        shouldStop = true;
        break;
      }

      // DO NOT scroll to top - instead scroll up gradually
      // This keeps posts in the virtual scroll viewport
      const currentScroll = window.scrollY;
      if (currentScroll <= 100) {
        // We've reached the top - we're done
        log('✅ Reached top of feed — all done!', 'progress');
        break;
      }

      const posts = getPosts();

      if (posts.length === 0) {
        noPostRounds++;
        log(`⚠️ No posts in viewport (${noPostRounds}/5)…`);
        
        if (noPostRounds >= 5) {
          log('✅ No more posts found — stopping', 'progress');
          break;
        }
        
        // Scroll up by fixed amount to load new posts into viewport
        window.scrollBy(0, -500);
        await delay(2000);
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
        // Post couldn't be deleted — scroll up to expose the next one
        stickyFailures++;
        if (stickyFailures >= 10) {
          log('⚠️ 10 consecutive failures — stopping', 'progress');
          break;
        }
        window.scrollBy(0, -300);
        await delay(2000);
      }
    }
  }

  // ── Entry point ────────────────────────────────────────────────────────────
  async function startAutomation(mode = 'videos') {
    // CRITICAL: Check if we're on a valid page before starting
    if (!isValidProfilePage()) {
      const msg = `❌ STOPPED: You're not on your profile/videos page! Current URL: ${window.location.href}`;
      log(msg, 'error');
      sendMsg({ type: 'error', message: msg });
      return;
    }

    isRunning = true;
    shouldStop = false;
    deletedCount = 0;
    failedCount = 0;
    skippedCount = 0;
    deleteMode = mode;

    const modeLabel = { videos: '🎬 Videos only', posts: '🖼️ Posts & Images', both: '🗑️ Both' }[mode] || mode;
    log(`🚀 Facebook Deleter started — ${modeLabel}`, 'progress');

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
        startAutomation(msg.mode || 'videos');
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
