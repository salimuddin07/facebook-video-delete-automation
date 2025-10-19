const puppeteer = require('puppeteer');
const fs = require('fs');
const { getThreeDotSelectors, getConfirmationSelectors } = require('./selectors');

// Main automation class
class FacebookVideoDeleter {
    constructor() {
        this.browser = null;
        this.page = null;
        this.deletedCount = 0;
        this.failedCount = 0;
        this.selectors = {
            profile: {
                verifyProfile: '[data-overlaycache="1"]'
            },
            posts: {
                postSection: '.x1jx94hy > div > div > div > div.html-div',
                article: 'article'
            },
            menus: {
                threeDotIcon: 'svg[fill="currentColor"] > g[transform="translate(-446 -350)"]'
            },
            confirmation: {
                deleteButton: '[aria-hidden="false"] [aria-label="Delete"][role="button"]'
            },
            loading: {
                spinner: '[role="progressbar"]',
                loadingIndicator: '.loading'
            },
            states: {
                clicked: '[aria-expanded="true"]',
                hidden: '[aria-hidden="true"]'
            }
        };
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

        // Verify we're on the profile page
        try {
            await this.page.waitForSelector(this.selectors.profile.verifyProfile, { timeout: 20000 });
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
        const maxStableAttempts = 8; // Increased for better coverage
        const maxScrollAttempts = 100; // Increased total attempts
        let scrollAttempt = 0;

        while (scrollAttempt < maxScrollAttempts && stableScrollAttempts < maxStableAttempts) {
            scrollAttempt++;

            // Scroll down aggressively
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait longer for content to load
            await this.delay(8000); // Increased wait time

            // Count posts using your specific selector
            currentPostCount = await this.page.evaluate((selector) => {
                return document.querySelectorAll(selector).length;
            }, this.selectors.posts.postSection);

            // If no posts found with specific selector, try article selector
            if (currentPostCount === 0) {
                currentPostCount = await this.page.evaluate((selector) => {
                    return document.querySelectorAll(selector).length;
                }, this.selectors.posts.article);
            }

            console.log(`📊 Scroll ${scrollAttempt}: Found ${currentPostCount} posts (previous: ${previousPostCount})`);

            if (currentPostCount === previousPostCount) {
                stableScrollAttempts++;
                console.log(`🔄 No new posts loaded (${stableScrollAttempts}/${maxStableAttempts} stable attempts)`);
                
                // Extra aggressive scrolling when stuck
                if (stableScrollAttempts > 3) {
                    console.log('🚀 Extra aggressive scrolling...');
                    for (let i = 0; i < 5; i++) {
                        await this.page.evaluate(() => {
                            window.scrollBy(0, window.innerHeight * 2);
                        });
                        await this.delay(3000);
                    }
                }
            } else {
                stableScrollAttempts = 0; // Reset if new posts found
                console.log(`✅ Loaded ${currentPostCount - previousPostCount} new posts`);
            }

            previousPostCount = currentPostCount;

            // Check for loading indicators and wait if found
            const isLoading = await this.page.evaluate((spinnerSelector, loadingSelector) => {
                const spinner = document.querySelector(spinnerSelector);
                const loading = document.querySelector(loadingSelector);
                return !!(spinner || loading);
            }, this.selectors.loading.spinner, this.selectors.loading.loadingIndicator);

            if (isLoading) {
                console.log('⏳ Loading indicator detected, waiting...');
                await this.delay(10000);
            }
        }

        console.log(`🎯 SCROLLING COMPLETE: Total posts loaded: ${currentPostCount}`);
        console.log(`📊 Scroll statistics: ${scrollAttempt} total scrolls, ${stableScrollAttempts} stable attempts`);
        
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

            // Try each three-dot button
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

                    console.log(`   🎯 Clicking three-dot menu ${dotIndex + 1} to check options...`);
                    
                    // Click the three-dot menu
                    await threeDotElement.click();
                    await this.delay(4000); // Wait for dropdown to appear

                    // Check if delete option exists in the dropdown
                    const deleteOptions = await this.page.$$(this.selectors.confirmation.deleteButton);
                    
                    if (deleteOptions.length > 0) {
                        console.log(`   ✅ DELETE OPTION FOUND in post ${index + 1}!`);
                        
                        // Close the dropdown by clicking elsewhere
                        await this.page.keyboard.press('Escape');
                        await this.delay(2000);
                        
                        return true;
                    } else {
                        console.log(`   ❌ No delete option found for menu ${dotIndex + 1}`);
                        
                        // Close the dropdown by clicking elsewhere
                        await this.page.keyboard.press('Escape');
                        await this.delay(2000);
                    }
                    
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

            console.log(`   ❌ POST ${index + 1} - NO DELETE OPTION available`);
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
        console.log('🗑️ Starting selective post deletion process...');
        console.log('📋 Will only delete posts/videos that have delete option available');

        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.delay(5000); // Wait for page to settle

        // Get posts using your specific selector from selectors.js
        let posts = await this.page.$$(this.selectors.posts.postSection);
        
        if (posts.length === 0) {
            console.log('⚠️ No posts found with specific selector, trying article selector...');
            posts = await this.page.$$(this.selectors.posts.article);
        }
        
        console.log(`📹 Found ${posts.length} posts to check for delete options`);

        let eligiblePosts = [];
        let skippedPosts = 0;

        // First pass: Check which posts have delete options
        console.log('\n🔍 Phase 1: Checking which posts have delete options...');
        
        for (let i = 0; i < posts.length; i++) {
            console.log(`\n🎯 Checking post ${i + 1} of ${posts.length} for delete option...`);
            
            // Re-query posts to avoid stale element references
            let currentPosts = await this.page.$$(this.selectors.posts.postSection);
            if (currentPosts.length === 0) {
                currentPosts = await this.page.$$(this.selectors.posts.article);
            }
            
            if (i < currentPosts.length) {
                const hasDeleteOption = await this.checkIfPostHasDeleteOption(currentPosts[i], i);
                if (hasDeleteOption) {
                    eligiblePosts.push(i);
                    console.log(`✅ Post ${i + 1} - HAS DELETE OPTION - Will be deleted`);
                } else {
                    skippedPosts++;
                    console.log(`⚠️ Post ${i + 1} - NO DELETE OPTION - Skipping`);
                }
            }
            
            // Small delay between checks
            await this.delay(2000);
        }

        console.log(`\n📊 Scan Complete:`);
        console.log(`✅ ${eligiblePosts.length} posts HAVE delete option - will be deleted`);
        console.log(`⚠️ ${skippedPosts} posts DON'T have delete option - will be skipped`);

        if (eligiblePosts.length === 0) {
            console.log('❌ No posts found with delete options. Nothing to delete.');
            return;
        }

        console.log('\n🗑️ Phase 2: Deleting eligible posts...');

        // Second pass: Delete only eligible posts
        for (let i = 0; i < eligiblePosts.length; i++) {
            const postIndex = eligiblePosts[i];
            console.log(`\n🎯 Deleting post ${i + 1} of ${eligiblePosts.length} (original post #${postIndex + 1})...`);
            
            // Re-query posts to avoid stale element references
            let currentPosts = await this.page.$$(this.selectors.posts.postSection);
            if (currentPosts.length === 0) {
                currentPosts = await this.page.$$(this.selectors.posts.article);
            }
            
            // Since we're deleting posts, the index shifts down
            const adjustedIndex = Math.min(postIndex - i, currentPosts.length - 1);
            
            if (adjustedIndex >= 0 && adjustedIndex < currentPosts.length) {
                try {
                    await this.deletePost(currentPosts[adjustedIndex], postIndex);
                    
                    // 50 second delay between deletions (except for the last one)
                    if (i < eligiblePosts.length - 1) {
                        console.log(`⏱️ Waiting 50 seconds before next deletion...`);
                        for (let countdown = 50; countdown > 0; countdown--) {
                            process.stdout.write(`\r⏱️ Next deletion in: ${countdown} seconds`);
                            await this.delay(1000);
                        }
                        console.log('\n✅ Proceeding to next post...');
                    }
                } catch (error) {
                    console.error(`❌ Failed to delete post ${postIndex + 1}: ${error.message}`);
                    this.failedCount++;
                }
            } else {
                console.log(`⚠️ Post index ${postIndex + 1} no longer valid (posts shifted after deletions)`);
            }
        }

        console.log(`\n📊 Final Summary:`);
        console.log(`✅ Successfully deleted: ${this.deletedCount} posts`);
        console.log(`❌ Failed deletions: ${this.failedCount} posts`);
        console.log(`⚠️ Skipped (no delete option): ${skippedPosts} posts`);
        console.log(`📊 Total posts processed: ${posts.length} posts`);
    }

    async deletePost(post, index) {
        try {
            await post.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(3000); // Wait for post to be visible

            console.log(`🔍 Post ${index + 1} - looking for three-dot menu using selectors.js`);

            // Use selectors from selectors.js
            const threeDotSelectors = getThreeDotSelectors();
            const svgElement = await post.$(threeDotSelectors);
            
            if (!svgElement) {
                console.log(`⚠️ Post ${index + 1} - no three-dot menu found`);
                return;
            }

            console.log(`✅ Post ${index + 1} - found three-dot menu`);

            // Get clickable parent
            const clickableElement = await svgElement.evaluateHandle((svg) => {
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
            console.log(`🔧 Post ${index + 1} - clicking three-dot menu`);
            await clickableElement.click();
            await this.delay(4000); // Wait for dropdown

            // Look for delete button using selector from selectors.js
            const confirmationSelectors = getConfirmationSelectors();
            
            try {
                await this.page.waitForSelector(confirmationSelectors, { timeout: 8000 });
                const deleteButton = await this.page.$(confirmationSelectors);
                
                if (deleteButton) {
                    console.log(`🎯 Post ${index + 1} - found DELETE button, clicking...`);
                    await deleteButton.click();
                    
                    await this.delay(5000); // Wait for deletion to complete
                    this.deletedCount++;
                    console.log(`🎉 Post ${index + 1} - DELETED SUCCESSFULLY`);
                } else {
                    console.log(`⚠️ Post ${index + 1} - confirmation button not found`);
                    this.failedCount++;
                }
            } catch (error) {
                console.log(`⚠️ Post ${index + 1} - confirmation failed: ${error.message}`);
                this.failedCount++;
            }

        } catch (error) {
            console.error(`❌ Post ${index + 1} - error: ${error.message}`);
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