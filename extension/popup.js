// SimpleFX Cross-Hedge Extension Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const clientIdDisplay = document.getElementById('client-id-display');
  const btnCopyId = document.getElementById('btn-copy-id');
  const copyBtnText = document.getElementById('copy-btn-text');
  const serverStatusDot = document.getElementById('server-status-dot');
  const serverStatusVal = document.getElementById('server-status-val');
  const tabStatusDot = document.getElementById('tab-status-dot');
  const tabStatusVal = document.getElementById('tab-status-val');
  const pairingBanner = document.getElementById('pairing-banner');
  const pairingTitle = document.getElementById('pairing-title');
  const pairingDesc = document.getElementById('pairing-desc');
  const lastUpdateTime = document.getElementById('last-update-time');
  const statPositions = document.getElementById('stat-positions');
  const statVolume = document.getElementById('stat-volume');
  const statLiq = document.getElementById('stat-liq');
  const serverUrlInput = document.getElementById('server-url-input');
  const btnSaveUrl = document.getElementById('btn-save-url');
  const btnRegenId = document.getElementById('btn-regen-id');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');

  let currentClientId = '';

  // 1. Get or Generate Unique Client ID
  function generateClientId() {
    const chars = '0123456789ABCDEF';
    const rand4 = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `SFX-${rand4()}-${rand4()}`;
  }

  async function loadClientId() {
    const data = await chrome.storage.local.get(['clientId', 'serverUrl', 'pairingInfo', 'lastScrape']);
    
    if (data.clientId) {
      currentClientId = data.clientId;
    } else {
      currentClientId = generateClientId();
      await chrome.storage.local.set({ clientId: currentClientId });
    }

    clientIdDisplay.textContent = currentClientId;

    if (data.serverUrl) {
      serverUrlInput.value = data.serverUrl;
    }

    updatePairingUI(data.pairingInfo);
    updateStatsUI(data.lastScrape);
  }

  // 2. Copy ID to Clipboard
  btnCopyId.addEventListener('click', () => {
    if (!currentClientId) return;
    navigator.clipboard.writeText(currentClientId).then(() => {
      copyBtnText.textContent = 'COPIED!';
      btnCopyId.classList.add('copied');
      setTimeout(() => {
        copyBtnText.textContent = 'COPY ID';
        btnCopyId.classList.remove('copied');
      }, 1500);
    });
  });

  // 3. Regenerate ID
  btnRegenId.addEventListener('click', async () => {
    if (confirm('Regenerate a new ID? You will need to re-link this browser in the dashboard.')) {
      currentClientId = generateClientId();
      await chrome.storage.local.set({ clientId: currentClientId, pairingInfo: null });
      clientIdDisplay.textContent = currentClientId;
      updatePairingUI(null);
      // Notify background to re-register
      chrome.runtime.sendMessage({ type: 'RECONNECT_WEBSOCKET' });
    }
  });

  // 4. Save Server URL
  btnSaveUrl.addEventListener('click', async () => {
    const url = serverUrlInput.value.trim();
    if (!url) return;
    await chrome.storage.local.set({ serverUrl: url });
    btnSaveUrl.textContent = 'Saved!';
    setTimeout(() => { btnSaveUrl.textContent = 'Save'; }, 1200);
    chrome.runtime.sendMessage({ type: 'RECONNECT_WEBSOCKET' });
  });

  // 5. Open Dashboard
  btnOpenDashboard.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim() || 'http://localhost:3000';
    chrome.tabs.create({ url: serverUrl });
  });

  // 6. Check background status
  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        serverStatusDot.className = 'status-dot offline';
        serverStatusVal.textContent = 'Disconnected';
        return;
      }

      if (res.connected) {
        serverStatusDot.className = 'status-dot online';
        serverStatusVal.textContent = 'Connected (Hub)';
      } else {
        serverStatusDot.className = 'status-dot offline';
        serverStatusVal.textContent = 'Disconnected';
      }

      if (res.simplefxTabActive) {
        tabStatusDot.className = 'status-dot online';
        tabStatusVal.textContent = 'Active (Ready)';
      } else {
        tabStatusDot.className = 'status-dot';
        tabStatusVal.textContent = 'No SimpleFX Tab';
      }

      if (res.pairingInfo) {
        updatePairingUI(res.pairingInfo);
      }
      if (res.lastScrape) {
        updateStatsUI(res.lastScrape);
      }
    });
  }

  function updatePairingUI(pairingInfo) {
    if (pairingInfo && pairingInfo.paired) {
      pairingBanner.className = 'pairing-banner paired';
      pairingTitle.textContent = `Paired as ${pairingInfo.role || 'Member'}`;
      pairingDesc.textContent = `Opponent: ${pairingInfo.opponentId || 'Unknown'}`;
    } else {
      pairingBanner.className = 'pairing-banner';
      pairingTitle.textContent = 'Pairing Status';
      pairingDesc.textContent = 'Unpaired. Add to Web Dashboard.';
    }
  }

  function updateStatsUI(scrape) {
    if (!scrape) return;
    const orders = scrape.positions || [];
    statPositions.textContent = orders.length;

    const totalVol = orders.reduce((s, o) => s + (parseFloat(o.volume) || 0), 0);
    statVolume.textContent = totalVol.toFixed(2);

    // Find liquidation price
    let liq = 0;
    for (const o of orders) {
      const v = parseFloat(o.liquidationPrice);
      if (!isNaN(v) && v > 0) { liq = v; break; }
    }
    statLiq.textContent = liq > 0 ? liq.toFixed(2) : '--';
    lastUpdateTime.textContent = 'Live DOM Active';
  }

  // Initialize
  await loadClientId();
  checkStatus();
  setInterval(checkStatus, 1500);
});
