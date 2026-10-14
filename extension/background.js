// SimpleFX Cross-Hedge Service Worker (background.js)
let ws = null;
let clientId = null;
let serverUrl = 'http://localhost:3000';
let isConnected = false;
let pingInterval = null;
let lastScrapeData = null;
let pairingInfo = null;

// Initialize Client ID and Settings
async function initSettings() {
  const data = await chrome.storage.local.get(['clientId', 'serverUrl', 'pairingInfo', 'lastScrape']);
  if (data.clientId) {
    clientId = data.clientId;
  } else {
    const chars = '0123456789ABCDEF';
    const rand4 = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    clientId = `SFX-${rand4()}-${rand4()}`;
    await chrome.storage.local.set({ clientId });
  }

  if (data.serverUrl) {
    serverUrl = data.serverUrl;
  }
  if (data.pairingInfo) {
    pairingInfo = data.pairingInfo;
  }
  if (data.lastScrape) {
    lastScrapeData = data.lastScrape;
  }

  connectWebSocket();
}

function getWsUrl() {
  let cleanUrl = serverUrl.trim().replace(/\/$/, '');
  if (cleanUrl.startsWith('https://')) {
    return cleanUrl.replace('https://', 'wss://');
  } else if (cleanUrl.startsWith('http://')) {
    return cleanUrl.replace('http://', 'ws://');
  } else if (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')) {
    return `ws://${cleanUrl}`;
  }
  return cleanUrl;
}

function connectWebSocket() {
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }

  const wsUrl = getWsUrl();
  console.log(`[SimpleFX Extension] Connecting WebSocket to: ${wsUrl} as [${clientId}]`);

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[SimpleFX Extension] Connected to Hub Server!');
      isConnected = true;

      // Register unique client ID
      ws.send(JSON.stringify({
        type: 'REGISTER_CLIENT',
        clientId: clientId,
        metadata: {
          platform: navigator.platform
        }
      }));

      // Start ping heartbeat
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 25000);

      // If we already have scrape data, send it now
      if (lastScrapeData) {
        sendDomUpdate(lastScrapeData);
      }
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[SimpleFX Extension] Received message from server:', msg.type);

        switch (msg.type) {
          case 'REGISTER_ACK':
            console.log('[SimpleFX Extension] Registration confirmed by Hub');
            break;

          case 'PAIR_STATUS_UPDATE':
            pairingInfo = msg.payload;
            await chrome.storage.local.set({ pairingInfo });
            notifySimpleFxTabs({
              type: 'PAIR_STATUS_UPDATE',
              payload: pairingInfo
            });
            break;

          case 'COMMAND_SET_TP':
            handleCommandSetTp(msg.payload);
            break;

          case 'PONG':
            break;

          default:
            console.warn('[SimpleFX Extension] Unknown server message:', msg.type);
        }
      } catch (err) {
        console.error('[SimpleFX Extension] Failed to parse server message:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      clearInterval(pingInterval);
      console.log('[SimpleFX Extension] WebSocket closed. Reconnecting in 3s...');
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      isConnected = false;
      console.error('[SimpleFX Extension] WebSocket error:', err);
    };
  } catch (err) {
    console.error('[SimpleFX Extension] Connection failed:', err);
    setTimeout(connectWebSocket, 3000);
  }
}

// Forward Take Profit setting command to active SimpleFX tab
async function handleCommandSetTp(payload) {
  console.log('[SimpleFX Extension] Forwarding COMMAND_SET_TP to tab:', payload);

  const tabs = await getSimpleFxTabs();
  if (tabs.length === 0) {
    console.warn('[SimpleFX Extension] No active SimpleFX tab found to execute TP command!');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_RESULT',
        payload: {
          orderId: payload.orderId,
          success: false,
          error: 'No active SimpleFX tab found in this browser'
        }
      }));
    }
    return;
  }

  // Send to the first matching tab
  chrome.tabs.sendMessage(tabs[0].id, {
    type: 'EXECUTE_SET_TP',
    payload
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SimpleFX Extension] Message error to tab:', chrome.runtime.lastError.message);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'COMMAND_RESULT',
          payload: {
            orderId: payload.orderId,
            success: false,
            error: chrome.runtime.lastError.message
          }
        }));
      }
      return;
    }

    console.log('[SimpleFX Extension] Result from tab execution:', response);
    // Send result back to hub server
    if (ws && ws.readyState === WebSocket.OPEN && response) {
      ws.send(JSON.stringify({
        type: 'COMMAND_RESULT',
        payload: response
      }));
    }
  });
}

function sendDomUpdate(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'DOM_UPDATE',
      payload: data
    }));
  }
}

async function getSimpleFxTabs() {
  return await chrome.tabs.query({
    url: [
      'https://app.simplefx.com/*',
      'http://localhost:3000/mock.html*',
      'http://127.0.0.1:3000/mock.html*'
    ]
  });
}

async function notifySimpleFxTabs(message) {
  const tabs = await getSimpleFxTabs();
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

// Message Listener for content.js and popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'DOM_SCRAPE_DATA') {
    lastScrapeData = request.payload;
    chrome.storage.local.set({ lastScrape: lastScrapeData });
    sendDomUpdate(request.payload);
    sendResponse({ received: true });
    return true;
  }

  if (request.type === 'GET_STATUS') {
    getSimpleFxTabs().then(tabs => {
      sendResponse({
        connected: isConnected,
        clientId,
        simplefxTabActive: tabs.length > 0,
        pairingInfo,
        lastScrape: lastScrapeData
      });
    });
    return true;
  }

  if (request.type === 'RECONNECT_WEBSOCKET') {
    initSettings().then(() => sendResponse({ reconnected: true }));
    return true;
  }
});

// Start initialization
initSettings();
