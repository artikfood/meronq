/* =========================================================
   MERONQ / ARTIK FOOD — site.js (FIXED for your HTML)
========================================================= */

const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';

// пробуем оба пути (чтобы не гадать где лежит index.json)
const STORES_INDEX_CANDIDATES = [
  BASE_PATH + 'stores/index.json',
  BASE_PATH + 'index.json',
];

const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let currentCart = {};
let currentStoreId = null;

function assetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return BASE_PATH + clean;
}

function formatAmd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}

function computeDelivery(district) {
  if (district === "Артик") return 500;
  if (district === "Арич") return 700;
  if (district === "Нор-Кянк") return 1000;
  if (district === "Пемзашен") return 1000;
  return 0;
}

/* ---------- navigation for your HTML ---------- */
function showHome() {
  document.getElementById("home-page")?.classList.remove("hidden");
  document.getElementById("store-page")?.classList.add("hidden");
  window.scrollTo(0, 0);
}
function showStore() {
  document.getElementById("home-page")?.classList.add("hidden");
  document.getElementById("store-page")?.classList.remove("hidden");
  window.scrollTo(0, 0);
}
function goBack(){ showHome(); }
function goHome(){ showHome(); }

// чтобы клики в шапке не ломали сайт ошибками
function toggleTheme(){ document.body.classList.toggle("light-theme"); }
function showOrderHistory(){ alert("История — скоро"); }
function fillFromLastOrder(){ alert("Заполнение — скоро"); }
function submitReview(){ alert("Отзывы — скоро"); }

async function fetchStoresIndex() {
  let last = null;
  for (const url of STORES_INDEX_CANDIDATES) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error("Не удалось загрузить index.json");
}

async function loadStores() {
  const container = document.getElementById("shops-list");   // ✅
  const loading = document.getElementById("loading-shops");  // ✅
  if (!container) return;

  try {
    const data = await fetchStoresIndex();
    if (loading) loading.style.display = "none";
    container.innerHTML = "";

    (data.stores || []).forEach(store => {
      if (!store?.enabled) return;
      stores[store.id] = store;

      const card = document.createElement("div");
      card.className = "card";
      card.onclick = () => openStore(store.id);

      card.innerHTML = `
        <span class="icon">🏪</span>
        <div>${store.name}</div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
          🕙 ${store.workingHours?.open || "09:00"} - ${store.workingHours?.close || "22:00"}
        </div>
      `;
      container.appendChild(card);
    });

    if (!container.children.length) {
      container.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  currentStoreId = storeId;
  showStore();

  const title = document.getElementById("store-title");
  if (title) title.textContent = store.name;

  const container = document.getElementById("store-products");
  if (!container) return;
  container.innerHTML = `<div class="loading">Загрузка меню...</div>`;

  try {
    const r = await fetch(assetUrl(store.menu), { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено (${r.status})`);
    const csv = await r.text();
    renderMenu(csv, storeId);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

function renderMenu(csvText, storeId) {
  const container = document.getElementById("store-products");
  if (!container) return;

  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) {
    container.innerHTML = `<div class="loading">Меню пустое</div>`;
    return;
  }

  const categories = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(s => (s || "").replace(/^"|"$/g, "").trim());

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const image = cols[4] || "";

    if (!name) continue;
    const price = parseInt(String(priceRaw).split('/')[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({ name, desc, price, image });
  }

  container.innerHTML = "";

  Object.keys(categories).sort().forEach(cat => {
    const h = document.createElement("h3");
    h.style.margin = "18px 0 8px";
    h.style.color = "var(--accent-gold)";
    h.textContent = cat;
    container.appendChild(h);

    categories[cat].forEach(p => {
      const row = document.createElement("div");
      row.className = "product";

    const img = assetUrl(
  `stores/${storeId}/images/${p.name}.jpg`
);

      const safe = p.name.replace(/'/g, "\\'");

      row.innerHTML = `
     <img src="${img}"
     alt="${p.name}"
     onerror="
       if (!this.dataset.pngTried) {
         this.dataset.pngTried = '1';
         this.src='${assetUrl(`stores/${storeId}/images/${p.name}.png`)}';
       } else {
         this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect fill=\\'%23333\\' width=\\'80\\' height=\\'80\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'26\\'%3E📦%3C/text%3E%3C/svg%3E';
       }
     ">


  updateCartDisplay();
}

/* ---------- cart ---------- */
function getQty(storeId, name) {
  return currentCart?.[storeId]?.[name]?.qty || 0;
}

function addToCart(storeId, name, price) {
  currentCart[storeId] ||= {};
  currentCart[storeId][name] ||= { qty: 0, price };
  currentCart[storeId][name].qty += 1;
  updateCartDisplay();
}

function updateCartQty(storeId, name, delta) {
  const item = currentCart?.[storeId]?.[name];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    delete currentCart[storeId][name];
    if (Object.keys(currentCart[storeId]).length === 0) delete currentCart[storeId];
  }
  updateCartDisplay();
}

function updateCartDisplay() {
  const cart = document.getElementById("global-cart-items");
  const itemsTotalEl = document.getElementById("global-cart-total");
  const deliveryEl = document.getElementById("delivery-total");
  const grandEl = document.getElementById("grand-total");
  if (!cart) return;

  cart.innerHTML = "";

  let itemsTotal = 0;
  let totalItems = 0;

  for (const storeId of Object.keys(currentCart)) {
    const store = stores[storeId] || { name: storeId };

    const header = document.createElement("div");
    header.style.margin = "12px 0 6px";
    header.style.fontWeight = "700";
    header.style.color = "var(--accent-gold)";
    header.textContent = store.name;
    cart.appendChild(header);

    for (const name of Object.keys(currentCart[storeId])) {
      const it = currentCart[storeId][name];
      totalItems += it.qty;
      itemsTotal += it.qty * it.price;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div style="flex:1;text-align:left;">
          <div style="font-weight:600;">${name}</div>
          <span>${formatAmd(it.price)} × ${it.qty} = ${formatAmd(it.price*it.qty)}</span>
        </div>
        <div class="qty-controls">
          <button onclick="updateCartQty('${storeId}','${name.replace(/'/g,"\\'")}',-1)">−</button>
          <span class="qty-number">${it.qty}</span>
          <button onclick="addToCart('${storeId}','${name.replace(/'/g,"\\'")}',${it.price})">+</button>
        </div>
      `;
      cart.appendChild(row);
    }
  }

  if (totalItems === 0) {
    cart.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
  }

  const district = document.getElementById("district")?.value || "";
  const delivery = computeDelivery(district);
  const grand = itemsTotal + delivery;

  if (itemsTotalEl) itemsTotalEl.textContent = `Товары: ${formatAmd(itemsTotal)}`;
  if (deliveryEl) deliveryEl.textContent = `Доставка: ${formatAmd(delivery)}`;
  if (grandEl) grandEl.textContent = `Итого: ${formatAmd(grand)}`;
}

/* ---------- order ---------- */
async function submitOrder() {
  const name = document.getElementById("name")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const address = document.getElementById("address")?.value.trim();
  const district = document.getElementById("district")?.value || "";
  const payment = document.getElementById("payment")?.value || "";
  const comment = document.getElementById("comment")?.value.trim() || "";

  if (!name || !phone || !address) return alert("Заполни имя, телефон и адрес");
  if (Object.keys(currentCart).length === 0) return alert("Корзина пуста");

  const products = [];
  for (const storeId of Object.keys(currentCart)) {
    const store = stores[storeId];
    for (const pname of Object.keys(currentCart[storeId])) {
      const it = currentCart[storeId][pname];
      products.push({
        storeKey: storeId,
        storeName: store?.name || storeId,
        name: pname,
        quantity: it.qty,
        unitPrice: it.price,
        totalPrice: it.qty * it.price
      });
    }
  }

  const itemsTotal = products.reduce((s,p)=>s+p.totalPrice,0);
  const delivery = computeDelivery(district);
  const grandTotal = itemsTotal + delivery;

  const orderData = {
    name, phone, address, district, payment, comment,
    products,
    totals: { itemsTotal, delivery, grandTotal }
  };

  try {
    const r = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key": API_KEY },
      body: JSON.stringify(orderData)
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    alert("✅ Заказ отправлен!");
    currentCart = {};
    updateCartDisplay();
    goHome();
  } catch (e) {
    console.error(e);
    alert("❌ Ошибка: " + e.message);
  }
}

// HTML calls this
function placeOrder(){ submitOrder(); }

/* ---------- init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  document.getElementById("district")?.addEventListener("change", updateCartDisplay);
});

// expose functions used in HTML inline handlers
window.goHome = goHome;
window.goBack = goBack;
window.toggleTheme = toggleTheme;
window.showOrderHistory = showOrderHistory;
window.fillFromLastOrder = fillFromLastOrder;
window.submitReview = submitReview;
window.openStore = openStore;
window.addToCart = addToCart;
window.updateCartQty = updateCartQty;
window.placeOrder = placeOrder;
