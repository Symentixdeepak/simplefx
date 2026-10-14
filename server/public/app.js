// SimpleFX HedgeMaster Web Dashboard Controller
(function() {
  let ws = null;
  let currentState = {
    clients: [],
    pairs: [],
    logs: []
  };

  // DOM Elements
  const wsIndicator = document.getElementById('ws-indicator');
  const wsStatus = document.getElementById('ws-status');
  const connectedCountEl = document.getElementById('connected-count');
  const activePairsCountEl = document.getElementById('active-pairs-count');
  const extensionsChipsList = document.getElementById('extensions-chips-list');
  const pairsContainer = document.getElementById('pairs-container');
  const emptyPairsState = document.getElementById('empty-pairs-state');
  const pairsBadge = document.getElementById('pairs-badge');
  const auditLogBody = document.getElementById('audit-log-body');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // Modal Elements
  const modalAddPair = document.getElementById('modal-add-pair');
  const btnOpenAddPair = document.getElementById('btn-open-add-pair');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const formAddPair = document.getElementById('form-add-pair');
  const inputPairName = document.getElementById('input-pair-name');
  const inputPlayerA = document.getElementById('input-player-a');
  const selectPlayerADropdown = document.getElementById('select-player-a-dropdown');
  const inputPlayerB = document.getElementById('input-player-b');
  const selectPlayerBDropdown = document.getElementById('select-player-b-dropdown');
  const inputSymbol = document.getElementById('input-symbol');
  const selectMode = document.getElementById('select-mode');
  const checkAutoSync = document.getElementById('check-auto-sync');
  const modalErrorMsg = document.getElementById('modal-error-msg');

  // --- WEBSOCKET CONNECTION ---

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsIndicator.className = 'pulse-dot online';
      wsStatus.textContent = 'Live Connected';
      // Subscribe to dashboard updates
      ws.send(JSON.stringify({ type: 'SUBSCRIBE_DASHBOARD' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE_SNAPSHOT') {
          currentState = msg.payload;
          renderDashboard();
        } else if (msg.type === 'LOG_ENTRY') {
          prependLogEntry(msg.payload);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      wsIndicator.className = 'pulse-dot offline';
      wsStatus.textContent = 'Reconnecting...';
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket encountered error:', err);
      ws.close();
    };
  }

  // --- RENDERING FUNCTIONS ---

  function renderDashboard() {
    // Top stats
    const connectedClients = currentState.clients.filter(c => c.connected);
    connectedCountEl.textContent = connectedClients.length;
    activePairsCountEl.textContent = currentState.pairs.filter(p => p.status === 'active').length;
    pairsBadge.textContent = `${currentState.pairs.length} Pair${currentState.pairs.length === 1 ? '' : 's'}`;

    // Render extensions chips
    renderExtensionsChips();

    // Populate modal dropdowns
    updateModalDropdowns();

    // Render active pairs
    renderPairs();

    // Render logs
    renderLogs();
  }

  function renderExtensionsChips() {
    if (!currentState.clients || currentState.clients.length === 0) {
      extensionsChipsList.innerHTML = `<div class="empty-chips">No browser extensions connected yet. Load the extension in your browsers to connect.</div>`;
      return;
    }

    extensionsChipsList.innerHTML = currentState.clients.map(client => {
      const isOnline = client.connected;
      const pairText = client.pairedWith ? `<span class="chip-pair-tag">Paired with ${escapeHtml(client.pairedWith)}</span>` : `<span class="chip-unpaired-tag">Unpaired</span>`;
      return `
        <div class="extension-chip ${isOnline ? 'chip-online' : 'chip-offline'}" title="Client URL: ${escapeHtml(client.url || 'None')}">
          <span class="chip-dot"></span>
          <span class="chip-id" onclick="copyToClipboard('${escapeHtml(client.id)}')">${escapeHtml(client.id)}</span>
          <button class="chip-copy-btn" onclick="copyToClipboard('${escapeHtml(client.id)}')" title="Copy Client ID">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          ${pairText}
        </div>
      `;
    }).join('');
  }

  function updateModalDropdowns() {
    const clients = currentState.clients || [];
    
    // Save current selections
    const currentA = selectPlayerADropdown.value;
    const currentB = selectPlayerBDropdown.value;

    let options = `<option value="">-- Choose connected browser --</option>`;
    clients.forEach(c => {
      const status = c.connected ? '🟢 Online' : '⚪ Offline';
      const pairedNote = c.pairId ? '(Already Paired)' : '';
      options += `<option value="${escapeHtml(c.id)}">${status} ${escapeHtml(c.id)} ${pairedNote}</option>`;
    });

    selectPlayerADropdown.innerHTML = options;
    selectPlayerBDropdown.innerHTML = options;

    selectPlayerADropdown.value = currentA;
    selectPlayerBDropdown.value = currentB;
  }

  function renderPairs() {
    if (!currentState.pairs || currentState.pairs.length === 0) {
      pairsContainer.innerHTML = '';
      emptyPairsState.classList.remove('hidden');
      return;
    }

    emptyPairsState.classList.add('hidden');

    pairsContainer.innerHTML = currentState.pairs.map(pair => {
      const isPaused = pair.status !== 'active';
      const modeText = pair.mode === 'first_trade' ? 'Cascade (1st Trade)' : 'All Open Trades';

      // Player A and Player B data
      const pA = pair.playerA;
      const pB = pair.playerB;

      // Extract liquidation prices
      const liqA = pA ? pA.liquidationPrice : 0;
      const liqB = pB ? pB.liquidationPrice : 0;

      // Net PnL formatting
      const netPnl = pair.netPnl || 0;
      const netPnlClass = netPnl >= 0 ? 'text-green' : 'text-red';
      const netPnlSign = netPnl >= 0 ? '+' : '';

      // Delta formatting
      const netDelta = (pair.netDeltaVolume || 0).toFixed(2);

      return `
        <div class="pair-card" id="card-${pair.id}">
          <!-- Header -->
          <div class="pair-header">
            <div class="pair-header-left">
              <span class="pair-title">${escapeHtml(pair.name)}</span>
              <span class="pair-tag">${escapeHtml(pair.symbol)}</span>
              <span class="pair-mode-tag">${modeText}</span>
              <span class="badge ${isPaused ? 'text-amber' : 'text-green'}">
                ${isPaused ? '⏸️ Paused' : '⚡ Active'}
              </span>
            </div>
            <div class="pair-header-actions">
              <button class="btn btn-xs btn-outline" onclick="triggerForceSync('${pair.id}')" title="Evaluate & sync take profit right now">
                🔄 Sync Now
              </button>
              <button class="btn btn-xs ${pair.autoSync ? 'btn-secondary' : 'btn-outline'}" onclick="toggleAutoSync('${pair.id}', ${!pair.autoSync})">
                ${pair.autoSync ? 'Auto-Sync: ON' : 'Auto-Sync: OFF'}
              </button>
              <button class="btn btn-xs btn-outline" onclick="togglePausePair('${pair.id}', '${isPaused ? 'active' : 'paused'}')">
                ${isPaused ? 'Resume' : 'Pause'}
              </button>
              <button class="btn btn-xs btn-danger" onclick="deletePair('${pair.id}')" title="Unlink and remove this pair">
                ✕ Unpair
              </button>
            </div>
          </div>

          <!-- Dual Player Battle Area -->
          <div class="pair-body">
            <!-- Player A Panel -->
            ${renderPlayerPanel(pA, pair.playerAId, 'Player A (Long/Primary)', 'panel-a', liqB, pair.mode)}

            <!-- Center Hedge Bridge -->
            <div class="hedge-bridge">
              <div class="bridge-title">Cross-Liquidation Matrix</div>

              <div class="sync-arrows-container">
                <!-- A Liq -> B TP -->
                <div class="sync-arrow-box flow-a-to-b">
                  <div class="flow-label">Player A Liq ➔ Player B TP</div>
                  <div class="flow-value">
                    <span>${liqA > 0 ? liqA.toFixed(2) : '--'}</span>
                    <span class="${pair.syncStatus.inSyncB ? 'text-green' : 'text-amber'}">
                      ${pair.syncStatus.inSyncB ? '✓ Synced' : (liqA > 0 ? '⟳ Syncing' : 'No Liq')}
                    </span>
                  </div>
                </div>

                <!-- B Liq -> A TP -->
                <div class="sync-arrow-box flow-b-to-a">
                  <div class="flow-label">Player B Liq ➔ Player A TP</div>
                  <div class="flow-value">
                    <span>${liqB > 0 ? liqB.toFixed(2) : '--'}</span>
                    <span class="${pair.syncStatus.inSyncA ? 'text-green' : 'text-amber'}">
                      ${pair.syncStatus.inSyncA ? '✓ Synced' : (liqB > 0 ? '⟳ Syncing' : 'No Liq')}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Net Combined Stats -->
              <div class="net-metric-box">
                <div class="label">Net Combined PnL</div>
                <div class="net-pnl ${netPnlClass}">${netPnlSign}${netPnl.toFixed(4)} USDT</div>
                <div class="net-delta">Net Exposure: ${netDelta} Lot</div>
              </div>

              <div class="bridge-status-hint">
                <small class="text-dim">Auto-Cascade active: Next trade auto-links on liquidation</small>
              </div>
            </div>

            <!-- Player B Panel -->
            ${renderPlayerPanel(pB, pair.playerBId, 'Player B (Short/Opposite)', 'panel-b', liqA, pair.mode)}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPlayerPanel(player, clientId, label, panelClass, oppositeLiq, mode) {
    if (!player) {
      return `
        <div class="player-panel ${panelClass}">
          <div class="player-header">
            <div class="player-identity">
              <span class="player-label">${label}</span>
              <span class="player-id-pill">${escapeHtml(clientId)}</span>
            </div>
            <span class="badge text-red">Disconnected</span>
          </div>
          <div class="empty-state" style="padding: 2rem 1rem;">
            <p>Extension not connected</p>
          </div>
        </div>
      `;
    }

    const account = player.account || {};
    const orders = player.orders || [];
    const isOnline = player.connected;
    const totalPnl = player.totalPnl || 0;
    const pnlClass = totalPnl >= 0 ? 'text-green' : 'text-red';
    const pnlSign = totalPnl >= 0 ? '+' : '';

    return `
      <div class="player-panel ${panelClass}">
        <!-- Header -->
        <div class="player-header">
          <div class="player-identity">
            <span class="player-label">${label}</span>
            <span class="player-id-pill" onclick="copyToClipboard('${escapeHtml(clientId)}')" title="Click to copy ID">
              ${escapeHtml(clientId)}
            </span>
          </div>
          <span class="badge ${isOnline ? 'text-green' : 'text-red'}">
            ${isOnline ? '🟢 Online' : '⚪ Offline'}
          </span>
        </div>

        <!-- Account stats -->
        <div class="player-stats-row">
          <div class="mini-stat">
            <div class="title">Balance</div>
            <div class="val">${(account.balance || 0).toFixed(2)} USDT</div>
          </div>
          <div class="mini-stat">
            <div class="title">Bonus</div>
            <div class="val">${(account.bonus || 0).toFixed(2)} USDT</div>
          </div>
          <div class="mini-stat">
            <div class="title">Total PnL</div>
            <div class="val ${pnlClass}">${pnlSign}${totalPnl.toFixed(4)}</div>
          </div>
        </div>

        <!-- Liquidation Card -->
        <div class="liq-card">
          <div class="liq-card-info">
            <span class="label">Est. Liquidation Price</span>
            <span class="sub">Mirrors to opposite player's Take Profit</span>
          </div>
          <div class="liq-price-display">
            ${player.liquidationPrice > 0 ? player.liquidationPrice.toFixed(2) : 'None / Safe'}
          </div>
        </div>

        <!-- Orders Table -->
        <div class="orders-table-wrapper">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              Open Positions (${orders.length}) | Vol: ${(player.totalVolume || 0).toFixed(2)}
            </span>
            <span style="font-size: 0.7rem; color: var(--text-dim);">
              Target TP: <strong class="text-cyan">${oppositeLiq > 0 ? oppositeLiq.toFixed(2) : '--'}</strong>
            </span>
          </div>

          ${orders.length === 0 ? `
            <div style="padding: 1.5rem; text-align: center; color: var(--text-dim); font-size: 0.85rem;">
              No open positions captured on SimpleFX. Open a trade to begin sync.
            </div>
          ` : `
            <table class="orders-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Order ID</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Open Price</th>
                  <th>Take Profit</th>
                  <th>PnL (USDT)</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map((ord, idx) => {
                  const isFirst = idx === 0;
                  const isTarget = mode === 'first_trade' ? isFirst : true;
                  const curTP = parseFloat(ord.takeProfit);
                  const isSynced = oppositeLiq > 0 && !isNaN(curTP) && Math.abs(curTP - oppositeLiq) <= 0.02;
                  const sideClass = (ord.side || '').toUpperCase() === 'BUY' ? 'side-buy' : 'side-sell';
                  const ordPnl = parseFloat(ord.profitCurrency) || 0;
                  const ordPnlClass = ordPnl >= 0 ? 'text-green' : 'text-red';

                  return `
                    <tr class="${isTarget ? 'active-target-row' : ''}">
                      <td style="color: var(--text-dim);">${idx + 1}</td>
                      <td>${escapeHtml(ord.orderId || '-')}</td>
                      <td><span class="side-badge ${sideClass}">${escapeHtml(ord.side || 'BUY')}</span></td>
                      <td>${escapeHtml(ord.volume || '0.01')}</td>
                      <td>${escapeHtml(ord.openPrice || '-')}</td>
                      <td>
                        ${!isNaN(curTP) && curTP > 0 ? `
                          <span class="tp-pill ${isSynced ? 'tp-synced' : 'tp-pending'}" title="${isSynced ? 'Correctly synced to opposite liq' : 'Value differs from current opposite liq'}">
                            ${curTP.toFixed(2)} ${isSynced ? '✓' : '⚠️'}
                          </span>
                        ` : `
                          <span class="tp-pill tp-unset">Not Set</span>
                        `}
                      </td>
                      <td class="${ordPnlClass}">${ordPnl >= 0 ? '+' : ''}${ordPnl.toFixed(4)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }

  function renderLogs() {
    if (!currentState.logs) return;
    auditLogBody.innerHTML = currentState.logs.map(log => createLogHtml(log)).join('');
  }

  function prependLogEntry(log) {
    const html = createLogHtml(log);
    auditLogBody.insertAdjacentHTML('afterbegin', html);
    // Limit to 100 entries in DOM
    if (auditLogBody.children.length > 100) {
      auditLogBody.removeChild(auditLogBody.lastElementChild);
    }
  }

  function createLogHtml(log) {
    const levelTagClass = {
      info: 'tag-info',
      sync: 'tag-sync',
      success: 'tag-success',
      warn: 'tag-warn',
      error: 'tag-error'
    }[log.level || 'info'] || 'tag-info';

    return `
      <div class="log-entry">
        <span class="log-time">${escapeHtml(log.timeFormatted || new Date(log.timestamp).toLocaleTimeString())}</span>
        <span class="log-tag ${levelTagClass}">${escapeHtml(log.type || 'SYS')}</span>
        <span class="log-msg">${escapeHtml(log.message)}</span>
      </div>
    `;
  }

  // --- ACTIONS ---

  window.triggerForceSync = async function(pairId) {
    try {
      const res = await fetch(`/api/pairs/${pairId}/force-sync`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) alert(data.error || 'Failed to force sync');
    } catch (err) {
      console.error(err);
    }
  };

  window.toggleAutoSync = async function(pairId, autoSync) {
    try {
      await fetch(`/api/pairs/${pairId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSync })
      });
    } catch (err) {
      console.error(err);
    }
  };

  window.togglePausePair = async function(pairId, status) {
    try {
      await fetch(`/api/pairs/${pairId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (err) {
      console.error(err);
    }
  };

  window.deletePair = async function(pairId) {
    if (!confirm('Are you sure you want to delete and unpair these two extensions?')) return;
    try {
      await fetch(`/api/pairs/${pairId}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
  };

  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied "${text}" to clipboard!`);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#00f2fe';
    toast.style.color = '#000';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '6px';
    toast.style.fontWeight = '700';
    toast.style.zIndex = '99999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // --- MODAL EVENTS ---

  btnOpenAddPair.addEventListener('click', () => {
    modalErrorMsg.classList.add('hidden');
    inputPairName.value = `Hedging Pair #${currentState.pairs.length + 1}`;
    modalAddPair.classList.remove('hidden');
  });

  const closeModal = () => {
    modalAddPair.classList.add('hidden');
  };

  modalCloseBtn.addEventListener('click', closeModal);
  modalCancelBtn.addEventListener('click', closeModal);

  selectPlayerADropdown.addEventListener('change', (e) => {
    if (e.target.value) inputPlayerA.value = e.target.value;
  });

  selectPlayerBDropdown.addEventListener('change', (e) => {
    if (e.target.value) inputPlayerB.value = e.target.value;
  });

  formAddPair.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalErrorMsg.classList.add('hidden');

    const name = inputPairName.value.trim();
    const playerAId = inputPlayerA.value.trim();
    const playerBId = inputPlayerB.value.trim();
    const symbol = inputSymbol.value.trim();
    const mode = selectMode.value;
    const autoSync = checkAutoSync.checked;

    if (!playerAId || !playerBId) {
      modalErrorMsg.textContent = 'Please provide both Player A and Player B Client IDs.';
      modalErrorMsg.classList.remove('hidden');
      return;
    }

    if (playerAId === playerBId) {
      modalErrorMsg.textContent = 'Player A and Player B must be different client IDs.';
      modalErrorMsg.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, playerAId, playerBId, symbol, mode, autoSync })
      });
      const data = await res.json();

      if (!data.success) {
        modalErrorMsg.textContent = data.error || 'Failed to create pair';
        modalErrorMsg.classList.remove('hidden');
        return;
      }

      closeModal();
      formAddPair.reset();
    } catch (err) {
      modalErrorMsg.textContent = 'Network error: ' + err.message;
      modalErrorMsg.classList.remove('hidden');
    }
  });

  btnClearLogs.addEventListener('click', async () => {
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  });

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial connection
  connectWebSocket();
})();
