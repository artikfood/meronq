/* =========================================================
   MERONQ / ARTIK FOOD — app.js (FIXED for your HTML)
   Stores from GitHub + Cart + Orders
========================================================= */

/* НАСТРОЙКИ */
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';

// Будем пробовать оба пути: /stores/index.json и /index.json
const STORES_INDEX_CANDIDATES = [
  BASE_PATH + 'stores/index.json',
  BASE_PATH + 'index.json'
];

const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!"; // ⚠️ ключ видно в браузере (потом лучше переделать)

let stores = {};          // { storeId: storeObj }
let currentCart = {};     // { storeId: { productName: {qty, price} } }
let currentStoreId = null;

/* =========================================================
   HELPERS
========================================================= */
function assetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return BASE_PATH + cleanPath;
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

/* =========================================================
   NAVIGATION (your HTML uses #home-page and #store-page + .hidden)
========================================================= */
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

function goBack() { showHome(); }
function goHome() { showHome(); }

/* =========================================================
   SAFE STUBS (to avoid console errors from header buttons)
========================================================= */
function toggleTheme() {
  document.body.classList.toggle("light-theme");
}
function showOrderHistory() { alert("История заказов — скоро"); }
function fillFromLastOrder() { alert("Автозаполнение — скоро"); }
function submitReview() { alert("Отзывы — скоро"); }

/* =========================================================
   STORES LOADING
========================================================= */
async function fetchStoresIndex() {
  let lastErr = null;
  for (const url of STORES_INDEX_CANDIDATES) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return await resp.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Не удалось загрузить index.json");
}

async function loadStores() {
  const container = document.getElementById("shops-list");      // ✅ your HTML
  const loading = document.getElementById("loading-shops");     // ✅ your HTML

  if (!container) return;

  try {
    const data = await fetchStoresIndex();

    if (loading) loading.style.display = "none";
    container.innerHTML = "";

    (data.stores || []).forEach(store => {
      if (!store?.enabled) return;
      stores[store.id] = store;

      // Используем твой класс .card (чтобы совпало со стилями)
      const card = document.createElement("div");
      card.className = "card";
      card.onclick = () => openStore(store.id);

      card.innerHTML = `
        <span class="icon">🏪</span>
        <div>${store.name}</div>
        <div style="margin-top:6px; font-size:12px; color: var(--text-muted);">
          🕙 ${store.workingHours?.open || "09:00"} - ${store.workingHours?.close || "22:00"}
        </div>
      `;

      container.appendChild(card);
    });

    if (!container.children.length) {
      container.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }

  } catch (e) {
    console.error("Ошибка загрузки магазинов:", e);
    if (loading) {
      loading.innerHTML = `<div style="color:#ff6b6b;">❌ Ошибка загрузки магазинов: ${e.message}</div>`;
    }
  }
}

/* =========================================================
   STORE MENU LOADING + RENDER
========================================================= */
async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  currentStoreId = storeId;

  // show store page
  showStore();

  const title = document.getElementById("store-title");        // ✅ your HTML
  if (title) title.textContent = store.name;

  const container = document.getElementById("store-products"); // ✅ your HTML
  if (!container) return;

  container.innerHTML = `<div class="loading">Загрузка меню...</div>`;

  try {
    const resp = await fetch(assetUrl(store.menu), { cache: "no-store" });
    if (!resp.ok) throw new Error(`Меню не найдено (${resp.status})`);

    const csvText = await resp.text();
    renderMenuFromCSV(csvText, storeId);

  } catch (e) {
    console.error("Ошибка загрузки меню:", e);
    container.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ Не удалось загрузить меню: ${e.message}</div>`;
  }
}

function renderMenuFromCSV(csvText, storeId) {
  const container = document.getElementById("store-products");
  if (!container) return;

  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) {
    container.innerHTML = `<div class="loading">Меню пустое</div>`;
    return;
  }

  // CSV columns assumed: category,name,desc,price,image
  const categories = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => (s || "").replace(/^"|"$/g, "").trim());
    if (cols.length < 4) continue;

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const image = cols[4] || "";

    if (!name) continue;

    const price = parseInt(String(priceRaw).split('/')[0].replace(/[^\d]/g, ""), 10) || 0;

    if (!categories[category]) categories[category] = [];
    categories[category].push({ name, desc, price, image });
  }

  container.innerHTML = "";

  Object.keys(categories).sort().forEach(category => {
    // category title
    const h = document.createElement("h3");
    h.style.margin = "18px 0 8px";
    h.style.color = "var(--accent-gold)";
    h.textContent = category;
    container.appendChild(h);

    categories[category].forEach(p => {
      const row = document.createElement("div");
      row.className = "product"; // ✅ matches your CSS (.product)

      const imgSrc = p.image
        ? assetUrl(`stores/${storeId}/images/${p.image}`)
        : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='26'%3E📦%3C/text%3E%3C/svg%3E`;

      const safeName = p.name.replace(/'/g, "\\'");

      row.innerHTML = `
        <img src="${imgSrc}" alt="${p.name}"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect fill=\\'%23333\\' width=\\'80\\' height=\\'80\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'26\\'%3E📦%3C/text%3E%3C/svg%3E'">
        <div style="flex:1;">
          <h4>${p.name}</h4>
          <p>${p.desc ? p.desc + " • " : ""}${formatAmd(p.price)}</p>
        </div>
        <div class="qty-controls">
          <button onclick="updateCartQty('${storeId}','${safeName}', -1)">−</button>
          <span class="qty-number" id="qty-${storeId}-${hashKey(p.name)}">${getQty(storeId, p.name)}</span>
          <button onclick="addToCart('${storeId}','${safeName}', ${p.price})">+</button>
        </div>
      `;

      container.appendChild(row);
    });
  });

  updateCartDisplay();
}

/* =========================================================
   CART
========================================================= */
function ensureItem(storeId, productName, price) {
  if (!currentCart[storeId]) currentCart[storeId] = {};
  if (!currentCart[storeId][productName]) currentCart[storeId][productName] = { qty: 0, price: price };
}

function getQty(storeId, productName) {
  return currentCart?.[storeId]?.[productName]?.qty || 0;
}

function addToCart(storeId, productName, price) {
  ensureItem(storeId, productName, price);
  currentCart[storeId][productName].qty += 1;

  updateCartDisplay();
  updateInlineQty(storeId, productName);
}

function updateCartQty(storeId, productName, delta) {
  if (!currentCart[storeId] || !currentCart[storeId][productName]) return;

  currentCart[storeId][productName].qty += delta;

  if (currentCart[storeId][productName].qty <= 0) {
    delete currentCart[storeId][productName];
    if (Object.keys(currentCart[storeId]).length === 0) delete currentCart[storeId];
  }

  updateCartDisplay();
  updateInlineQty(storeId, productName);
}

function update
