/* =========================================================
   MERONQ / ARTIK FOOD — site.js (CSP-SAFE + COMPACT + FIXED)
   ✅ Магазины грузятся стабильно (fallback + cache-bust)
   ✅ Компактнее: магазины/категории/товары
   ✅ Темный фон (без правки CSS/HTML)
   ✅ Фото: .jpg OR .png (через HEAD, без 404 spam)
   ✅ Заказ → Worker /orders (без ключа)
   ✅ История заказов localStorage (fix: unshift null)
   ✅ CSP-safe: без inline onclick
========================================================= */

/* ================= DICTIONARY (AUTO-TRANSLATE) ================= */
const SUPPORTED_LANGS = ["ru", "hy", "en"];
let __lang = localStorage.getItem("lang") || "ru";

const TEXT_DICT = {
  "Корзина": { ru: "Корзина", hy: "Զամբյուղ", en: "Cart" },
  "История заказов": { ru: "История заказов", hy: "Պատվերների պատմություն", en: "Order History" },
  "Пусто": { ru: "Пусто", hy: "Դատարկ է", en: "Empty" },
  "Итого": { ru: "Итого", hy: "Ընդամենը", en: "Total" },
  "Оформить заказ": { ru: "Оформить заказ", hy: "Ձևակերպել պատվերը", en: "Checkout" },
  "Способ оплаты:": { ru: "Способ оплаты:", hy: "Վճարման եղանակը:", en: "Payment method:" },
  "Наличные": { ru: "Наличные", hy: "Կանխիկ", en: "Cash" },
  "Перевод": { ru: "Перевод", hy: "Փոխանցում", en: "Transfer" }
};

const PLACEHOLDER_DICT = {
  "Ваше имя": { ru: "Ваше имя", hy: "Ձեր անունը", en: "Your name" },
  "Ваш телефон": { ru: "Ваш телефон", hy: "Ձեր հեռախոսը", en: "Your phone" },
  "Адрес доставки": { ru: "Адрес доставки", hy: "Առաքման հասցեն", en: "Delivery address" }
};

/* ================= PAYMENT LOGIC (FIX) ================= */
// Добавь эту функцию в конец файла site.js
function handlePaymentChange(val) {
  const cardBox = document.getElementById("card-details-box");
  if (!cardBox) return;
  if (val === "Перевод") {
    cardBox.style.display = "block";
  } else {
    cardBox.style.display = "none";
  }
}

function copyCardNumber() {
  const num = document.getElementById("card-num-text").innerText;
  navigator.clipboard.writeText(num).then(() => {
    alert("Номер скопирован! / Համարը պատճենված է:");
  });
}
/* ================= PATHS ================= */
const BASE_PATH = new URL("./", location.href).pathname;

// Пробуем несколько вариантов путей (регистрозависимость GitHub Pages) + cache-bust
const STORES_INDEX_CANDIDATES = [
  BASE_PATH + "stores/index.json",
  BASE_PATH + "Stores/index.json",
  "/meronq/stores/index.json",
  "/meronq/Stores/index.json",
];

/* ================= WORKER ================= */
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";

/* ================= STATE ================= */
let stores = {};
let menus = {}; // {storeId: {categories:{cat:[item]}}}
let cart = {};  // {storeId: {productName: {q, p}}}

let currentStoreId = null;
let currentCategory = null;
let currentCategoryItems = []; // для поиска внутри категории

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

/* ================= UTILS ================= */
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

/* ================= IMAGES (jpg OR png, no 404 spam) ================= */
const IMAGE_EXTS = [".jpg", ".png"];
const imageExistsCache = new Map();   // url -> true/false
const resolvedImageCache = new Map(); // basePathNoExt -> resolvedUrl

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

function setProductImage(imgElementId, basePathNoExt) {
  const img = document.getElementById(imgElementId);
  if (!img) return;

  // placeholder
  img.src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23222' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='24'%3E⏳%3C/text%3E%3C/svg%3E";

  resolveImageUrl(basePathNoExt).then((url) => {
    if (url) img.src = url;
    else {
      img.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='26'%3E📦%3C/text%3E%3C/svg%3E";
    }
  });
}

/* ================= STORES ================= */
async function fetchJsonFirstOk(urls) {
  const bust = `v=${Date.now()}`;
  let lastErr = null;

  for (const u of urls) {
    const url = u.includes("?") ? `${u}&${bust}` : `${u}?${bust}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        lastErr = new Error(`${u} HTTP ${r.status}`);
        continue;
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("stores index not reachable");
}

async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");
  if (!list) return;

  try {
    const data = await fetchJsonFirstOk(STORES_INDEX_CANDIDATES);

    if (loading) loading.style.display = "none";
    list.innerHTML = "";

    (data.stores || []).forEach((s) => {
      if (!s?.enabled) return;
      stores[s.id] = s;

      const el = document.createElement("div");
      el.className = "card shop-card";
      el.dataset.storeId = s.id;

      const logoSrc = asset(s.logo);
      el.innerHTML = `
        <div class="shop-card-inner">
          <img class="shop-logo" src="${logoSrc}" alt="${escapeHtml(s.name)}">
          <div class="shop-name">${escapeHtml(s.name)}</div>
          <div class="shop-hours">🕙 ${escapeHtml(s.workingHours?.open || "09:00")} - ${escapeHtml(s.workingHours?.close || "22:00")}</div>
        </div>
      `;

      el.addEventListener("click", () => openStore(s.id));
      list.appendChild(el);
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }
  } catch (e) {
    console.error("loadStores error:", e);
    if (loading) {
      loading.innerHTML = `<div style="color:#ff6b6b;">❌ Не удалось загрузить магазины.<br>Проверь файл <b>stores/index.json</b> в репозитории.<br>Ошибка: ${escapeHtml(e?.message || "unknown")}</div>`;
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

  // сброс поиска
  if ($("searchInput")) $("searchInput").value = "";

  // меню уже загружали
  if (menus[storeId]?.categories) {
    showCategories(storeId);
    return;
  }

  const box = $("store-products");
  if (box) box.innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const menuUrl = asset(store.menu);
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
        <div style="font-size:24px;line-height:1">${catIcon(cat)}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:14px">${escapeHtml(cat)}</div>
          <div style="margin-top:4px;font-size:12px;color:var(--text-muted)">Товаров: ${count}</div>
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
    header.style.margin = "10px 0 6px";
    header.style.fontWeight = "800";
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
          <div style="font-weight:700;">${escapeHtml(name)}</div>
          <span style="color:var(--text-muted);font-size:12px">${amd(it.p)} × ${it.q} = ${amd(it.p * it.q)}</span>
        </div>
        <div class="qty-controls">
          <button data-act="minus" data-sid="${escapeHtml(sid)}" data-name="${escapeHtml(name)}">−</button>
          <span class="qty-number">${it.q}</span>
          <button data-act="plus" data-sid="${escapeHtml(sid)}" data-name="${escapeHtml(name)}" data-price="${it.p}">+</button>
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

/* ================= UI MESSAGE FOR ORDER ================= */
function showOrderMsg(text, type = "info") {
  let box = document.getElementById("order-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "order-status";
    box.style.marginTop = "10px";
    box.style.padding = "10px 12px";
    box.style.borderRadius = "14px";
    box.style.fontSize = "13px";
    box.style.fontWeight = "700";
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
    box.style.border = "1px solid rgba(255,255,255,.15)";
    box.style.background = "rgba(255,255,255,.06)";
    box.style.color = "var(--text-main)";
  }
  box.textContent = text;
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

async function placeOrder() {
  const btn = document.querySelector("[data-order-btn]") || document.querySelector(".order-form button") || null;

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

    // ✅ сохраняем в историю (без падений)
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
    const imageSlug = (cols[4] || "").trim(); // без расширения

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

/* ================= PRODUCT RENDER (no inline onclick) ================= */
function makeQtyId(storeId, productName) {
  const enc = btoa(unescape(encodeURIComponent(`${storeId}::${productName}`))).replace(/=+$/g, "");
  return `qty-${enc}`;
}

function renderCategoryList(storeId, category, items) {
  const productsBox = $("store-products");
  if (!productsBox) return;

  productsBox.innerHTML = "";

  const h = document.createElement("h3");
  h.style.margin = "16px 0 8px";
  h.style.color = "var(--accent-gold)";
  h.style.fontSize = "14px";
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

    const row = document.createElement("div");
    row.className = "product";
    row.innerHTML = `
      <img id="${imgElId}" alt="${escapeHtml(p.name)}">
      <div style="flex:1">
        <h4>${escapeHtml(p.name)}</h4>
        <p>${escapeHtml(p.desc || "")}${p.desc ? " • " : ""}${amd(p.price)}</p>
      </div>
      <div class="qty-controls">
        <button data-act="minus" data-sid="${escapeHtml(storeId)}" data-name="${escapeHtml(p.name)}">−</button>
        <span class="qty-number" id="${qtyId}">${getQty(storeId, p.name)}</span>
        <button data-act="plus" data-sid="${escapeHtml(storeId)}" data-name="${escapeHtml(p.name)}" data-price="${p.price}">+</button>
      </div>
    `;
    productsBox.appendChild(row);

    setProductImage(imgElId, imgBase);
  });

  updateCart();
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
  if (!Array.isArray(prev)) prev = []; // ✅ FIX (unshift null)
  prev.unshift(record);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(prev.slice(0, 30)));
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {

  // ===== UI: Default DARK + Compact mode (no CSS edits needed) =====
  try {
    const style = document.createElement("style");
    style.textContent = `
      :root{
        --bg-main:#0f1115;--bg-secondary:#151822;--bg-card:rgba(255,255,255,.06);
        --bg-glass:rgba(255,255,255,.08);--border-glass:rgba(255,255,255,.12);
        --accent-gold:#d4af37;--accent-green:#2ecc71;
        --text-main:#f5f6f7;--text-muted:rgba(245,246,247,.72);
        --shadow-soft:0 12px 30px rgba(0,0,0,.45);
      }
      body{background:var(--bg-main)!important;color:var(--text-main)!important}
      .card{padding:12px!important;border-radius:16px!important}
      .shop-card-inner{display:flex;flex-direction:column;align-items:center;gap:8px}
      .shop-logo{width:62px;height:62px;border-radius:16px;object-fit:cover;box-shadow:var(--shadow-soft);background:rgba(0,0,0,.06)}
      .shop-name{font-weight:800;font-size:14px}
      .shop-hours{font-size:12px;color:var(--text-muted)}
      #categories-list .card{padding:10px!important}
      .product{padding:10px!important;gap:10px!important}
      .product img{width:64px!important;height:64px!important;border-radius:14px!important}
      .product h4{margin:0 0 4px 0!important;font-size:14px!important}
      .product p{margin:0!important;font-size:12px!important;color:var(--text-muted)!important}
      .qty-controls button{width:30px!important;height:30px!important;border-radius:10px!important}
      .qty-number{min-width:18px!important;font-size:13px!important}
    `;
    document.head.appendChild(style);
  } catch {}

  // ===== PWA: register service worker if present =====
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(BASE_PATH + "sw.js").catch(() => {});
    }
  } catch {}

  showHome();
  loadStores();

  // пересчёт доставки при смене района
  document.getElementById("district")?.addEventListener("change", updateCart);

  // кнопки +/- в товарах и корзине (делегирование, CSP-safe)
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-act]");
    if (!btn) return;

    const act = btn.dataset.act;
    const sid = btn.dataset.sid;
    const name = btn.dataset.name;

    if (!sid || !name) return;

    if (act === "minus") {
      changeQty(sid, name, -1, makeQtyId(sid, name));
    } else if (act === "plus") {
      const price = Number(btn.dataset.price || 0);
      addToCart(sid, name, price, makeQtyId(sid, name));
    }
  });
   /* ================= MULTI-LANGUAGE (hy default) ================= */
const LANG_KEY = "meronq_lang_v1";
const SUPPORTED_LANGS = ["hy", "ru", "en"];

const I18N = {
  hy: {
    brand_title: "Մերոնք",
    search: "Որոնել…",
    shops_title: "Խանութներ",
    cart_title: "Զամբյուղ",
    name: "Անուն",
    phone: "Հեռախոս",
    address: "Հասցե",
    district: "Շրջան",
    payment: "Վճարում",
    comment: "Մեկնաբանություն",
    send_order: "📲 Ուղարկել պատվերը",
    sending: "ՈՒՂԱՐԿՈՒՄ ԵՆՔ…",
    order_sent: "✅ Պատվերը ուղարկվեց!",
    order_error: "❌ Պատվերի սխալ՝ ",
    fill_required: "Լրացրեք անունը, հեռախոսը և հասցեն",
    choose_district: "Ընտրեք շրջանը",
    cart_empty: "Զամբյուղը դատարկ է",
    name_ph: "Անուն",
    phone_ph: "Հեռախոս",
    address_ph: "Փողոց, տուն, մուտք",
    comment_ph: "Օրինակ՝ դուռը զանգել",
  },
  ru: {
    brand_title: "Меронк",
    search: "Поиск…",
    shops_title: "Магазины",
    cart_title: "Корзина",
    name: "Имя",
    phone: "Телефон",
    address: "Адрес",
    district: "Район",
    payment: "Оплата",
    comment: "Комментарий",
    send_order: "📲 Отправить заказ",
    sending: "ОТПРАВЛЯЕМ…",
    order_sent: "✅ Заказ отправлен!",
    order_error: "❌ Ошибка заказа: ",
    fill_required: "Заполни имя, телефон и адрес",
    choose_district: "Выбери район",
    cart_empty: "Корзина пуста",
    name_ph: "Имя",
    phone_ph: "Телефон",
    address_ph: "Улица, дом, подъезд",
    comment_ph: "Например: позвонить в дверь",
  },
  en: {
    brand_title: "Meronq",
    search: "Search…",
    shops_title: "Stores",
    cart_title: "Cart",
    name: "Name",
    phone: "Phone",
    address: "Address",
    district: "District",
    payment: "Payment",
    comment: "Comment",
    send_order: "📲 Place order",
    sending: "SENDING…",
    order_sent: "✅ Order sent!",
    order_error: "❌ Order error: ",
    fill_required: "Please enter name, phone, and address",
    choose_district: "Please choose a district",
    cart_empty: "Cart is empty",
    name_ph: "Name",
    phone_ph: "Phone",
    address_ph: "Street, building, entrance",
    comment_ph: "e.g., ring the doorbell",
  },
};

let currentLang = "hy";

function getLang() {
  const saved = (localStorage.getItem(LANG_KEY) || "").trim();
  if (SUPPORTED_LANGS.includes(saved)) return saved;

  // Авто по языку устройства (если армянский — ставим hy)
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("hy")) return "hy";
  if (nav.startsWith("ru")) return "ru";
  return "hy"; // по умолчанию армянский
}

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.hy[key]) || key;
}

function applyI18n() {
  // Тексты
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });

  // Плейсхолдеры
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });

  // Визуально подсветим активный язык
  const switchBox = document.getElementById("lang-switch");
  if (switchBox) {
    switchBox.querySelectorAll("button[data-lang]").forEach((b) => {
      b.style.opacity = (b.getAttribute("data-lang") === currentLang) ? "1" : "0.55";
      b.style.border = (b.getAttribute("data-lang") === currentLang) ? "1px solid rgba(212,175,55,.6)" : "1px solid rgba(255,255,255,.15)";
      b.style.background = "rgba(255,255,255,.06)";
      b.style.color = "var(--text-main)";
      b.style.borderRadius = "999px";
      b.style.padding = "8px 12px";
      b.style.cursor = "pointer";
      b.style.fontWeight = "700";
    });
  }
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyI18n();

  // обновим кнопку отправки, если она есть
  const btn = document.querySelector("[data-order-btn]");
  if (btn && !btn.disabled) btn.textContent = t("send_order");
}

document.addEventListener("DOMContentLoaded", () => {
  currentLang = getLang();
  applyI18n();

  // клики по языкам
  document.getElementById("lang-switch")?.addEventListener("click", (e) => {
    const b = e.target?.closest?.("button[data-lang]");
    if (!b) return;
    setLang(b.getAttribute("data-lang"));
  });
});

/* === интеграция с placeOrder (если у тебя есть showOrderMsg) ===
   Просто используй t(...) в твоём placeOrder:
   btn.textContent = t("sending");
   showOrderMsg(t("order_sent"), "success");
   showOrderMsg(t("order_error") + e.message, "error");
*/

});

/* ================= AUTO MULTI-LANGUAGE (HY default, no data-i18n) =================
   Работает так:
   - Находит текстовые узлы/placeholder'ы на странице
   - Если текст есть в словаре — заменяет на выбранный язык
   - Язык запоминается в localStorage
   - По умолчанию: hy (армянский)
=================================================================================== */

const LANG_KEY = "meronq_lang_v2";
const SUPPORTED_LANGS = ["hy", "ru", "en"];

// Точные совпадения текста (как в твоём index.html)
const TEXT_DICT = {
  // NAV / UI
  "Магазины": { hy: "Խանութներ", ru: "Магазины", en: "Stores" },
  "📱 История": { hy: "📱 Պատմություն", ru: "📱 История", en: "📱 History" },
  "⭐ Отзывы": { hy: "⭐ Կարծիքներ", ru: "⭐ Отзывы", en: "⭐ Reviews" },
  "Корзина": { hy: "Զամբյուղ", ru: "Корзина", en: "Cart" },

  // HERO
  "Premium доставка в Артике": { hy: "Պրեմիում առաքում Արթիկում", ru: "Premium доставка в Артике", en: "Premium delivery in Artik" },
  "Закажите продукты из лучших магазинов с доставкой на дом": {
    hy: "Պատվիրեք լավագույն խանութներից՝ առաքմամբ տուն",
    ru: "Закажите продукты из лучших магазинов с доставкой на дом",
    en: "Order from the best stores with home delivery",
  },
  "Смотреть магазины": { hy: "Տեսնել խանութները", ru: "Смотреть магазины", en: "View stores" },

  // Shops
  "Наши магазины": { hy: "Մեր խանութները", ru: "Наши магазины", en: "Our stores" },
  "Загрузка магазинов...": { hy: "Խանութները բեռնվում են…", ru: "Загрузка магазинов...", en: "Loading stores..." },

  // Store page
  "← Назад": { hy: "← Հետ", ru: "← Назад", en: "← Back" },
  "Корзина магазина": { hy: "Խանութի զամբյուղ", ru: "Корзина магазина", en: "Store cart" },
  "Корзина пуста": { hy: "Զամբյուղը դատարկ է", ru: "Корзина пуста", en: "Cart is empty" },

  // Cart / totals (для точных редких строк)
  "⏱ Доставка: 30-45 минут": { hy: "⏱ Առաքում՝ 30-45 րոպե", ru: "⏱ Доставка: 30-45 минут", en: "⏱ Delivery: 30–45 min" },
  "⚡ Данные из последнего заказа": { hy: "⚡ Վերջին պատվերի տվյալները", ru: "⚡ Данные из последнего заказа", en: "⚡ Last order info" },
  "Выберите район": { hy: "Ընտրեք շրջան", ru: "Выберите район", en: "Choose district" },

  // District options (текст опции — value не трогаем)
  "Артик (500 AMD)": { hy: "Արթիկ (500 AMD)", ru: "Артик (500 AMD)", en: "Artik (500 AMD)" },
  "Арич (700 AMD)": { hy: "Արիչ (700 AMD)", ru: "Арич (700 AMD)", en: "Arich (700 AMD)" },
  "Нор-Кянк (1000 AMD)": { hy: "Նոր-Կյանք (1000 AMD)", ru: "Нор-Кянк (1000 AMD)", en: "Nor Kyank (1000 AMD)" },
  "Пемзашен (1000 AMD)": { hy: "Պեմզաշեն (1000 AMD)", ru: "Пемзашен (1000 AMD)", en: "Pemzashen (1000 AMD)" },

  // Payment options
  "💵 Наличные курьеру": { hy: "💵 Կանխիկ՝ առաքիչին", ru: "💵 Наличные курьеру", en: "💵 Cash to courier" },
  "💳 Перевод на карту (Fast Bank)": { hy: "💳 Փոխանցում քարտին (Fast Bank)", ru: "💳 Перевод на карту (Fast Bank)", en: "💳 Card transfer (Fast Bank)" },

  // Card info
  "Номер карты:": { hy: "Քարտի համար՝", ru: "Номер карты:", en: "Card number:" },
  "Получатель:": { hy: "Ստացող՝", ru: "Получатель:", en: "Recipient:" },

  // Order button
  "📲 Отправить заказ": { hy: "📲 Ուղարկել պատվերը", ru: "📲 Отправить заказ", en: "📲 Place order" },

  // Reviews
  "⭐ Оставить отзыв": { hy: "⭐ Թողնել կարծիք", ru: "⭐ Оставить отзыв", en: "⭐ Leave a review" },
  "Оцените качество": { hy: "Գնահատեք որակը", ru: "Оцените качество", en: "Rate the quality" },
  "Нажмите на звёзды": { hy: "Սեղմեք աստղերի վրա", ru: "Нажмите на звёзды", en: "Tap the stars" },
  "📝 Отправить отзыв": { hy: "📝 Ուղարկել կարծիքը", ru: "📝 Отправить отзыв", en: "📝 Send review" },
  "💬 Отзывы клиентов": { hy: "💬 Հաճախորդների կարծիքներ", ru: "💬 Отзывы клиентов", en: "💬 Customer reviews" },

  // History modal
  "📱 История заказов": { hy: "📱 Պատվերների պատմություն", ru: "📱 История заказов", en: "📱 Order history" },
  "Очистить историю": { hy: "Մաքրել պատմությունը", ru: "Очистить историю", en: "Clear history" },
  "Закрыть": { hy: "Փակել", ru: "Закрыть", en: "Close" },

  // Footer
  "&copy; 2026 Artik Food. Все права защищены.": {
    hy: "© 2026 Artik Food. Բոլոր իրավունքները պաշտպանված են։",
    ru: "© 2026 Artik Food. Все права защищены.",
    en: "© 2026 Artik Food. All rights reserved.",
  },
};

// Перевод строк с числами (например "Итого: 0 AMD", "Товары: 123 AMD")
const PREFIX_DICT = {
  "Итого:": { hy: "Ընդամենը՝", ru: "Итого:", en: "Total:" },
  "Товары:": { hy: "Ապրանքներ՝", ru: "Товары:", en: "Items:" },
  "Доставка:": { hy: "Առաքում՝", ru: "Доставка:", en: "Delivery:" },
};

// Placeholder'ы (как в твоём HTML)
const PLACEHOLDER_DICT = {
  "🔍 Поиск товаров...": { hy: "🔍 Որոնել…", ru: "🔍 Поиск товаров...", en: "🔍 Search products..." },
  "Ваше имя": { hy: "Ձեր անունը", ru: "Ваше имя", en: "Your name" },
  "Телефон": { hy: "Հեռախոս", ru: "Телефон", en: "Phone" },
  "Адрес доставки": { hy: "Առաքման հասցե", ru: "Адрес доставки", en: "Delivery address" },
  "Комментарий к заказу": { hy: "Մեկնաբանություն պատվերին", ru: "Комментарий к заказу", en: "Order comment" },
  "Комментарий (необязательно)": { hy: "Մեկնաբանություն (ըստ ցանկության)", ru: "Комментарий (необязательно)", en: "Comment (optional)" },
};

let __lang = "hy";
let __built = false;
let __textNodes = [];     // { node, base }
let __phEls = [];         // { el, base }

function __getSavedLang() {
  const saved = (localStorage.getItem(LANG_KEY) || "").trim();
  if (SUPPORTED_LANGS.includes(saved)) return saved;

  // дефолт всегда армянский
  return "hy";
}

function __styleLangButtons() {
  const box = document.getElementById("lang-switch");
  if (!box) return;

  box.querySelectorAll("button[data-lang]").forEach((b) => {
    const active = b.getAttribute("data-lang") === __lang;
    b.style.opacity = active ? "1" : "0.55";
    b.style.border = active ? "1px solid rgba(212,175,55,.6)" : "1px solid rgba(255,255,255,.15)";
    b.style.background = "rgba(255,255,255,.06)";
    b.style.color = "var(--text-main)";
    b.style.borderRadius = "999px";
    b.style.padding = "8px 12px";
    b.style.cursor = "pointer";
    b.style.fontWeight = "700";
  });
}

function __translateByPrefix(str) {
  const s = (str || "").trim();

  for (const pref of Object.keys(PREFIX_DICT)) {
    if (s.startsWith(pref)) {
      const rest = s.slice(pref.length).trim();
      const tr = PREFIX_DICT[pref]?.[__lang] || pref;
      return (tr + " " + rest).trim();
    }
  }
  return null;
}

function __buildMapsOnce() {
  if (__built) return;
  __built = true;

  // 1) Text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const txt = (node.nodeValue || "").trim();
      if (!txt) return NodeFilter.FILTER_REJECT;

      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = (p.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;

      // переводим только то, что есть в словаре или по префиксу
      if (TEXT_DICT[txt]) return NodeFilter.FILTER_ACCEPT;
      if (__translateByPrefix(txt) != null) return NodeFilter.FILTER_ACCEPT;

      return NodeFilter.FILTER_REJECT;
    },
  });

  let n;
  while ((n = walker.nextNode())) {
    __textNodes.push({ node: n, base: (n.nodeValue || "").trim() });
  }

  // 2) Placeholders
  document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
    const ph = (el.getAttribute("placeholder") || "").trim();
    if (!ph) return;
    if (PLACEHOLDER_DICT[ph]) __phEls.push({ el, base: ph });
  });
}

function __applyLang() {
  __buildMapsOnce();

  // Text
  __textNodes.forEach(({ node, base }) => {
    // exact
    const d = TEXT_DICT[base];
    if (d && d[__lang]) {
      node.nodeValue = " " + d[__lang] + " ";
      return;
    }

    // prefix
    const byPref = __translateByPrefix(base);
    if (byPref != null) node.nodeValue = " " + byPref + " ";
  });

  // Placeholders
  __phEls.forEach(({ el, base }) => {
    const d = PLACEHOLDER_DICT[base];
    if (d && d[__lang]) el.setAttribute("placeholder", d[__lang]);
  });

  __styleLangButtons();
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  __lang = lang;
  localStorage.setItem(LANG_KEY, lang);
  __applyLang();
}

// INIT
document.addEventListener("DOMContentLoaded", () => {
  __lang = __getSavedLang();
  __applyLang();

  document.getElementById("lang-switch")?.addEventListener("click", (e) => {
    const b = e.target?.closest?.("button[data-lang]");
    if (!b) return;
    setLang(b.getAttribute("data-lang"));
  });
});
