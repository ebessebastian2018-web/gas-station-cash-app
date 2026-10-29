'use strict';

const SUPABASE_URL = 'https://dxsuybxregdldmkduuye.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bBWO0GD6aZj5aYMzFpqnng_qYqhBoOP';
const hasSupabaseConfig = !SUPABASE_URL.includes('YOUR_') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
const supabaseClient = hasSupabaseConfig && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const state = {
  dashboard: null,
  page: null,
  role: null,
  userEmail: '',
  type: 'income',
  filter: 'all',
  search: '',
  expanded: false,
  chartDays: 7,
  toastTimer: null,
  ledgerRequest: 0,
};

const elements = {
  authScreen: document.getElementById('authScreen'),
  authMessage: document.getElementById('authMessage'),
  loginForm: document.getElementById('loginForm'),
  loginButton: document.getElementById('loginButton'),
  appShell: document.getElementById('appShell'),
  connection: document.getElementById('connectionStatus'),
  breadcrumbTitle: document.getElementById('breadcrumbTitle'),
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
  receiptModal: document.getElementById('receiptModal'),
  receiptContent: document.getElementById('receiptContent'),
  shiftModal: document.getElementById('shiftModal'),
  shiftForm: document.getElementById('shiftForm'),
  shiftFormError: document.getElementById('shiftFormError'),
  journalModal: document.getElementById('journalModal'),
  journalForm: document.getElementById('journalForm'),
  journalLines: document.getElementById('journalLines'),
  journalFormError: document.getElementById('journalFormError'),
  journalRows: document.getElementById('journalRows'),
  ledgerRows: document.getElementById('ledgerRows'),
  shiftState: document.getElementById('shiftState'),
  shiftCashier: document.getElementById('shiftCashier'),
  shiftTime: document.getElementById('shiftTime'),
  shiftAction: document.getElementById('shiftAction'),
  toast: document.getElementById('toast'),
};

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});
const fuelPrices = Object.freeze({ V1: 10_000, V2: 15_000, SX: 7_500 });

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function supabaseErrorMessage(error) {
  const message = String(error?.message || 'Permintaan ke Supabase gagal.');
  if (message.toLowerCase().includes('failed to fetch')) return 'Tidak dapat menghubungi Supabase. Periksa URL, publishable key, dan koneksi internet.';
  if (message.includes('app_user_roles') || message.includes('chart_accounts') || message.includes('journal_entries') || message.includes('journal_entry_lines')) return 'Skema peran dan akuntansi belum tersedia. Jalankan ulang backend/schema.sql di Supabase SQL Editor.';
  if (message.includes('receipt_text') || error?.code === '42703') return 'Kolom struk belum tersedia. Jalankan backend/schema.sql di Supabase SQL Editor.';
  if (error?.code === '42501' || message.toLowerCase().includes('row-level security')) {
    return 'Akses data ditolak oleh RLS. Jalankan ulang backend/schema.sql di Supabase SQL Editor.';
  }
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'Tabel belum tersedia. Jalankan backend/schema.sql di Supabase SQL Editor.';
  if (error?.code === '23505') return 'Masih ada shift yang terbuka. Tutup shift tersebut terlebih dahulu.';
  return message;
}

function assertSupabaseSuccess(result) {
  if (result.error) throw new Error(supabaseErrorMessage(result.error));
  return result.data;
}

function showAuthScreen(message = '') {
  state.role = null;
  state.userEmail = '';
  state.dashboard = null;
  elements.appShell.hidden = true;
  elements.authScreen.hidden = false;
  elements.authMessage.textContent = message;
  if (window.lucide) window.lucide.createIcons();
}

async function openAuthorizedApplication(session) {
  const roleResult = await supabaseClient.from('app_user_roles')
    .select('role').eq('user_id', session.user.id).maybeSingle();
  const role = assertSupabaseSuccess(roleResult)?.role;
  if (!['admin', 'owner'].includes(role)) {
    await supabaseClient.auth.signOut();
    throw new Error('Akun ini belum memiliki peran admin atau owner. Hubungi pengelola aplikasi.');
  }
  state.role = role;
  state.userEmail = session.user.email || 'Operator';
  document.getElementById('profileRole').textContent = role === 'owner' ? 'Owner' : 'Admin';
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.hidden = role === 'admin'
      ? !['shift', 'transaksi'].includes(link.dataset.section)
      : link.dataset.section === 'shift';
  });
  document.getElementById('shift').hidden = role !== 'admin';
  document.getElementById('transaksi').hidden = false;
  document.getElementById('transactionsHistoryPanel').hidden = role === 'admin';
  document.getElementById('adminSalesNotice').hidden = role !== 'admin';
  document.getElementById('transactionsPageTitle').textContent = role === 'admin' ? 'Penjualan' : 'Transaksi';
  document.getElementById('transactionsPageSubtitle').textContent = role === 'admin'
    ? 'Catat penjualan BBM dan layanan SPBU di shift yang sedang berjalan.'
    : 'Telusuri setiap kas masuk dan keluar di SPBU Melati.';
  document.getElementById('transactionNavLabel').textContent = role === 'admin' ? 'Penjualan' : 'Transaksi';
  document.getElementById('addTransactionLabel').textContent = role === 'admin' ? 'Catat penjualan' : 'Catat transaksi';
  document.getElementById('navCount').hidden = role === 'admin';
  document.querySelector('[data-type="expense"]').hidden = role === 'admin';
  document.querySelector('.shift-balance-card').hidden = role === 'admin';
  document.querySelector('.shift-guide-grid').hidden = role !== 'admin';
  document.getElementById('addTransactionButton').hidden = false;
  elements.shiftAction.hidden = role !== 'admin';
  elements.authScreen.hidden = true;
  elements.appShell.hidden = false;
  showPage(role === 'admin' ? 'shift' : window.location.hash.slice(1) || 'ringkasan');
  await refreshDashboard();
}

async function initializeApplication() {
  try {
    if (!window.supabase) {
      showAuthScreen('Library Supabase belum termuat. Periksa koneksi internet atau CDN.');
      return;
    }
    if (!supabaseClient) {
      showAuthScreen('Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY pada frontend/app.js.');
      return;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      showAuthScreen();
      return;
    }
    await openAuthorizedApplication(data.session);
  } catch (error) {
    showAuthScreen(supabaseErrorMessage(error));
  }
}

async function signIn(event) {
  event.preventDefault();
  elements.loginButton.disabled = true;
  elements.authMessage.textContent = '';
  const values = Object.fromEntries(new FormData(elements.loginForm).entries());
  try {
    if (!supabaseClient) throw new Error('Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY pada frontend/app.js.');
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      const message = error.message.toLowerCase().includes('invalid login credentials')
        ? 'Email atau password salah, atau email akun belum dikonfirmasi.'
        : supabaseErrorMessage(error);
      throw new Error(message);
    }
    await openAuthorizedApplication(data.session);
  } catch (error) {
    elements.authMessage.textContent = supabaseErrorMessage(error);
  } finally {
    elements.loginButton.disabled = false;
  }
}

async function signOut() {
  state.dashboard = null;
  elements.loginForm.reset();
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw new Error(supabaseErrorMessage(error));
    showAuthScreen('Anda sudah keluar dari akun.');
  } catch (error) {
    showAuthScreen(error.message);
  }
}

function setConnection(connected) {
  const dot = elements.connection.querySelector('.status-dot');
  dot.classList.toggle('offline', !connected);
  elements.connection.lastChild.textContent = connected ? 'Terhubung' : 'Belum terhubung';
  elements.setupNotice.hidden = connected;
  document.getElementById('systemStatus').textContent = connected
    ? 'Sistem beroperasi normal'
    : 'Supabase belum terhubung';
  document.getElementById('addTransactionButton').disabled = !connected || state.role !== 'owner';
  elements.shiftAction.disabled = !connected || state.role !== 'admin';
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

function updateFuelSaleFields() {
  const category = state.dashboard?.categories.find((item) => item.id === elements.categories.value);
  const isFuelSale = category?.name === 'Penjualan BBM' && category.type === 'income';
  const fuelFields = document.getElementById('fuelFields');
  const fuelLitersInput = document.getElementById('fuelLitersInput');
  const amountInput = document.getElementById('amountInput');
  fuelFields.hidden = !isFuelSale;
  fuelLitersInput.required = isFuelSale;
  amountInput.readOnly = isFuelSale;
  if (!isFuelSale) {
    fuelLitersInput.value = '';
    amountInput.value = '';
    return;
  }
  updateFuelSaleAmount();
}

function updateFuelSaleAmount() {
  const fuelTypeInput = document.getElementById('fuelTypeInput');
  const product = fuelTypeInput.value;
  const price = fuelPrices[product];
  const liters = Number(document.getElementById('fuelLitersInput').value);
  const amountInput = document.getElementById('amountInput');
  const total = Number.isFinite(liters) && liters > 0 ? Math.round(price * liters) : 0;
  amountInput.value = total || '';
  document.querySelectorAll('.fuel-type-option').forEach((option) => {
    const selected = option.dataset.fuelType === product;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
  document.getElementById('fuelPriceHint').textContent = total
    ? `${product} · ${rupiah.format(price)} / liter · Total ${rupiah.format(total)}`
    : `Harga ${product}: ${rupiah.format(price)} per liter`;
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
  if (state.role === 'admin') {
    document.querySelector('#adminSalesNotice span').textContent = activeShift
      ? 'Shift aktif. Catat penjualan BBM atau layanan SPBU; nominal penjualan akan dicatat pada kas shift ini.'
      : 'Catat penjualan BBM atau layanan SPBU. Admin perlu memulai shift terlebih dahulu agar penjualan masuk ke pencatatan kas shift.';
    document.querySelector('#adminSalesNotice a').hidden = Boolean(activeShift);
  }
  document.getElementById('balanceContext').textContent = activeShift ? 'Shift aktif' : 'Belum ada shift';
  document.getElementById('shiftPageBalance').textContent = rupiah.format(summary.balance);
  document.getElementById('profileName').textContent = state.userEmail || 'Operator';
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
    ? `conic-gradient(#c32132 0deg ${incomeAngle}deg, #edb51c ${incomeAngle}deg ${expenseAngle}deg, #fff2cf ${expenseAngle}deg 360deg)`
    : '#fff2cf';
  document.getElementById('donutTotal').textContent = rupiah.format(total);
  document.getElementById('compositionIncome').textContent = rupiah.format(income);
  document.getElementById('compositionExpense').textContent = rupiah.format(expense);
}

function renderProfitLoss() {
  const entries = state.dashboard?.profitLossEntries || [];
  const start = new Date(`${state.dashboard.date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (state.chartDays - 1));
  const startDate = start.toISOString().slice(0, 10);
  const periodEntries = entries.filter((entry) => entry.entry_date >= startDate && entry.entry_date <= state.dashboard.date);
  let revenue = 0;
  let expenses = 0;
  for (const entry of periodEntries) {
    for (const line of entry.journal_entry_lines || []) {
      if (line.account?.account_type === 'revenue') revenue += Number(line.credit) - Number(line.debit);
      if (line.account?.account_type === 'expense') expenses += Number(line.debit) - Number(line.credit);
    }
  }
  const profit = revenue - expenses;
  document.getElementById('profitLossPeriod').textContent = `Berdasarkan jurnal ${state.chartDays} hari · ${startDate} – ${state.dashboard.date}`;
  document.getElementById('reportRevenue').textContent = rupiah.format(revenue);
  document.getElementById('reportExpenses').textContent = rupiah.format(expenses);
  document.getElementById('reportProfit').textContent = rupiah.format(Math.abs(profit));
  document.getElementById('profitLabel').textContent = profit < 0 ? 'Rugi bersih' : 'Laba bersih';
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
  const receipt = transaction.receipt_text
    ? `<button class="receipt-link" type="button" data-receipt-id="${escapeHtml(transaction.id)}"><i data-lucide="file-text"></i><span>Lihat rincian</span></button>`
    : '<span class="receipt-missing">—</span>';
  return `<tr><td><div class="transaction-name"><span class="transaction-icon ${kind}"><i data-lucide="${icon}"></i></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(transaction.shift?.cashier?.full_name || 'Kasir')} · ${date}</small></span></div></td><td data-label="Kategori"><span class="category-tag ${kind}">${escapeHtml(category)}</span></td><td data-label="Waktu">${time}</td><td data-label="Metode"><span class="method-label"><i data-lucide="${icon}"></i>${method}</span></td><td data-label="Struk">${receipt}</td><td data-label="Jumlah" class="amount-cell ${kind}">${isIncome ? '+' : '−'}${escapeHtml(rupiah.format(transaction.amount))}</td></tr>`;
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
    : '<tr class="empty-row"><td colspan="6"><span class="empty-icon"><i data-lucide="receipt"></i></span><strong>Belum ada transaksi</strong><span>Transaksi yang cocok akan muncul di sini.</span></td></tr>';
  elements.tableSummary.textContent = `Menampilkan ${shown.length} dari ${filtered.length} transaksi`;
  document.getElementById('viewAllButton').innerHTML = state.expanded
    ? 'Tampilkan lebih sedikit <i data-lucide="arrow-up"></i>'
    : 'Lihat semua <i data-lucide="arrow-right"></i>';
  document.getElementById('viewAllButton').hidden = filtered.length <= 5;
  if (window.lucide) window.lucide.createIcons();
}

function renderJournals() {
  const entries = state.dashboard?.journalEntries || [];
  const rows = entries.flatMap((entry) => (entry.journal_entry_lines || []).map((line) => {
    const source = entry.source_type === 'manual' ? 'Manual' : 'Otomatis · transaksi kas';
    return `<tr><td data-label="Tanggal">${escapeHtml(entry.entry_date)}</td><td data-label="Keterangan">${escapeHtml(entry.description)}</td><td data-label="Akun">${escapeHtml(line.account?.code || '')} · ${escapeHtml(line.account?.name || 'Akun')}</td><td data-label="Debit" class="amount-cell">${escapeHtml(rupiah.format(Number(line.debit)))}</td><td data-label="Kredit" class="amount-cell">${escapeHtml(rupiah.format(Number(line.credit)))}</td><td data-label="Sumber">${source}</td></tr>`;
  }));
  elements.journalRows.innerHTML = rows.length
    ? rows.join('')
    : '<tr class="empty-row"><td colspan="6"><strong>Belum ada jurnal</strong><span>Jurnal otomatis muncul saat transaksi dicatat.</span></td></tr>';
  document.getElementById('journalSummary').textContent = `${entries.length} jurnal · ${rows.length} baris`;
}

function renderLedgerAccounts(selectedId) {
  const accounts = state.dashboard?.accounts || [];
  const select = document.getElementById('ledgerAccount');
  select.innerHTML = accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.code)} · ${escapeHtml(account.name)}</option>`).join('');
  if (!accounts.length) {
    select.innerHTML = '<option value="">Belum ada akun</option>';
    return;
  }
  const account = accounts.find((item) => item.id === selectedId) || accounts[0];
  select.value = account.id;
  document.getElementById('ledgerAccountTitle').textContent = `${account.code} · ${account.name}`;
}

async function loadLedger(accountId) {
  if (!accountId || state.role !== 'owner') return;
  const requestId = ++state.ledgerRequest;
  const lines = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabaseClient.from('journal_entry_lines')
      .select('debit,credit,entry:journal_entries!inner(entry_date,description,source_type,created_at)')
      .eq('account_id', accountId).range(offset, offset + 999);
    const page = assertSupabaseSuccess(result) || [];
    lines.push(...page);
    if (page.length < 1000) break;
  }
  if (requestId !== state.ledgerRequest) return;
  const account = state.dashboard.accounts.find((item) => item.id === accountId);
  const debitNormal = ['asset', 'expense'].includes(account?.account_type);
  const sorted = [...lines].sort((a, b) => {
    const dateOrder = String(a.entry.entry_date).localeCompare(String(b.entry.entry_date));
    return dateOrder || String(a.entry.created_at).localeCompare(String(b.entry.created_at));
  });
  let balance = 0;
  elements.ledgerRows.innerHTML = sorted.length ? sorted.map((line) => {
    const debit = Number(line.debit);
    const credit = Number(line.credit);
    balance += debitNormal ? debit - credit : credit - debit;
    const source = line.entry.source_type === 'manual' ? 'Manual' : 'Otomatis';
    return `<tr><td data-label="Tanggal">${escapeHtml(line.entry.entry_date)}</td><td data-label="Keterangan">${escapeHtml(line.entry.description)}</td><td data-label="Sumber">${source}</td><td data-label="Debit" class="amount-cell">${debit ? escapeHtml(rupiah.format(debit)) : '—'}</td><td data-label="Kredit" class="amount-cell">${credit ? escapeHtml(rupiah.format(credit)) : '—'}</td><td data-label="Saldo" class="amount-cell">${escapeHtml(rupiah.format(balance))}</td></tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="6">Belum ada mutasi untuk akun ini.</td></tr>';
  document.getElementById('ledgerBalance').textContent = `Saldo akhir ${rupiah.format(balance)}`;
  document.getElementById('ledgerSummary').textContent = `${sorted.length} mutasi`;
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
    if (!supabaseClient) throw new Error('Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY pada frontend/app.js.');
    const rangeEnd = new Date(`${date}T23:59:59.999Z`);
    const rangeStart = new Date(`${date}T00:00:00.000Z`);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 13);
    const [transactionsResult, categoriesResult, cashiersResult, shiftsResult] = await Promise.all([
      supabaseClient.from('cash_transactions')
        .select('id,shift_id,amount,description,payment_method,receipt_text,occurred_at,category:transaction_categories(id,name,type),shift:shifts(id,cashier:cashiers(full_name))')
        .gte('occurred_at', rangeStart.toISOString())
        .lte('occurred_at', rangeEnd.toISOString())
        .order('occurred_at', { ascending: false })
        .limit(500),
      supabaseClient.from('transaction_categories')
        .select('id,name,type').eq('active', true).order('name'),
      supabaseClient.from('cashiers')
        .select('id,full_name').eq('active', true).order('full_name'),
      supabaseClient.from('shifts')
        .select('id,cashier_id,opened_at,opening_cash,status,cashier:cashiers(full_name)')
        .eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
    ]);
    const transactions = assertSupabaseSuccess(transactionsResult) || [];
    const todayTransactions = transactions.filter((transaction) => transaction.occurred_at.slice(0, 10) === date);
    const categories = assertSupabaseSuccess(categoriesResult) || [];
    const cashiers = assertSupabaseSuccess(cashiersResult) || [];
    const openShifts = assertSupabaseSuccess(shiftsResult) || [];
    const activeShift = openShifts[0] || null;
    const accountsResult = state.role === 'owner'
      ? await supabaseClient.from('chart_accounts')
        .select('id,code,name,account_type').eq('active', true).order('code')
      : null;
    const journalEntriesResult = state.role === 'owner'
      ? await supabaseClient.from('journal_entries')
        .select('id,entry_date,description,source_type,journal_entry_lines(debit,credit,account:chart_accounts(code,name))')
        .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(250)
      : null;
    const profitLossEntries = [];
    if (state.role === 'owner') {
      for (let offset = 0; ; offset += 1000) {
        const result = await supabaseClient.from('journal_entries')
          .select('id,entry_date,journal_entry_lines(debit,credit,account:chart_accounts(account_type))')
          .gte('entry_date', rangeStart.toISOString().slice(0, 10))
          .lte('entry_date', date)
          .order('entry_date', { ascending: true })
          .range(offset, offset + 999);
        const page = assertSupabaseSuccess(result) || [];
        profitLossEntries.push(...page);
        if (page.length < 1000) break;
      }
    }
    const shiftTransactionsResult = activeShift
      ? await supabaseClient.from('cash_transactions')
        .select('amount,payment_method,category:transaction_categories(type)')
        .eq('shift_id', activeShift.id)
      : null;
    const shiftTransactions = activeShift ? assertSupabaseSuccess(shiftTransactionsResult) || [] : [];
    const income = todayTransactions
      .filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    const expense = todayTransactions
      .filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    const shiftIncome = shiftTransactions
      .filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    const shiftExpense = shiftTransactions
      .filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    const chart = [];
    const chartStart = new Date(rangeStart);
    for (let offset = 0; offset < 14; offset += 1) {
      const day = new Date(chartStart);
      day.setUTCDate(day.getUTCDate() + offset);
      const key = day.toISOString().slice(0, 10);
      const dayTransactions = transactions.filter((transaction) => transaction.occurred_at.slice(0, 10) === key);
      chart.push({
        date: key,
        income: dayTransactions.filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'income').reduce((total, transaction) => total + Number(transaction.amount), 0),
        expense: dayTransactions.filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === 'expense').reduce((total, transaction) => total + Number(transaction.amount), 0),
      });
    }
    state.dashboard = {
      date,
      summary: {
        income,
        expense,
        balance: activeShift ? Number(activeShift.opening_cash) + shiftIncome - shiftExpense : 0,
        count: todayTransactions.length,
      },
      transactions: todayTransactions.slice(0, 100),
      chart,
      categories,
      cashiers,
      activeShift,
      accounts: state.role === 'owner' ? assertSupabaseSuccess(accountsResult) || [] : [],
      journalEntries: state.role === 'owner' ? assertSupabaseSuccess(journalEntriesResult) || [] : [],
      profitLossEntries,
    };
    setConnection(true);
    renderDashboard();
    if (state.role === 'owner') {
      renderJournals();
      renderProfitLoss();
      renderLedgerAccounts(document.getElementById('ledgerAccount').value);
      const selectedAccount = document.getElementById('ledgerAccount').value;
      if (selectedAccount) await loadLedger(selectedAccount);
    }
  } catch (error) {
    setConnection(false);
    if (error.status === 401 || error.code === 'PGRST301') {
      await supabaseClient?.auth.signOut();
      showAuthScreen('Sesi login berakhir. Silakan masuk kembali.');
      return;
    }
    showToast(supabaseErrorMessage(error), true);
  }
}

function openModal() {
  if (!state.dashboard) {
    showToast('Hubungkan Supabase sebelum mencatat transaksi.', true);
    return;
  }
  if (state.role === 'admin' && !state.dashboard?.activeShift) {
    showToast('Mulai shift kasir terlebih dahulu.', true);
    return;
  }
  elements.form.reset();
  elements.formError.hidden = true;
  state.type = 'income';
  document.querySelectorAll('.type-option').forEach((button) => button.classList.toggle('selected', button.dataset.type === state.type));
  renderCategories();
  updateFuelSaleFields();
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
  document.getElementById('shiftBalanceHint').hidden = !isClosing || state.role !== 'owner';
  document.getElementById('shiftExpectedBalance').textContent = rupiah.format(state.dashboard.summary.balance);
  amountInput.value = isClosing && state.role === 'owner' ? String(state.dashboard.summary.balance) : '';
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
    data.description = String(data.description || '').trim();
    data.receipt_text = String(data.receipt_text || '').trim();
    const category = state.dashboard.categories.find((item) => item.id === data.category_id);
    if (state.role === 'admin' && category?.type !== 'income') {
      throw new Error('Admin hanya dapat mencatat penjualan.');
    }
    if (category?.name === 'Penjualan BBM' && category.type === 'income') {
      const product = data.fuel_type;
      const liters = Number(data.fuel_liters);
      const price = fuelPrices[product];
      if (!price || !Number.isFinite(liters) || liters < 0.01) {
        throw new Error('Pilih jenis bensin dan masukkan jumlah liter minimal 0,01.');
      }
      data.amount = Math.round(price * liters);
      const litersText = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(liters);
      data.description = [data.description, `${product} · ${litersText} L`].filter(Boolean).join(' — ');
      data.receipt_text = [
        `${product} · ${litersText} liter × ${rupiah.format(price)} / liter = ${rupiah.format(data.amount)}`,
        data.receipt_text,
      ].filter(Boolean).join('\n\n');
    }
    if (data.receipt_text.length > 2000) throw new Error('Rincian struk maksimal 2.000 karakter.');
    const result = await supabaseClient.from('cash_transactions').insert({
      shift_id: state.dashboard.activeShift?.id || null,
      category_id: data.category_id,
      amount: data.amount,
      description: data.description,
      payment_method: data.payment_method,
      receipt_text: data.receipt_text || null,
    });
    assertSupabaseSuccess(result);
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

function closeReceiptModal() {
  elements.receiptModal.hidden = true;
  elements.receiptContent.hidden = true;
  document.body.classList.remove('modal-open');
}

function showTransactionReceipt(transaction) {
  elements.receiptContent.textContent = transaction.receipt_text || '';
  elements.receiptContent.hidden = false;
  elements.receiptModal.hidden = false;
  document.body.classList.add('modal-open');
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
      const result = await supabaseClient.from('shifts')
        .update({ closing_cash: amount, closed_at: new Date().toISOString(), status: 'closed' })
        .eq('id', state.dashboard.activeShift.id).eq('status', 'open').select('id').single();
      assertSupabaseSuccess(result);
      closeShiftModal();
      showToast('Shift berhasil ditutup.');
    } else {
      const cashierId = formData.get('cashier_id');
      if (!cashierId) throw new Error('Tambahkan kasir aktif di Supabase terlebih dahulu.');
      const result = await supabaseClient.from('shifts')
        .insert({ cashier_id: cashierId, opening_cash: amount, status: 'open' }).select('id').single();
      assertSupabaseSuccess(result);
      closeShiftModal();
      showToast('Shift berhasil dimulai.');
    }
    await refreshDashboard();
  } catch (error) {
    elements.shiftFormError.textContent = supabaseErrorMessage(error);
    elements.shiftFormError.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

function addJournalLine() {
  const options = ['<option value="">Pilih akun</option>', ...(state.dashboard?.accounts || []).map((account) =>
    `<option value="${escapeHtml(account.id)}">${escapeHtml(account.code)} · ${escapeHtml(account.name)}</option>`)].join('');
  const line = document.createElement('div');
  line.className = 'journal-line';
  line.innerHTML = `<select class="form-control journal-account" aria-label="Akun jurnal" required>${options}</select><label><span>Debit</span><input class="form-control journal-debit" type="number" min="0" step="0.01" value="0" aria-label="Debit" /></label><label><span>Kredit</span><input class="form-control journal-credit" type="number" min="0" step="0.01" value="0" aria-label="Kredit" /></label><button class="icon-button journal-remove" type="button" aria-label="Hapus baris"><i data-lucide="trash-2"></i></button>`;
  elements.journalLines.append(line);
  if (window.lucide) window.lucide.createIcons();
}

function updateJournalTotals() {
  const debit = [...elements.journalLines.querySelectorAll('.journal-debit')]
    .reduce((sum, input) => sum + Number(input.value || 0), 0);
  const credit = [...elements.journalLines.querySelectorAll('.journal-credit')]
    .reduce((sum, input) => sum + Number(input.value || 0), 0);
  const totals = document.getElementById('journalTotals');
  totals.textContent = `Debit ${rupiah.format(debit)} · Kredit ${rupiah.format(credit)}`;
  totals.classList.toggle('unbalanced', Math.round(debit * 100) !== Math.round(credit * 100));
}

function openJournalModal() {
  elements.journalForm.reset();
  elements.journalFormError.hidden = true;
  elements.journalLines.replaceChildren();
  document.getElementById('journalDate').value = localDateKey();
  addJournalLine();
  addJournalLine();
  updateJournalTotals();
  elements.journalModal.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => document.getElementById('journalDate').focus(), 50);
}

function closeJournalModal() {
  elements.journalModal.hidden = true;
  document.body.classList.remove('modal-open');
}

async function saveManualJournal(event) {
  event.preventDefault();
  const submit = document.getElementById('journalSubmit');
  const formData = new FormData(elements.journalForm);
  const lines = [...elements.journalLines.querySelectorAll('.journal-line')].map((row) => ({
    account_id: row.querySelector('.journal-account').value,
    debit: Number(row.querySelector('.journal-debit').value || 0),
    credit: Number(row.querySelector('.journal-credit').value || 0),
  }));
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  const debitCents = Math.round(debit * 100);
  const creditCents = Math.round(credit * 100);
  const validLines = lines.length >= 2 && lines.every((line) =>
    line.account_id && Number.isFinite(line.debit) && Number.isFinite(line.credit)
    && line.debit >= 0 && line.credit >= 0 && ((line.debit > 0) !== (line.credit > 0)));
  if (!validLines || debitCents <= 0 || debitCents !== creditCents) {
    elements.journalFormError.textContent = 'Isi akun dan salah satu nominal pada setiap baris. Total debit dan kredit harus sama.';
    elements.journalFormError.hidden = false;
    return;
  }
  submit.disabled = true;
  elements.journalFormError.hidden = true;
  try {
    const result = await supabaseClient.rpc('create_manual_journal_entry', {
      p_entry_date: formData.get('entry_date'),
      p_description: String(formData.get('description') || '').trim(),
      p_lines: lines,
    });
    assertSupabaseSuccess(result);
    closeJournalModal();
    showToast('Jurnal umum berhasil disimpan.');
    await refreshDashboard();
  } catch (error) {
    elements.journalFormError.textContent = supabaseErrorMessage(error);
    elements.journalFormError.hidden = false;
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
document.getElementById('addJournalButton').addEventListener('click', openJournalModal);
document.getElementById('refreshJournalButton').addEventListener('click', refreshDashboard);
document.getElementById('addJournalLineButton').addEventListener('click', addJournalLine);
elements.journalForm.addEventListener('submit', saveManualJournal);
elements.journalLines.addEventListener('input', updateJournalTotals);
elements.journalLines.addEventListener('click', (event) => {
  if (!event.target.closest('.journal-remove')) return;
  event.target.closest('.journal-line').remove();
  updateJournalTotals();
});
document.getElementById('ledgerAccount').addEventListener('change', (event) => {
  const account = state.dashboard?.accounts.find((item) => item.id === event.target.value);
  if (account) document.getElementById('ledgerAccountTitle').textContent = `${account.code} · ${account.name}`;
  loadLedger(event.target.value).catch((error) => showToast(supabaseErrorMessage(error), true));
});
elements.categories.addEventListener('change', updateFuelSaleFields);
document.getElementById('fuelTypeOptions').addEventListener('click', (event) => {
  const option = event.target.closest('[data-fuel-type]');
  if (!option) return;
  document.getElementById('fuelTypeInput').value = option.dataset.fuelType;
  updateFuelSaleAmount();
});
document.getElementById('fuelLitersInput').addEventListener('input', updateFuelSaleAmount);
elements.modal.addEventListener('click', (event) => {
  if (event.target === elements.modal || event.target.closest('[data-close-modal]')) closeModal();
});
elements.shiftModal.addEventListener('click', (event) => {
  if (event.target === elements.shiftModal || event.target.closest('[data-close-shift-modal]')) closeShiftModal();
});
elements.journalModal.addEventListener('click', (event) => {
  if (event.target === elements.journalModal || event.target.closest('[data-close-journal-modal]')) closeJournalModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!elements.modal.hidden) closeModal();
  if (!elements.shiftModal.hidden) closeShiftModal();
  if (!elements.journalModal.hidden) closeJournalModal();
  if (!elements.receiptModal.hidden) closeReceiptModal();
  if (sidebar.classList.contains('open')) setSidebarOpen(false);
});
document.querySelectorAll('.type-option').forEach((button) => button.addEventListener('click', () => {
  state.type = button.dataset.type;
  document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('selected', option === button));
  renderCategories();
  updateFuelSaleFields();
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
elements.rows.addEventListener('click', (event) => {
  const receiptButton = event.target.closest('[data-receipt-id]');
  if (!receiptButton) return;
  const transaction = state.dashboard?.transactions.find((item) => item.id === receiptButton.dataset.receiptId);
  if (!transaction?.receipt_text) return;
  showTransactionReceipt(transaction);
});
elements.receiptModal.addEventListener('click', (event) => {
  if (event.target === elements.receiptModal || event.target.closest('[data-close-receipt-modal]')) {
    closeReceiptModal();
  }
});
elements.chartRange.addEventListener('change', (event) => {
  state.chartDays = Number(event.target.value);
  renderChart();
  renderProfitLoss();
});
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

function setSidebarOpen(open) {
  sidebar.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Tutup navigasi' : 'Buka navigasi');
  sidebarBackdrop.hidden = !open;
}

menuToggle.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
function showPage(section = 'ringkasan') {
  const pageTitles = {
    ringkasan: 'Ringkasan kas',
    transaksi: 'Transaksi',
    shift: 'Shift kasir',
    laporan: 'Laporan',
    jurnal: 'Jurnal umum',
    'buku-besar': 'Buku besar',
  };
  if (state.role === 'admin' && !['shift', 'transaksi'].includes(section)) section = 'shift';
  if (state.role === 'owner' && section === 'shift') section = 'ringkasan';
  const page = Object.hasOwn(pageTitles, section) ? section : 'ringkasan';
  const pageChanged = state.page !== page;
  state.page = page;
  document.querySelectorAll('[data-page-view]').forEach((view) => {
    view.hidden = view.dataset.pageView !== page;
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    const active = link.dataset.section === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  elements.breadcrumbTitle.textContent = pageTitles[page];
  document.title = `Bas Station | ${pageTitles[page]}`;
  setSidebarOpen(false);
  if (pageChanged) window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  setSidebarOpen(false);
}));
window.addEventListener('hashchange', () => showPage(window.location.hash.slice(1)));

if (window.lucide) window.lucide.createIcons();
showPage(window.location.hash.slice(1) || 'ringkasan');
initializeApplication();
