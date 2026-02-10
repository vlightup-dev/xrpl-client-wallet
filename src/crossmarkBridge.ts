// Helper functions to communicate with content script for Crossmark integration

/**
 * Ensure content script is injected and ready
 */
async function ensureContentScriptInjected(): Promise<number | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      console.log('No active tab found');
      return null;
    }

    // Try to ping the content script first
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      return tab.id; // Content script already exists
    } catch {
      // Content script not ready, inject it programmatically
      console.log('Injecting content script...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      return tab.id;
    }
  } catch (error) {
    console.error('Failed to ensure content script:', error);
    return null;
  }
}

/**
 * Check if Crossmark is installed via content script
 */
export async function checkCrossmarkViaContentScript(): Promise<boolean> {
  try {
    const tabId = await ensureContentScriptInjected();
    
    if (!tabId) {
      return false;
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tabId, { action: 'checkCrossmark' });
    return response?.installed || false;
  } catch (error) {
    console.log('Content script not ready or error:', error);
    return false;
  }
}

/**
 * Connect to Crossmark wallet via content script
 */
export async function connectCrossmarkViaContentScript(): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    const tabId = await ensureContentScriptInjected();
    
    if (!tabId) {
      return { success: false, error: 'No active tab found' };
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tabId, { action: 'connectCrossmark' });
    return response;
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to communicate with page' 
    };
  }
}
