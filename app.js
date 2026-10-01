'use strict';

const state = {
  dashboard: null,
  type: 'income',
  filter: 'all',
  search: '',
  expanded: false,
  chartDays: 7,
  toastTimer: null,
};

const elements = {
  authScreen: document.getElementById('authScreen'),
  authMessage: document.getElementById('authMessage'),
  loginForm: document.getElementById('loginForm'),
  loginButton: document.getElementById('loginButton'),
  appShell: document.getElementById('appShell'),
  connection: document.getElementById('connectionStatus'),
  setupNotice: document.getElementById('setupNotice'),
  income: document.getElementById('incomeValue'),
  expense: document.getElementById('expenseValue'),
  balance: document.getElementById('balanceValue'),
  count: document.getElementById('transactionCount'),
  navCount: document.getElementById('navCount'),
  rows: document.getElementById('transactionRows'),
  tableSummary: document.getElementById('tableSummary'),
  chartColumns: document.getElementById('chartColumns'),
  chartCaption: document.getElementById('chartCaption'),
  chartRange: document.getElementById('chartRange'),
  categories: document.getElementById('categoryInput'),
  modal: document.getElementById('transactionModal'),
  form: document.getElementById('transactionForm'),
  formError: document.getElementById('formError'),
  shiftModal: document.getElementById('shiftModal'),
  shiftForm: document.getElementById('shiftForm'),
  shiftFormError: document.getElementById('shiftFormError'),
  shiftState: document.getElementById('shiftState'),
  shiftCashier: document.getElementById('shiftCashier'),
  shiftTime: document.getElementById('shiftTime'),
  shiftAction: document.getElementById('shiftAction'),
  toast: document.getElementById('toast'),
};

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Backend tidak dapat dijangkau. Pastikan node backend/app.js masih berjalan.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Permintaan gagal.'), { status: response.status });
  return payload;
}

function showAuthScreen(message = '') {
  elements.appShell.hidden = true;
  elements.authScreen.hidden = false;
  elements.authMessage.textContent = message;
  if (window.lucide) window.lucide.createIcons();
}

async function initializeApplication() {
  try {
    const health = await api('/api/health');
    if (!health.configured) {
      showAuthScreen('Konfigurasi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum lengkap di .env.');
      return;
    }
    if (!health.authConfigured) {
      showAuthScreen('Tambahkan SUPABASE_ANON_KEY dari project yang sama ke .env untuk login.');
      return;
    }
    const session = await api('/api/auth/session');
    if (!session.authenticated) {
      showAuthScreen();
      return;
    }
    elements.authScreen.hidden = true;
    elements.appShell.hidden = false;
    await refreshDashboard();
  } catch (error) {
    showAuthScreen(error.message);
  }
}

async function signIn(event) {
  event.preventDefault();
  elements.loginButton.disabled = true;
  elements.authMessage.textContent = '';
  const values = Object.fromEntries(new FormData(elements.loginForm).entries());
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
    elements.authScreen.hidden = true;
    elements.appShell.hidden = false;
    await refreshDashboard();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  } finally {
    elements.loginButton.disabled = false;
  }
}

async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* Clear the local view even if the server is offline. */ }
  state.dashboard = null;
  elements.loginForm.reset();
  showAuthScreen('Anda sudah keluar dari akun.');
}

function setConnection(connected) {
  const dot = elements.connection.querySelector('.status-dot');
  dot.classList.toggle('offline', !connected);
  elements.connection.lastChild.textContent = connected ? 'Terhubung' : 'Belum terhubung';
  elements.setupNotice.hidden = connected;
  document.getElementById('systemStatus').textContent = connected ? 'Sistem beroperasi normal' : 'Supabase belum terhubung';
  document.getElementById('addTransactionButton').disabled = !connected;
  elements.shiftAction.disabled = !connected;
  if (!connected) {
    elements.shiftState.textContent = 'Supabase belum terhubung';
    elements.shiftState.previousElementSibling.classList.add('closed');
  }
}

function showToast(message, isError = false) {
  const toast = elements.toast;
  toast.querySelector('span').textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
}

function renderCategories() {
  const categories = state.dashboard?.categories || [];
  const matching = categories.filter((category) => category.type === state.type);
  elements.categories.innerHTML = '<option value="">Pilih kategori</option>' + matching
    .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
}

function renderSummary() {
  const { summary, activeShift } = state.dashboard;
  elements.income.textContent = rupiah.format(summary.income);
  elements.expense.textContent = rupiah.format(summary.expense);
  elements.balance.textContent = rupiah.format(summary.balance);
  elements.count.innerHTML = `${summary.count} <small>transaksi</small>`;
  elements.navCount.textContent = summary.count;
  elements.shiftState.textContent = activeShift ? 'Shift sedang berjalan' : 'Belum ada shift aktif';
  elements.shiftState.previousElementSibling.classList.toggle('closed', !activeShift);
  elements.shiftCashier.textContent = activeShift?.cashier?.full_name || 'Kasir belum tersedia';
  elements.shiftTime.textContent = activeShift
    ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(activeShift.opened_at))
    : '--:--';
  elements.shiftAction.innerHTML = activeShift
    ? 'Tutup shift <i data-lucide="arrow-up-right"></i>'
    : 'Mulai shift <i data-lucide="arrow-up-right"></i>';
  document.getElementById('balanceContext').textContent = activeShift ? 'Shift aktif' : 'Belum ada shift';
  document.getElementById('profileName').textContent = activeShift?.cashier?.full_name || state.dashboard.cashiers[0]?.full_name || 'Kasir Utama';
}

function renderChart() {
  const points = (state.dashboard?.chart || []).slice(-state.chartDays);
  const maxValue = 4_000_000;
  elements.chartColumns.innerHTML = points.map((point) => {
    const date = new Date(`${point.date}T12:00:00Z`);
    const label = new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date);
    const incomeHeight = Math.min(100, point.income / maxValue * 100);
    const expenseHeight = Math.min(100, point.expense / maxValue * 100);
    return `<div class="chart-day" title="${escapeHtml(point.date)}"><div class="bar-pair"><span class="chart-bar" style="height:${incomeHeight}%" data-value="${escapeHtml(rupiah.format(point.income))}"></span><span class="chart-bar expense" style="height:${expenseHeight}%" data-value="${escapeHtml(rupiah.format(point.expense))}"></span></div><span>${escapeHtml(label)}</span></div>`;
  }).join('');
  const total = points.reduce((value, point) => value + point.income + point.expense, 0);
  elements.chartCaption.textContent = total ? `${state.chartDays} hari · ${rupiah.format(total)} total arus` : 'Belum ada data';
  document.getElementById('chartArea').setAttribute('aria-label', `Grafik arus kas ${state.chartDays} hari terakhir`);
}

function renderComposition() {
  const { income, expense } = state.dashboard.summary;
  const total = income + expense;
  const incomeAngle = total ? (income / total) * 360 : 0;
  const expenseAngle = total ? incomeAngle + (expense / total) * 360 : 0;
  const chart = document.getElementById('donutChart');
  chart.style.background = total
    ? `conic-gradient(#5e9c73 0deg ${incomeAngle}deg, #e5a18f ${incomeAngle}deg ${expenseAngle}deg, #eff2ed ${expenseAngle}deg 360deg)`
    : '#eff2ed';
  document.getElementById('donutTotal').textContent = rupiah.format(total);
  document.getElementById('compositionIncome').textContent = rupiah.format(income);
  document.getElementById('compositionExpense').textContent = rupiah.format(expense);
}

function transactionMarkup(transaction) {
  const isIncome = transaction.category?.type === 'income';
  const kind = isIncome ? 'income' : 'expense';
  const title = transaction.description || transaction.category?.name || 'Transaksi kas';
  const category = transaction.category?.name || 'Tanpa kategori';
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.occurred_at));
  const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(transaction.occurred_at));
  const methods = { cash: ['banknote', 'Tunai'], transfer: ['landmark', 'Transfer'], card: ['contactless', 'Kartu / QRIS'] };
  const [icon, method] = methods[transaction.payment_method] || methods.cash;
  return `<tr><td><div class="transaction-name"><span class="transaction-icon ${kind}"><i data-lucide="${icon}"></i></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(transaction.shift?.cashier?.full_name || 'Kasir')} · ${date}</small></span></div></td><td><span class="category-tag ${kind}">${escapeHtml(category)}</span></td><td>${time}</td><td><span class="method-label"><i data-lucide="${icon}"></i>${method}</span></td><td class="amount-cell ${kind}">${isIncome ? '+' : '−'}${escapeHtml(rupiah.format(transaction.amount))}</td></tr>`;
}

function renderTransactions() {
  const transactions = state.dashboard?.transactions || [];
  const filtered = transactions.filter((transaction) => {
    const typeMatches = state.filter === 'all' || transaction.category?.type === state.filter;
    const searchText = `${transaction.description || ''} ${transaction.category?.name || ''} ${transaction.shift?.cashier?.full_name || ''}`.toLocaleLowerCase('id-ID');
    return typeMatches && searchText.includes(state.search.toLocaleLowerCase('id-ID'));
  });
  const shown = state.expanded ? filtered : filtered.slice(0, 5);
  elements.rows.innerHTML = shown.length
    ? shown.map(transactionMarkup).join('')
    : '<tr class="empty-row"><td colspan="5"><span class="empty-icon"><i data-lucide="receipt"></i></span><strong>Belum ada transaksi</strong><span>Transaksi yang cocok akan muncul di sini.</span></td></tr>';
  elements.tableSummary.textContent = `Menampilkan ${shown.length} dari ${filtered.length} transaksi`;
  document.getElementById('viewAllButton').innerHTML = state.expanded
    ? 'Tampilkan lebih sedikit <i data-lucide="arrow-up"></i>'
    : 'Lihat semua <i data-lucide="arrow-right"></i>';
  document.getElementById('viewAllButton').hidden = filtered.length <= 5;
  if (window.lucide) window.lucide.createIcons();
}

function renderDashboard() {
  renderSummary();
  renderChart();
  renderComposition();
  renderTransactions();
  renderCategories();
  if (window.lucide) window.lucide.createIcons();
}

async function refreshDashboard() {
  const date = localDateKey();
  document.getElementById('copyrightYear').textContent = new Date().getFullYear();
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date());
  try {
    const health = await api('/api/health');
    if (!health.configured) {
      state.dashboard = null;
      setConnection(false);
      return;
    }
    if (!health.authConfigured) {
      state.dashboard = null;
      setConnection(false);
      showAuthScreen('Tambahkan SUPABASE_ANON_KEY dari project yang sama ke .env untuk login.');
      return;
    }
    const dashboard = await api(`/api/bootstrap?date=${encodeURIComponent(date)}`);
    state.dashboard = dashboard;
    setConnection(true);
    renderDashboard();
  } catch (error) {
    setConnection(false);
    if (error.status === 401) {
      showAuthScreen('Sesi login berakhir. Silakan masuk kembali.');
      return;
    }
    showToast(error.message, true);
  }
}

function openModal() {
  if (!state.dashboard) {
    showToast('Hubungkan Supabase sebelum mencatat transaksi.', true);
    return;
  }
  if (!state.dashboard?.activeShift) {
    showToast('Mulai shift kasir terlebih dahulu.', true);
    return;
  }
  elements.form.reset();
  elements.formError.hidden = true;
  state.type = 'income';
  document.querySelectorAll('.type-option').forEach((button) => button.classList.toggle('selected', button.dataset.type === state.type));
  renderCategories();
  elements.modal.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => document.getElementById('categoryInput').focus(), 50);
}

function closeModal() {
  elements.modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function openShiftModal() {
  if (!state.dashboard) return showToast('Hubungkan Supabase untuk mengelola shift.', true);
  const isClosing = Boolean(state.dashboard.activeShift);
  const cashierField = document.getElementById('shiftCashierField');
  const cashierInput = document.getElementById('shiftCashierInput');
  const amountInput = document.getElementById('shiftAmountInput');
  const submit = document.getElementById('shiftSubmit');
  elements.shiftForm.reset();
  elements.shiftFormError.hidden = true;
  cashierField.hidden = isClosing;
  cashierInput.innerHTML = state.dashboard.cashiers
    .map((cashier) => `<option value="${escapeHtml(cashier.id)}">${escapeHtml(cashier.full_name)}</option>`).join('');
  document.getElementById('shiftModalTitle').textContent = isClosing ? 'Tutup shift' : 'Mulai shift';
  document.getElementById('shiftAmountLabel').textContent = isClosing ? 'Kas fisik saat tutup' : 'Saldo kas awal';
  document.getElementById('shiftBalanceHint').hidden = !isClosing;
  document.getElementById('shiftExpectedBalance').textContent = rupiah.format(state.dashboard.summary.balance);
  amountInput.value = isClosing ? String(state.dashboard.summary.balance) : '';
  submit.innerHTML = isClosing ? '<i data-lucide="square"></i>Tutup shift' : '<i data-lucide="play"></i>Mulai shift';
  elements.shiftModal.hidden = false;
  document.body.classList.add('modal-open');
  if (window.lucide) window.lucide.createIcons();
  window.setTimeout(() => amountInput.focus(), 50);
}

function closeShiftModal() {
  elements.shiftModal.hidden = true;
  document.body.classList.remove('modal-open');
}

async function saveTransaction(event) {
  event.preventDefault();
  const submit = document.getElementById('submitTransaction');
  const formData = new FormData(elements.form);
  const data = Object.fromEntries(formData.entries());
  data.amount = Number(data.amount);
  submit.disabled = true;
  elements.formError.hidden = true;
  try {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    showToast('Transaksi berhasil dicatat.');
    await refreshDashboard();
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function saveShift(event) {
  event.preventDefault();
  const submit = document.getElementById('shiftSubmit');
  const isClosing = Boolean(state.dashboard?.activeShift);
  const formData = new FormData(elements.shiftForm);
  const amount = Number(formData.get('amount'));
  if (!Number.isFinite(amount) || amount < 0) {
    elements.shiftFormError.textContent = 'Masukkan jumlah kas yang valid.';
    elements.shiftFormError.hidden = false;
    return;
  }
  submit.disabled = true;
  elements.shiftFormError.hidden = true;
  try {
    if (isClosing) {
      await api(`/api/shifts/${encodeURIComponent(state.dashboard.activeShift.id)}/close`, {
        method: 'POST', body: JSON.stringify({ closing_cash: amount }),
      });
      closeShiftModal();
      showToast('Shift berhasil ditutup.');
    } else {
      const cashierId = formData.get('cashier_id');
      if (!cashierId) throw new Error('Tambahkan kasir aktif melalui backend/schema.sql terlebih dahulu.');
      await api('/api/shifts', {
        method: 'POST', body: JSON.stringify({ cashier_id: cashierId, opening_cash: amount }),
      });
      closeShiftModal();
      showToast('Shift berhasil dimulai.');
    }
    await refreshDashboard();
  } catch (error) {
    elements.shiftFormError.textContent = error.message;
    elements.shiftFormError.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

document.getElementById('addTransactionButton').addEventListener('click', openModal);
document.getElementById('refreshButton').addEventListener('click', refreshDashboard);
elements.loginForm.addEventListener('submit', signIn);
document.getElementById('signOutButton').addEventListener('click', signOut);
document.getElementById('dismissNotice').addEventListener('click', () => { elements.setupNotice.hidden = true; });
elements.shiftAction.addEventListener('click', openShiftModal);
elements.form.addEventListener('submit', saveTransaction);
elements.shiftForm.addEventListener('submit', saveShift);
elements.modal.addEventListener('click', (event) => {
  if (event.target === elements.modal || event.target.closest('[data-close-modal]')) closeModal();
});
elements.shiftModal.addEventListener('click', (event) => {
  if (event.target === elements.shiftModal || event.target.closest('[data-close-shift-modal]')) closeShiftModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!elements.modal.hidden) closeModal();
  if (!elements.shiftModal.hidden) closeShiftModal();
});
document.querySelectorAll('.type-option').forEach((button) => button.addEventListener('click', () => {
  state.type = button.dataset.type;
  document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('selected', option === button));
  renderCategories();
}));
document.getElementById('transactionSearch').addEventListener('input', (event) => {
  state.search = event.target.value.trim();
  renderTransactions();
});
document.getElementById('typeFilter').addEventListener('change', (event) => {
  state.filter = event.target.value;
  document.getElementById('filterLabel').textContent = { all: 'Semua', income: 'Pemasukan', expense: 'Pengeluaran' }[state.filter];
  state.expanded = false;
  renderTransactions();
});
document.getElementById('viewAllButton').addEventListener('click', () => {
  state.expanded = !state.expanded;
  renderTransactions();
});
elements.chartRange.addEventListener('change', (event) => {
  state.chartDays = Number(event.target.value);
  renderChart();
});
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === link));
  document.getElementById('sidebar').classList.remove('open');
}));

if (window.lucide) window.lucide.createIcons();
initializeApplication();
