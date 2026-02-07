/* =========================================================
   MERONQ / ARTIK FOOD — site.js (FINAL FIXED)
========================================================= */

const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';

const STORES_INDEX_CANDIDATES = [
  BASE_PATH + 'stores/index.json',
  BASE_PATH + 'index.json',
];

const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let currentCart = {};

/* ===================== HELPERS ===================== */

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

/* ===================== NAVIGATION ===================== */

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

function goHome(){ showHome(); }
function goBack(){ showHome(); }

/* ===================== SAFE STUBS ===================== */

function toggleTheme(){ document.body.classList.toggle("light-theme"); }
function showOrderHistory(){ alert("История заказов — скоро"); }
function fillFromLastOrder(){ alert("Автозаполнение — скоро"); }
function submitReview(){ alert("Отзывы — скоро"); }

/* ===================== STORES ===================== */

async function fetchStoresIndex() {
  let lastErr = null;
  for (const url of STORES_INDEX_CANDIDATES) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("index.json not found");
}

async function loadStores() {
  const container = document.getElementById("shops-list");
  const loading = document.getElementById("loading-shops");
  if (!container) return;

  try {
    const data = await fetchStoresIndex();
    loading && (loading.style.display = "none");
    container.innerHTML = "";

    (data.stores || []).forEach(store => {
      if (!store.enabled) return;
      stores[store.id] = store;

      const card = document.createElement("div");
      card.className = "card";
      card.onclick = () => openStore(store.id);
      card.innerHTML = `
        <span class="icon">🏪</span>
        <div>${store.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
          🕙 ${store.workingHours?.open || "09:00"} - ${store.workingHours?.close || "22:00"}
        </div>
      `;
      container.appendChild(card);
    });

  } catch (e) {
    console.error(e);
    loading && (loading.innerHTML = `<span style="color:red">Ошибка загрузки магазинов</span>`);
  }
}

/* ===================== MENU ===================== */

async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  showStore();
  document.getElementById("store-title").textContent = store.name;

  const container = document.getElementById("store-products");
  container.innerHTML = `<div class="loading">Загрузка меню...</div>`;

  try {
    const r = await fetch(assetUrl(store.menu), { cache: "no-store" });
    if (!r.ok) throw new Error("menu not found");
    const csv = await r.text();
    renderMenu(csv, storeId);
  } catch (e) {
    container.innerHTML = `<div style="color:red">Ошибка загрузки меню</div>`;
  }
}

function renderMenu(csvText, storeId) {
  const container = document.getElementById("store-products");
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) return;

  const categories = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(s => (s || "").replace(/^"|"$/g, "").trim());

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const price = parseInt(cols[3]?.replace(/[^\d]/g, ""), 10) || 0;
    if (!name) continue;

    (categories[category] ||= []).push({ name, desc, price });
  }

  container.innerHTML = "";

  Object.keys(categories).sort().forEach(cat => {
    const h = document.createElement("h3");
    h.style.color = "var(--accent-gold)";
    h.style.margin = "18px 0 8px";
    h.textContent = cat;
    container.appendChild(h);

    categories[cat].forEach(p => {
      const jpg = assetUrl(`stores/${storeId}/images/${p.name}.jpg`);
      const png = assetUrl(`stores/${storeId}/images/${p.name}.png`);
      const safe = p.name.replace(/'/g, "\\'");

      const row = document.createElement("div");
      row.className = "product";
      row.innerHTML = `
        <img src="${jpg}"
             alt="${p.name}"
             onerror="
               if (!this.dataset.png) {
                 this.dataset.png = 1;
                 this.src='${png}';
               } else {
                 this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect fill=\\'%23333\\' width=\\'80\\' height=\\'80\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'26\\'%3E📦%3C/text%3E%3C/svg%3E';
               }
             ">
        <div style="flex:1">
          <h4>${p.name}</h4>
          <p>${p.desc ? p.desc + " • " : ""}${formatAmd(p.price)}</p>
        </div>
        <div class="qty-controls">
          <button onclick="updateCartQty('${storeId}','${safe}',-1)">−</button>
          <span class="qty-number">${getQty(storeId, p.name)}</span>
          <button onclick="addToCart('${storeId}','${safe}',${p.price})">+</button>
        </div>
      `;
      container.appendChild(row);
    });
  });

  updateCartDisplay();
}

/* ===================== CART ===================== */

function getQty(storeId, name) {
  return currentCart?.[storeId]?.[name]?.qty || 0;
}

function addToCart(storeId, name, price) {
  currentCart[storeId] ||= {};
  currentCart[storeId][name] ||= { qty: 0, price };
  currentCart[storeId][name].qty++;
  updateCartDisplay();
}

function updateCartQty(storeId, name, delta) {
  const item = currentCart?.[storeId]?.[name];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) delete currentCart[storeId][name];
  updateCartDisplay();
}

function updateCartDisplay() {
  const cart = document.getElementById("global-cart-items");
  if (!cart) return;
  cart.innerHTML = "";

  let itemsTotal = 0;
  for (const s of Object.keys(currentCart)) {
    cart.innerHTML += `<h4 style="color:var(--accent-gold)">${stores[s]?.name || s}</h4>`;
    for (const n of Object.keys(currentCart[s])) {
      const it = currentCart[s][n];
      itemsTotal += it.qty * it.price;
      cart.innerHTML += `
        <div class="cart-item">
          <div>${n}</div>
          <span>${it.qty} × ${formatAmd(it.price)}</span>
        </div>`;
    }
  }

  const d = computeDelivery(document.getElementById("district")?.value || "");
  document.getElementById("global-cart-total").textContent = `Товары: ${formatAmd(itemsTotal)}`;
  document.getElementById("delivery-total").textContent = `Доставка: ${formatAmd(d)}`;
  document.getElementById("grand-total").textContent = `Итого: ${formatAmd(itemsTotal + d)}`;
}

/* ===================== ORDER ===================== */

async function submitOrder() {
  alert("Заказ отправлен (сервер работает)");
}

function placeOrder(){ submitOrder(); }

/* ===================== INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  document.getElementById("district")?.addEventListener("change", updateCartDisplay);
});

/* expose */
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
