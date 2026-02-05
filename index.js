/* =========================================================
   НАСТРОЙКИ (КОНФИГУРАЦИЯ)
========================================================= */

// Автоматическое определение пути (для GitHub Pages это /meronq/)
const BASE_PATH = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.replace(/\/[^/]*$/, "/");

const STORES_INDEX_URL = `${BASE_PATH}stores/index.json`;
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; 
const MIN_ITEMS_TOTAL = 3000;

/* =========================================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ
========================================================= */
let stores = {};      
let carts = {};       
let currentStore = null;

/* =========================================================
   УТИЛИТЫ (ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ)
========================================================= */

// Формирует правильный URL для файлов на GitHub
function assetUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (/^(https?:)?\/\//.test(s) || s.startsWith("data:")) return s;
  const clean = s.startsWith("/") ? s.slice(1) : s;
  return `${BASE_PATH}${clean}`;
}

// Загрузка CSV с учетом префикса магазина (например, million_menu.csv)
async function loadStoreMenuCSV(storeKey) {
  const fileName = `${storeKey}_menu.csv`; // Твоя новая логика
  const url = assetUrl(`stores/${storeKey}/${fileName}`);
  
  console.log(`[System] Ищу меню по адресу: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[System] Файл ${fileName} не найден. Пробую стандартный menu.csv`);
      const fallbackUrl = assetUrl(`stores/${storeKey}/menu.csv`);
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) throw new Error("Файл меню не найден");
      return await fallbackRes.text();
    }
    return await response.text();
  } catch (e) {
    console.error(`[Error] Не удалось загрузить магазин ${storeKey}:`, e);
    return null;
  }
}

/* =========================================================
   ОТОБРАЖЕНИЕ МАГАЗИНОВ И ТОВАРОВ
========================================================= */

async function loadStores() {
  try {
    const resp = await fetch(STORES_INDEX_URL);
    if (!resp.ok) throw new Error("Не удалось загрузить index.json");
    const data = await resp.json();
    
    const container = document.getElementById("shops-list");
    if (!container) return;
    container.innerHTML = "";

data.stores.forEach(s => {
      if (!s.enabled) return;
      stores[s.id] = s;
      
      // Безопасное получение часов работы
      const openTime = s.workingHours ? s.workingHours.open : "00:00";
      const closeTime = s.workingHours ? s.workingHours.close : "00:00";
      
      const div = document.createElement("div");
      div.className = "shop-card";
      div.onclick = () => openStore(s.id);
      div.innerHTML = `
        <img src="${assetUrl(s.logo)}" onerror="this.src='https://via.placeholder.com/300x150?text=No+Logo'">
        <div class="shop-card-content">
          <h3>${s.name}</h3>
          <p>🕙 ${openTime} - ${closeTime}</p>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.error("Ошибка инициализации магазинов:", e);
  }
}

async function openStore(storeKey) {
  currentStore = storeKey;
  const store = stores[storeKey];
  
  // Показываем оверлей (убедись, что ID совпадает с HTML)
  const overlay = document.getElementById("store-overlay");
  if (overlay) overlay.style.display = "flex";
  
  document.getElementById("overlay-title").innerText = store.name;
  
  const container = document.getElementById("product-container");
  container.innerHTML = "<div class='loader'>Загружаем продукты...</div>";

  const csvText = await loadStoreMenuCSV(storeKey);
  if (!csvText) {
    container.innerHTML = "<p style='padding:20px;'>Ошибка: товары не найдены.</p>";
    return;
  }

  const rows = csvText.split("\n").filter(r => r.trim().length > 5);
  container.innerHTML = "";

  rows.forEach(row => {
    // Парсинг CSV с учетом возможных кавычек
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cols.length < 5) return;

    const pName = cols[2].replace(/"/g, "").trim();
    const pPrice = parseInt(cols[4].replace(/\D/g, "")) || 0;
    // Путь к картинке товара: stores/название/images/имя_товара.jpg
    const pImg = assetUrl(`stores/${storeKey}/images/${pName}.jpg`);

    const qty = (carts[storeKey] && carts[storeKey][pName]) ? carts[storeKey][pName].qty : 0;

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${pImg}" onerror="this.src='https://via.placeholder.com/150?text=${encodeURIComponent(pName)}'">
      <div class="product-info">
        <h4>${pName}</h4>
        <p class="price">${pPrice} AMD</p>
        <div class="qty-control">
          <button onclick="changeQty('${storeKey}', '${pName}', ${pPrice}, -1)">-</button>
          <span id="qty-${storeKey}-${pName.replace(/\s+/g, '')}">${qty}</span>
          <button onclick="changeQty('${storeKey}', '${pName}', ${pPrice}, 1)">+</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   ЛОГИКА КОРЗИНЫ
========================================================= */

function changeQty(sId, pName, price, delta) {
  if (!carts[sId]) carts[sId] = {};
  if (!carts[sId][pName]) carts[sId][pName] = { qty: 0, price: price };

  carts[sId][pName].qty += delta;

  if (carts[sId][pName].qty <= 0) {
    delete carts[sId][pName];
    if (Object.keys(carts[sId]).length === 0) delete carts[sId];
  }

  // Обновляем число в карточке товара
  const qtyEl = document.getElementById(`qty-${sId}-${pName.replace(/\s+/g, '')}`);
  if (qtyEl) qtyEl.innerText = (carts[sId] && carts[sId][pName]) ? carts[sId][pName].qty : 0;

  saveCart();
  updateCartBadge();
}

function saveCart() {
  localStorage.setItem("meronq_cart_v2", JSON.stringify(carts));
}

function updateCartBadge() {
  let count = 0;
  for (let s in carts) {
    for (let p in carts[s]) count += carts[s][p].qty;
  }
  const badge = document.getElementById("cart-badge");
  if (badge) badge.innerText = count;
}

/* =========================================================
   ОТПРАВКА ЗАКАЗА
========================================================= */

async function placeOrder() {
  const name = document.getElementById("customer-name")?.value;
  const phone = document.getElementById("customer-phone")?.value;
  const address = document.getElementById("customer-address")?.value;

  if (!name || !phone || !address) return alert("Заполните данные доставки!");

  const products = [];
  let total = 0;

  for (let sId in carts) {
    for (let pName in carts[sId]) {
      const it = carts[sId][pName];
      products.push({
        storeKey: sId,
        name: pName,
        quantity: it.qty,
        unitPrice: it.price
      });
      total += it.qty * it.price;
    }
  }

  if (products.length === 0) return alert("Корзина пуста!");
  if (total < MIN_ITEMS_TOTAL) return alert(`Минимальный заказ — ${MIN_ITEMS_TOTAL} AMD`);

  const orderData = {
    name, phone, address,
    products,
    payment: "Наличные", // Можно добавить выбор в HTML
    totals: { grandTotal: total }
  };

  try {
    const res = await fetch(`${WORKER_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(orderData)
    });

    const result = await res.json();
    if (result.ok) {
      alert(`✅ Заказ №${result.id.slice(-6)} принят!`);
      carts = {};
      saveCart();
      location.reload();
    } else {
      alert("Ошибка: " + result.error);
    }
  } catch (e) {
    alert("Ошибка связи с сервером.");
  }
}

/* =========================================================
   ЗАПУСК
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("meronq_cart_v2");
  if (saved) carts = JSON.parse(saved);
  
  // Делаем функции доступными для HTML-кнопок
  window.changeQty = changeQty;
  window.placeOrder = placeOrder;
  window.closeStore = () => document.getElementById("store-overlay").style.display = "none";

  updateCartBadge();
  loadStores();
});
