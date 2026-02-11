// This script runs in the page's MAIN world (same as window.crossmark)
// Communicates with content script via DOM events

function notifyCrossmarkStatus(available) {
  document.dispatchEvent(new CustomEvent('__crossmarkStatus__', {
    detail: { available }
  }));
}

// Initial check
let crossmarkAvailable = typeof window.crossmark !== 'undefined';
console.log('Crossmark bridge initialized. Crossmark available:', crossmarkAvailable);

// Notify initial status
notifyCrossmarkStatus(crossmarkAvailable);

// Set up message handler for getAddress requests
document.addEventListener('__getCrossmarkAddress__', async () => {
  try {
    if (typeof window.crossmark === 'undefined') {
      document.dispatchEvent(new CustomEvent('__crossmarkAddressResponse__', {
        detail: { success: false, error: 'Crossmark not found' }
      }));
      return;
    }
    
    // Crossmark uses methods.signInAndWait()
    const result = await window.crossmark.methods.signInAndWait();
    
    // Extract address from response
    const address = result?.response?.data?.address;
    
    if (address) {
      console.log('Successfully connected to Crossmark:', address);
      document.dispatchEvent(new CustomEvent('__crossmarkAddressResponse__', {
        detail: { success: true, address }
      }));
    } else {
      console.error('No address in Crossmark response:', result);
      document.dispatchEvent(new CustomEvent('__crossmarkAddressResponse__', {
        detail: { success: false, error: 'No address returned from Crossmark' }
      }));
    }
  } catch (error) {
    console.error('Crossmark connection error:', error);
    document.dispatchEvent(new CustomEvent('__crossmarkAddressResponse__', {
      detail: { success: false, error: error.message || 'Failed to connect' }
    }));
  }
});

// Poll for Crossmark injection (it may load asynchronously)
if (!crossmarkAvailable) {
  const checkCrossmark = () => {
    if (typeof window.crossmark !== 'undefined' && !crossmarkAvailable) {
      crossmarkAvailable = true;
      console.log('Crossmark detected after polling! Notifying content script');
      notifyCrossmarkStatus(true);
    }
  };
  
  // Check multiple times over 5 seconds
  setTimeout(checkCrossmark, 100);
  setTimeout(checkCrossmark, 300);
  setTimeout(checkCrossmark, 500);
  setTimeout(checkCrossmark, 1000);
  setTimeout(checkCrossmark, 2000);
  setTimeout(checkCrossmark, 3000);
  setTimeout(checkCrossmark, 5000);
}
