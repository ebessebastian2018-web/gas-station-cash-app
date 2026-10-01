'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#') || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
  }
}

const rootEnvFile = path.resolve(__dirname, '../.env');
const backendEnvFile = path.resolve(__dirname, '.env');
loadEnvFile(fs.existsSync(rootEnvFile) ? rootEnvFile : backendEnvFile);

const frontendDirectory = path.resolve(__dirname, '../frontend');
const port = Number(process.env.PORT || 3000);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const configured = Boolean(supabaseUrl && supabaseAnonKey);
const authConfigured = configured;
const sessionCookieName = 'arus_kas_session';
const sessions = new Map();
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw Object.assign(new Error('Ukuran permintaan terlalu besar.'), { status: 413 });
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error('Format JSON tidak valid.'), { status: 400 });
  }
}

async function supabaseAuthRequest(endpoint, body) {
  const result = await fetch(`${supabaseUrl}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await result.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!result.ok) {
    const message = payload?.error_description || payload?.msg || payload?.message || 'Autentikasi Supabase gagal.';
    throw Object.assign(new Error(message), { status: result.status });
  }
  return payload;
}

function sessionIdFromRequest(request) {
  const cookie = (request.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName.length + 1)) : null;
}

function setSessionCookie(response, sessionId, maxAge = 60 * 60 * 24 * 7) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('set-cookie', `${sessionCookieName}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('set-cookie', `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure}`);
}

async function getSession(request, response) {
  const sessionId = sessionIdFromRequest(request);
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now() + 60_000) {
    try {
      const refreshed = await supabaseAuthRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken });
      session.accessToken = refreshed.access_token;
      session.refreshToken = refreshed.refresh_token;
      session.expiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
      session.user = refreshed.user;
      sessions.set(sessionId, session);
      setSessionCookie(response, sessionId);
    } catch {
      sessions.delete(sessionId);
      clearSessionCookie(response);
      return null;
    }
  }
  return session;
}

async function supabaseRequest(table, query = {}, options = {}) {
  if (!options.accessToken) throw Object.assign(new Error('Sesi login diperlukan untuk mengakses data.'), { status: 401 });
  const endpoint = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
  const result = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
      ...(options.returnRepresentation ? { Prefer: 'return=representation' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await result.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!result.ok) {
    const detail = payload && typeof payload === 'object' ? payload.message || payload.details || payload.hint : null;
    throw Object.assign(new Error(detail || 'Permintaan ke Supabase gagal.'), { status: result.status >= 500 ? 502 : result.status });
  }
  return payload;
}

function isoDayBounds(dateString, numberOfDays = 14) {
  const end = new Date(`${dateString}T23:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || Number.isNaN(end.getTime())) {
    throw Object.assign(new Error('Tanggal laporan tidak valid.'), { status: 400 });
  }
  const start = new Date(`${dateString}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - numberOfDays + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function sumCash(transactions, type) {
  return transactions
    .filter((transaction) => transaction.payment_method === 'cash' && transaction.category?.type === type)
    .reduce((total, transaction) => total + Number(transaction.amount), 0);
}

async function getBootstrap(dateString, accessToken) {
  const { start, end } = isoDayBounds(dateString);
  const [transactions, categories, cashiers, openShifts] = await Promise.all([
    supabaseRequest('cash_transactions', {
      select: 'id,shift_id,amount,description,payment_method,occurred_at,category:transaction_categories(id,name,type),shift:shifts(id,cashier:cashiers(full_name))',
      occurred_at: `gte.${start}`,
      and: `(occurred_at.lte.${end})`,
      order: 'occurred_at.desc',
      limit: '500',
    }, { accessToken }),
    supabaseRequest('transaction_categories', { select: 'id,name,type', active: 'eq.true', order: 'name.asc' }, { accessToken }),
    supabaseRequest('cashiers', { select: 'id,full_name', active: 'eq.true', order: 'full_name.asc' }, { accessToken }),
    supabaseRequest('shifts', {
      select: 'id,cashier_id,opened_at,opening_cash,status,cashier:cashiers(full_name)',
      status: 'eq.open',
      order: 'opened_at.desc',
      limit: '1',
    }, { accessToken }),
  ]);

  const todayTransactions = transactions.filter((transaction) => transaction.occurred_at.slice(0, 10) === dateString);
  const activeShift = openShifts[0] || null;
  const activeShiftTransactions = activeShift
    ? await supabaseRequest('cash_transactions', {
      select: 'amount,payment_method,category:transaction_categories(type)',
      shift_id: `eq.${activeShift.id}`,
    }, { accessToken })
    : [];
  const dailyIncome = sumCash(todayTransactions, 'income');
  const dailyExpense = sumCash(todayTransactions, 'expense');
  const shiftBalance = activeShift
    ? Number(activeShift.opening_cash) + sumCash(activeShiftTransactions, 'income') - sumCash(activeShiftTransactions, 'expense')
    : 0;
  const chart = [];
  const firstDay = new Date(`${dateString}T00:00:00.000Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 13);
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(firstDay);
    day.setUTCDate(day.getUTCDate() + offset);
    const key = day.toISOString().slice(0, 10);
    const dayTransactions = transactions.filter((transaction) => transaction.occurred_at.slice(0, 10) === key);
    chart.push({ date: key, income: sumCash(dayTransactions, 'income'), expense: sumCash(dayTransactions, 'expense') });
  }

  return {
    date: dateString,
    summary: { income: dailyIncome, expense: dailyExpense, balance: shiftBalance, count: todayTransactions.length },
    transactions: todayTransactions.slice(0, 100),
    chart,
    categories,
    cashiers,
    activeShift,
  };
}

async function findOpenShift(accessToken) {
  const shifts = await supabaseRequest('shifts', {
    select: 'id,cashier_id,opened_at,opening_cash,status',
    status: 'eq.open',
    order: 'opened_at.desc',
    limit: '1',
  }, { accessToken });
  return shifts[0] || null;
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return sendJson(response, 200, { ok: true, configured, authConfigured });
  }

  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    const session = authConfigured ? await getSession(request, response) : null;
    return sendJson(response, 200, {
      authenticated: Boolean(session),
      user: session ? { id: session.user.id, email: session.user.email } : null,
    });
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const sessionId = sessionIdFromRequest(request);
    if (sessionId) sessions.delete(sessionId);
    clearSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    if (!configured || !authConfigured) {
      return sendJson(response, 503, { error: 'Pastikan SUPABASE_URL dan SUPABASE_ANON_KEY terisi di backend/.env.' });
    }
    const body = await readJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password || email.length > 320 || password.length > 1024) {
      return sendJson(response, 400, { error: 'Masukkan email dan password akun Supabase.' });
    }
    try {
      const auth = await supabaseAuthRequest('token?grant_type=password', { email, password });
      if (!auth.access_token || !auth.refresh_token || !auth.user) {
        return sendJson(response, 502, { error: 'Supabase tidak mengembalikan sesi login yang valid.' });
      }
      const sessionId = randomUUID();
      sessions.set(sessionId, {
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        expiresAt: Date.now() + Number(auth.expires_in || 3600) * 1000,
        user: auth.user,
      });
      setSessionCookie(response, sessionId);
      return sendJson(response, 200, { authenticated: true, user: { id: auth.user.id, email: auth.user.email } });
    } catch (error) {
      const detail = error.message.toLowerCase();
      const message = detail.includes('invalid login') || detail.includes('invalid_credentials')
        ? 'Email atau password salah, atau email akun belum dikonfirmasi.'
        : detail.includes('api key')
          ? 'SUPABASE_ANON_KEY tidak valid. Gunakan anon/publishable key dari project yang sama.'
          : error.status === 429
            ? 'Terlalu banyak percobaan login. Coba lagi beberapa saat.'
            : 'Login Supabase gagal. Periksa akun dan pengaturan Auth project.';
      return sendJson(response, error.status >= 500 ? 502 : 401, { error: message });
    }
  }

  if (url.pathname.startsWith('/api/auth/')) {
    return sendJson(response, 405, { error: 'Metode autentikasi tidak didukung.' });
  }
  if (!configured) {
    return sendJson(response, 503, { error: 'Supabase belum dikonfigurasi. Atur SUPABASE_URL dan SUPABASE_ANON_KEY di backend/.env.' });
  }
  const session = await getSession(request, response);
  if (!session) {
    return sendJson(response, 401, { error: 'Sesi login tidak ditemukan. Masuk kembali dengan akun Supabase.' });
  }

  if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
    const requestedDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    return sendJson(response, 200, await getBootstrap(requestedDate, session.accessToken));
  }

  if (url.pathname === '/api/transactions' && request.method === 'POST') {
    const body = await readJson(request);
    const amount = Number(body.amount);
    const paymentMethods = ['cash', 'transfer', 'card'];
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) {
      return sendJson(response, 400, { error: 'Jumlah transaksi harus lebih besar dari nol.' });
    }
    if (!['income', 'expense'].includes(body.type) || !body.category_id || !paymentMethods.includes(body.payment_method)) {
      return sendJson(response, 400, { error: 'Jenis, kategori, atau metode pembayaran tidak valid.' });
    }
    const shift = await findOpenShift(session.accessToken);
    if (!shift) return sendJson(response, 409, { error: 'Mulai shift kasir sebelum mencatat transaksi.' });
    const categories = await supabaseRequest('transaction_categories', {
      select: 'id,name,type',
      id: `eq.${body.category_id}`,
      type: `eq.${body.type}`,
      active: 'eq.true',
      limit: '1',
    }, { accessToken: session.accessToken });
    if (!categories.length) return sendJson(response, 400, { error: 'Kategori tidak cocok dengan jenis transaksi.' });
    const description = String(body.description || '').trim().slice(0, 160);
    const inserted = await supabaseRequest('cash_transactions', {}, {
      method: 'POST',
      returnRepresentation: true,
      body: {
        shift_id: shift.id,
        category_id: categories[0].id,
        amount,
        description,
        payment_method: body.payment_method,
      },
      accessToken: session.accessToken,
    });
    return sendJson(response, 201, { transaction: inserted[0] });
  }

  if (url.pathname === '/api/shifts' && request.method === 'POST') {
    const body = await readJson(request);
    const openingCash = Number(body.opening_cash);
    if (!body.cashier_id || !Number.isFinite(openingCash) || openingCash < 0) {
      return sendJson(response, 400, { error: 'Pilih kasir dan masukkan saldo awal yang valid.' });
    }
    if (await findOpenShift(session.accessToken)) return sendJson(response, 409, { error: 'Masih ada shift yang terbuka.' });
    const cashiers = await supabaseRequest('cashiers', {
      select: 'id', id: `eq.${body.cashier_id}`, active: 'eq.true', limit: '1',
    }, { accessToken: session.accessToken });
    if (!cashiers.length) return sendJson(response, 400, { error: 'Kasir tidak ditemukan atau tidak aktif.' });
    const inserted = await supabaseRequest('shifts', {}, {
      method: 'POST',
      returnRepresentation: true,
      body: { cashier_id: body.cashier_id, opening_cash: openingCash, status: 'open' },
      accessToken: session.accessToken,
    });
    return sendJson(response, 201, { shift: inserted[0] });
  }

  const closeMatch = url.pathname.match(/^\/api\/shifts\/([0-9a-f-]+)\/close$/i);
  if (closeMatch && request.method === 'POST') {
    const body = await readJson(request);
    const closingCash = Number(body.closing_cash);
    if (!Number.isFinite(closingCash) || closingCash < 0) {
      return sendJson(response, 400, { error: 'Masukkan jumlah kas fisik yang valid.' });
    }
    const updated = await supabaseRequest('shifts', {
      id: `eq.${closeMatch[1]}`, status: 'eq.open',
    }, {
      method: 'PATCH',
      returnRepresentation: true,
      body: { closing_cash: closingCash, closed_at: new Date().toISOString(), status: 'closed' },
      accessToken: session.accessToken,
    });
    if (!updated.length) return sendJson(response, 404, { error: 'Shift tidak ditemukan atau sudah ditutup.' });
    return sendJson(response, 200, { shift: updated[0] });
  }

  return sendJson(response, 404, { error: 'Endpoint tidak ditemukan.' });
}

function serveFrontend(request, response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(frontendDirectory, `.${requestedPath}`);
  if (!filePath.startsWith(`${frontendDirectory}${path.sep}`)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
      return response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
    }
    response.writeHead(200, {
      'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else if (['GET', 'HEAD'].includes(request.method)) serveFrontend(request, response, url);
    else sendJson(response, 405, { error: 'Metode tidak didukung.' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${error.message}`);
    if (!response.headersSent) sendJson(response, status, { error: error.message || 'Terjadi kesalahan pada server.' });
    else response.destroy();
  }
});

server.listen(port, () => {
  console.log(`Arus Kas SPBU berjalan di http://localhost:${port}`);
  if (!configured) console.warn('Supabase belum dikonfigurasi. Atur SUPABASE_URL dan SUPABASE_ANON_KEY di backend/.env.');
});
