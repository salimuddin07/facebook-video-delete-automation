// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Facebook Video Deleter installed.');
});

// Relay messages from content script to popup if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Allow messages to propagate to popup
  return false;
});
