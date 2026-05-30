// popup.js — Controls the extension popup UI

let currentTabId = null;

// ── DOM references ──────────────────────────────────────────────────────────
const statusBar = document.getElementById('status-bar');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statsSection = document.getElementById('stats-section');
const statDeleted = document.getElementById('stat-deleted');
const statFailed = document.getElementById('stat-failed');
const statSkipped = document.getElementById('stat-skipped');
const logArea = document.getElementById('log-area');
const clearLogBtn = document.getElementById('clear-log-btn');
const countdownBar = document.getElementById('countdown-bar');
const countdownText = document.getElementById('countdown-text');

// ── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(icon, text, type = '') {
  statusIcon.textContent = icon;
  statusText.textContent = text;
  statusBar.className = 'status-bar' + (type ? ' ' + type : '');
}

function addLog(message, cls = '') {
  const p = document.createElement('p');
  if (cls) p.className = 'log-' + cls;
  p.textContent = message;
  logArea.appendChild(p);
  logArea.scrollTop = logArea.scrollHeight;
  // Keep log under 200 entries
  while (logArea.children.length > 200) {
    logArea.removeChild(logArea.firstChild);
  }
}

function updateStats(deleted, failed, skipped) {
  statDeleted.textContent = deleted ?? 0;
  statFailed.textContent = failed ?? 0;
  statSkipped.textContent = skipped ?? 0;
  statsSection.style.display = 'flex';
}

function setRunningState(running) {
  if (running) {
    startBtn.style.display = 'none';
    stopBtn.style.display = '';
    setStatus('⏳', 'Automation is running…', 'running');
  } else {
    startBtn.style.display = '';
    stopBtn.style.display = 'none';
    countdownBar.style.display = 'none';
  }
}

function isFacebookTab(url) {
  return url && url.startsWith('https://www.facebook.com/');
}

// ── Initialise popup ─────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId = tab.id;

  if (!isFacebookTab(tab.url)) {
    setStatus('⚠️', 'Please open Facebook first', 'warning');
    startBtn.disabled = true;
    return;
  }

  // Ask content script for current status
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'status' });
    if (response && response.isRunning) {
      setRunningState(true);
      updateStats(response.deleted, response.failed, response.skipped);
    } else {
      setStatus('✅', 'Ready — you are on Facebook', 'success');
      startBtn.disabled = false;
    }
  } catch (e) {
    // Content script not yet injected (page still loading or not injected)
    setStatus('✅', 'Ready — navigate to your profile videos', 'success');
    startBtn.disabled = false;
  }
}

// ── Button handlers ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  startBtn.disabled = true;
  addLog('▶ Starting automation…', 'progress');

  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'start' });
    setRunningState(true);
    statsSection.style.display = 'flex';
  } catch (e) {
    setStatus('❌', 'Cannot reach page — reload Facebook tab', 'error');
    addLog('Error: ' + e.message, 'error');
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  stopBtn.disabled = true;
  addLog('⏹ Stopping…', 'progress');
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'stop' });
  } catch (e) {
    // ignore
  }
});

clearLogBtn.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// ── Listen for messages from content script ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  // Update stats
  if (msg.deleted !== undefined) updateStats(msg.deleted, msg.failed, msg.skipped);

  switch (msg.type) {
    case 'log':
      addLog(msg.message);
      break;

    case 'progress':
      addLog(msg.message, 'progress');
      break;

    case 'countdown':
      countdownBar.style.display = '';
      countdownText.textContent = `⏱️ ${msg.message}`;
      break;

    case 'done':
      setRunningState(false);
      setStatus('🎉', 'Completed!', 'success');
      addLog(msg.message, 'done');
      countdownBar.style.display = 'none';
      stopBtn.disabled = false;
      startBtn.disabled = false;
      break;

    case 'error':
      setRunningState(false);
      setStatus('❌', 'Error occurred', 'error');
      addLog('❌ ' + msg.message, 'error');
      startBtn.disabled = false;
      stopBtn.disabled = false;
      break;
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
init();
