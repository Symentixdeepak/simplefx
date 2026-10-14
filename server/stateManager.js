/**
 * SimpleFX Cross-Hedging State Manager
 * Handles client registrations, pair configurations, liquidation-to-TP synchronization, and audit logging.
 */

class StateManager {
  constructor(broadcastCallback) {
    this.broadcast = broadcastCallback || (() => {});
    // clientId -> clientObj
    this.clients = new Map();
    // pairId -> pairObj
    this.pairs = new Map();
    // In-memory audit log (max 200 items)
    this.logs = [];
    // Track pending commands to prevent rapid duplicate commands: `${clientId}:${orderId}` -> timestamp
    this.pendingCommands = new Map();
  }

  log(level, type, message, details = {}) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString(),
      level, // 'info' | 'success' | 'warn' | 'error'
      type,  // 'connection' | 'sync' | 'order' | 'pair' | 'system'
      message,
      details
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    // Broadcast log update to web dashboard
    this.broadcast({
      type: 'LOG_ENTRY',
      payload: entry
    });
  }

  // --- CLIENT MANAGEMENT ---

  registerClient(clientId, ws, metadata = {}) {
    let client = this.clients.get(clientId);
    const isNew = !client;

    if (!client) {
      client = {
        id: clientId,
        ws: ws,
        connected: true,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        account: {
          balance: 0,
          bonus: 0,
          profitSwap: 0,
          currency: 'USDT'
        },
        positions: [],
        summary: null,
        url: metadata.url || '',
        pairedWith: null,
        pairId: null
      };
      this.clients.set(clientId, client);
    } else {
      client.ws = ws;
      client.connected = true;
      client.lastSeen = Date.now();
      if (metadata.url) client.url = metadata.url;
    }

    // Check if client is part of any existing pair
    for (const pair of this.pairs.values()) {
      if (pair.playerAId === clientId) {
        client.pairId = pair.id;
        client.pairedWith = pair.playerBId;
        break;
      } else if (pair.playerBId === clientId) {
        client.pairId = pair.id;
        client.pairedWith = pair.playerAId;
        break;
      }
    }

    this.log('info', 'connection', `Browser extension registered: [${clientId}]`, { clientId });
    this.broadcastState();
    return client;
  }

  unregisterClient(clientId, ws) {
    const client = this.clients.get(clientId);
    // Only mark disconnected if this closing socket is indeed the client's current active socket
    if (client && (!ws || client.ws === ws)) {
      client.connected = false;
      client.ws = null;
      client.lastSeen = Date.now();
      this.log('warn', 'connection', `Browser extension disconnected: [${clientId}]`, { clientId });
      this.broadcastState();
    }
  }

  updateClientData(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastSeen = Date.now();
    if (payload.account) {
      client.account = { ...client.account, ...payload.account };
    }
    if (Array.isArray(payload.positions)) {
      client.positions = payload.positions;
    }
    if (payload.summary) {
      client.summary = payload.summary;
    }
    if (payload.url) {
      client.url = payload.url;
    }

    // Evaluate sync for the pair this client belongs to
    if (client.pairId) {
      this.evaluatePairSync(client.pairId, clientId);
    }

    this.broadcastState();
  }

  // --- PAIR MANAGEMENT ---

  createPair({ name, playerAId, playerBId, symbol = 'XAUUSD', mode = 'first_trade', autoSync = true }) {
    if (!playerAId || !playerBId) {
      throw new Error('Both Player A ID and Player B ID are required');
    }
    if (playerAId === playerBId) {
      throw new Error('Player A and Player B must be different extensions');
    }

    // Check if already in another pair
    for (const p of this.pairs.values()) {
      if (p.playerAId === playerAId || p.playerBId === playerAId) {
        throw new Error(`Extension ${playerAId} is already in pair "${p.name}"`);
      }
      if (p.playerAId === playerBId || p.playerBId === playerBId) {
        throw new Error(`Extension ${playerBId} is already in pair "${p.name}"`);
      }
    }

    const pairId = 'pair_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const newPair = {
      id: pairId,
      name: name || `Pair ${this.pairs.size + 1} (${playerAId} vs ${playerBId})`,
      playerAId,
      playerBId,
      symbol: (symbol || 'XAUUSD').toUpperCase(),
      mode: mode || 'first_trade', // 'first_trade' | 'all_trades'
      autoSync: autoSync !== undefined ? autoSync : true,
      status: 'active', // 'active' | 'paused'
      createdAt: new Date().toISOString(),
      stats: {
        totalSyncs: 0,
        lastSyncA: null,
        lastSyncB: null,
        lastAction: 'Pair created'
      }
    };

    this.pairs.set(pairId, newPair);

    // Update clients
    const clientA = this.clients.get(playerAId);
    if (clientA) {
      clientA.pairId = pairId;
      clientA.pairedWith = playerBId;
    }
    const clientB = this.clients.get(playerBId);
    if (clientB) {
      clientB.pairId = pairId;
      clientB.pairedWith = playerAId;
    }

    this.log('success', 'pair', `New trading pair created: "${newPair.name}"`, {
      pairId,
      playerA: playerAId,
      playerB: playerBId
    });

    // Notify extensions of pairing status
    this.sendToClient(playerAId, {
      type: 'PAIR_STATUS_UPDATE',
      payload: { paired: true, pairId, opponentId: playerBId, role: 'Player A' }
    });
    this.sendToClient(playerBId, {
      type: 'PAIR_STATUS_UPDATE',
      payload: { paired: true, pairId, opponentId: playerAId, role: 'Player B' }
    });

    // Run initial sync check
    this.evaluatePairSync(pairId, 'INIT');
    this.broadcastState();
    return newPair;
  }

  deletePair(pairId) {
    const pair = this.pairs.get(pairId);
    if (!pair) return false;

    // Unlink clients
    const clientA = this.clients.get(pair.playerAId);
    if (clientA) {
      clientA.pairId = null;
      clientA.pairedWith = null;
      this.sendToClient(pair.playerAId, {
        type: 'PAIR_STATUS_UPDATE',
        payload: { paired: false, pairId: null, opponentId: null }
      });
    }

    const clientB = this.clients.get(pair.playerBId);
    if (clientB) {
      clientB.pairId = null;
      clientB.pairedWith = null;
      this.sendToClient(pair.playerBId, {
        type: 'PAIR_STATUS_UPDATE',
        payload: { paired: false, pairId: null, opponentId: null }
      });
    }

    this.pairs.delete(pairId);
    this.log('info', 'pair', `Trading pair removed: "${pair.name}"`, { pairId });
    this.broadcastState();
    return true;
  }

  updatePairSettings(pairId, settings) {
    const pair = this.pairs.get(pairId);
    if (!pair) return null;

    if (settings.name !== undefined) pair.name = settings.name;
    if (settings.mode !== undefined) pair.mode = settings.mode;
    if (settings.autoSync !== undefined) pair.autoSync = settings.autoSync;
    if (settings.status !== undefined) pair.status = settings.status;
    if (settings.symbol !== undefined) pair.symbol = settings.symbol.toUpperCase();

    this.log('info', 'pair', `Updated pair settings for "${pair.name}"`, settings);
    this.evaluatePairSync(pairId, 'SETTINGS_UPDATE');
    this.broadcastState();
    return pair;
  }

  // --- SYNCHRONIZATION ENGINE ---

  /**
   * Evaluates the liquidation prices and sets take profits cross-wise:
   * Player A TP <- Player B Est. Liquidation Price
   * Player B TP <- Player A Est. Liquidation Price
   */
  evaluatePairSync(pairId, triggerSource = '') {
    const pair = this.pairs.get(pairId);
    if (!pair) return;

    if (pair.status !== 'active') {
      return; // Paused
    }

    if (!pair.autoSync) {
      return; // Manual mode only
    }

    const clientA = this.clients.get(pair.playerAId);
    const clientB = this.clients.get(pair.playerBId);

    if (!clientA || !clientB) {
      return;
    }

    if (!clientA.connected || !clientB.connected) {
      return;
    }

    // Filter relevant orders by symbol if configured
    const filterOrders = (orders) => {
      if (!Array.isArray(orders)) return [];
      if (!pair.symbol || pair.symbol === 'ALL') return orders;
      return orders.filter(o => {
        const sym = (o.symbol || '').toUpperCase();
        return sym.includes(pair.symbol) || pair.symbol.includes(sym);
      });
    };

    const ordersA = filterOrders(clientA.positions);
    const ordersB = filterOrders(clientB.positions);

    // Find Estimated Liquidation Price for Player A
    // (Check individual orders, or summary if order didn't have it)
    const liqA = this.extractLiquidationPrice(ordersA, clientA);
    // Find Estimated Liquidation Price for Player B
    const liqB = this.extractLiquidationPrice(ordersB, clientB);

    // Sync Step 1: Set Player A's Take Profit to Player B's Liquidation Price
    if (liqB > 0 && ordersA.length > 0) {
      this.syncTakeProfit(clientA, ordersA, liqB, 'Player B Liquidation', pair);
    }

    // Sync Step 2: Set Player B's Take Profit to Player A's Liquidation Price
    if (liqA > 0 && ordersB.length > 0) {
      this.syncTakeProfit(clientB, ordersB, liqA, 'Player A Liquidation', pair);
    }
  }

  extractLiquidationPrice(orders, client) {
    // 1. Check order rows
    for (const o of orders) {
      const val = parseFloat(o.liquidationPrice);
      if (!isNaN(val) && val > 0) {
        return val;
      }
    }
    // 2. Fallback to client summary if present
    if (client.summary && client.summary.liquidationPrice) {
      const val = parseFloat(client.summary.liquidationPrice);
      if (!isNaN(val) && val > 0) return val;
    }
    return 0;
  }

  /**
   * Applies TP to orders based on pair mode (first trade vs all trades).
   * Maintains edge cases:
   * - Already correctly set? Don't trigger again.
   * - Set wrong? Fix it immediately.
   * - Command in-flight (cooldown)? Don't spam.
   */
  syncTakeProfit(targetClient, orders, targetPrice, reason, pair) {
    const ordersToSync = pair.mode === 'first_trade' ? [orders[0]] : orders;

    for (const order of ordersToSync) {
      if (!order || !order.orderId) continue;

      const currentTP = parseFloat(order.takeProfit);
      const isAlreadySet = !isNaN(currentTP) && Math.abs(currentTP - targetPrice) <= 0.02;

      if (isAlreadySet) {
        // Edge case: Already set correctly! Do not spam or re-open modal.
        continue;
      }

      // Check command cooldown to avoid double firing while Angular processes
      const commandKey = `${targetClient.id}:${order.orderId}`;
      const pending = this.pendingCommands.get(commandKey);
      const now = Date.now();

      if (pending) {
        const timeDiff = now - pending.timestamp;
        // If same target price is already in flight, wait at least 3 seconds
        if (Math.abs(pending.targetPrice - targetPrice) <= 0.02 && timeDiff < 3000) {
          continue;
        }
        // If target price changed (liquidation moved), wait at least 600ms before overwriting
        if (timeDiff < 600) {
          continue;
        }
      }

      // Record dispatch with targetPrice
      this.pendingCommands.set(commandKey, { timestamp: now, targetPrice });

      const isWronglySet = !isNaN(currentTP) && currentTP > 0;
      const statusText = isWronglySet
        ? `Fixing wrong TP on ${targetClient.id} (Current: ${currentTP} -> New: ${targetPrice})`
        : `Setting TP on ${targetClient.id} to ${targetPrice}`;

      this.log('sync', 'order', `${statusText} for Order #${order.orderId} [${reason}]`, {
        clientId: targetClient.id,
        orderId: order.orderId,
        currentTP: isNaN(currentTP) ? 'None' : currentTP,
        targetPrice,
        pairId: pair.id
      });

      // Send command to the browser extension
      this.sendToClient(targetClient.id, {
        type: 'COMMAND_SET_TP',
        payload: {
          orderId: order.orderId,
          targetPrice: targetPrice,
          symbol: order.symbol,
          tolerance: 0.02,
          reason
        }
      });

      // Update pair stats
      pair.stats.totalSyncs++;
      if (targetClient.id === pair.playerAId) {
        pair.stats.lastSyncA = new Date().toISOString();
      } else {
        pair.stats.lastSyncB = new Date().toISOString();
      }
      pair.stats.lastAction = `${statusText} #${order.orderId}`;
    }
  }

  // Handle acknowledgment / response from extension
  handleCommandResult(clientId, payload) {
    const { orderId, success, targetPrice, error, message, skipped } = payload;
    const key = `${clientId}:${orderId}`;

    if (skipped) {
      // Already correct, clear cooldown early
      this.pendingCommands.delete(key);
      return;
    }

    if (success) {
      this.log('success', 'order', `Successfully applied TP ${targetPrice} on [${clientId}] Order #${orderId}`, {
        clientId,
        orderId,
        targetPrice
      });
      // Allow re-evaluation after 500ms
      setTimeout(() => this.pendingCommands.delete(key), 500);
    } else {
      this.log('error', 'order', `Failed to set TP on [${clientId}] Order #${orderId}: ${error || message}`, {
        clientId,
        orderId,
        error
      });
      // Clear after 3s to allow retry
      setTimeout(() => this.pendingCommands.delete(key), 3000);
    }

    this.broadcastState();
  }

  // --- COMMUNICATION ---

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws && client.ws.readyState === 1 /* OPEN */) {
      try {
        client.ws.send(JSON.stringify(data));
      } catch (err) {
        console.error(`Failed to send to client ${clientId}:`, err);
      }
    }
  }

  // Generate full state for Web Dashboard
  getDashboardState() {
    const clientsList = Array.from(this.clients.values()).map(c => ({
      id: c.id,
      connected: c.connected,
      connectedAt: c.connectedAt,
      lastSeen: c.lastSeen,
      account: c.account,
      positions: c.positions,
      summary: c.summary,
      url: c.url,
      pairId: c.pairId,
      pairedWith: c.pairedWith
    }));

    const pairsList = Array.from(this.pairs.values()).map(p => {
      const clientA = this.clients.get(p.playerAId);
      const clientB = this.clients.get(p.playerBId);

      const ordersA = clientA ? clientA.positions : [];
      const ordersB = clientB ? clientB.positions : [];
      const liqA = clientA ? this.extractLiquidationPrice(ordersA, clientA) : 0;
      const liqB = clientB ? this.extractLiquidationPrice(ordersB, clientB) : 0;

      // Calculate total volumes and PnL
      const totalVolumeA = ordersA.reduce((sum, o) => sum + (parseFloat(o.volume) || 0), 0);
      const totalVolumeB = ordersB.reduce((sum, o) => sum + (parseFloat(o.volume) || 0), 0);
      const totalPnlA = ordersA.reduce((sum, o) => sum + (parseFloat(o.profitCurrency) || 0), 0);
      const totalPnlB = ordersB.reduce((sum, o) => sum + (parseFloat(o.profitCurrency) || 0), 0);

      return {
        ...p,
        playerA: clientA ? {
          id: clientA.id,
          connected: clientA.connected,
          account: clientA.account,
          positionsCount: ordersA.length,
          totalVolume: totalVolumeA,
          totalPnl: totalPnlA,
          liquidationPrice: liqA,
          orders: ordersA
        } : null,
        playerB: clientB ? {
          id: clientB.id,
          connected: clientB.connected,
          account: clientB.account,
          positionsCount: ordersB.length,
          totalVolume: totalVolumeB,
          totalPnl: totalPnlB,
          liquidationPrice: liqB,
          orders: ordersB
        } : null,
        netPnl: totalPnlA + totalPnlB,
        netDeltaVolume: totalVolumeA - totalVolumeB,
        syncStatus: {
          targetTPA: liqB > 0 ? liqB : null,
          targetTPB: liqA > 0 ? liqA : null,
          inSyncA: ordersA.length > 0 && liqB > 0 && Math.abs((parseFloat(ordersA[0].takeProfit) || 0) - liqB) <= 0.02,
          inSyncB: ordersB.length > 0 && liqA > 0 && Math.abs((parseFloat(ordersB[0].takeProfit) || 0) - liqA) <= 0.02
        }
      };
    });

    return {
      serverTime: new Date().toISOString(),
      clients: clientsList,
      pairs: pairsList,
      logs: this.logs.slice(0, 50)
    };
  }

  broadcastState() {
    const state = this.getDashboardState();
    this.broadcast({
      type: 'STATE_SNAPSHOT',
      payload: state
    });
  }
}

module.exports = StateManager;
