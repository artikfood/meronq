/* =========================================================
   MERONQ / ARTIK FOOD — site.js (FINAL FIX)
   ✅ Stores load (index.json)
   ✅ Menu categories/products
   ✅ Search
   ✅ Cart + totals
   ✅ Orders -> Worker /orders (no API key in front)
   ✅ Order history (localStorage) + autofill
   ✅ Payment transfer card info + copy
   ✅ Auto-multilanguage (HY default) + RU + EN
   ✅ Images: tries jpg/png/webp without console spam
========================================================= */

/* ================= PATHS ================= */
const BASE_PATH = new URL("./", location.href).pathname;
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";

/* ================= WORKER ================= */
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";

/* ================= STATE ================= */
let stores = {};
let menus = {}; // {storeId: {categories:{cat:[item]}}}
let cart = {};  // {storeId: {productName: {q, p}}}

let currentStoreId = null;
let currentCategory = null;
let currentCategoryItems = []; // для поиска внутри выбранной категории

/* ================= DOM HELPERS ================= */
const $ = (id) => document.getElementById(id);

function asset(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : BASE_PATH + path.replace(/^\/+/, "");
}
function amd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}
function deliveryCost(d) {
  return d === "Артик" ? 500 :
         d === "Арич" ? 700 :
         (d === "Нор-Кянк" || d === "Пемзашен") ? 1000 : 0;
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

/* ================= IMAGE LOADER (jpg/png/webp) ================= */
const IMAGE_EXTS = [".jpg", ".png", ".webp"];
const imageExistsCache = new Map(); // url -> bool
const resolvedImageCache = new Map(); // base -> url|''

async function urlExists(url) {
  if (imageExistsCache.has(url)) return imageExistsCache.get(url);
  try {
    const r = await fetch(url, { method: "HEAD", cache: "force-cache" });
    const ok = !!r.ok;
    imageExistsCache.set(url, ok);
    return ok;
  } catch {
    imageExistsCache.set(url, false);
    return false;
  }
}

async function resolveImageUrl(baseNoExt) {
  if (resolvedImageCache.has(baseNoExt)) return resolvedImageCache.get(baseNoExt);
  for (const ext of IMAGE_EXTS) {
    const url = asset(baseNoExt + ext);
    // eslint-disable-next-line no-await-in-loop
    if (await urlExists(url)) {
      resolvedImageCache.set(baseNoExt, url);
      return url;
    }
  }
  resolvedImageCache.set(baseNoExt, "");
  return "";
}

async function setProductImage(imgElementId, baseNoExt) {
  const img = document.getElementById(imgElementId);
  if (!img) return;
  const url = await resolveImageUrl(baseNoExt);
  img.src = url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='26'%3E📦%3C/text%3E%3C/svg%3E";
}

/* ================= STORES ================= */
async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");
  if (!list) return;

  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`stores/index.json HTTP ${r.status}`);
    const data = await r.json();

    if (loading) loading.style.display = "none";
    list.innerHTML = "";

    (data.stores || []).forEach((s) => {
      if (!s?.enabled) return;
      stores[s.id] = s;

      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="shop-card-inner">
          <img class="shop-logo" src="${asset(s.logo)}" alt="${escapeHtml(s.name)}" onerror="this.style.display='none'">
          <div class="shop-name">${escapeHtml(s.name)}</div>
          <div class="shop-hours">🕙 ${escapeHtml(s.workingHours?.open || "09:00")} - ${escapeHtml(s.workingHours?.close || "22:00")}</div>
        </div>
      `;
      el.addEventListener("click", () => openStore(s.id));
      list.appendChild(el);
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="loading">${t("Магазины не найдены")}</div>`;
    }
  } catch (e) {
    console.error("loadStores error:", e);
    if (loading) {
      loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${t("Не удалось загрузить магазины")}.<br>${escapeHtml(e?.message || "unknown")}</div>`;
    }
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
  if (box) box.innerHTML = `<div class="loading">${t("Загрузка меню...")}</div>`;

  try {
    const menuUrl = asset(store.menu);
    const r = await fetch(menuUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`${t("Меню не найдено")}: ${menuUrl} (HTTP ${r.status})`);
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
    productsBox.innerHTML = `<div class="loading" style="color:#ff6b6b;">${t("Меню пустое")}</div>`;
    return;
  }

  cats.forEach((cat) => {
    const count = (menus[storeId].categories[cat] || []).length;
    const card = document.createElement("div");
    card.className = "card";
    card.style.textAlign = "left";
    card.style.padding = "12px"; // компактнее
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:26px;line-height:1">${catIcon(cat)}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${escapeHtml(cat)}</div>
          <div style="margin-top:4px;font-size:12px;color:var(--text-muted)">${t("Товаров")}: ${count}</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => showCategoryProducts(storeId, cat));
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

/* ================= RENDER PRODUCTS ================= */
function makeQtyId(storeId, productName) {
  const enc = btoa(unescape(encodeURIComponent(`${storeId}::${productName}`))).replace(/=+$/g, "");
  return `qty-${enc}`;
}

function renderCategoryList(storeId, category, items) {
  const productsBox = $("store-products");
  if (!productsBox) return;

  productsBox.innerHTML = "";

  const h = document.createElement("h3");
  h.style.margin = "14px 0 8px"; // компактнее
  h.style.color = "var(--accent-gold)";
  h.textContent = category;
  productsBox.appendChild(h);

  if (!items.length) {
    productsBox.innerHTML += `<div class="loading">${t("Ничего не найдено")}</div>`;
    return;
  }

  items.forEach((p) => {
    const base = (p.image || "").trim() || "no-image";
    const imgBase = `stores/${storeId}/images/${base}`;
    const qtyId = makeQtyId(storeId, p.name);
    const imgElId = `img-${qtyId}`;

    const row = document.createElement("div");
    row.className = "product";
    row.style.padding = "12px 14px"; // компактнее
    row.innerHTML = `
      <img id="${imgElId}"
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23222' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='24'%3E⏳%3C/text%3E%3C/svg%3E"
           alt="${escapeHtml(p.name)}">
      <div style="flex:1">
        <h4 style="font-size:15px;margin:0">${escapeHtml(p.name)}</h4>
        <p style="font-size:13px;margin:6px 0 0">${escapeHtml(p.desc || "")}${p.desc ? " • " : ""}${amd(p.price)}</p>
      </div>
      <div class="qty-controls">
        <button data-act="minus" data-store="${storeId}" data-name="${encodeURIComponent(p.name)}" data-qty="${qtyId}">−</button>
        <span class="qty-number" id="${qtyId}">${getQty(storeId, p.name)}</span>
        <button data-act="plus" data-store="${storeId}" data-name="${encodeURIComponent(p.name)}" data-price="${Number(p.price || 0)}" data-qty="${qtyId}">+</button>
      </div>
    `;
    productsBox.appendChild(row);

    // загрузка картинки (jpg/png/webp)
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
  cards.forEach((c) => {
    if (!q) c.style.display = "";
    else c.style.display = (c.textContent || "").toLowerCase().includes(q) ? "" : "none";
  });
  const sec = document.getElementById("shops");
  if (sec) sec.scrollIntoView({ behavior: "smooth" });
}
function filterCategories(q) {
  const catList = $("categories-list");
  if (!catList) return;
  const cards = Array.from(catList.children);
  cards.forEach((c) => {
    if (!q) c.style.display = "";
    else c.style.display = (c.textContent || "").toLowerCase().includes(q) ? "" : "none";
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
    if (qtyId) document.getElementById(qtyId)?.textContent = "0";
  } else {
    if (qtyId) document.getElementById(qtyId)?.textContent = String(item.q);
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
    header.style.fontWeight = "700";
    header.style.color = "var(--accent-gold)";
    header.textContent = storeName;
    box.appendChild(header);

    for (const name of Object.keys(cart[sid])) {
      const it = cart[sid][name];
      sum += it.q * it.p;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div style="flex:1;text-align:left;">
          <div style="font-weight:600;">${escapeHtml(name)}</div>
          <span>${amd(it.p)} × ${it.q} = ${amd(it.p * it.q)}</span>
        </div>
        <div class="qty-controls">
          <button data-act="cminus" data-store="${sid}" data-name="${encodeURIComponent(name)}">−</button>
          <span class="qty-number">${it.q}</span>
          <button data-act="cplus" data-store="${sid}" data-name="${encodeURIComponent(name)}" data-price="${it.p}">+</button>
        </div>
      `;
      box.appendChild(row);
    }
  }

  if (!Object.keys(cart).length) {
    box.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${t("Корзина пуста")}</p>`;
  }

  const district = $("district")?.value || "";
  const d = deliveryCost(district);

  $("global-cart-total") && ($("global-cart-total").textContent = `${t("Товары")}: ${amd(sum)}`);
  $("delivery-total") && ($("delivery-total").textContent = `${t("Доставка")}: ${amd(d)}`);
  $("grand-total") && ($("grand-total").textContent = `${t("Итого")}: ${amd(sum + d)}`);
}

/* ================= ORDERS ================= */
function buildOrderPayload() {
  const name = ($("name")?.value || "").trim();
  const phone = ($("phone")?.value || "").trim();
  const address = ($("address")?.value || "").trim();
  const district = ($("district")?.value || "").trim();
  const payment = ($("payment")?.value || "").trim();
  const comment = ($("comment")?.value || "").trim();

  if (!name || !phone || !address) return { error: t("Заполни имя, телефон и адрес") };
  if (!district) return { error: t("Выбери район") };
  if (!Object.keys(cart).length) return { error: t("Корзина пуста") };

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
      name,
      phone,
      address,
      district,
      payment,
      comment,
      products,
      totals: { itemsTotal, delivery, grandTotal },
      createdAt: new Date().toISOString(),
    },
  };
}

function showOrderMsg(text, type = "info") {
  // если нет блока — просто alert
  const el = document.getElementById("order-msg");
  if (!el) {
    alert(text);
    return;
  }
  el.style.display = "block";
  el.textContent = text;
  el.style.color = type === "error" ? "#ff6b6b" : (type === "ok" ? "#2ecc71" : "var(--text-main)");
}

async function placeOrder() {
  const btn = document.querySelector("button[onclick*='placeOrder']") || null;
  const built = buildOrderPayload();

  if (built.error) {
    showOrderMsg("❌ " + built.error, "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = t("ОТПРАВЛЯЕМ…");
  }

  try {
    const r = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.payload),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    // ✅ история + автозаполнение
    saveOrderToLocal(built.payload, j);

    showOrderMsg("✅ " + t("Заказ отправлен"), "ok");

    cart = {};
    updateCart();

    if ($("comment")) $("comment").value = "";
    openShops();
  } catch (e) {
    console.error(e);
    showOrderMsg("❌ " + t("Ошибка заказа") + ": " + (e?.message || t("неизвестно")), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📲 " + t("Отправить заказ");
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
    (categories[category] ||= []).push({ name, desc, price, image: imageSlug });
  }
  return categories;
}

/* ================= ORDER HISTORY (LOCALSTORAGE) ================= */
const LS_HISTORY_KEY = "meronq_order_history_v1";
const LS_LAST_ORDER_KEY = "meronq_last_order_v1";

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
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

  const prevRaw = safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
  const prev = Array.isArray(prevRaw) ? prevRaw : [];  // ✅ FIX: не будет null.unshift
  prev.unshift(record);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(prev.slice(0, 30)));
}

function getHistory() {
  const h = safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
  return Array.isArray(h) ? h : [];
}

function closeOrderHistory() {
  document.getElementById("history-modal")?.classList.add("hidden");
}

function showOrderHistory() {
  const modal = document.getElementById("history-modal");
  const list = document.getElementById("history-list");
  if (!modal || !list) return;

  const history = getHistory();

  if (!history.length) {
    list.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center">${t("История пуста")}</div>`;
  } else {
    list.innerHTML = history.map((h, idx) => {
      const date = new Date(h.at);
      const dt = isNaN(date.getTime()) ? h.at : date.toLocaleString();

      const grand = h?.totals?.grandTotal ?? null;
      const productsText = (h.products || []).slice(0, 12).map(p => {
        const nm = escapeHtml(p.name || "");
        const q = Number(p.quantity || 0);
        const st = escapeHtml(p.storeName || p.storeKey || "");
        return `<div style="color:var(--text-muted);font-size:13px">• ${nm} × ${q} <span style="opacity:.8">(${st})</span></div>`;
      }).join("");

      return `
        <div style="border:1px solid var(--border-glass);background:linear-gradient(180deg,var(--bg-glass),rgba(255,255,255,0.02));
                    border-radius:16px;padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-weight:700;color:var(--text-main)">${t("Заказ")} ${h.id ? `#${escapeHtml(String(h.id))}` : `№${history.length - idx}`}</div>
            <div style="color:var(--text-muted);font-size:13px">${escapeHtml(dt)}</div>
          </div>
          <div style="margin-top:6px;color:var(--text-muted);font-size:13px">👤 ${escapeHtml(h.customer.name)} • 📞 ${escapeHtml(h.customer.phone)}</div>
          <div style="margin-top:4px;color:var(--text-muted);font-size:13px">📍 ${escapeHtml(h.customer.address)} • 🏙 ${escapeHtml(h.customer.district)} • 💳 ${escapeHtml(h.customer.payment)}</div>
          <div style="margin-top:8px">${productsText || `<div style="color:var(--text-muted);font-size:13px">${t("Товары не сохранены")}</div>`}</div>
          <div style="margin-top:10px;font-weight:700;color:var(--accent-gold)">
            ${grand != null ? `${t("Итого")}: ${Number(grand).toLocaleString()} AMD` : ""}
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
            <button data-history-act="use" data-index="${idx}" style="padding:9px 12px;border-radius:999px;border:1px solid var(--border-glass);
                     background:var(--bg-glass); color:var(--text-main);cursor:pointer;font-weight:600">${t("Заполнить форму")}</button>
          </div>
        </div>
      `;
    }).join("");
  }

  modal.classList.remove("hidden");
}

function clearOrderHistory() {
  localStorage.removeItem(LS_HISTORY_KEY);
  showOrderHistory();
}

function fillOrderForm(h) {
  const c = h.customer || {};
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

  updatePaymentUI();
}

function useHistoryOrder(index) {
  const history = getHistory();
  const h = history[index];
  if (!h) return;

  fillOrderForm(h);
  closeOrderHistory();
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

function fillFromLastOrder() {
  const h = safeParse(localStorage.getItem(LS_LAST_ORDER_KEY), null);
  if (!h) return showOrderMsg(t("Нет сохранённых данных последнего заказа"), "error");
  fillOrderForm(h);
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

window.showOrderHistory = showOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.clearOrderHistory = clearOrderHistory;
window.useHistoryOrder = useHistoryOrder;
window.fillFromLastOrder = fillFromLastOrder;

/* ================= PAYMENT UI + COPY ================= */
const CARD_NUMBER = "4335 4400 4065 6791";

function updatePaymentUI() {
  const paymentSelect = document.getElementById("payment");
  const cardInfo = document.getElementById("card-info");
  const cardNumberSpan = document.getElementById("card-number");
  if (cardNumberSpan) cardNumberSpan.textContent = CARD_NUMBER;

  if (paymentSelect && cardInfo) {
    cardInfo.style.display = paymentSelect.value.includes("Перевод") ? "block" : "none";
  }
}

async function copyCardNumber() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(CARD_NUMBER);
    } else {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = CARD_NUMBER;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    showOrderMsg("✅ " + t("Скопировано"), "ok");
  } catch (e) {
    showOrderMsg("❌ " + t("Не удалось скопировать"), "error");
  }
}
window.copyCardNumber = copyCardNumber;

/* ================= MULTILANGUAGE ================= */
const LANG_KEY = "meronq_lang_v1";

// HY default
let LANG = (localStorage.getItem(LANG_KEY) || "hy").toLowerCase();
if (!["hy", "ru", "en"].includes(LANG)) LANG = "hy";

const I18N = {
  "Магазины": { hy: "Խանութներ", ru: "Магазины", en: "Stores" },
  "Корзина": { hy: "Զամբյուղ", ru: "Корзина", en: "Cart" },
  "История": { hy: "Պատմություն", ru: "История", en: "History" },
  "Отзывы": { hy: "Կարծիքներ", ru: "Отзывы", en: "Reviews" },

  "🔍 Поиск товаров.": { hy: "🔍 Որոնել ապրանք", ru: "🔍 Поиск товаров.", en: "🔍 Search products" },

  "Загрузка меню...": { hy: "Մենյուն բեռնվում է…", ru: "Загрузка меню...", en: "Loading menu..." },
  "Магазины не найдены": { hy: "Խանութներ չեն գտնվել", ru: "Магазины не найдены", en: "No stores found" },
  "Не удалось загрузить магазины": { hy: "Չհաջողվեց բեռնել խանութները", ru: "Не удалось загрузить магазины", en: "Failed to load stores" },

  "Меню не найдено": { hy: "Մենյուն չի գտնվել", ru: "Меню не найдено", en: "Menu not found" },
  "Меню пустое": { hy: "Մենյուն դատարկ է", ru: "Меню пустое", en: "Menu is empty" },
  "Товаров": { hy: "Ապրանք", ru: "Товаров", en: "Items" },
  "Ничего не найдено": { hy: "Ոչինչ չի գտնվել", ru: "Ничего не найдено", en: "Nothing found" },

  "Корзина пуста": { hy: "Զամբյուղը դատարկ է", ru: "Корзина пуста", en: "Cart is empty" },
  "Товары": { hy: "Ապրանքներ", ru: "Товары", en: "Items" },
  "Доставка": { hy: "Առաքում", ru: "Доставка", en: "Delivery" },
  "Итого": { hy: "Ընդամենը", ru: "Итого", en: "Total" },

  "Заполни имя, телефон и адрес": { hy: "Լրացրեք անունը, հեռախոսը և հասցեն", ru: "Заполни имя, телефон и адрес", en: "Fill name, phone and address" },
  "Выбери район": { hy: "Ընտրեք շրջանը", ru: "Выбери район", en: "Choose district" },
  "Ошибка заказа": { hy: "Պատվերի սխալ", ru: "Ошибка заказа", en: "Order error" },
  "неизвестно": { hy: "անհայտ", ru: "неизвестно", en: "unknown" },

  "ОТПРАВЛЯЕМ…": { hy: "Ուղարկում ենք…", ru: "ОТПРАВЛЯЕМ…", en: "SENDING…" },
  "Отправить заказ": { hy: "Ուղարկել պատվերը", ru: "Отправить заказ", en: "Place order" },
  "Заказ отправлен": { hy: "Պատվերը ուղարկված է", ru: "Заказ отправлен", en: "Order sent" },

  "История пуста": { hy: "Պատմությունը դատարկ է", ru: "История пуста", en: "History is empty" },
  "Заказ": { hy: "Պատվեր", ru: "Заказ", en: "Order" },
  "Товары не сохранены": { hy: "Ապրանքները չեն պահպանվել", ru: "Товары не сохранены", en: "Items not saved" },
  "Заполнить форму": { hy: "Լրացնել ձևը", ru: "Заполнить форму", en: "Fill the form" },

  "Нет сохранённых данных последнего заказа": { hy: "Վերջին պատվերի տվյալներ չկան", ru: "Нет сохранённых данных последнего заказа", en: "No saved last order data" },

  "Скопировано": { hy: "Պատճենվել է", ru: "Скопировано", en: "Copied" },
  "Не удалось скопировать": { hy: "Չհաջողվեց պատճենել", ru: "Не удалось скопировать", en: "Copy failed" },
};

function t(s) {
  const k = String(s);
  const entry = I18N[k];
  return entry ? (entry[LANG] || entry.ru || k) : k;
}

function applyI18nToStaticUI() {
  // nav links (по тексту — мягко)
  const navLinks = document.querySelectorAll("header nav a");
  navLinks.forEach((a) => {
    const txt = (a.textContent || "").trim();
    if (I18N[txt]) a.textContent = t(txt);
  });

  // search placeholder
  const search = document.getElementById("searchInput");
  if (search) search.placeholder = t("🔍 Поиск товаров.");

  // history title
  const historyTitle = document.querySelector("#history-modal [style*='История заказов']");
  if (historyTitle) historyTitle.textContent = "📱 " + (LANG === "hy" ? "Պատվերների պատմություն" : LANG === "en" ? "Order history" : "История заказов");

  // order button label (если не меняется автоматически)
  const orderBtn = document.querySelector("button[onclick*='placeOrder']");
  if (orderBtn && !orderBtn.disabled) orderBtn.textContent = "📲 " + t("Отправить заказ");

  // payment labels in card-info (если есть)
  const cardInfo = document.getElementById("card-info");
  if (cardInfo) {
    const lbl1 = cardInfo.querySelector("[data-i18n='card_label']"); // optional
    if (lbl1) lbl1.textContent = t("Номер карты:");
  }
}

function setLang(lang) {
  LANG = (lang || "hy").toLowerCase();
  if (!["hy", "ru", "en"].includes(LANG)) LANG = "hy";
  localStorage.setItem(LANG_KEY, LANG);

  // отметить кнопку
  document.querySelectorAll("#lang-switch button[data-lang]").forEach((b) => {
    b.style.opacity = (b.dataset.lang === LANG) ? "1" : ".45";
  });

  applyI18nToStaticUI();
  // обновим динамические блоки
  updateCart();
  if (document.getElementById("history-modal") && !document.getElementById("history-modal").classList.contains("hidden")) {
    showOrderHistory();
  }
}
window.setLang = setLang;

/* ================= EVENTS (CSP-safe for dynamic buttons) ================= */
function bindDelegatedClicks() {
  const productsBox = $("store-products");
  if (productsBox && !productsBox.__bound) {
    productsBox.__bound = true;
    productsBox.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const storeId = btn.dataset.store;
      const name = decodeURIComponent(btn.dataset.name || "");
      const price = Number(btn.dataset.price || 0);
      const qtyId = btn.dataset.qty || "";
      if (!storeId || !name) return;

      if (act === "plus") addToCart(storeId, name, price, qtyId);
      if (act === "minus") changeQty(storeId, name, -1, qtyId);
    });
  }

  const cartBox = $("global-cart-items");
  if (cartBox && !cartBox.__bound) {
    cartBox.__bound = true;
    cartBox.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const storeId = btn.dataset.store;
      const name = decodeURIComponent(btn.dataset.name || "");
      const price = Number(btn.dataset.price || 0);
      if (!storeId || !name) return;

      if (act === "cplus") addToCart(storeId, name, price, null);
      if (act === "cminus") changeQty(storeId, name, -1, null);
    });
  }

  const historyList = document.getElementById("history-list");
  if (historyList && !historyList.__bound) {
    historyList.__bound = true;
    historyList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-history-act]");
      if (!btn) return;
      const idx = Number(btn.dataset.index || -1);
      if (btn.dataset.historyAct === "use" && idx >= 0) useHistoryOrder(idx);
    });
  }
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  bindDelegatedClicks();

  // district change -> recalc totals
  document.getElementById("district")?.addEventListener("change", updateCart);

  // payment change -> show card info
  document.getElementById("payment")?.addEventListener("change", updatePaymentUI);

  // copy card button
  document.getElementById("copy-card")?.addEventListener("click", (e) => {
    e.preventDefault();
    copyCardNumber();
  });

  // lang switch buttons
  document.querySelectorAll("#lang-switch button[data-lang]").forEach((b) => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });

  // first UI refresh
  updatePaymentUI();
  setLang(LANG);
});
