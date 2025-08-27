const STORAGE_KEY = 'pocketwise_txns_v1';
const DEFAULT_CATEGORIES = ['Food', 'Groceries', 'Transport', 'Rent', 'Entertainment', 'Salary', 'Loan', 'Other'];

const txnForm = document.getElementById('txnForm');
const typeEl = document.getElementById('type');
const amountEl = document.getElementById('amount');
const categoryEl = document.getElementById('category');
const dateEl = document.getElementById('date');
const noteEl = document.getElementById('note');
const txList = document.getElementById('txList');
const totalIncome = document.getElementById('totalIncome');
const totalExpense = document.getElementById('totalExpense');
const netBalance = document.getElementById('netBalance');
const quickCats = document.getElementById('quickCats');
const chartMonthLabel = document.getElementById('chartMonthLabel');

const filterMonth = document.getElementById('filterMonth');
const filterCategory = document.getElementById('filterCategory');
const searchText = document.getElementById('searchText');
const sortSelect = document.getElementById('sortSelect');
const resetBtn = document.getElementById('resetBtn');
const txCount = document.getElementById('txCount');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

let transactions = [];
let pieChart = null, barChart = null;

Chart.defaults.devicePixelRatio = window.devicePixelRatio || 1;
dateEl.value = new Date().toISOString().slice(0, 10);

// --- storage helpers
function saveTxns() { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
function loadTxns() { transactions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }

// --- utils
function uid() { return 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 9999); }
function formatCurrency(n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function monthKeyToLabel(key) {
  // key: "YYYY-MM"
  const [y, m] = key.split('-');
  const d = new Date(`${y}-${m}-01T00:00:00`);
  return d.toLocaleString('default', { month: 'short', year: 'numeric' });
}

// --- quick category buttons
function renderQuickCats() {
  quickCats.innerHTML = '';
  DEFAULT_CATEGORIES.forEach(cat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick';
    b.innerText = cat;
    b.addEventListener('click', () => categoryEl.value = cat);
    quickCats.appendChild(b);
  });
}
renderQuickCats();

// --- form submit
txnForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = typeEl.value;
  const amount = parseFloat(amountEl.value);
  let category = (categoryEl.value || '').trim();
  const date = dateEl.value;
  const note = (noteEl.value || '').trim();

  if (!amount || isNaN(amount) || amount <= 0) { alert('Please enter a valid amount.'); return; }
  if (!date) { alert('Please select a valid date.'); return; }
  if (type === 'expense' && !category) { alert('Please enter a category for expenses.'); return; }
  if (type === 'income' && !category) category = 'Income';

  transactions.push({ id: uid(), type, amount, category, date, note });
  saveTxns();
  txnForm.reset();
  dateEl.value = new Date().toISOString().slice(0, 10);
  refreshFilterOptions();
  renderAll();
});

// clear form
clearBtn.addEventListener('click', () => {
  txnForm.reset();
  dateEl.value = new Date().toISOString().slice(0, 10);
});

// reset filters
resetBtn.addEventListener('click', () => {
  filterMonth.value = 'all';
  filterCategory.value = 'all';
  searchText.value = '';
  sortSelect.value = 'latest';
  renderAll();
});

// export CSV
exportBtn.addEventListener('click', () => {
  if (transactions.length === 0) { alert('No transactions to export.'); return; }
  const headers = ['Type','Amount','Category','Date','Note'];
  const rows = transactions.map(t => [t.type, t.amount, `"${t.category}"`, t.date, `"${(t.note||'').replace(/"/g,'""')}"`]);
  let csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pocketwise_transactions.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// delete txn
function deleteTxn(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter(t => t.id !== id);
  saveTxns();
  refreshFilterOptions();
  renderAll();
}

// --- render transactions list
function renderTxList(filtered) {
  txList.innerHTML = '';
  if (!filtered || filtered.length === 0) {
    txList.innerHTML = `<li class="tx-item"><div style="padding:14px;color:#6b7280">No transactions found.</div></li>`;
    txCount.innerText = '0';
    return;
  }
  filtered.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'tx-item';

    const left = document.createElement('div');
    left.className = 'tx-left';

    const dot = document.createElement('div');
    dot.className = 'tx-type';
    dot.style.background = tx.type === 'income' ? '#10b981' : '#ef4444';

    const info = document.createElement('div');
    info.className = 'tx-info';

    const title = document.createElement('strong');
    title.innerText = `${tx.category} • ${formatCurrency(tx.amount)}`;

    const meta = document.createElement('small');
    meta.innerText = `${tx.date} • ${tx.note || '—'}`;

    info.appendChild(title);
    info.appendChild(meta);
    left.appendChild(dot);
    left.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'tx-actions';
    const delBtn = document.createElement('button');
    delBtn.title = 'Delete';
    delBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
    delBtn.addEventListener('click', () => deleteTxn(tx.id));
    actions.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(actions);
    txList.appendChild(li);
  });
  txCount.innerText = filtered.length;
}

// --- stats
function computeStats(filtered) {
  let income = 0, expense = 0;
  filtered.forEach(t => { if (t.type === 'income') income += t.amount; else expense += t.amount; });
  totalIncome.innerText = formatCurrency(income);
  totalExpense.innerText = formatCurrency(expense);
  netBalance.innerText = formatCurrency(income - expense);
}

// --- charts
function updateCharts(filtered) {
  // PIE: spending by category (expenses only)
  const byCategory = {};
  filtered.forEach(t => {
    if (t.type === 'expense') {
      const cat = t.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + t.amount;
    }
  });
  let catLabels = Object.keys(byCategory);
  let catValues = catLabels.map(l => byCategory[l]);
  if (catLabels.length === 0) { catLabels = ['No expenses']; catValues = [1]; }

  const palette = ['#60a5fa','#34d399','#f97316','#f472b6','#f87171','#c084fc','#facc15','#93c5fd','#7dd3fc','#fb7185'];

  const pieData = { labels: catLabels, datasets: [{ data: catValues, backgroundColor: palette.slice(0, catLabels.length), borderWidth: 1 }] };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1, // force square area so pie is circular
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#0f172a',
          boxWidth: 12,
          usePointStyle: true,
          padding: 12,
          // reduce label font size if too many categories
          font: { size: Math.max(11, 14 - Math.floor(catLabels.length / 6)) }
        },
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.raw || 0;
            return `${label}: ₹${value.toLocaleString('en-IN')}`;
          }
        }
      }
    }
  };

  const pieCtx = document.getElementById('pieChart').getContext('2d');
  if (!pieChart) pieChart = new Chart(pieCtx, { type: 'pie', data: pieData, options: pieOptions });
  else { pieChart.data = pieData; pieChart.options = pieOptions; pieChart.update(); }

  // BAR: monthly income vs expense
  const byMonth = {};
  filtered.forEach(t => {
    // normalize to YYYY-MM
    const d = new Date(t.date);
    if (isNaN(d)) return;
    const key = d.toISOString().slice(0,7); // "YYYY-MM"
    if (!byMonth[key]) byMonth[key] = { income: 0, expense: 0 };
    if (t.type === 'income') byMonth[key].income += t.amount;
    else byMonth[key].expense += t.amount;
  });

  // sort months ascending by key (YYYY-MM)
  const monthKeys = Object.keys(byMonth).sort();
  // if no months, show current month with zeros to avoid empty chart
  if (monthKeys.length === 0) {
    const k = new Date().toISOString().slice(0,7);
    monthKeys.push(k);
    byMonth[k] = { income: 0, expense: 0 };
  }

  const months = monthKeys.map(k => monthKeyToLabel(k));
  const incomeVals = monthKeys.map(k => byMonth[k].income);
  const expenseVals = monthKeys.map(k => byMonth[k].expense);

  const barData = {
    labels: months,
    datasets: [
      { label: 'Income', data: incomeVals, backgroundColor: '#10b981' },
      { label: 'Expense', data: expenseVals, backgroundColor: '#ef4444' }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#0f172a' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')}` } }
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: '#0f172a' } },
      x: { ticks: { color: '#0f172a' } }
    }
  };

  const barCtx = document.getElementById('barChart').getContext('2d');
  if (!barChart) barChart = new Chart(barCtx, { type: 'bar', data: barData, options: barOptions });
  else { barChart.data = barData; barChart.options = barOptions; barChart.update(); }
}

// --- refresh filters UI options (months & categories)
function refreshFilterOptions() {
  // months seen in transactions (YYYY-MM)
  const months = Array.from(new Set(transactions.map(t => (t.date || '').slice(0,7)).filter(Boolean))).sort((a,b) => b.localeCompare(a)); // newest first
  // rebuild month select
  filterMonth.innerHTML = '<option value="all">All months</option>';
  months.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.innerText = monthKeyToLabel(key);
    filterMonth.appendChild(opt);
  });

  // categories
  const cats = new Set(DEFAULT_CATEGORIES);
  transactions.forEach(t => { if (t.category) cats.add(t.category); });
  filterCategory.innerHTML = '<option value="all">All categories</option>';
  Array.from(cats).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = cat;
    filterCategory.appendChild(opt);
  });
}

// --- main renderAll
function renderAll() {
  // start with all txns
  let filtered = transactions.slice();

  // apply month filter 
  const mf = filterMonth.value;
  if (mf && mf !== 'all') {
    filtered = filtered.filter(t => (t.date || '').slice(0,7) === mf);
    // show month label on chart
    chartMonthLabel.innerText = monthKeyToLabel(mf);
  } else {
    chartMonthLabel.innerText = '';
  }

  // category filter
  const cf = filterCategory.value;
  if (cf && cf !== 'all') filtered = filtered.filter(t => t.category === cf);

  // search text
  const q = (searchText.value || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(t => {
      return (t.category || '').toLowerCase().includes(q)
        || (t.note || '').toLowerCase().includes(q)
        || (t.type || '').toLowerCase().includes(q)
        || String(t.amount).toLowerCase().includes(q);
    });
  }

  // sort
  const sortVal = sortSelect.value;
  if (sortVal === 'latest') filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
  else if (sortVal === 'amountHigh') filtered.sort((a,b) => b.amount - a.amount);
  else if (sortVal === 'amountLow') filtered.sort((a,b) => a.amount - b.amount);

  // render UI
  renderTxList(filtered);
  computeStats(filtered);
  updateCharts(filtered);
}

// --- initial load
(function init() {
  loadTxns();
  refreshFilterOptions();
  renderQuickCats();
  renderAll();
})();

// --- wire up filters to re-render realtime
filterMonth.addEventListener('change', renderAll);
filterCategory.addEventListener('change', renderAll);
searchText.addEventListener('input', debounce(renderAll, 250));
sortSelect.addEventListener('change', renderAll);

// --- simple debounce
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
