/* =========================================================
   НАСТРОЙКИ
========================================================= */
const BASE_PATH = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.replace(/\/[^/]*$/, "/");

const STORES_INDEX_URL = `${BASE_PATH}stores/index.json`;
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; 

let stores = {};      
let carts = {};       

function assetUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (/^(https?:)?\/\//.test(s) || s.startsWith("data:")) return s;
  const clean = s.startsWith("/") ? s.slice(1) : s;
  return `${BASE_PATH}${clean}`;
}

/* =========================================================
   ЗАГРУЗКА МАГАЗИНОВ (Исправлено)
========================================================= */
async function loadStores() {
  try {
    console.log("Загрузка index.json...");
    const resp = await fetch(STORES_INDEX_URL);
    if (!resp.ok) throw new Error(`Ошибка сети: ${resp.status}`);
    
    const data = await resp.json();
    const container = document.getElementById("shops-list");
    if (!container) return;
    container.innerHTML = "";

    if (!data.stores || !Array.isArray(data.stores)) {
      throw new Error("Формат JSON неверен: отсутствует массив stores");
    }

    data.stores.forEach(s => {
      if (!s.enabled) return;
      stores[s.id] = s;
      
      // Защита от undefined в workingHours
      const open = s.workingHours?.open || "09:00";
      const close = s.workingHours?.close || "21:00";
      
      const div = document.createElement("div");
      div.className = "shop-card";
      div.onclick = () => openStore(s.id);
      div.innerHTML = `
        <img src="${assetUrl(s.logo)}" onerror="this.src='https://via.placeholder.com/300x150?text=No+Logo'">
        <div class="shop-card-content">
          <h3>${s.name}</h3>
          <p>🕙 ${open} - ${close}</p>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.error("Критическая ошибка loadStores:", e);
    document.getElementById("shops-list").innerHTML = `<p style='color:red; padding:20px;'>Ошибка: ${e.message}</p>`;
  }
}

/* =========================================================
   ЗАГРУЗКА ТОВАРОВ (С префиксами)
========================================================= */
async function loadStoreMenuCSV(storeKey) {
  const fileName = `${storeKey}_menu.csv`;
  const url = assetUrl(`stores/${storeKey}/${fileName}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("CSV не найден");
    return await response.text();
  } catch (e) {
    console.warn(`Файл ${fileName} не найден, пробую menu.csv`);
    try {
      const fallback = await fetch(assetUrl(`stores/${storeKey}/menu.csv`));
      return fallback.ok ? await fallback.text() : null;
    } catch { return null; }
  }
}

async function openStore(storeKey) {
  const store = stores[storeKey];
  const overlay = document.getElementById("store-overlay");
  if (overlay) overlay.style.display = "flex";
  
  document.getElementById("overlay-title").innerText = store?.name || "Магазин";
  
  const container = document.getElementById("product-container");
  container.innerHTML = "<div class='loader'>Загружаем продукты...</div>";

  const csvText = await loadStoreMenuCSV(storeKey);
  if (!csvText) {
    container.innerHTML = "<p style='padding:20px;'>Товары скоро появятся!</p>";
    return;
  }

  const rows = csvText.split("\n").filter(r => r.trim().length > 5);
  container.innerHTML = "";

  rows.forEach(row => {
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cols.length < 5) return;

    const pName = cols[2].replace(/"/g, "").trim();
    const pPrice = parseInt(cols[4].replace(/\D/g, "")) || 0;
    const pImg = assetUrl(`stores/${storeKey}/images/${pName}.jpg`);

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${pImg}" onerror="this.src='https://via.placeholder.com/150?text=No+Photo'">
      <div class="product-info">
        <h4>${pName}</h4>
        <p class="price">${pPrice} AMD</p>
        <button class="add-btn" onclick="addToCart('${storeKey}', '${pName}', ${pPrice})">В корзину</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Запуск при загрузке
document.addEventListener("DOMContentLoaded", loadStores);
window.closeStore = () => document.getElementById("store-overlay").style.display = "none";
