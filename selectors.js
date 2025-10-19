// Facebook selectors for video deletion automation
// These selectors may need updates if Facebook changes their HTML structure

const selectors = {
    // Profile page detection
    profilePage: {
        timeline: '[data-pagelet*="ProfileTimeline"], [data-pagelet="ProfileTimeline"], div[id*="profile"], #timeline_tab_content',
        profileHeader: '[data-pagelet="ProfileCover"], [role="banner"]',
        profileName: 'h1[data-selenium-id="ProfileHeader"], h1[dir="auto"]'
    },

    // Video and post related selectors
    posts: {
        // Main post containers - using your specific selector
        article: '[role="article"]',
        postSection: '.x1jx94hy > div > div > div > div.html-div',
        feedStory: '[data-pagelet*="FeedUnit"], [data-ft], div[id^="hyperfeed_story_id"]',
        
        // Video specific selectors
        videoPost: '[aria-label*="video"], [data-store*="video"], video, [role="article"]:has(video)',
        videoPlayer: 'video, [aria-label*="video player"], [data-video-id]',
        
        // Generic post containers that might contain videos
        postContainer: '[role="article"], [data-testid="fbfeed_story"], div[id*="story"], .x1jx94hy > div > div > div > div.html-div'
    },

    // Menu and action selectors
    menus: {
        // Three-dot menu variations - including your specific selector
        threeDotMenu: [
            'svg[fill="currentColor"] > g[transform="translate(-446 -350)"]',
            'svg[fill="currentColor"]>g[transform="translate(-446 -350)"]',
            'div[aria-label="Actions for this post"]',
            'div[aria-label="Action options"]', 
            'div[aria-label="More"]',
            '[aria-label*="option"]',
            '[role="button"][aria-label*="Actions"]',
            '[role="button"][aria-label*="More"]',
            'div[role="button"]:has(svg)',
            '[data-testid="post_chevron_button"]',
            'svg[fill="currentColor"]'
        ],
        
        // Menu items in dropdown
        menuItem: '[role="menuitem"]',
        menuItemText: '[role="menuitem"] span, [role="menuitem"] div',
        
        // Delete specific options
        deleteOptions: [
            '[role="menuitem"]:has-text("Delete")',
            '[role="menuitem"] span:contains("Delete")',
            '[role="menuitem"][aria-label*="Delete"]',
            '[role="menuitem"]:has(span:contains("Delete"))',
            '[role="menuitem"]:has(div:contains("Delete"))'
        ]
    },

    // Confirmation dialog selectors
    confirmation: {
        deleteButton: [
            '[aria-hidden="false"] [aria-label="Delete"][role="button"]',
            '[aria-label="Delete"][role="button"]',
            '[aria-label*="Delete"][role="button"]',
            'button:contains("Delete")',
            '[role="button"]:has-text("Delete")',
            '[data-testid="delete_confirm_button"]',
            '[role="button"][aria-label*="delete" i]',
            '[role="button"]:contains("Delete")',
            'div[role="button"]:contains("Delete")',
            '[aria-label*="confirm" i][role="button"]',
            'button[data-testid*="confirm"]',
            '[role="dialog"] [role="button"]:contains("Delete")',
            '[aria-modal="true"] [role="button"]:contains("Delete")'
        ],
        confirmDialog: '[role="dialog"], [aria-modal="true"]',
        confirmButton: '[role="button"][aria-label*="confirm"], button[data-testid*="confirm"]'
    },

    // Loading and scroll indicators
    loading: {
        spinner: '[role="progressbar"], .loading, [aria-label*="Loading"], [data-testid="loading"]',
        feedEnd: '[data-testid="feed_end"], .feed_end, [aria-label*="end of feed"]',
        moreContent: '[data-testid="more_content"], [aria-label*="See more"]'
    },

    // Error and empty states
    states: {
        noContent: '[data-testid="empty_feed"], .empty, [aria-label*="No posts"]',
        errorMessage: '[role="alert"], .error, [data-testid="error"]'
    }
};

// Helper function to get multiple selectors as a single query
function getMultiSelector(selectorArray) {
    return selectorArray.join(', ');
}

// Helper function to get all three-dot menu selectors
function getThreeDotSelectors() {
    return getMultiSelector(selectors.menus.threeDotMenu);
}

// Helper function to get all delete option selectors  
function getDeleteSelectors() {
    return getMultiSelector(selectors.menus.deleteOptions);
}

// Helper function to get all confirmation button selectors
function getConfirmationSelectors() {
    return getMultiSelector(selectors.confirmation.deleteButton);
}

// Helper function to get all profile page selectors
function getProfileSelectors() {
    return getMultiSelector([
        selectors.profilePage.timeline,
        selectors.profilePage.profileHeader,
        selectors.profilePage.profileName
    ]);
}

module.exports = {
    selectors,
    getMultiSelector,
    getThreeDotSelectors,
    getDeleteSelectors, 
    getConfirmationSelectors,
    getProfileSelectors
};