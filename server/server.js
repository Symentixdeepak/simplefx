const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const StateManager = require('./stateManager');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// CORS middleware for external extension & API calls
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Set up middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render / cloud monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Set of active dashboard WebSocket subscribers
const dashboardSockets = new Set();

// State manager with broadcast callback to all dashboard connections
const stateManager = new StateManager((msg) => {
  const json = JSON.stringify(msg);
  for (const client of dashboardSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
      } catch (err) {
        console.error('Error broadcasting to dashboard:', err);
      }
    }
  }
});

// --- REST API ROUTES ---

// Get current state snapshot
app.get('/api/state', (req, res) => {
  res.json({
    success: true,
    data: stateManager.getDashboardState()
  });
});

// Create new pair
app.post('/api/pairs', (req, res) => {
  try {
    const { name, playerAId, playerBId, symbol, mode, autoSync } = req.body;
    const pair = stateManager.createPair({
      name,
      playerAId,
      playerBId,
      symbol,
      mode,
      autoSync
    });
    res.json({ success: true, pair });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete pair
app.delete('/api/pairs/:id', (req, res) => {
  const success = stateManager.deletePair(req.params.id);
  if (success) {
    res.json({ success: true, message: 'Pair deleted successfully' });
  } else {
    res.status(404).json({ success: false, error: 'Pair not found' });
  }
});

// Update pair settings
app.patch('/api/pairs/:id', (req, res) => {
  const pair = stateManager.updatePairSettings(req.params.id, req.body);
  if (pair) {
    res.json({ success: true, pair });
  } else {
    res.status(404).json({ success: false, error: 'Pair not found' });
  }
});

// Force sync pair now
app.post('/api/pairs/:id/force-sync', (req, res) => {
  const pair = stateManager.pairs.get(req.params.id);
  if (!pair) {
    return res.status(404).json({ success: false, error: 'Pair not found' });
  }
  stateManager.log('info', 'sync', `Manual force sync triggered for "${pair.name}"`, { pairId: pair.id });
  stateManager.evaluatePairSync(req.params.id, 'MANUAL_TRIGGER');
  res.json({ success: true, message: 'Sync evaluation executed' });
});

// Clear logs
app.post('/api/logs/clear', (req, res) => {
  stateManager.logs = [];
  stateManager.broadcastState();
  res.json({ success: true });
});

// --- WEBSOCKET CONNECTION HANDLER ---

wss.on('connection', (ws, req) => {
  let clientId = null;
  let isDashboard = false;

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw);

      switch (data.type) {
        // Dashboard client subscribing to live feed
        case 'SUBSCRIBE_DASHBOARD': {
          isDashboard = true;
          dashboardSockets.add(ws);
          ws.send(JSON.stringify({
            type: 'STATE_SNAPSHOT',
            payload: stateManager.getDashboardState()
          }));
          break;
        }

        // Extension client registering unique ID
        case 'REGISTER_CLIENT': {
          clientId = data.clientId;
          stateManager.registerClient(clientId, ws, data.metadata || {});
          ws.send(JSON.stringify({
            type: 'REGISTER_ACK',
            payload: {
              clientId,
              serverTime: Date.now(),
              message: 'Registered successfully with SimpleFX Cross-Hedge Hub'
            }
          }));
          break;
        }

        // Extension sending real-time DOM scrape from SimpleFX
        case 'DOM_UPDATE': {
          if (clientId) {
            stateManager.updateClientData(clientId, data.payload || {});
          }
          break;
        }

        // Extension returning result of Take Profit command execution
        case 'COMMAND_RESULT': {
          if (clientId) {
            stateManager.handleCommandResult(clientId, data.payload || {});
          }
          break;
        }

        // Ping / Heartbeat
        case 'PING': {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          break;
        }

        default:
          console.warn('Unknown message type received:', data.type);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (isDashboard) {
      dashboardSockets.delete(ws);
    }
    if (clientId) {
      stateManager.unregisterClient(clientId);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${clientId || 'unknown'}:`, err);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  SimpleFX Cross-Hedge Synchronization Hub (Production Ready)`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`=======================================================`);
});
