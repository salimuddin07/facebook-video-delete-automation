const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { selectors, getThreeDotSelectors, getDeleteSelectors, getConfirmationSelectors, getProfileSelectors } = require('./selectors');

class FacebookVideoDeleter {
    constructor() {
        this.browser = null;
        this.page = null;
        this.deletedCount = 0;
        this.failedCount = 0;
        this.cookiesPath = path.join(__dirname, 'cookies.json');
        this.profileUrl = 'https://www.facebook.com/salimuddin007/';
        this.selectors = selectors;
    }

    // Helper function for delays
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('🚀 Starting Facebook Video Deletion Automation...');
        
        this.browser = await puppeteer.launch({
            headless: false, // Set to true for headless mode
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Set user agent
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Load cookies
        await this.loadCookies();
        
        console.log('✅ Browser initialized and cookies loaded');
    }

    async loadCookies() {
        try {
            const cookies = JSON.parse(await fs.readFile(this.cookiesPath, 'utf8'));
            await this.page.setCookie(...cookies);
            console.log('✅ Session cookies loaded successfully');
        } catch (error) {
            console.error('❌ Error loading cookies:', error.message);
            throw error;
        }
    }

    async navigateToProfile() {
        console.log('🔄 Navigating to profile page...');
        
        await this.page.goto(this.profileUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait for the page to load and check if we're logged in
        await this.delay(3000);
        
        // Check if we're on the correct profile page with multiple selectors
        try {
            console.log('🔍 Looking for profile page elements...');
            
            // Try multiple selectors for profile page detection
            const profileSelector = getProfileSelectors();
            await this.page.waitForSelector(profileSelector, { timeout: 15000 });
            
            console.log('✅ Successfully navigated to profile page');
            
            // Additional check - wait for posts/timeline to load
            await this.delay(2000);
            
        } catch (error) {
            console.log('⚠️ Primary profile selectors not found, trying alternative detection...');
            
            // Check if we're actually on Facebook and logged in
            const currentUrl = this.page.url();
            console.log(`Current URL: ${currentUrl}`);
            
            if (!currentUrl.includes('facebook.com')) {
                throw new Error('❌ Not on Facebook domain. Please check cookies.');
            }
            
            // Check for login redirect
            if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
                throw new Error('❌ Redirected to login. Please update cookies.');
            }
            
            // If we're on the right URL, continue anyway
            console.log('✅ On Facebook profile page (alternative detection)');
        }
    }

    async scrollToLoadAllVideos() {
        console.log('📜 Starting infinite scroll to load all posts...');
        
        let previousPostCount = 0;
        let noNewPostsCount = 0;
        let scrollAttempts = 0;
        const maxNoNewPostsAttempts = 5;
        const maxScrollAttempts = 50; // Prevent infinite loops

        // First scroll to get past any initial content
        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.delay(1000);

        while (noNewPostsCount < maxNoNewPostsAttempts && scrollAttempts < maxScrollAttempts) {
            scrollAttempts++;
            
            // Scroll down in steps
            await this.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 1.5);
            });

            // Wait for content to load
            await this.delay(3000);

            // Wait for loading to complete
            await this.waitForLoadingToComplete();

            // Count current posts using your specific selector first, then fallbacks
            const currentPostCount = await this.page.evaluate(() => {
                const posts1 = document.querySelectorAll('.x1jx94hy > div > div > div > div.html-div');
                const posts2 = document.querySelectorAll('[role="article"]');
                const posts3 = document.querySelectorAll('[data-pagelet*="FeedUnit"]');
                
                // Use your specific selector first, then highest fallback count
                if (posts1.length > 0) return posts1.length;
                return Math.max(posts2.length, posts3.length);
            });

            console.log(`📊 Scroll attempt ${scrollAttempts}: Found ${currentPostCount} posts`);

            if (currentPostCount > previousPostCount) {
                console.log(`� Loaded new content: ${currentPostCount} posts (+${currentPostCount - previousPostCount})`);
                previousPostCount = currentPostCount;
                noNewPostsCount = 0;
            } else {
                noNewPostsCount++;
                console.log(`⏳ No new posts loaded (attempt ${noNewPostsCount}/${maxNoNewPostsAttempts})`);
            }

            // Extra scroll to trigger Facebook's infinite scroll
            await this.page.evaluate(() => {
                // Scroll to bottom of page
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            await this.delay(2000);
        }

        console.log(`✅ Finished loading posts. Total found: ${previousPostCount} (after ${scrollAttempts} scrolls)`);
        return previousPostCount;
    }

    async waitForLoadingToComplete() {
        try {
            // Wait for loading spinners to disappear
            await this.page.waitForFunction(() => {
                const spinners = document.querySelectorAll('[role="progressbar"], .loading, [aria-label*="Loading"]');
                return spinners.length === 0;
            }, { timeout: 8000 });
        } catch (error) {
            // Continue if no loading spinners found or timeout
        }
    }

    async findAndDeleteVideos() {
        console.log('🗑️ Starting post deletion process...');

        // Scroll back to top to start from the beginning
        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.delay(2000);

        // Get all posts using your specific selector first, then fallback to articles
        let posts = await this.page.$$('.x1jx94hy > div > div > div > div.html-div');
        
        if (posts.length === 0) {
            console.log('⚠️ No posts found with specific selector, trying fallback...');
            posts = await this.page.$$('[role="article"]');
        }
        
        console.log(`📹 Found ${posts.length} potential posts to check`);

        if (posts.length === 0) {
            console.log('❌ No posts found on the profile');
            return;
        }

        // Process posts in smaller batches to avoid stale elements
        const batchSize = 3;
        for (let i = 0; i < posts.length; i += batchSize) {
            const endIndex = Math.min(i + batchSize, posts.length);
            console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}: posts ${i + 1}-${endIndex}`);
            
            // Re-query posts to avoid stale element references
            let currentPosts = await this.page.$$('.x1jx94hy > div > div > div > div.html-div');
            
            if (currentPosts.length === 0) {
                currentPosts = await this.page.$$('[role="article"]');
            }
            
            for (let j = i; j < endIndex && j < currentPosts.length; j++) {
                console.log(`\n🎯 Processing post ${j + 1}/${posts.length}...`);
                
                try {
                    await this.deletePost(currentPosts[j], j);
                    await this.delay(4000); // Safety delay between deletions
                } catch (error) {
                    console.error(`❌ Failed to delete post ${j + 1}: ${error.message}`);
                    this.failedCount++;
                }
            }
            
            // Small delay between batches
            await this.delay(2000);
        }

        console.log(`\n📊 Deletion Summary:`);
        console.log(`✅ Successfully deleted: ${this.deletedCount} posts`);
        console.log(`❌ Failed deletions: ${this.failedCount} posts`);
    }

    async deletePost(post, index) {
        try {
            // Scroll the post into view
            await post.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(1500);

            // Try your specific three-dot menu selector first
            console.log(`🔍 Looking for three-dot menu in post ${index + 1}...`);
            
            let threeDotMenu = null;
            
            // First try your specific SVG selector
            console.log(`🎯 Trying specific SVG selector: svg[fill="currentColor"] > g[transform="translate(-446 -350)"]`);
            try {
                threeDotMenu = await post.$('svg[fill="currentColor"] > g[transform="translate(-446 -350)"]');
                if (threeDotMenu) {
                    console.log(`✅ Found three-dot menu using specific SVG selector`);
                } else {
                    // Try clicking the parent SVG instead
                    const parentSvg = await post.$('svg[fill="currentColor"]:has(g[transform="translate(-446 -350)"])');
                    if (parentSvg) {
                        threeDotMenu = parentSvg;
                        console.log(`✅ Found parent SVG with three-dot transform`);
                    }
                }
            } catch (error) {
                console.log(`⚠️ Specific SVG selector failed: ${error.message}`);
            }
            
            // If that fails, try looking for any SVG with that transform
            if (!threeDotMenu) {
                console.log(`🔍 Looking for any SVG with the transform...`);
                try {
                    const allSvgs = await post.$$('svg[fill="currentColor"]');
                    console.log(`🔍 Found ${allSvgs.length} SVG elements in post`);
                    
                    for (let i = 0; i < allSvgs.length; i++) {
                        const svg = allSvgs[i];
                        const hasTransform = await svg.$('g[transform="translate(-446 -350)"]');
                        if (hasTransform) {
                            threeDotMenu = svg;
                            console.log(`✅ Found SVG ${i + 1} with correct transform`);
                            break;
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ SVG search failed: ${error.message}`);
                }
            }
            
            // If not found, try alternative approaches
            if (!threeDotMenu) {
                console.log(`🔍 Trying alternative menu selectors...`);
                
                // Try simpler selectors
                const altSelectors = [
                    '[role="button"]',
                    'div[role="button"]', 
                    '[aria-label*="option"]',
                    '[aria-label*="Action"]',
                    '[aria-label*="More"]',
                    'svg',
                    '[data-testid*="menu"]'
                ];
                
                for (const selector of altSelectors) {
                    const elements = await post.$$(selector);
                    console.log(`🔍 Found ${elements.length} elements with selector: ${selector}`);
                    
                    if (elements.length > 0) {
                        // Try to find one that looks like a menu
                        for (const element of elements) {
                            const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label') || '');
                            const text = await element.evaluate(el => el.textContent || '');
                            console.log(`   - Element: aria-label="${ariaLabel}", text="${text}"`);
                            
                            if (ariaLabel.toLowerCase().includes('option') || 
                                ariaLabel.toLowerCase().includes('action') ||
                                ariaLabel.toLowerCase().includes('more') ||
                                ariaLabel.toLowerCase().includes('menu')) {
                                threeDotMenu = element;
                                console.log(`✅ Found potential menu: ${ariaLabel}`);
                                break;
                            }
                        }
                    }
                    
                    if (threeDotMenu) break;
                }
            }
            
            // Last resort: try looking in the entire page
            if (!threeDotMenu) {
                console.log(`🔍 Searching entire page for visible menus...`);
                const allMenus = await this.page.$$(threeDotSelectors);
                console.log(`Found ${allMenus.length} menus on entire page`);
                
                if (allMenus.length > 0) {
                    // Find the menu that's visible and within the post area
                    for (const menu of allMenus) {
                        const isVisible = await menu.evaluate(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 && 
                                   rect.top >= 0 && rect.bottom <= window.innerHeight;
                        });
                        if (isVisible) {
                            threeDotMenu = menu;
                            console.log(`✅ Found visible menu on page`);
                            break;
                        }
                    }
                }
            }
            
            if (!threeDotMenu) {
                console.log(`⚠️ No three-dot menu found in post ${index + 1}, skipping...`);
                return;
            }

            // Click the three-dot menu
            console.log(`🔧 Clicking three-dot menu for post ${index + 1}...`);
            try {
                // Try regular click first
                await threeDotMenu.click();
            } catch (error) {
                try {
                    // Try JavaScript click as fallback
                    await threeDotMenu.evaluate(el => el.click());
                } catch (jsError) {
                    // Try clicking the parent element
                    const parent = await threeDotMenu.evaluateHandle(el => el.parentElement);
                    await parent.click();
                }
            }
            
            await this.delay(2000);

            // Wait for menu to appear and look for delete option
            console.log(`🔍 Looking for delete option in menu...`);
            
            const menuItems = await this.page.$$('[role="menuitem"]');
            console.log(`📋 Found ${menuItems.length} menu items`);
            
            if (menuItems.length === 0) {
                console.log(`⚠️ No menu items found for post ${index + 1}, skipping...`);
                return;
            }

            let deleteMenuItem = null;

            // Check each menu item for delete text
            for (let i = 0; i < menuItems.length; i++) {
                try {
                    const text = await menuItems[i].evaluate(el => el.textContent.toLowerCase().trim());
                    console.log(`📝 Menu item ${i + 1}: "${text}"`);
                    
                    if (text.includes('delete') || text.includes('remove') || 
                        text.includes('trash') || text.includes('bin')) {
                        deleteMenuItem = menuItems[i];
                        console.log(`✅ Found delete option: "${text}"`);
                        break;
                    }
                } catch (error) {
                    console.log(`⚠️ Could not read menu item ${i + 1}`);
                }
            }

            if (!deleteMenuItem) {
                console.log(`⚠️ No delete option found for post ${index + 1}, skipping...`);
                // Click somewhere else to close the menu
                await this.page.click('body');
                return;
            }

            // Click the delete option
            console.log(`🗑️ Clicking delete option for post ${index + 1}...`);
            try {
                await deleteMenuItem.click();
            } catch (error) {
                await deleteMenuItem.evaluate(el => el.click());
            }
            
            await this.delay(3000);

            // Wait for confirmation dialog and click confirm
            console.log(`🔍 Looking for confirmation dialog...`);
            
            try {
                // Wait a moment for the dialog to appear
                await this.delay(1500);
                
                // Try multiple ways to find the confirmation button
                let confirmButton = null;
                
                // Method 1: Try the specific selectors
                const confirmSelectors = getConfirmationSelectors();
                try {
                    await this.page.waitForSelector(confirmSelectors, { timeout: 5000 });
                    confirmButton = await this.page.$(confirmSelectors);
                } catch (error) {
                    console.log(`⚠️ Standard confirmation selectors failed: ${error.message}`);
                }
                
                // Method 2: Look for any button with "Delete" text in a dialog
                if (!confirmButton) {
                    console.log(`🔍 Looking for delete button in dialog...`);
                    const dialogButtons = await this.page.$$('[role="dialog"] [role="button"], [aria-modal="true"] [role="button"]');
                    
                    for (const button of dialogButtons) {
                        const text = await button.evaluate(el => el.textContent.toLowerCase().trim());
                        const ariaLabel = await button.evaluate(el => (el.getAttribute('aria-label') || '').toLowerCase());
                        
                        console.log(`🔍 Dialog button: text="${text}", aria-label="${ariaLabel}"`);
                        
                        if (text.includes('delete') || ariaLabel.includes('delete')) {
                            confirmButton = button;
                            console.log(`✅ Found delete confirmation button: "${text}"`);
                            break;
                        }
                    }
                }
                
                // Method 3: Look for any red/primary button in dialogs (Facebook typically uses red for delete)
                if (!confirmButton) {
                    console.log(`🔍 Looking for red/primary buttons in dialogs...`);
                    const allButtons = await this.page.$$('[role="dialog"] [role="button"], [aria-modal="true"] [role="button"]');
                    
                    for (const button of allButtons) {
                        const styles = await button.evaluate(el => {
                            const computed = window.getComputedStyle(el);
                            return {
                                backgroundColor: computed.backgroundColor,
                                color: computed.color,
                                className: el.className
                            };
                        });
                        
                        // Check if button looks like a delete button (red background or specific classes)
                        if (styles.backgroundColor.includes('rgb(220, 38, 38)') || // Red
                            styles.backgroundColor.includes('rgb(239, 68, 68)') ||
                            styles.className.includes('danger') ||
                            styles.className.includes('destructive')) {
                            confirmButton = button;
                            console.log(`✅ Found potential delete button by style`);
                            break;
                        }
                    }
                }
                
                if (confirmButton) {
                    console.log(`✅ Confirming deletion for post ${index + 1}...`);
                    
                    try {
                        await confirmButton.click();
                    } catch (error) {
                        await confirmButton.evaluate(el => el.click());
                    }
                    
                    await this.delay(3000);
                    
                    this.deletedCount++;
                    console.log(`🎉 Successfully deleted post ${index + 1}`);
                } else {
                    console.log(`⚠️ Confirmation button not found for post ${index + 1}`);
                    this.failedCount++;
                }
            } catch (error) {
                console.log(`⚠️ Error in confirmation dialog for post ${index + 1}: ${error.message}`);
                this.failedCount++;
            }

        } catch (error) {
            console.error(`❌ Error processing post ${index + 1}: ${error.message}`);
            throw error;
        }
    }

    async run() {
        try {
            await this.init();
            await this.navigateToProfile();
            await this.scrollToLoadAllVideos();
            await this.findAndDeleteVideos();
            
        } catch (error) {
            console.error('❌ Fatal error:', error.message);
        } finally {
            if (this.browser) {
                await this.browser.close();
                console.log('🔐 Browser closed');
            }
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Run the automation
async function main() {
    const deleter = new FacebookVideoDeleter();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Received interrupt signal, closing browser...');
        await deleter.close();
        process.exit(0);
    });

    await deleter.run();
}

// Start the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = FacebookVideoDeleter;