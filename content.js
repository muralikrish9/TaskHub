let highlightButton = null;
let savedSelectedText = '';
let savedContext = null;

function extractGmailContent() {
  try {
    // Try multiple selectors for Gmail email content
    const selectors = [
      '[role="main"] [data-message-id]',
      '.adn .ii.gt',
      '.ii.gt',
      '[data-message-id] .ii.gt',
      '.email-body',
      '.message-content'
    ];

    for (const selector of selectors) {
      const emailElement = document.querySelector(selector);
      if (emailElement) {
        // Get text content and clean it up
        let content = emailElement.textContent || emailElement.innerText || '';

        // Clean up the content
        content = content
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, '\n') // Remove empty lines
          .trim();

        if (content.length > 50) { // Only return if we got substantial content
          console.log('[Gmail] Extracted email content using selector:', selector);
          return content;
        }
      }
    }

    // Fallback: try to get content from the main email area
    const mainContent = document.querySelector('[role="main"]');
    if (mainContent) {
      let content = mainContent.textContent || mainContent.innerText || '';
      content = content.replace(/\s+/g, ' ').trim();

      if (content.length > 50) {
        console.log('[Gmail] Extracted email content from main area');
        return content;
      }
    }

    return null;
  } catch (error) {
    console.error('[Gmail] Error extracting email content:', error);
    return null;
  }
}

function createHighlightButton() {
  const button = document.createElement('div');
  button.id = 'getshitdone-highlight-btn';
  
  // Create icon element
  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/capture.svg');
  icon.style.cssText = 'width: 16px; height: 16px; margin-right: 6px;';
  
  // Create text span
  const text = document.createElement('span');
  text.textContent = 'Capture Task';
  
  button.appendChild(icon);
  button.appendChild(text);
  
  button.style.cssText = `
    position: absolute;
    background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: none;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
    button.style.background = 'linear-gradient(135deg, #5cbf60 0%, #55b055 100%)';
  });

  // Prevent selection from being cleared by the click interaction
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    button.style.background = 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)';
  });

  button.addEventListener('click', handleCapture);
  document.body.appendChild(button);
  return button;
}

function handleCapture() {
  console.log('[Content] ========================================');
  console.log('[Content] Capture button clicked!');
  const fallbackSelection = window.getSelection().toString().trim();
  const selectedText = savedSelectedText || fallbackSelection;
  console.log('[Content] Using text length:', selectedText ? selectedText.length : 0);

  if (!selectedText) {
    console.log('[Content] No text available to capture, aborting');
    showNotification('No text selected to capture', 'error');
    return;
  }

  // Show capturing notification with spinner
  const capturingNotif = showNotification('Capturing task...', 'capturing', true);

  // Smart context expansion for Gmail
  let fullEmailContext = null;
  if (window.location.href.includes('mail.google.com') && selectedText.length < 200) {
    try {
      // Try to extract full email content from Gmail
      const emailBody = extractGmailContent();
      if (emailBody && emailBody.length > selectedText.length) {
        fullEmailContext = emailBody;
        console.log('[Content] ✓ Full email context extracted:', emailBody.length, 'chars');
      }
    } catch (error) {
      console.log('[Content] Could not extract full email context:', error);
    }
  }

  const context = savedContext || {
    url: window.location.href,
    title: document.title,
    selectedText,
    fullEmailContext,
    timestamp: new Date().toISOString()
  };

  console.log('[Content] Page context:', context);
  console.log('[Content] >>> Sending message to background script...');

  try {
    chrome.runtime.sendMessage({
      action: 'captureTask',
      data: context
    }, (response) => {
      console.log('[Content] <<< Response received from background');

      if (chrome.runtime.lastError) {
        console.error('[Content] Runtime error:', chrome.runtime.lastError);

        // Remove capturing notification
        if (capturingNotif && capturingNotif.parentNode) {
          capturingNotif.remove();
        }

        // Check if it's an extension context invalidated error
        if (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
            chrome.runtime.lastError.message.includes('message port closed')) {
          showNotification('Extension was reloaded. Please refresh this page (F5) to continue.', 'error');
          hideHighlightButton();
          savedSelectedText = '';
          savedContext = null;
        } else {
          showNotification('Failed to capture task: ' + chrome.runtime.lastError.message, 'error');
        }
        return;
      }

      console.log('[Content] Response data:', response);

      // Remove capturing notification
      if (capturingNotif && capturingNotif.parentNode) {
        capturingNotif.remove();
      }

      if (response && response.success) {
        console.log('[Content] Task captured successfully!');
        console.log('[Content] Saved task:', response.task);
        showNotification('Task captured successfully!', 'success');
      } else {
        console.error('[Content] Task capture failed:', response?.error || 'Unknown error');
        showNotification('Failed to capture task: ' + (response?.error || 'Unknown error'), 'error');
      }
    });
  } catch (error) {
    console.error('[Content] Extension context error:', error);
    
    // Remove capturing notification
    if (capturingNotif && capturingNotif.parentNode) {
      capturingNotif.remove();
    }
    
    showNotification('Extension was reloaded. Please refresh this page (F5) to continue.', 'error');

    // Hide the button since we can't communicate with background
    hideHighlightButton();
    savedSelectedText = '';
    savedContext = null;
  }

  hideHighlightButton();
  savedSelectedText = '';
  savedContext = null;
  window.getSelection().removeAllRanges();
}

function showHighlightButton(x, y) {
  if (!highlightButton) {
    highlightButton = createHighlightButton();
  }

  highlightButton.style.left = `${x}px`;
  highlightButton.style.top = `${y - 45}px`;
  highlightButton.style.display = 'flex';
}

function hideHighlightButton() {
  if (highlightButton) {
    highlightButton.style.display = 'none';
  }
}

function showNotification(message, type, persistent = false) {
  const notification = document.createElement('div');
  
  let bgColor;
  if (type === 'success') {
    bgColor = 'linear-gradient(135deg, #7FB77E 0%, #88AB8E 100%)';
  } else if (type === 'error') {
    bgColor = 'linear-gradient(135deg, #dc4c3e 0%, #c9302c 100%)';
  } else if (type === 'capturing') {
    bgColor = 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)';
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    font-family: 'Office Code Pro', 'Courier New', monospace;
    animation: slideInBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  // Add spinner for capturing state
  if (type === 'capturing') {
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    `;
    notification.appendChild(spinner);
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  notification.appendChild(textSpan);

  document.body.appendChild(notification);

  // If it's an extension reload error, show persistent banner
  if (message.includes('refresh') || message.includes('Extension was reloaded')) {
    showPersistentReloadBanner();
  }

  if (!persistent) {
    setTimeout(() => {
      notification.style.animation = 'slideOutBounce 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  return notification;
}

function showPersistentReloadBanner() {
  // Don't create duplicate banners
  if (document.getElementById('gsd-reload-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'gsd-reload-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
    color: white;
    padding: 16px 20px;
    font-size: 15px;
    font-weight: 600;
    z-index: 9999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    text-align: center;
    animation: slideDown 0.3s ease-out;
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 20px;">
      <span style="font-size: 24px;">⚠️</span>
      <span>TaskHub Extension: Please refresh this page (Press F5 or Cmd+R)</span>
      <button id="gsd-refresh-btn" style="
        background: white;
        color: #f44336;
        border: none;
        padding: 8px 20px;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      ">Refresh Now</button>
      <button id="gsd-dismiss-btn" style="
        background: transparent;
        color: white;
        border: 2px solid white;
        padding: 6px 16px;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
        font-size: 13px;
      ">Dismiss</button>
    </div>
  `;

  document.body.insertBefore(banner, document.body.firstChild);

  // Add click handlers
  document.getElementById('gsd-refresh-btn').addEventListener('click', () => {
    location.reload();
  });

  document.getElementById('gsd-dismiss-btn').addEventListener('click', () => {
    banner.style.animation = 'slideUp 0.3s ease-out';
    setTimeout(() => banner.remove(), 300);
  });
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();

    if (selectedText.length > 10) {
      console.log('[Content] Text selected (' + selectedText.length + ' chars), showing capture button');

      // Save the selected text and context NOW before it gets cleared
      savedSelectedText = selectedText;
      savedContext = {
        url: window.location.href,
        title: document.title,
        selectedText: selectedText,
        timestamp: new Date().toISOString()
      };
      console.log('[Content] ✓ Saved text and context for capture');

      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showHighlightButton(
        rect.left + (rect.width / 2) - 60,
        rect.top + window.scrollY
      );
    } else {
      if (selectedText.length > 0) {
        console.log('[Content] Text too short (' + selectedText.length + ' chars), need >10');
      }
      savedSelectedText = '';
      savedContext = null;
      hideHighlightButton();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (highlightButton && !highlightButton.contains(e.target)) {
    setTimeout(() => {
      const selectedText = window.getSelection().toString().trim();
      if (!selectedText) {
        hideHighlightButton();
      }
    }, 10);
  }
});

const style = document.createElement('style');
style.textContent = `
  @keyframes slideInBounce {
    0% {
      transform: translateX(400px);
      opacity: 0;
    }
    60% {
      transform: translateX(-10px);
      opacity: 1;
    }
    80% {
      transform: translateX(5px);
    }
    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutBounce {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(-100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Listen for extension updates/reloads
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'taskCaptured') {
    console.log('[Content] Task captured notification received:', message.task);
    showNotification('Task captured and synced!', 'success');
  }
  
  if (message.action === 'getPageText') {
    console.log('[Content] Received getPageText request');
    try {
      // First check if there's selected text
      const selection = window.getSelection();
      let text = selection ? selection.toString().trim() : '';
      
      // If no selected text, try Gmail-specific extraction
      if (!text && window.location.hostname.includes('mail.google.com')) {
        text = extractGmailContent() || '';
      }
      
      // If still no text, get visible text from body
      if (!text) {
        // Get main content, excluding scripts, styles, and common noise
        const mainContent = document.body.innerText || document.body.textContent || '';
        text = mainContent
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .trim()
          .substring(0, 5000);  // Limit to first 5000 chars to avoid huge payloads
      }
      
      console.log('[Content] Sending page text, length:', text.length);
      sendResponse({ success: true, text });
    } catch (error) {
      console.error('[Content] Error getting page text:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  }
});

// Detect if extension context is invalidated
let extensionValid = true;
function checkExtensionContext() {
  try {
    // Try to access chrome.runtime.id to check if context is valid
    const test = chrome.runtime.id;
  } catch (e) {
    if (extensionValid) {
      extensionValid = false;
      console.warn('[Content] Extension context invalidated, showing reload banner');
      showPersistentReloadBanner();
      hideHighlightButton();
    }
  }
}

// Check extension context periodically (every 3 seconds)
setInterval(checkExtensionContext, 3000);

console.log('[Content] TaskHub content script loaded on:', window.location.href);
