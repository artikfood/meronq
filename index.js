/* =========================================================
   НАСТРОЙКИ (ПОД ТВОЙ HTML)
========================================================= */

// Авто-определение базового пути
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';

// Функция для формирования правильных ссылок на картинки и CSV
function getAssetPath(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return BASE_PATH + cleanPath;
}
/* =========================================================
   ЗАГРУЗКА МАГАЗИНОВ
========================================================= */

async function loadStores() {
  const container = document.getElementById("hero-shops"); // ID из твоего HTML
  if (!container) return;

  try {
    const resp = await fetch(STORES_INDEX_URL);
    if (!resp.ok) throw new Error("Ошибка загрузки index.json");
    const data = await resp.json();
    
    container.innerHTML = "";

    data.stores.forEach(s => {
      if (!s.enabled) return;
      stores[s.id] = s;
      
      const card = document.createElement("div");
      card.className = "shop-card";
      card.onclick = () => openStore(s.id);
      
      // Используем структуру из твоего CSS
      card.innerHTML = `
        <div class="shop-badge">Premium</div>
        <img src="${assetUrl(s.logo)}" class="shop-logo" onerror="this.src='https://via.placeholder.com/300x150?text=No+Logo'">
        <div class="shop-card-content">
          <h3 class="shop-title">${s.name}</h3>
          <div class="shop-info">
            <span>🕙 ${s.workingHours?.open || "09:00"} - ${s.workingHours?.close || "22:00"}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    console.error("Ошибка:", e);
    container.innerHTML = "<p>Не удалось загрузить список магазинов.</p>";
  }
}

/* =========================================================
   МЕНЮ И ТОВАРЫ (С ПРЕФИКСАМИ)
========================================================= */

async function openStore(storeKey) {
  currentStoreId = storeKey;
  const store = stores[storeKey];
  
  const overlay = document.getElementById("store-overlay");
  const container = document.getElementById("product-container");
  const title = document.getElementById("overlay-title");

  if (overlay) overlay.style.display = "flex";
  if (title) title.innerText = store.name;
  if (container) container.innerHTML = "<div class='loader'>Загрузка меню...</div>";

  // Пытаемся загрузить [storeKey]_menu.csv
  const fileName = `${storeKey}_menu.csv`;
  const url = assetUrl(`stores/${storeKey}/${fileName}`);
  
  try {
    let response = await fetch(url);
    if (!response.ok) {
      // Запасной вариант: просто menu.csv
      response = await fetch(assetUrl(`stores/${storeKey}/menu.csv`));
    }
    
    if (!response.ok) throw new Error("Меню не найдено");
    const csvText = await response.text();
    renderProducts(csvText, storeKey);
    
  } catch (e) {
    container.innerHTML = "<p style='padding:20px;'>Товары временно недоступны.</p>";
  }
}

function renderProducts(csvText, storeKey) {
  const container = document.getElementById("product-container");
  if (!container) return;
  container.innerHTML = "";

  // Разбиваем CSV на строки
  const rows = csvText.split("\n").filter(r => r.trim().length > 5);

  rows.forEach(row => {
    // Умное разделение запятых (игнорирует запятые внутри кавычек)
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cols.length < 5) return;

    const pName = cols[2].replace(/"/g, "").trim();
    const pPrice = parseInt(cols[4].replace(/\D/g, "")) || 0;
    
    // Путь к картинке: stores/million/images/Название.jpg
    const pImg = assetUrl(`stores/${storeKey}/images/${pName}.jpg`);

    // Создаем карточку товара
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${pImg}" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=No+Photo'">
      <div class="product-info">
        <h4 class="product-title">${pName}</h4>
        <p class="product-price">${pPrice} AMD</p>
        <button class="add-btn" onclick="changeQty('${storeKey}', '${pName.replace(/'/g, "\\'")}', ${pPrice}, 1)">
          Добавить
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   КОРЗИНА И ИНИЦИАЛИЗАЦИЯ
========================================================= */

function addToCart(sId, name, price) {
  // Базовая логика корзины
  alert(`Добавлено: ${name}`);
}

window.closeStore = () => {
  document.getElementById("store-overlay").style.display = "none";
};

document.addEventListener("DOMContentLoaded", () => {
  loadStores();
  
  // Кнопка закрытия оверлея
  const closeBtn = document.querySelector(".close-overlay");
  if (closeBtn) closeBtn.onclick = window.closeStore;
});
