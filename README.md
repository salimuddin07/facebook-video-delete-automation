# Facebook Video Delete Automation

This Node.js script automates the deletion of all uploaded Facebook videos using Puppeteer.

## Features

- ✅ **Authentication**: Uses saved session cookies for automatic login
- 🔄 **Infinite Scroll**: Automatically scrolls to load all videos on your profile
- 🎯 **Smart Detection**: Finds video cards and their three-dot menus
- 🗑️ **Safe Deletion**: Clicks delete option and confirms deletion
- 🛡️ **Error Handling**: Continues operation even if individual deletions fail
- 📊 **Progress Tracking**: Logs every deletion attempt and provides summary
- ⏱️ **Safety Delays**: Built-in delays to avoid being flagged by Facebook

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Update Cookies** (if needed):
   - The `cookies.json` file contains your Facebook session cookies
   - If the cookies expire, you'll need to update them with fresh ones
   - You can export cookies using browser extensions like "Cookie Editor"

3. **Update Profile URL** (if needed):
   - Open `facebook-video-delete.js`
   - Change the `profileUrl` variable to your Facebook profile URL

## Usage

Run the script:
```bash
npm start
```

Or directly with Node:
```bash
node facebook-video-delete.js
```

## How It Works

1. **Initialization**: Launches Puppeteer browser with your session cookies
2. **Navigation**: Goes to your Facebook profile page
3. **Loading**: Scrolls infinitely to load all video posts
4. **Detection**: Finds video cards and locates three-dot menus
5. **Deletion**: For each video:
   - Clicks the three-dot menu
   - Looks for "Delete" option
   - Clicks delete and confirms
   - Waits before moving to next video
6. **Summary**: Reports total deleted and failed videos

## Safety Features

- **Non-headless mode**: Runs with visible browser window by default
- **Delays**: 2-5 second delays between operations
- **Error recovery**: Continues if individual deletions fail
- **Graceful shutdown**: Handles Ctrl+C interruption
- **Detailed logging**: Shows progress and any issues

## Configuration

You can modify these settings in `facebook-video-delete.js`:

- **Headless mode**: Change `headless: false` to `headless: true`
- **Delays**: Adjust `waitForTimeout()` values for faster/slower operation
- **Profile URL**: Update `profileUrl` for different profiles
- **Selectors**: Modify selectors if Facebook changes their HTML structure

## Troubleshooting

### "Failed to load profile page" error:
- Your cookies may have expired
- Export fresh cookies from your browser and update `cookies.json`

### Script skips videos:
- Facebook's HTML structure may have changed
- Check browser console for any errors
- Some posts might not be videos (photos, text posts, etc.)

### Browser crashes or hangs:
- Try running with headless mode: `headless: true`
- Increase delay times between operations
- Check if Facebook is showing captchas or security warnings

## Important Notes

- ⚠️ **This will permanently delete your videos** - there's no undo!
- 🔄 Run a test first with a small number of videos
- 📱 Facebook may detect automation and show security warnings
- 🕐 Process can take a long time if you have many videos
- 💾 Consider backing up important videos before running

## Legal Disclaimer

This script is for educational purposes and personal use only. Use responsibly and in accordance with Facebook's Terms of Service.