const puppeteer = require('puppeteer');
const fs = require('fs');
const { selectors, getThreeDotSelectors, getDeleteSelectors, getConfirmationSelectors, getProfileSelectors } = require('./selectors');

// Main automation class
class FacebookVideoDeleter {
    constructor() {
        this.browser = null;
        this.page = null;
        this.deletedCount = 0;
        this.failedCount = 0;
        // Use ONLY selectors from selectors.js - no hardcoded selectors
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('🚀 Starting Facebook Video Deleter...');
        
        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Load cookies if they exist
        try {
            const cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf8'));
            await this.page.setCookie(...cookies);
            console.log('🍪 Cookies loaded successfully');
        } catch (error) {
            console.log('⚠️ No cookies found, manual login required');
        }

        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    }

    async navigateToProfile() {
        console.log('🌐 Navigating to Facebook profile...');
        const profileUrl = 'https://www.facebook.com/salimuddin007/';
        
        await this.page.goto(profileUrl, { waitUntil: 'networkidle2' });
        await this.delay(10000); // Wait for page to load completely

        // Verify we're on the profile page using selectors from selectors.js
        try {
            const profileSelectorsString = getProfileSelectors();
            await this.page.waitForSelector(profileSelectorsString, { timeout: 20000 });
            console.log('✅ Successfully navigated to profile page');
        } catch (error) {
            console.log('⚠️ Could not verify profile page, continuing anyway...');
        }
    }

    async scrollToLoadAllPosts() {
        console.log('📜 Starting comprehensive scroll to load ALL posts...');
        let previousPostCount = 0;
        let currentPostCount = 0;
        let stableScrollAttempts = 0;
        const maxStableAttempts = 5; // Reduced for better detection
        const maxScrollAttempts = 50; // Reasonable limit
        let scrollAttempt = 0;

        while (scrollAttempt < maxScrollAttempts && stableScrollAttempts < maxStableAttempts) {
            scrollAttempt++;

            // Scroll down aggressively
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for content to load
            await this.delay(5000);

            // Count posts using selectors from selectors.js
            currentPostCount = await this.page.evaluate((postSelector, articleSelector) => {
                let count = document.querySelectorAll(postSelector).length;
                if (count === 0) {
                    count = document.querySelectorAll(articleSelector).length;
                }
                return count;
            }, selectors.posts.postSection, selectors.posts.article);

            console.log(`📊 Scroll ${scrollAttempt}: Found ${currentPostCount} posts (previous: ${previousPostCount})`);

            // Check if we've reached the end
            const hasEndIndicator = await this.page.evaluate((endSelectors) => {
                return !!document.querySelector(endSelectors);
            }, selectors.loading.feedEnd);

            if (hasEndIndicator) {
                console.log('🏁 Detected end of feed - stopping scroll');
                break;
            }

            if (currentPostCount === previousPostCount) {
                stableScrollAttempts++;
                console.log(`🔄 No new posts loaded (${stableScrollAttempts}/${maxStableAttempts} stable attempts)`);
                
                // Check if there are loading indicators
                const isLoading = await this.page.evaluate((spinnerSelector) => {
                    return !!document.querySelector(spinnerSelector);
                }, selectors.loading.spinner);

                if (!isLoading && stableScrollAttempts >= 3) {
                    console.log('⚠️ No loading indicators and no new posts - likely reached end');
                    break;
                }
            } else {
                stableScrollAttempts = 0; // Reset if new posts found
                console.log(`✅ Loaded ${currentPostCount - previousPostCount} new posts`);
            }

            previousPostCount = currentPostCount;

            // Additional wait if loading indicators are present
            const isLoading = await this.page.evaluate((spinnerSelector) => {
                return !!document.querySelector(spinnerSelector);
            }, selectors.loading.spinner);

            if (isLoading) {
                console.log('⏳ Loading indicator detected, waiting longer...');
                await this.delay(8000);
            }
        }

        console.log(`🎯 SCROLLING COMPLETE: Total posts loaded: ${currentPostCount}`);
        console.log(`📊 Scroll statistics: ${scrollAttempt} total scrolls, ${stableScrollAttempts} stable attempts`);
        
        if (currentPostCount === 0) {
            console.log('❌ WARNING: No posts found! Check if selectors are correct or if profile is accessible.');
        }
        
        // Final scroll to top for consistent processing
        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.delay(5000);
    }

    async checkIfPostHasDeleteOption(post, index) {
        try {
            console.log(`   🔍 Checking post ${index + 1} for delete option...`);
            
            // Scroll to post to ensure it's visible
            await post.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(3000);

            // Find three-dot menu using your specific selector
            const threeDotElements = await post.$$(this.selectors.menus.threeDotIcon);
            
            if (threeDotElements.length === 0) {
                console.log(`   ❌ No three-dot menu found in post ${index + 1}`);
                return false;
            }

            console.log(`   📍 Found ${threeDotElements.length} three-dot menu(s) in post ${index + 1}`);

            // Try the first visible three-dot button
            for (let dotIndex = 0; dotIndex < threeDotElements.length; dotIndex++) {
                try {
                    const threeDotElement = threeDotElements[dotIndex];
                    
                    // Check if element is visible and clickable
                    const isVisible = await this.page.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && rect.top >= 0;
                    }, threeDotElement);

                    if (!isVisible) {
                        console.log(`   ⚠️ Three-dot menu ${dotIndex + 1} not visible, skipping...`);
                        continue;
                    }

                    console.log(`   🎯 Clicking three-dot menu ${dotIndex + 1} to check for DELETE option...`);
                    
                    // Get clickable parent element for the three-dot menu
                    const clickableElement = await threeDotElement.evaluateHandle((svg) => {
                        let parent = svg.parentElement;
                        while (parent && parent !== document.body) {
                            if (parent.tagName === 'BUTTON' || 
                                parent.role === 'button' || 
                                parent.getAttribute('role') === 'button' ||
                                parent.onclick ||
                                parent.getAttribute('aria-label')) {
                                return parent;
                            }
                            parent = parent.parentElement;
                            if (parent && parent.getAttribute('role') === 'article') break;
                        }
                        return svg.parentElement || svg;
                    });
                    
                    // Click the three-dot menu
                    await clickableElement.click();
                    await this.delay(4000); // Wait for dropdown to appear

                    // Check if YOUR SPECIFIC delete selector exists
                    const deleteSelector = '[aria-hidden="false"] [aria-label="Delete"][role="button"]';
                    const deleteButton = await this.page.$(deleteSelector);
                    
                    if (deleteButton) {
                        console.log(`   ✅ DELETE OPTION FOUND in post ${index + 1} using your selector!`);
                        
                        // Close the dropdown by pressing Escape
                        await this.page.keyboard.press('Escape');
                        await this.delay(2000);
                        
                        return true;
                    } else {
                        console.log(`   ❌ No delete option found with selector: ${deleteSelector}`);
                        
                        // Close the dropdown by pressing Escape
                        await this.page.keyboard.press('Escape');
                        await this.delay(2000);
                    }
                    
                    // Only try the first clickable three-dot menu
                    break;
                    
                } catch (menuError) {
                    console.log(`   ⚠️ Error checking menu ${dotIndex + 1}: ${menuError.message}`);
                    
                    // Try to close any open dropdown
                    try {
                        await this.page.keyboard.press('Escape');
                        await this.delay(2000);
                    } catch (escError) {
                        // Ignore escape errors
                    }
                }
            }

            console.log(`   ❌ POST ${index + 1} - NO DELETE OPTION available with your selector`);
            return false;

        } catch (error) {
            console.error(`   ❌ Error checking post ${index + 1} for delete option: ${error.message}`);
            
            // Try to close any open dropdown
            try {
                await this.page.keyboard.press('Escape');
                await this.delay(2000);
            } catch (escError) {
                // Ignore escape errors
            }
            
            return false;
        }
    }

    async findAndDeletePosts() {
        console.log('🗑️ Starting direct post deletion process...');
        console.log('📋 Will attempt to delete ALL posts directly (no pre-checking)');

        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.delay(5000); // Wait for page to settle

        // Get posts using selectors from selectors.js
        let posts = await this.page.$$(selectors.posts.postSection);
        
        if (posts.length === 0) {
            console.log('⚠️ No posts found with specific selector, trying article selector...');
            posts = await this.page.$$(selectors.posts.article);
        }
        
        console.log(`📹 Found ${posts.length} posts to process - WILL TRY TO DELETE ALL`);

        // Process ALL posts directly (no checking phase)
        for (let i = 0; i < posts.length; i++) {
            console.log(`\n🎯 Processing post ${i + 1} of ${posts.length}...`);
            
            // Re-query posts to avoid stale element references
            let currentPosts = await this.page.$$(selectors.posts.postSection);
            if (currentPosts.length === 0) {
                currentPosts = await this.page.$$(selectors.posts.article);
            }
            
            // Since we're deleting posts, the index might shift
            const adjustedIndex = Math.min(i, currentPosts.length - 1);
            
            if (adjustedIndex >= 0 && adjustedIndex < currentPosts.length) {
                try {
                    await this.deletePost(currentPosts[adjustedIndex], i);
                    
                    // 50 second delay between deletions (except for the last one)
                    if (i < posts.length - 1) {
                        console.log(`⏱️ Waiting 50 seconds before next deletion...`);
                        for (let countdown = 50; countdown > 0; countdown--) {
                            process.stdout.write(`\r⏱️ Next deletion in: ${countdown} seconds`);
                            await this.delay(1000);
                        }
                        console.log('\n✅ Proceeding to next post...');
                    }
                } catch (error) {
                    console.error(`❌ Failed to delete post ${i + 1}: ${error.message}`);
                    this.failedCount++;
                }
            } else {
                console.log(`⚠️ Post index ${i + 1} no longer valid (posts shifted after deletions)`);
            }
        }

        console.log(`\n📊 Final Summary:`);
        console.log(`✅ Successfully deleted: ${this.deletedCount} posts`);
        console.log(`❌ Failed deletions: ${this.failedCount} posts`);
        console.log(`📊 Total posts processed: ${posts.length} posts`);
    }

    async deletePost(post, index) {
        try {
            // Step 1: Scroll to post
            await post.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(3000);
            console.log(`📜 Step 1: Post ${index + 1} - Scrolled to post`);

            console.log(`🗑️ Post ${index + 1} - Starting 4-step deletion process`);

            // Step 2: Click three-dot menu
            console.log(`🔍 Step 2: Post ${index + 1} - Looking for three-dot menu...`);

            // Find three-dot menu using selectors from selectors.js
            const threeDotSelector = getThreeDotSelectors();
            console.log(`🔍 Using three-dot selectors: ${threeDotSelector}`);
            const threeDotElements = await post.$$(threeDotSelector);
            
            if (threeDotElements.length === 0) {
                console.log(`❌ Post ${index + 1} - No three-dot menu found with selectors.js`);
                this.failedCount++;
                return;
            }

            console.log(`📍 Post ${index + 1} - Found ${threeDotElements.length} three-dot element(s)`);

            // Get the first visible three-dot element
            let threeDotElement = null;
            for (const element of threeDotElements) {
                const isVisible = await this.page.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 0;
                }, element);
                
                if (isVisible) {
                    threeDotElement = element;
                    break;
                }
            }

            if (!threeDotElement) {
                console.log(`⚠️ Post ${index + 1} - no visible three-dot menu found`);
                this.failedCount++;
                return;
            }

            console.log(`✅ Post ${index + 1} - found three-dot menu, clicking...`);

            // Get clickable parent
            const clickableElement = await threeDotElement.evaluateHandle((svg) => {
                let parent = svg.parentElement;
                while (parent && parent !== document.body) {
                    if (parent.tagName === 'BUTTON' || 
                        parent.role === 'button' || 
                        parent.getAttribute('role') === 'button' ||
                        parent.onclick ||
                        parent.getAttribute('aria-label')) {
                        return parent;
                    }
                    parent = parent.parentElement;
                    if (parent && parent.getAttribute('role') === 'article') break;
                }
                return svg.parentElement || svg;
            });

            // Click three-dot menu
            console.log(`🔧 Step 2: Post ${index + 1} - Clicking three-dot menu`);
            await clickableElement.click();
            await this.delay(4000); // Wait for dropdown

            // Step 3: Click delete button
            console.log(`🔍 Step 3: Post ${index + 1} - Looking for DELETE option in menu...`);
            
            // Use delete option selectors from selectors.js
            const deleteOptionSelectors = selectors.menus.deleteOptions;
            
            try {
                let deleteOption = null;
                
                // Try each delete option selector from selectors.js
                for (const selector of deleteOptionSelectors) {
                    await this.delay(1000);
                    
                    // Handle special selectors that use text content
                    if (selector.includes(':has-text') || selector.includes(':contains')) {
                        // For these, we need to check text content manually
                        const menuItems = await this.page.$$(selectors.menus.menuItem);
                        for (const item of menuItems) {
                            const text = await this.page.evaluate(el => el.textContent?.toLowerCase() || '', item);
                            if (text.includes('delete')) {
                                deleteOption = item;
                                console.log(`✅ Step 3: Post ${index + 1} - Found DELETE option with text: "${text}"`);
                                break;
                            }
                        }
                    } else {
                        // For regular selectors
                        deleteOption = await this.page.$(selector);
                        if (deleteOption) {
                            const text = await this.page.evaluate(el => el.textContent?.toLowerCase() || '', deleteOption);
                            console.log(`✅ Step 3: Post ${index + 1} - Found DELETE option with selector: ${selector}, text: "${text}"`);
                            break;
                        }
                    }
                    
                    if (deleteOption) break;
                }
                
                if (deleteOption) {
                    await deleteOption.click();
                    await this.delay(3000);
                    console.log(`🎯 Step 3: Post ${index + 1} - Clicked DELETE option`);
                    
                    // Step 4: Click confirmation delete button
                    console.log(`🔍 Step 4: Post ${index + 1} - Looking for confirmation DELETE button...`);
                    
                    try {
                        // Use confirmation selectors from selectors.js
                        const confirmSelector = getConfirmationSelectors();
                        console.log(`🔍 Using confirmation selectors: ${confirmSelector}`);
                        
                        await this.page.waitForSelector(confirmSelector, { timeout: 8000 });
                        const confirmButton = await this.page.$(confirmSelector);
                        
                        if (confirmButton) {
                            await confirmButton.click();
                            await this.delay(5000);
                            this.deletedCount++;
                            console.log(`🎉 SUCCESS: Post ${index + 1} - DELETED COMPLETELY (4 steps completed)`);
                        } else {
                            console.log(`⚠️ Post ${index + 1} - Confirmation button not found`);
                            this.failedCount++;
                        }
                        
                    } catch (confirmError) {
                        console.log(`⚠️ Post ${index + 1} - Confirmation step failed: ${confirmError.message}`);
                        this.failedCount++;
                    }
                } else {
                    console.log(`⚠️ Post ${index + 1} - delete button not found with selector: ${deleteSelector}`);
                    this.failedCount++;
                }
            } catch (error) {
                console.log(`⚠️ Post ${index + 1} - deletion failed: ${error.message}`);
                this.failedCount++;
            }

        } catch (error) {
            console.error(`❌ Post ${index + 1} - error: ${error.message}`);
            this.failedCount++;
            throw error;
        }
    }

    async run() {
        try {
            await this.init();
            await this.navigateToProfile();
            await this.scrollToLoadAllPosts();
            await this.findAndDeletePosts();
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
    
    process.on('SIGINT', async () => {
        console.log('\n🛑 Closing browser...');
        await deleter.close();
        process.exit(0);
    });

    await deleter.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = FacebookVideoDeleter;