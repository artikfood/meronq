/* =========================================================
   НАСТРОЙКИ
========================================================= */
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; 

let stores = {};      
let carts = {};       

// Исправленная функция путей
function assetUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return BASE_PATH + cleanPath;
}

/* =========================================================
   ЗАГРУЗКА МАГАЗИНОВ
========================================================= */
async function loadStores() {
    const container = document.getElementById("hero-shops"); 
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
            card.innerHTML = `
                <div class="shop-badge">Premium</div>
                <img src="${assetUrl(s.logo)}" class="shop-logo" onerror="this.src='https://via.placeholder.com/300x150?text=${s.name}'">
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
        console.error("Ошибка инициализации:", e);
        container.innerHTML = `<p style="color:white; padding:20px;">Ошибка: ${e.message}</p>`;
    }
}

/* =========================================================
   ОТКРЫТИЕ МАГАЗИНА И ПАРСИНГ CSV
========================================================= */
async function openStore(storeKey) {
    const store = stores[storeKey];
    const overlay = document.getElementById("store-overlay");
    const container = document.getElementById("product-container");
    const title = document.getElementById("overlay-title");

    if (overlay) overlay.style.display = "flex";
    if (title) title.innerText = store.name;
    container.innerHTML = "<div class='loader'>Загрузка меню...</div>";

    try {
        const resp = await fetch(assetUrl(store.menu));
        if (!resp.ok) throw new Error("CSV не найден");
        const csvText = await resp.text();
        
        container.innerHTML = "";
        const rows = csvText.split("\n").filter(r => r.trim().length > 5);

        rows.forEach(row => {
            // Разделение по запятым, игнорируя те, что в кавычках
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 4) return;

            const name = cols[2]?.replace(/"/g, "").trim();
            const desc = cols[3]?.replace(/"/g, "").trim() || "";
            // Обработка цены вида "950/1250" -> берем 950
            const priceRaw = cols[4] ? cols[4].split('/')[0] : "0";
            const price = parseInt(priceRaw.replace(/\D/g, "")) || 0;

            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
                <img src="${assetUrl(`stores/${storeKey}/images/${name}.jpg`)}" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=No+Photo'">
                <div class="product-info">
                    <h4 class="product-title">${name}</h4>
                    <p style="font-size:12px; color:#aaa; margin-bottom:8px;">${desc}</p>
                    <p class="product-price">${price} AMD</p>
                    <button class="add-btn" onclick="addToCart('${storeKey}', '${name.replace(/'/g, "\\'")}', ${price})">Добавить</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = "<p>Не удалось загрузить товары.</p>";
    }
}

/* =========================================================
   КОРЗИНА И ЗАКАЗ
========================================================= */
function addToCart
