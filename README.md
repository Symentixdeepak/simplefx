# SimpleFX HedgeMaster
### Cross-Liquidation to Take-Profit Automation Engine & Web Dashboard

SimpleFX HedgeMaster is an automated pair-trading and cross-hedging system engineered specifically for [SimpleFX WebTrader](https://app.simplefx.com/). It connects two (or more) browser sessions, captures real-time DOM states (orders, open prices, PnL, account balances, and estimated liquidation prices), and dynamically mirrors each account's liquidation price into the opposing account's Take Profit order.

---

## ⚡ How It Works

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    CENTRAL HUB SERVER                       │
  │                  (http://localhost:3000)                    │
  │  - Real-Time WebSocket Synchronization Engine               │
  │  - Pair Matching (Player A ↔ Player B)                      │
  │  - Cascade 1-by-1 Execution Engine                          │
  │  - Live Audit Terminal & Visual Control Dashboard           │
  └───────────────▲─────────────────────────────▲───────────────┘
                  │                             │
    WebSocket (ws://)             WebSocket (ws://)
                  │                             │
  ┌───────────────▼─────────────┐ ┌─────────────▼───────────────┐
  │   BROWSER 1 (PLAYER A)      │ │    BROWSER 2 (PLAYER B)     │
  │   Unique ID: SFX-XXXX-AAAA  │ │    Unique ID: SFX-YYYY-BBBB │
  │                             │ │                             │
  │   SimpleFX WebTrader Tab    │ │    SimpleFX WebTrader Tab   │
  │   • Opens 6x BUY orders     │ │    • Opens 6x SELL orders   │
  │   • Est. Liq: 4143.34 ──────┼─┼───► Take Profit: 4143.34    │
  │   • Take Profit: 4190.50 ◄──┼─┼──── Est. Liq: 4190.50       │
  │                             │ │                             │
  │   [Auto-Cascade Engine]     │ │    [Auto-Cascade Engine]    │
  │   When trade #1 hits TP,    │ │    When trade #1 hits TP,   │
  │   remaining 5 auto-adjust   │ │    remaining 5 auto-adjust  │
  └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Start the Backend Server & Dashboard

From `d:\simplefx`:
```bash
npm start
```
The server will start on `http://localhost:3000`:
- **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Built-in DOM Simulator:** [http://localhost:3000/mock.html](http://localhost:3000/mock.html)
- **WebSocket Endpoint:** `ws://localhost:3000`

---

### 2. Install the Extension in Your Browsers

You need the extension running in **2 separate browsers** (e.g. Chrome + Brave, or two separate Chrome Profiles):

1. Open your browser and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** (top-right corner).
3. Click **Load unpacked**.
4. Select the directory:
   ```
   d:\simplefx\extension
   ```
5. Repeat the exact same steps in your second browser / profile.

---

### 3. Copy Unique Client IDs & Create a Pair

1. In Browser 1, click the extension icon in the toolbar.
   - You will see a unique ID (e.g. `SFX-98F1-LONG`).
   - Click **COPY ID**.
2. In Browser 2, click the extension icon in the toolbar.
   - You will see its unique ID (e.g. `SFX-34C2-SHRT`).
   - Click **COPY ID**.
3. Open the **Web Dashboard** at [http://localhost:3000](http://localhost:3000).
4. Click **+ Add Trading Pair**:
   - Paste Browser 1's ID as **Player A**.
   - Paste Browser 2's ID as **Player B**.
   - Select your Cascade Strategy Mode (default: **First Open Trade Cascade 1-by-1**).
   - Click **Link & Activate Pair**.

---

### 4. Trade Execution & Auto-Mirroring

1. Open [https://app.simplefx.com/](https://app.simplefx.com/) on both browsers.
2. In Browser 1 (Player A): Open your Long (BUY) orders (e.g. 6x 0.01 XAUUSD).
3. In Browser 2 (Player B): Open your Short (SELL) orders (e.g. 6x 0.01 XAUUSD).
4. **Instant Synchronization:**
   - The extension captures the DOM in real time.
   - Player A's Est. Liquidation Price is automatically injected as Player B's Take Profit!
   - Player B's Est. Liquidation Price is automatically injected as Player A's Take Profit!
5. **The Cascade Effect:**
   - When Player A's Take Profit hits (and Player B gets liquidated on that position), 5 positions remain.
   - The liquidation prices shift on both accounts.
   - The engine automatically detects the new liquidation prices and re-adjusts the Take Profit on the next open trade until all trades are complete!

---

## 🧪 Testing with the Built-In Simulator

You don't need real funds to verify the entire system. A complete SimpleFX DOM simulator is built into the server:

1. Open [http://localhost:3000/mock.html](http://localhost:3000/mock.html) in Browser 1.
2. Open [http://localhost:3000/mock.html](http://localhost:3000/mock.html) in Browser 2.
3. Open 6x Longs on Browser 1 and 6x Shorts on Browser 2 using the test buttons.
4. Watch both Take Profits set automatically!
5. Click **Simulate 1 Trade Hit TP** to observe the cascade re-adjustment in real time.

---

## 🛡️ Edge Cases Handled

- **Already Set Correctly:** If an order's TP is already within ±0.02 of the opposite liquidation price, no clicks or popups are triggered.
- **Wrong Value Correction:** If a TP is set to an old or incorrect value, the engine immediately overwrites and corrects it.
- **Collapsed Group Row:** If the SimpleFX positions table is grouped/collapsed, the extension automatically expands it to access individual order IDs and prices.
- **Multiple Pairs:** You can link 4 browsers into 2 independent pairs, 6 browsers into 3 pairs, etc. Each pair operates in isolation.
- **Cooldown Throttling:** Rapid DOM updates are throttled so Angular reactive forms are not spammed with duplicate popups.
