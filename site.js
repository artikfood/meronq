/* =========================================================
   MERONQ / ARTIK FOOD — site.js (FINAL FIXED)
   ✅ магазины/меню/корзина
   ✅ заказ на Worker /orders
   ✅ история заказов + автозаполнение
   ✅ мультиязык (auto + AM/RU/EN) без reload
   ✅ оплата переводом: блок карты + Copy
   ✅ изображения: jpg/png/webp (без спама 404)
========================================================= */

/* ================= PATHS ================= */
const BASE_PATH = new URL("./", location.href).pathname;
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";

/* ================= WORKER ================= */
// Ключ на фронте не нужен (у тебя Worker защищён Origin-ом)
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";

/* ================= STATE ================= */
let stores = {};
let menus = {}; // {storeId: {categories:{cat:[item]}}}
let cart = {};  // {storeId: {productName: {q, p}}}

let currentStoreId = null;
let currentCategory = null;
let currentCategoryItems = [];

/* ================= DOM HELPERS ================= */
const $ = (id) => document.getElementById(id);

function asset(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : BASE_PATH + path.replace(/^\/+/, "");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function amd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}

function deliveryCost(d) {
  return d === "Артик" ? 500 :
         d === "Арич" ? 700 :
         (d === "Нор-Кянк" || d === "Пемзашен") ? 1000 : 0;
}

/* ================= UI MSG ================= */
function showOrderMsg(text, type = "info") {
  let box = document.getElementById("order-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "order-status";
    box.style.marginTop = "10px";
    box.style.padding = "10px 12px";
    box.style.borderRadius = "14px";
    box.style.fontSize = "13px";
    box.style.fontWeight = "800";
    box.style.textAlign = "center";
    const form = document.querySelector(".order-form") || document.body;
    form.appendChild(box);
  }

  if (type === "error") {
    box.style.border = "1px solid rgba(255,107,107,.35)";
    box.style.background = "rgba(255,107,107,.10)";
    box.style.color = "#ffb3b3";
  } else if (type === "success") {
    box.style.border = "1px solid rgba(46,204,113,.35)";
    box.style.background = "rgba(46,204,113,.10)";
    box.style.color = "#b7f5c8";
  } else {
    box.style.border = "1px solid rgba(255,255,255,.14)";
    box.style.background = "rgba(255,255,255,.06)";
    box.style.color = "var(--text-main)";
  }

  box.textContent = text;
}

/* ================= NAV ================= */
function showHome() {
  $("home-page")?.classList.remove("hidden");
  $("store-page")?.classList.add("hidden");
  currentStoreId = null;
  currentCategory = null;
  currentCategoryItems = [];
  scrollTo(0, 0);
}
function showStore() {
  $("home-page")?.classList.add("hidden");
  $("store-page")?.classList.remove("hidden");
  scrollTo(0, 0);
}
function goBack() {
  if (currentStoreId && currentCategory) {
    showCategories(currentStoreId);
    return;
  }
  showHome();
}
function openShops() {
  showHome();
  const sec = document.getElementById("shops");
  if (sec) sec.scrollIntoView({ behavior: "smooth" });
}

window.goHome = openShops;
window.goBack = goBack;
window.openShops = openShops;
window.toggleTheme = () => document.body.classList.toggle("light-theme");

/* ================= CATEGORY ICONS ================= */
const CATEGORY_ICONS = {
  "Шаурма": "🥙",
  "Шашлык": "🍖",
  "Мангал": "🔥",
  "Кебаб": "🌯",
  "Салаты": "🥗",
  "Гарнир": "🍟",
  "Соусы": "🧄",
  "Напитки": "🥤",
  "Десерты": "🍰",
  "Хлеб": "🥖",
  "Разное": "🍽️",
};
function catIcon(name) {
  return CATEGORY_ICONS[name] || "📦";
}

/* ================= STORES ================= */
async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");
  if (!list) return;

  try {
    const url = STORES_INDEX_URL + `?v=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`stores/index.json HTTP ${r.status}`);
    const data = await r.json();

    if (loading) loading.style.display = "none";
    list.innerHTML = "";

    (data.stores || []).forEach((s) => {
      if (!s?.enabled) return;
      stores[s.id] = s;

      const el = document.createElement("div");
      el.className = "card";
      el.onclick = () => openStore(s.id);

      const logoSrc = asset(s.logo);

      el.innerHTML = `
        <div class="shop-card-inner">
          <img class="shop-logo" src="${logoSrc}" alt="${escapeHtml(s.name)}"
               onerror="this.style.display='none'">
          <div class="shop-name">${escapeHtml(s.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">
            🕙 ${escapeHtml(s.workingHours?.open || "09:00")} - ${escapeHtml(s.workingHours?.close || "22:00")}
          </div>
        </div>
      `;

      list.appendChild(el);
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${escapeHtml(e.message)}</div>`;
  }
}

/* ================= MENU FLOW ================= */
async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  currentStoreId = storeId;
  currentCategory = null;
  currentCategoryItems = [];

  showStore();
  if ($("store-title")) $("store-title").textContent = store.name;

  $("store-products") && ($("store-products").innerHTML = "");
  $("categories-list") && ($("categories-list").innerHTML = "");
  $("categories-block")?.classList.remove("hidden");

  if ($("searchInput")) $("searchInput").value = "";

  if (menus[storeId]?.categories) {
    showCategories(storeId);
    return;
  }

  const box = $("store-products");
  if (box) box.innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const menuUrl = asset(store.menu) + `?v=${Date.now()}`;
    const r = await fetch(menuUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено: ${menuUrl} (HTTP ${r.status})`);
    const csv = await r.text();

    menus[storeId] = { categories: parseMenuToCategories(csv) };
    showCategories(storeId);
  } catch (e) {
    console.error(e);
    if (box) box.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${escapeHtml(e.message)}</div>`;
  }
}

function showCategories(storeId) {
  currentCategory = null;
  currentCategoryItems = [];

  const catBlock = $("categories-block");
  const catList = $("categories-list");
  const productsBox = $("store-products");
  if (!catList || !productsBox) return;

  catBlock?.classList.remove("hidden");
  productsBox.innerHTML = "";

  const cats = Object.keys(menus[storeId]?.categories || {}).sort();
  catList.innerHTML = "";

  if (!cats.length) {
    productsBox.innerHTML = `<div class="loading" style="color:#ff6b6b;">Меню пустое или не распознано</div>`;
    return;
  }

  cats.forEach((cat) => {
    const count = (menus[storeId].categories[cat] || []).length;

    const card = document.createElement("div");
    card.className = "card";
    card.style.textAlign = "left";
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:26px;line-height:1">${catIcon(cat)}</div>
        <div style="flex:1">
          <div style="font-weight:900">${escapeHtml(cat)}</div>
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Товаров: ${count}</div>
        </div>
      </div>
    `;
    card.onclick = () => showCategoryProducts(storeId, cat);
    catList.appendChild(card);
  });

  scrollTo(0, 0);
}

function showCategoryProducts(storeId, category) {
  currentCategory = category;

  const productsBox = $("store-products");
  const catBlock = $("categories-block");
  if (!productsBox) return;

  catBlock?.classList.add("hidden");

  const items = menus[storeId]?.categories?.[category] || [];
  currentCategoryItems = items.slice();

  renderCategoryList(storeId, category, items);
  scrollTo(0, 0);
}

/* ================= IMAGES (jpg/png/webp) ================= */
const IMAGE_EXTS = [".jpg", ".png", ".webp"];
const imageExistsCache = new Map();
const resolvedImageCache = new Map();

async function urlExists(url) {
  if (imageExistsCache.has(url)) return imageExistsCache.get(url);
  try {
    const r = await fetch(url, { method: "HEAD", cache: "force-cache" });
    const ok = r.ok;
    imageExistsCache.set(url, ok);
    return ok;
  } catch {
    imageExistsCache.set(url, false);
    return false;
  }
}

async function resolveImageUrl(basePathNoExt) {
  if (resolvedImageCache.has(basePathNoExt)) return resolvedImageCache.get(basePathNoExt);

  for (const ext of IMAGE_EXTS) {
    const url = asset(basePathNoExt + ext);
    // eslint-disable-next-line no-await-in-loop
    if (await urlExists(url)) {
      resolvedImageCache.set(basePathNoExt, url);
      return url;
    }
  }

  resolvedImageCache.set(basePathNoExt, "");
  return "";
}

async function setProductImage(imgElementId, basePathNoExt) {
  const img = document.getElementById(imgElementId);
  if (!img) return;

  const url = await resolveImageUrl(basePathNoExt);

  if (url) {
    img.src = url;
  } else {
    img.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='26'%3E📦%3C/text%3E%3C/svg%3E";
  }
}

/* ================= PRODUCTS RENDER ================= */
function makeQtyId(storeId, productName) {
  const enc = btoa(unescape(encodeURIComponent(`${storeId}::${productName}`))).replace(/=+$/g, "");
  return `qty-${enc}`;
}

function renderCategoryList(storeId, category, items) {
  const productsBox = $("store-products");
  if (!productsBox) return;

  productsBox.innerHTML = "";

  const h = document.createElement("h3");
  h.style.margin = "18px 0 8px";
  h.style.color = "var(--accent-gold)";
  h.style.fontWeight = "900";
  h.textContent = category;
  productsBox.appendChild(h);

  if (!items.length) {
    productsBox.innerHTML += `<div class="loading">Ничего не найдено</div>`;
    return;
  }

  items.forEach((p) => {
    const base = (p.image || "").trim() || "no-image";
    const imgBase = `stores/${storeId}/images/${base}`;
    const qtyId = makeQtyId(storeId, p.name);
    const imgElId = `img-${qtyId}`;
    const safeName = String(p.name || "").replace(/'/g, "\\'");

    const row = document.createElement("div");
    row.className = "product";
    row.innerHTML = `
      <img id="${imgElId}"
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23222' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='24'%3E⏳%3C/text%3E%3C/svg%3E"
           alt="${escapeHtml(p.name)}">
      <div style="flex:1">
        <h4>${escapeHtml(p.name)}</h4>
        <p>${escapeHtml(p.desc || "")}${p.desc ? " • " : ""}${amd(p.price)}</p>
      </div>
      <div class="qty-controls">
        <button onclick="changeQty('${storeId}','${safeName}',-1,'${qtyId}')">−</button>
        <span class="qty-number" id="${qtyId}">${getQty(storeId, p.name)}</span>
        <button onclick="addToCart('${storeId}','${safeName}',${p.price},'${qtyId}')">+</button>
      </div>
    `;
    productsBox.appendChild(row);

    setProductImage(imgElId, imgBase);
  });

  updateCart();
}

/* ================= SEARCH ================= */
function applySearch() {
  const q = ($("searchInput")?.value || "").trim().toLowerCase();
  const active = q.length >= 2;

  if (!currentStoreId) {
    filterShops(active ? q : "");
    return;
  }

  if (currentStoreId && currentCategory) {
    const items = currentCategoryItems || [];
    const filtered = !active
      ? items
      : items.filter((p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.desc || "").toLowerCase().includes(q)
        );
    renderCategoryList(currentStoreId, currentCategory, filtered);
    return;
  }

  if (currentStoreId && !currentCategory) {
    filterCategories(active ? q : "");
  }
}

function filterShops(q) {
  const list = $("shops-list");
  if (!list) return;

  const cards = Array.from(list.children);
  if (!q) {
    cards.forEach((c) => (c.style.display = ""));
    return;
  }

  cards.forEach((c) => {
    const txt = (c.textContent || "").toLowerCase();
    c.style.display = txt.includes(q) ? "" : "none";
  });

  const sec = document.getElementById("shops");
  if (sec) sec.scrollIntoView({ behavior: "smooth" });
}

function filterCategories(q) {
  const catList = $("categories-list");
  if (!catList) return;

  const cards = Array.from(catList.children);
  if (!q) {
    cards.forEach((c) => (c.style.display = ""));
    return;
  }

  cards.forEach((c) => {
    const txt = (c.textContent || "").toLowerCase();
    c.style.display = txt.includes(q) ? "" : "none";
  });
}

window.applySearch = applySearch;

/* ================= CART ================= */
function getQty(storeId, name) {
  return cart?.[storeId]?.[name]?.q || 0;
}

function addToCart(storeId, name, price, qtyId) {
  cart[storeId] ||= {};
  cart[storeId][name] ||= { q: 0, p: price };
  cart[storeId][name].q++;

  if (qtyId) {
    const el = document.getElementById(qtyId);
    if (el) el.textContent = String(cart[storeId][name].q);
  }

  updateCart();
}

function changeQty(storeId, name, delta, qtyId) {
  const item = cart?.[storeId]?.[name];
  if (!item) return;

  item.q += delta;

  if (item.q <= 0) {
    delete cart[storeId][name];
    if (Object.keys(cart[storeId]).length === 0) delete cart[storeId];

    if (qtyId) {
      const el = document.getElementById(qtyId);
      if (el) el.textContent = "0";
    }
  } else {
    if (qtyId) {
      const el = document.getElementById(qtyId);
      if (el) el.textContent = String(item.q);
    }
  }

  updateCart();
}

function updateCart() {
  const box = $("global-cart-items");
  if (!box) return;

  box.innerHTML = "";
  let sum = 0;

  for (const sid of Object.keys(cart)) {
    const storeName = stores[sid]?.name || sid;

    const header = document.createElement("div");
    header.style.margin = "12px 0 6px";
    header.style.fontWeight = "900";
    header.style.color = "var(--accent-gold)";
    header.textContent = storeName;
    box.appendChild(header);

    for (const name of Object.keys(cart[sid])) {
      const it = cart[sid][name];
      sum += it.q * it.p;

      const safeName = name.replace(/'/g, "\\'");
      const row = document.createElement("div");
      row.className = "product";
      row.innerHTML = `
        <div style="flex:1;text-align:left;">
          <div style="font-weight:800;">${escapeHtml(name)}</div>
          <div style="color:var(--text-muted);font-size:13px">${amd(it.p)} × ${it.q} = ${amd(it.p * it.q)}</div>
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${sid}','${safeName}',-1,'${makeQtyId(sid, name)}')">−</button>
          <span class="qty-number">${it.q}</span>
          <button onclick="addToCart('${sid}','${safeName}',${it.p},'${makeQtyId(sid, name)}')">+</button>
        </div>
      `;
      box.appendChild(row);
    }
  }

  if (!Object.keys(cart).length) {
    box.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
  }

  const district = $("district")?.value || "";
  const d = deliveryCost(district);

  $("global-cart-total") && ($("global-cart-total").textContent = `Товары: ${amd(sum)}`);
  $("delivery-total") && ($("delivery-total").textContent = `Доставка: ${amd(d)}`);
  $("grand-total") && ($("grand-total").textContent = `Итого: ${amd(sum + d)}`);
}

/* ================= ORDERS ================= */
function buildOrderPayload() {
  const name = ($("name")?.value || "").trim();
  const phone = ($("phone")?.value || "").trim();
  const address = ($("address")?.value || "").trim();
  const district = ($("district")?.value || "").trim();
  const payment = ($("payment")?.value || "").trim();
  const comment = ($("comment")?.value || "").trim();

  if (!name || !phone || !address) return { error: "Заполни имя, телефон и адрес" };
  if (!district) return { error: "Выбери район" };
  if (!Object.keys(cart).length) return { error: "Корзина пуста" };

  const products = [];
  for (const storeId of Object.keys(cart)) {
    const store = stores[storeId];
    for (const pname of Object.keys(cart[storeId])) {
      const it = cart[storeId][pname];
      products.push({
        storeKey: storeId,
        storeName: store?.name || storeId,
        name: pname,
        quantity: it.q,
        unitPrice: it.p,
        totalPrice: it.q * it.p,
      });
    }
  }

  const itemsTotal = products.reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
  const delivery = deliveryCost(district);
  const grandTotal = itemsTotal + delivery;

  return {
    payload: {
      name, phone, address, district, payment, comment,
      products,
      totals: { itemsTotal, delivery, grandTotal },
      createdAt: new Date().toISOString(),
    },
  };
}

async function placeOrder() {
  const btn = document.querySelector(".order-form button[onclick*='placeOrder']") || null;

  const built = buildOrderPayload();
  if (built.error) {
    showOrderMsg("❌ " + built.error, "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "ОТПРАВЛЯЕМ…";
  }

  try {
    const r = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.payload),
    });

    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch {}

    if (!r.ok || !j.ok) {
      throw new Error(j?.error || `HTTP ${r.status}: ${text.slice(0, 200)}`);
    }

    saveOrderToLocal(built.payload, j);

    showOrderMsg("✅ Заказ отправлен!", "success");
    cart = {};
    updateCart();

    if ($("comment")) $("comment").value = "";
    openShops();
  } catch (e) {
    console.error(e);
    showOrderMsg("❌ Ошибка заказа: " + (e?.message || "неизвестно"), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📲 Отправить заказ";
    }
  }
}

window.openStore = openStore;
window.addToCart = addToCart;
window.changeQty = changeQty;
window.placeOrder = placeOrder;

/* ================= CSV PARSE ================= */
function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line, delim) {
  const re = new RegExp(`${escapeRegExp(delim)}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line
    .split(re)
    .map((v) => (v ?? "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim());
}

function parseMenuToCategories(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return {};

  const delim = detectDelimiter(lines[0]);
  const categories = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const imageSlug = (cols[4] || "").trim();

    if (!name) continue;

    const price = parseInt(String(priceRaw).split("/")[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({
      name,
      desc,
      price,
      image: imageSlug,
    });
  }

  return categories;
}

/* ================= ORDER HISTORY (LOCALSTORAGE) ================= */
const LS_HISTORY_KEY = "meronq_order_history_v1";
const LS_LAST_ORDER_KEY = "meronq_last_order_v1";

function safeParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return (v === null || v === undefined) ? fallback : v;
  } catch {
    return fallback;
  }
}

function saveOrderToLocal(orderData, resultFromServer) {
  const record = {
    id: resultFromServer?.orderId || resultFromServer?.id || null,
    at: new Date().toISOString(),
    customer: {
      name: orderData?.name || "",
      phone: orderData?.phone || "",
      address: orderData?.address || "",
      district: orderData?.district || "",
      payment: orderData?.payment || "",
      comment: orderData?.comment || "",
    },
    totals: orderData?.totals || null,
    products: Array.isArray(orderData?.products) ? orderData.products : [],
  };

  localStorage.setItem(LS_LAST_ORDER_KEY, JSON.stringify(record));

  let prev = safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
  if (!Array.isArray(prev)) prev = [];
  prev.unshift(record);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(prev.slice(0, 30)));
}

/* ================= HISTORY UI (MODAL) ================= */
function getHistory() {
  return safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
}

function closeOrderHistory() {
  document.getElementById("history-modal")?.classList.add("hidden");
}

function clearOrderHistory() {
  localStorage.removeItem(LS_HISTORY_KEY);
  localStorage.removeItem(LS_LAST_ORDER_KEY);
  showOrderHistory();
}

function showOrderHistory() {
  const modal = document.getElementById("history-modal");
  const list = document.getElementById("history-list");
  if (!modal || !list) return;

  const history = getHistory();
  if (!Array.isArray(history) || history.length === 0) {
    list.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center">История пуста</div>`;
    modal.classList.remove("hidden");
    return;
  }

  list.innerHTML = history.map((h, idx) => {
    const date = new Date(h.at);
    const dt = isNaN(date.getTime()) ? (h.at || "") : date.toLocaleString();
    const itemsTotal = h?.totals?.itemsTotal ?? null;
    const delivery = h?.totals?.delivery ?? null;
    const grand = h?.totals?.grandTotal ?? null;

    const productsText = (h.products || []).slice(0, 12).map(p => {
      const nm = escapeHtml(p.name || "");
      const q = Number(p.quantity || 0);
      const st = escapeHtml(p.storeName || p.storeKey || "");
      return `<div style="color:var(--text-muted);font-size:13px">• ${nm} × ${q} <span style="opacity:.8">(${st})</span></div>`;
    }).join("");

    return `
      <div style="
        border:1px solid var(--border-glass);
        background:linear-gradient(180deg,var(--bg-glass),rgba(255,255,255,0.02));
        border-radius:16px;
        padding:12px;
        margin-bottom:10px;
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-weight:900;color:var(--text-main)">
            Заказ ${h.id ? `#${escapeHtml(String(h.id))}` : `№${history.length - idx}`}
          </div>
          <div style="color:var(--text-muted);font-size:13px">${escapeHtml(dt)}</div>
        </div>

        <div style="margin-top:6px;color:var(--text-muted);font-size:13px">
          👤 ${escapeHtml(h?.customer?.name || "")} • 📞 ${escapeHtml(h?.customer?.phone || "")}
        </div>
        <div style="margin-top:4px;color:var(--text-muted);font-size:13px">
          📍 ${escapeHtml(h?.customer?.address || "")} • 🏙 ${escapeHtml(h?.customer?.district || "")}
        </div>

        <div style="margin-top:8px">
          ${productsText || `<div style="color:var(--text-muted);font-size:13px">Товары не сохранены</div>`}
        </div>

        <div style="margin-top:10px;font-weight:900;color:var(--accent-gold)">
          ${grand != null ? `Итого: ${Number(grand).toLocaleString()} AMD` : ""}
          <span style="font-weight:700;color:var(--text-muted);font-size:13px;margin-left:10px">
            ${itemsTotal != null ? `Товары: ${Number(itemsTotal).toLocaleString()} AMD` : ""}
            ${delivery != null ? ` • Доставка: ${Number(delivery).toLocaleString()} AMD` : ""}
          </span>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
          <button onclick="useHistoryOrder(${idx})" style="
            padding:9px 12px;border-radius:999px;
            border:1px solid var(--border-glass);
            background:var(--bg-glass); color:var(--text-main);
            cursor:pointer;font-weight:900
          ">Заполнить форму</button>
        </div>
      </div>
    `;
  }).join("");

  modal.classList.remove("hidden");
}

function fillOrderFormFromRecord(h) {
  const c = h?.customer || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  setVal("name", c.name);
  setVal("phone", c.phone);
  setVal("address", c.address);
  setVal("district", c.district);
  setVal("payment", c.payment);
  setVal("comment", c.comment);

  updateCart();

  // Payment UI refresh
  const paySel = document.getElementById("payment");
  const cardBox = document.getElementById("card-info");
  if (paySel && cardBox) {
    const v = String(paySel.value || "").toLowerCase();
    const isTr = v.includes("перевод") || v.includes("transfer") || v.includes("փոխանց");
    cardBox.style.display = isTr ? "block" : "none";
  }
}

function useHistoryOrder(index) {
  const history = getHistory();
  const h = history?.[index];
  if (!h) return;
  fillOrderFormFromRecord(h);
  closeOrderHistory();
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

function fillFromLastOrder() {
  const h = safeParse(localStorage.getItem(LS_LAST_ORDER_KEY), null);
  if (!h) {
    alert("Нет сохранённых данных последнего заказа");
    return;
  }
  fillOrderFormFromRecord(h);
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

window.showOrderHistory = showOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.clearOrderHistory = clearOrderHistory;
window.useHistoryOrder = useHistoryOrder;
window.fillFromLastOrder = fillFromLastOrder;

/* ================= MULTILANG (AUTO + BUTTONS) ================= */
/* Простой и безопасный “авто-перевод” без data-i18n:
   переводим только фразы из словаря — не трогаем суммы/товары.
*/
const LANG_KEY = "meronq_lang_v1";
const SUPPORTED_LANGS = ["hy", "ru", "en"];
let __lang = "hy";

const TEXT_DICT = {
  "Магазины": { ru: "Магазины", hy: "Խանութներ", en: "Stores" },
  "История": { ru: "История", hy: "Պատմություն", en: "History" },
  "Корзина": { ru: "Корзина", hy: "Զամբյուղ", en: "Cart" },
  "История заказов": { ru: "История заказов", hy: "Պատվերների պատմություն", en: "Order history" },
  "Выберите район": { ru: "Выберите район", hy: "Ընտրեք շրջանը", en: "Choose district" },
  "Комментарий к заказу": { ru: "Комментарий к заказу", hy: "Մեկնաբանություն", en: "Comment" },
  "⚡ Автозаполнить из последнего заказа": { ru: "⚡ Автозаполнить из последнего заказа", hy: "⚡ Լրացնել վերջին պատվերից", en: "⚡ Fill from last order" },
  "📲 Отправить заказ": { ru: "📲 Отправить заказ", hy: "📲 Ուղարկել պատվերը", en: "📲 Place order" },
  "← Назад": { ru: "← Назад", hy: "← Հետ", en: "← Back" },
  "Закрыть": { ru: "Закрыть", hy: "Փակել", en: "Close" },
  "Очистить историю": { ru: "Очистить историю", hy: "Մաքրել պատմությունը", en: "Clear history" },
  "Поиск...": { ru: "Поиск...", hy: "Որոնել…", en: "Search…" },
};

const PLACEHOLDER_DICT = {
  "Ваше имя": { ru: "Ваше имя", hy: "Ձեր անունը", en: "Your name" },
  "Ваш телефон": { ru: "Ваш телефон", hy: "Ձեր հեռախոսը", en: "Your phone" },
  "Адрес доставки": { ru: "Адрес доставки", hy: "Առաքման հասցեն", en: "Delivery address" },
};

let __built = false;
let __textNodes = [];
let __phEls = [];

function __buildMapsOnce() {
  if (__built) return;
  __built = true;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const txt = (node.nodeValue || "").trim();
      if (!txt) return NodeFilter.FILTER_REJECT;

      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = (p.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;

      if (TEXT_DICT[txt]) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    }
  });

  let n;
  while ((n = walker.nextNode())) {
    __textNodes.push({ node: n, base: (n.nodeValue || "").trim() });
  }

  document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach(el => {
    const ph = (el.getAttribute("placeholder") || "").trim();
    if (ph && PLACEHOLDER_DICT[ph]) __phEls.push({ el, base: ph });
  });
}

function __applyLang() {
  __buildMapsOnce();
  __textNodes.forEach(({ node, base }) => {
    const d = TEXT_DICT[base];
    if (d && d[__lang]) node.nodeValue = " " + d[__lang] + " ";
  });
  __phEls.forEach(({ el, base }) => {
    const d = PLACEHOLDER_DICT[base];
    if (d && d[__lang]) el.setAttribute("placeholder", d[__lang]);
  });
}

function getLang() {
  const saved = (localStorage.getItem(LANG_KEY) || "").trim();
  if (SUPPORTED_LANGS.includes(saved)) return saved;

  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("hy")) return "hy";
  if (nav.startsWith("ru")) return "ru";
  return "hy";
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  __lang = lang;
  localStorage.setItem(LANG_KEY, lang);
  __applyLang();
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  // init language
  try {
    __lang = getLang();
    localStorage.setItem(LANG_KEY, __lang);
  } catch {}
  try { __applyLang(); } catch {}

  // lang buttons
  const sw = document.getElementById("lang-switch");
  if (sw) {
    sw.querySelectorAll("button[data-lang]").forEach((b) => {
      b.addEventListener("click", () => setLang(b.getAttribute("data-lang")));
    });
  }

  // payment UI + copy
  const paySel = document.getElementById("payment");
  const cardBox = document.getElementById("card-info");
  const copyBtn = document.getElementById("copy-card-btn");

  function isTransfer(val){
    const v = String(val||"").toLowerCase();
    return v.includes("перевод") || v.includes("transfer") || v.includes("փոխանց");
  }
  function refreshPaymentUI(){
    if (!paySel || !cardBox) return;
    cardBox.style.display = isTransfer(paySel.value) ? "block" : "none";
  }
  if (paySel) paySel.addEventListener("change", refreshPaymentUI);
  refreshPaymentUI();

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const numEl = document.getElementById("card-number");
      const raw = (numEl?.textContent || "").replace(/\s+/g, "");
      if (!raw) return;
      try {
        await navigator.clipboard.writeText(raw);
        const old = copyBtn.textContent;
        copyBtn.textContent = "✅";
        setTimeout(() => (copyBtn.textContent = old), 1200);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = raw;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        ta.remove();
      }
    });
  }

  // store load
  showHome();
  loadStores();

  // update totals when district changes
  document.getElementById("district")?.addEventListener("change", updateCart);
});
