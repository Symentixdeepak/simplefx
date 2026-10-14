/**
 * SimpleFX Cross-Hedge Content Script
 * Scrapes positions and account data, automates Take Profit injection, and renders in-page HUD.
 */

(function() {
  console.log('[SimpleFX HedgeMaster] Content script active on:', window.location.href);

  let lastScrapedJson = '';
  let scrapeTimer = null;
  let pairingInfo = { paired: false, opponentId: null, role: null };
  let hudElement = null;

  // --- 1. DOM SCRAPING ENGINE ---

  function parseNumber(text) {
    if (!text) return 0;
    // Remove currency symbols, commas, spaces, non-numeric characters except minus and dot
    const clean = text.replace(/[^0-9.-]/g, '').trim();
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  function scrapeAccountSummary() {
    const account = {
      bonus: 0,
      balance: 0,
      profitSwap: 0,
      currency: 'USDT'
    };

    // Locate SimpleFX footer summary wrapper
    const summaryWrapper = document.querySelector('.footer__summary--intro-wrapper, .summary__wrapper');
    if (!summaryWrapper) return account;

    const summaryItems = summaryWrapper.querySelectorAll('.summary');
    summaryItems.forEach(item => {
      const titleEl = item.querySelector('.summary__title');
      const valEl = item.querySelector('.summary__value');
      if (!titleEl || !valEl) return;

      const title = titleEl.textContent.trim().toLowerCase();
      const valText = valEl.textContent.trim();

      if (title.includes('bonus')) {
        account.bonus = parseNumber(valText);
      } else if (title.includes('balance')) {
        account.balance = parseNumber(valText);
      } else if (title.includes('profit') || title.includes('swap')) {
        account.profitSwap = parseNumber(valText);
      }
    });

    return account;
  }

  function scrapePositions() {
    const orders = [];
    let summary = null;

    // 1. Check for group summary row (e.g. Gold($) XAUUSD)
    const summaryRow = document.querySelector('.positions-table__row--summary');
    if (summaryRow) {
      const symEl = summaryRow.querySelector('.positions-table__cell--symbol');
      const sideEl = summaryRow.querySelector('.positions-table__cell--side');
      const volEl = summaryRow.querySelector('.positions-table__cell--volume');
      const openPriceEl = summaryRow.querySelector('.positions-table__cell--openPrice');
      const pnlPointsEl = summaryRow.querySelector('.positions-table__cell--profitPoints');
      const pnlCurrencyEl = summaryRow.querySelector('.positions-table__cell--profitAccountCurrency');
      const badgeEl = summaryRow.querySelector('.positions-table__aggregation-badge');

      summary = {
        symbol: symEl ? symEl.textContent.replace(/\s+/g, ' ').trim() : '',
        side: sideEl ? sideEl.textContent.trim() : '',
        volume: volEl ? volEl.textContent.trim() : '',
        openPrice: openPriceEl ? openPriceEl.textContent.trim() : '',
        profitPoints: pnlPointsEl ? pnlPointsEl.textContent.trim() : '',
        profitCurrency: pnlCurrencyEl ? pnlCurrencyEl.textContent.trim() : '',
        count: badgeEl ? parseInt(badgeEl.textContent.trim(), 10) || 1 : 1
      };

      // Auto-expand: If summary has count > 1 or order rows are hidden, click summary to expand
      const individualRows = document.querySelectorAll('.positions-table__row:not(.positions-table__row--summary)');
      if (individualRows.length === 0 && summary.count > 0) {
        console.log('[SimpleFX HedgeMaster] Expanding collapsed positions group...');
        summaryRow.click();
      }
    }

    // 2. Scrape individual order rows
    const rowElements = document.querySelectorAll('.positions-table__row:not(.positions-table__row--summary)');

    rowElements.forEach(row => {
      // Find Order ID
      let orderId = '';
      const testId = row.getAttribute('data-testid');
      if (testId && testId.startsWith('table-order-id-')) {
        orderId = testId.replace('table-order-id-', '').trim();
      } else {
        const idCell = row.querySelector('.positions-table__cell--id');
        if (idCell) orderId = idCell.textContent.trim();
      }

      // If no valid order ID found, skip
      if (!orderId) return;

      const symCell = row.querySelector('.positions-table__cell--symbol');
      const sideCell = row.querySelector('.positions-table__cell--side');
      const volCell = row.querySelector('.positions-table__cell--volume');
      const openTimeCell = row.querySelector('.positions-table__cell--openTime');
      const openPriceCell = row.querySelector('.positions-table__cell--openPrice');
      const tpCell = row.querySelector('.positions-table__cell--takeProfit');
      const slCell = row.querySelector('.positions-table__cell--stopLoss');
      const ptsCell = row.querySelector('.positions-table__cell--profitPoints');
      const pnlCell = row.querySelector('.positions-table__cell--profitAccountCurrency');
      const liqCell = row.querySelector('.positions-table__cell--estimatedLiquidationPrice');

      // Parse Take Profit
      let takeProfit = null;
      if (tpCell) {
        const tpText = tpCell.textContent.replace(/[^0-9.]/g, '').trim();
        if (tpText && !isNaN(parseFloat(tpText))) {
          takeProfit = parseFloat(tpText);
        }
      }

      // Parse Stop Loss
      let stopLoss = null;
      if (slCell) {
        const slText = slCell.textContent.replace(/[^0-9.]/g, '').trim();
        if (slText && !isNaN(parseFloat(slText))) {
          stopLoss = parseFloat(slText);
        }
      }

      // Parse Liquidation Price
      let liqPrice = null;
      if (liqCell) {
        const liqText = liqCell.textContent.replace(/[^0-9.]/g, '').trim();
        if (liqText && !isNaN(parseFloat(liqText))) {
          liqPrice = parseFloat(liqText);
        }
      }

      orders.push({
        orderId,
        symbol: symCell ? symCell.textContent.replace(/\s+/g, ' ').trim() : (summary ? summary.symbol : 'XAUUSD'),
        side: sideCell ? sideCell.textContent.trim().toUpperCase() : (summary ? summary.side : 'BUY'),
        volume: volCell ? volCell.textContent.trim() : '0.01',
        openTime: openTimeCell ? openTimeCell.textContent.trim() : '',
        openPrice: openPriceCell ? openPriceElFormat(openPriceCell.textContent) : '',
        takeProfit,
        stopLoss,
        profitPoints: ptsCell ? ptsCell.textContent.trim() : '0',
        profitCurrency: pnlCell ? pnlCell.textContent.trim() : '0.0000',
        liquidationPrice: liqPrice
      });
    });

    return { orders, summary };
  }

  function openPriceElFormat(text) {
    if (!text) return '';
    return text.replace(/[^0-9.]/g, '').trim();
  }

  function triggerScrapeAndSend() {
    try {
      const account = scrapeAccountSummary();
      const { orders, summary } = scrapePositions();

      const payload = {
        account,
        positions: orders,
        summary,
        url: window.location.href,
        timestamp: Date.now()
      };

      const serialized = JSON.stringify({ account, positions: orders, summary });
      if (serialized !== lastScrapedJson) {
        lastScrapedJson = serialized;
        chrome.runtime.sendMessage({
          type: 'DOM_SCRAPE_DATA',
          payload
        }).catch(() => {});

        updateHud(account, orders);
      }
    } catch (err) {
      console.error('[SimpleFX HedgeMaster] Scraping error:', err);
    }
  }

  function scheduleScrape() {
    if (scrapeTimer) clearTimeout(scrapeTimer);
    scrapeTimer = setTimeout(triggerScrapeAndSend, 300);
  }

  // --- 2. TAKE PROFIT AUTOMATION ENGINE ---

  async function executeSetTakeProfit(payload) {
    const { orderId, targetPrice, tolerance = 0.02 } = payload;
    console.log(`[SimpleFX HedgeMaster] Executing SET_TP for Order #${orderId} -> Target: ${targetPrice}`);

    if (!orderId || !targetPrice || isNaN(targetPrice)) {
      return { success: false, error: 'Invalid orderId or targetPrice provided' };
    }

    // Step A: Find the order row
    let row = document.querySelector(`[data-testid="table-order-id-${orderId}"]`);
    if (!row) {
      // Try searching inside order id cells
      const idCells = document.querySelectorAll('.positions-table__cell--id');
      for (const cell of idCells) {
        if (cell.textContent.includes(orderId)) {
          row = cell.closest('.positions-table__row');
          break;
        }
      }
    }

    if (!row) {
      // Check if group is collapsed
      const summaryRow = document.querySelector('.positions-table__row--summary');
      if (summaryRow) {
        summaryRow.click();
        await sleep(250);
        row = document.querySelector(`[data-testid="table-order-id-${orderId}"]`);
      }
    }

    if (!row) {
      return { success: false, error: `Order row #${orderId} not found in DOM` };
    }

    // Step B: Check current TP value in row
    const tpCell = row.querySelector('.positions-table__cell--takeProfit');
    if (!tpCell) {
      return { success: false, error: 'Take Profit cell not found in order row' };
    }

    const currentTpText = tpCell.textContent.replace(/[^0-9.]/g, '').trim();
    const currentTp = parseFloat(currentTpText);
    if (!isNaN(currentTp) && Math.abs(currentTp - targetPrice) <= tolerance) {
      console.log(`[SimpleFX HedgeMaster] Order #${orderId} TP already matches target (${currentTp} ≈ ${targetPrice}). Skipping.`);
      return {
        success: true,
        skipped: true,
        orderId,
        targetPrice,
        message: 'Already matching target price'
      };
    }

    // Step C: Click the edit icon / cell to trigger Angular edit modal
    const editIcon = tpCell.querySelector('icon[name="edit-small"], icon.edit-small') || tpCell.querySelector('svg') || tpCell;
    editIcon.click();

    // Step D: Wait for dialog panel to appear
    const dialog = await waitForElement('.stop-level-dialog-panel, table-stop-level-input, #active-stop-level-dialog', 2000);
    if (!dialog) {
      return { success: false, error: 'Failed to open Take Profit edit dialog (timeout)' };
    }

    await sleep(100);

    // Step E: Locate the amount input
    const input = dialog.querySelector('input.value-spinner__amount') || dialog.querySelector('input[type="text"]');
    if (!input) {
      return { success: false, error: 'Take profit input field not found inside dialog' };
    }

    // Step F: Format price and inject value
    const targetPriceStr = targetPrice.toFixed(2);
    input.focus();

    // Use native prototype value setter to properly notify Angular reactive form
    const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeValueSetter) {
      nativeValueSetter.call(input, targetPriceStr);
    } else {
      input.value = targetPriceStr;
    }

    // Dispatch input events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowUp' }));

    // Wait 120ms for Angular validation (validateStepLevels)
    await sleep(120);

    // Step G: Locate Apply button
    const controls = dialog.querySelector('.table-item-edit-popup__form-controls') || dialog;
    let applyBtn = Array.from(controls.querySelectorAll('button')).find(btn => {
      const txt = (btn.textContent || '').trim().toLowerCase();
      return (txt.includes('apply') || txt.includes('save') || txt.includes('ok')) && !btn.classList.contains('text-gray');
    });

    if (!applyBtn) {
      // Fallback: second button that isn't cancel
      const buttons = controls.querySelectorAll('button:not(.text-gray)');
      if (buttons.length > 0) applyBtn = buttons[buttons.length - 1];
    }

    if (!applyBtn) {
      // Try hitting Enter key
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));
    } else {
      if (applyBtn.disabled) {
        // Validation error present
        const errWrapper = dialog.querySelector('.table-stop-level-input__validation-wrapper');
        const errMsg = errWrapper ? errWrapper.textContent.trim() : 'Invalid step level';
        // Click cancel to close
        const cancelBtn = controls.querySelector('button.text-gray') || controls.querySelector('button');
        if (cancelBtn) cancelBtn.click();
        return { success: false, error: `SimpleFX validation error: ${errMsg}` };
      }
      applyBtn.click();
    }

    // Step H: Wait for dialog to close and verify update
    await sleep(250);
    triggerScrapeAndSend();

    return {
      success: true,
      orderId,
      targetPrice,
      message: `Take Profit updated to ${targetPriceStr}`
    };
  }

  function waitForElement(selector, timeoutMs = 2000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const startTime = Date.now();
      const interval = setInterval(() => {
        const found = document.querySelector(selector);
        if (found) {
          clearInterval(interval);
          resolve(found);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 50);
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // --- 3. IN-PAGE FLOATING HUD ---

  function createHud() {
    if (document.getElementById('simplefx-hedgemaster-hud')) return;

    hudElement = document.createElement('div');
    hudElement.id = 'simplefx-hedgemaster-hud';
    hudElement.className = 'sfx-hud-container';
    hudElement.innerHTML = `
      <div class="sfx-hud-header" id="sfx-hud-drag-handle">
        <div class="sfx-hud-status">
          <span class="sfx-hud-dot"></span>
          <span class="sfx-hud-title">SimpleFX HedgeMaster</span>
        </div>
        <button class="sfx-hud-toggle" id="sfx-hud-min-btn">−</button>
      </div>
      <div class="sfx-hud-body" id="sfx-hud-content">
        <div class="sfx-hud-row">
          <span class="sfx-hud-label">Pair Status:</span>
          <span class="sfx-hud-val" id="sfx-hud-pair-status">Unpaired</span>
        </div>
        <div class="sfx-hud-row">
          <span class="sfx-hud-label">Positions:</span>
          <span class="sfx-hud-val" id="sfx-hud-positions">0 open</span>
        </div>
        <div class="sfx-hud-row">
          <span class="sfx-hud-label">Est. Liquidation:</span>
          <span class="sfx-hud-val text-amber" id="sfx-hud-liq">--</span>
        </div>
      </div>
    `;

    document.body.appendChild(hudElement);

    const minBtn = hudElement.querySelector('#sfx-hud-min-btn');
    const content = hudElement.querySelector('#sfx-hud-content');
    minBtn.addEventListener('click', () => {
      content.classList.toggle('sfx-hud-hidden');
      minBtn.textContent = content.classList.contains('sfx-hud-hidden') ? '+' : '−';
    });
  }

  function updateHud(account, orders) {
    if (!hudElement) createHud();

    const pairStatusEl = document.getElementById('sfx-hud-pair-status');
    const positionsEl = document.getElementById('sfx-hud-positions');
    const liqEl = document.getElementById('sfx-hud-liq');

    if (positionsEl) positionsEl.textContent = `${orders.length} open (${orders.reduce((s, o) => s + (parseFloat(o.volume) || 0), 0).toFixed(2)} Lot)`;

    if (liqEl) {
      let liq = 0;
      for (const o of orders) {
        const v = parseFloat(o.liquidationPrice);
        if (!isNaN(v) && v > 0) { liq = v; break; }
      }
      liqEl.textContent = liq > 0 ? liq.toFixed(2) : '--';
    }

    if (pairStatusEl) {
      if (pairingInfo && pairingInfo.paired) {
        pairStatusEl.innerHTML = `<span style="color:#00f2fe;">Paired</span> with <strong>${pairingInfo.opponentId}</strong>`;
      } else {
        pairStatusEl.innerHTML = `<span style="color:#9ca3af;">Unpaired</span>`;
      }
    }
  }

  // --- 4. COMMUNICATION WITH BACKGROUND ---

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_SET_TP') {
      executeSetTakeProfit(request.payload).then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep channel open for async response
    }

    if (request.type === 'PAIR_STATUS_UPDATE') {
      pairingInfo = request.payload;
      updateHud(scrapeAccountSummary(), scrapePositions().orders);
      sendResponse({ received: true });
      return true;
    }
  });

  // --- 5. INITIALIZATION & OBSERVERS ---

  function init() {
    createHud();

    // MutationObserver to detect DOM changes immediately
    const observer = new MutationObserver((mutations) => {
      scheduleScrape();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Fallback polling interval every 1 second
    setInterval(triggerScrapeAndSend, 1000);

    // Initial scrape
    triggerScrapeAndSend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
