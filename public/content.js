// Content script that bridges communication between the popup and Crossmark extension
// Communicates with pageWorld.js via DOM events (cross-world communication)

let crossmarkAvailable = false;

// Listen for Crossmark status updates from the main world
document.addEventListener('__crossmarkStatus__', (event) => {
  crossmarkAvailable = event.detail.available;
  console.log('Crossmark status received:', crossmarkAvailable);
});

// Wait for Crossmark to be detected
function waitForCrossmark(timeout = 5000) {
  return new Promise((resolve) => {
    if (crossmarkAvailable) {
      resolve(true);
      return;
    }
    
    const startTime = Date.now();
    
    const checkCrossmark = () => {
      if (crossmarkAvailable) {
        console.log('Crossmark ready!');
        resolve(true);
      } else if (Date.now() - startTime < timeout) {
        setTimeout(checkCrossmark, 200);
      } else {
        console.log('Crossmark not detected within timeout');
        resolve(false);
      }
    };
    
    checkCrossmark();
  });
}

// Request Crossmark address from main world
function requestCrossmarkAddress() {
  return new Promise((resolve) => {
    const handler = (event) => {
      document.removeEventListener('__crossmarkAddressResponse__', handler);
      resolve(event.detail);
    };
    
    document.addEventListener('__crossmarkAddressResponse__', handler);
    document.dispatchEvent(new CustomEvent('__getCrossmarkAddress__'));
    
    // Timeout after 10 seconds
    setTimeout(() => {
      document.removeEventListener('__crossmarkAddressResponse__', handler);
      resolve({ success: false, error: 'Timeout waiting for Crossmark response' });
    }, 10000);
  });
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ ready: true });
    return true;
  }

  if (request.action === 'checkCrossmark') {
    // Wait for Crossmark to be detected
    waitForCrossmark().then((available) => {
      console.log('Crossmark check result:', available);
      sendResponse({ installed: available });
    });
    return true;
  }

  if (request.action === 'connectCrossmark') {
    // Wait for Crossmark then connect
    waitForCrossmark().then(async (available) => {
      if (!available) {
        sendResponse({ success: false, error: 'Crossmark not available' });
        return;
      }

      const result = await requestCrossmarkAddress();
      sendResponse(result);
    });
    
    return true; // Keep the message channel open for async response
  }
});
