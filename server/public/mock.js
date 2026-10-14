// SimpleFX DOM Simulator Script
(function() {
  let orders = [];
  let basePrice = 4156.86;
  let balance = 153.35;
  let bonus = 40.05;
  let nextOrderId = 325840960;

  const positionsContainer = document.getElementById('positions-container');
  const summaryProfit = document.getElementById('summary-profit');
  const summaryBalance = document.getElementById('summary-balance');
  const summaryBonus = document.getElementById('summary-bonus');

  // SVG Sprite icon for edit-small
  const editIconSvg = `
    <icon name="edit-small" class="mat-mdc-tooltip-trigger icon--sm edit-small ng-star-inserted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    </icon>
  `;

  const checkmarkSvg = `
    <icon name="checkmark-small" class="mat-mdc-tooltip-trigger icon--sm checkmark-small ng-star-inserted">
      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </icon>
  `;

  // Calculate realistic liquidation price
  function calculateLiquidation(side, totalVol) {
    if (totalVol <= 0) return 0;
    // SimpleFX cross margin formula: (Balance + Bonus) cushion / (Total Lot * 100)
    const cushion = (balance + bonus) / (totalVol * 10);
    if (side === 'BUY') {
      return Number(Math.max(10, basePrice - cushion).toFixed(2));
    } else {
      return Number((basePrice + cushion).toFixed(2));
    }
  }

  function addOrder(side, vol = 0.01) {
    nextOrderId++;
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${now.toLocaleTimeString()}`;

    orders.push({
      id: nextOrderId.toString(),
      symbol: 'Gold($) XAUUSD',
      symbolRaw: 'XAUUSD',
      side: side,
      volume: vol.toFixed(2),
      openTime: timeStr,
      openPrice: basePrice.toFixed(2),
      takeProfit: '',
      stopLoss: '',
      profitPoints: side === 'BUY' ? '-50' : '50',
      profitCurrency: side === 'BUY' ? '-3.5035' : '3.5035'
    });

    render();
  }

  function render() {
    if (orders.length === 0) {
      positionsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #8896a6;">
          No open positions. Click the buttons above to open trades.
        </div>
      `;
      summaryProfit.textContent = '0.0000 USDT';
      summaryProfit.className = 'summary__value';
      return;
    }

    const firstSide = orders[0].side;
    const totalVol = orders.reduce((s, o) => s + parseFloat(o.volume), 0);
    const liqPrice = calculateLiquidation(firstSide, totalVol);
    const totalPnl = orders.reduce((s, o) => s + parseFloat(o.profitCurrency), 0);

    summaryProfit.textContent = `${totalPnl.toFixed(4)} USDT`;
    summaryProfit.className = `summary__value ${totalPnl >= 0 ? 'positive' : 'negative'}`;

    // 1. Group summary section HTML (Exact SimpleFX Angular classes)
    let html = `
      <div class="table__section positions-table__section table__section--group ng-star-inserted">
        <table-item>
          <div class="table__row positions-table__row positions-table__row--summary table__row--active-chart" data-testid="table-symbol-XAUUSD">
            <div class="table__cell positions-table__cell positions-table__cell--aggregation">
              <span style="font-size: 10px;">▲</span>
            </div>
            <div class="positions-table__cell positions-table__cell--symbol table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content">
                <span class="positions-table__symbol-content ng-star-inserted"> Gold($) <span class="text-medium-gray text-xxs">XAUUSD</span></span>
              </span>
            </div>
            <div class="positions-table__cell positions-table__cell--optionsStart table__cell ng-star-inserted">
              <span class="positions-table__aggregation-badge ng-star-inserted"> ${orders.length} </span>
            </div>
            <div class="positions-table__cell positions-table__cell--id table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"></span>
            </div>
            <div class="positions-table__cell positions-table__cell--side table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"> ${firstSide} </span>
            </div>
            <div class="positions-table__cell positions-table__cell--volume table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"> ${totalVol.toFixed(2)} </span>
            </div>
            <div class="positions-table__cell positions-table__cell--openTime table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"> ${orders[0].openTime} </span>
            </div>
            <div class="positions-table__cell positions-table__cell--openPrice table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"> ${orders[0].openPrice} </span>
            </div>
            <div class="table__cell positions-table__cell positions-table__cell--takeProfit visible-value ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content">${checkmarkSvg}</span>
            </div>
            <div class="table__cell positions-table__cell positions-table__cell--stopLoss ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"></span>
            </div>
            <div class="table__cell positions-table__cell positions-table__cell--profitPoints ${totalPnl >= 0 ? 'positive' : 'negative'} ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content">${orders[0].profitPoints}</span>
            </div>
            <div class="table__cell positions-table__cell positions-table__cell--profitAccountCurrency ng-star-inserted ${totalPnl >= 0 ? 'positive' : 'negative'}">
              <span class="table__cell-content positions-table__cell-content"> ${totalPnl.toFixed(4)} </span>
            </div>
            <div class="positions-table__cell positions-table__cell--estimatedLiquidationPrice table__cell ng-star-inserted">
              <span class="table__cell-content positions-table__cell-content"></span>
            </div>
            <div class="positions-table__cell positions-table__cell--optionsEnd table__cell ng-star-inserted">✕</div>
          </div>
        </table-item>
      </div>
    `;

    // 2. Individual Order rows HTML (Exact SimpleFX Angular classes)
    orders.forEach(order => {
      html += `
        <div class="table__section positions-table__section ng-star-inserted">
          <table-item>
            <div class="table__row positions-table__row table__row--active-chart" data-testid="table-order-id-${order.id}">
              <div class="table__cell positions-table__cell positions-table__cell--aggregation"></div>
              <div class="positions-table__cell positions-table__cell--symbol table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content">
                  <span class="positions-table__symbol-content ng-star-inserted"> Gold($) <span class="text-medium-gray text-xxs">XAUUSD</span></span>
                </span>
              </div>
              <div class="positions-table__cell positions-table__cell--optionsStart table__cell ng-star-inserted"></div>
              <div class="positions-table__cell positions-table__cell--id table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content"> ${order.id} </span>
              </div>
              <div class="positions-table__cell positions-table__cell--side table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content"> ${order.side} </span>
              </div>
              <div class="positions-table__cell positions-table__cell--volume table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content"> ${order.volume} </span>
              </div>
              <div class="positions-table__cell positions-table__cell--openTime table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content"> ${order.openTime} </span>
              </div>
              <div class="positions-table__cell positions-table__cell--openPrice table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content"> ${order.openPrice} </span>
              </div>
              <div class="table__cell positions-table__cell positions-table__cell--takeProfit visible-value ng-star-inserted" data-order-id="${order.id}">
                <span class="table__cell-content positions-table__cell-content">
                  ${editIconSvg} <span class="tp-display-val">${order.takeProfit || ''}</span>
                </span>
              </div>
              <div class="table__cell positions-table__cell positions-table__cell--stopLoss ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content">${editIconSvg} ${order.stopLoss || ''}</span>
              </div>
              <div class="table__cell positions-table__cell positions-table__cell--profitPoints ${parseFloat(order.profitCurrency) >= 0 ? 'positive' : 'negative'} ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content">${order.profitPoints}</span>
              </div>
              <div class="table__cell positions-table__cell positions-table__cell--profitAccountCurrency ng-star-inserted ${parseFloat(order.profitCurrency) >= 0 ? 'positive' : 'negative'}">
                <span class="table__cell-content positions-table__cell-content"> ${order.profitCurrency} </span>
              </div>
              <div class="positions-table__cell positions-table__cell--estimatedLiquidationPrice table__cell ng-star-inserted">
                <span class="table__cell-content positions-table__cell-content">
                  <span class="ng-star-inserted">${liqPrice.toFixed(2)}</span>
                </span>
              </div>
              <div class="positions-table__cell positions-table__cell--optionsEnd table__cell ng-star-inserted">✕</div>
            </div>
          </table-item>
        </div>
      `;
    });

    positionsContainer.innerHTML = html;
    bindEditEvents();
  }

  // Bind click on Take Profit edit icon / cell to open the SimpleFX popup
  function bindEditEvents() {
    document.querySelectorAll('.positions-table__cell--takeProfit').forEach(cell => {
      const orderId = cell.getAttribute('data-order-id');
      if (!orderId) return;

      const editBtn = cell.querySelector('icon.edit-small');
      const openModal = (e) => {
        e.stopPropagation();
        openTakeProfitModal(orderId, cell);
      };

      if (editBtn) editBtn.onclick = openModal;
      cell.onclick = openModal;
    });
  }

  // Open the exact SimpleFX Take Profit Modal
  function openTakeProfitModal(orderId, cellElement) {
    // Remove any existing dialog
    closeAnyModal();

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const rect = cellElement.getBoundingClientRect();

    const dialogPanel = document.createElement('div');
    dialogPanel.className = 'stop-level-dialog-panel';
    dialogPanel.id = 'active-stop-level-dialog';
    dialogPanel.style.left = `${Math.min(window.innerWidth - 320, rect.left)}px`;
    dialogPanel.style.top = `${Math.max(20, rect.top - 160)}px`;

    dialogPanel.innerHTML = `
      <table-stop-level-input class="table-stop-level-input form__group table-item-edit-popup">
        <div class="table-item-edit-popup__form">
          <div class="form__group table-stop-level-input__control">
            <input type="text" class="value-spinner__amount" value="${order.takeProfit || ''}" placeholder="0.00" autofocus>
          </div>
          <div class="table-stop-level-input__validation-wrapper"></div>
          <div class="flex-row table-item-edit-popup__form-controls">
            <button type="button" class="btn-simple text-gray" id="btn-tp-cancel">Cancel</button>
            <button type="button" class="btn-simple" id="btn-tp-apply">Apply</button>
          </div>
        </div>
      </table-stop-level-input>
    `;

    document.body.appendChild(dialogPanel);

    const input = dialogPanel.querySelector('.value-spinner__amount');
    const btnCancel = dialogPanel.querySelector('#btn-tp-cancel');
    const btnApply = dialogPanel.querySelector('#btn-tp-apply');

    input.focus();
    input.select();

    btnCancel.onclick = () => closeAnyModal();

    btnApply.onclick = () => {
      saveTakeProfit(orderId, input.value.trim());
      closeAnyModal();
    };

    input.onkeyup = (e) => {
      if (e.key === 'Enter') {
        btnApply.click();
      } else if (e.key === 'Escape') {
        btnCancel.click();
      }
    };
  }

  function saveTakeProfit(orderId, newTp) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.takeProfit = newTp;
      render();
    }
  }

  function closeAnyModal() {
    const existing = document.getElementById('active-stop-level-dialog');
    if (existing) existing.remove();
  }

  // Button Listeners
  document.getElementById('btn-buy-lot').onclick = () => addOrder('BUY', 0.01);
  document.getElementById('btn-sell-lot').onclick = () => addOrder('SELL', 0.01);

  document.getElementById('btn-buy-6x').onclick = () => {
    for (let i = 0; i < 6; i++) addOrder('BUY', 0.01);
  };

  document.getElementById('btn-sell-6x').onclick = () => {
    for (let i = 0; i < 6; i++) addOrder('SELL', 0.01);
  };

  // Simulate 1 Trade Hit TP (Removes 1st order and shifts liquidation)
  document.getElementById('btn-hit-tp').onclick = () => {
    if (orders.length > 0) {
      const removed = orders.shift();
      alert(`Simulated TP Hit on Order #${removed.id}!\nRemaining positions: ${orders.length}\nLiquidation recalculated automatically.`);
      render();
    } else {
      alert('No positions open to simulate!');
    }
  };

  document.getElementById('btn-clear-orders').onclick = () => {
    orders = [];
    render();
  };

  // Initial render
  render();
})();
