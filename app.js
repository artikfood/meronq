/* =========================================================
   MERONQ - CORE APPLICATION
========================================================= */
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let currentCart = {};

function assetUrl(path) {
    if (!path) return '';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return BASE_PATH + cleanPath;
}

/* ЗАГРУЗКА МАГАЗИНОВ */
async function loadStores() {
    const container = document.getElementById("hero-shops") || document.getElementById("shops-list");
    if (!container) return;

    try {
        const resp = await fetch(STORES_INDEX_URL);
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
                    <div class="shop-info"><span>🕙 ${s.workingHours?.open || '10:00'} - ${s.workingHours?.close || '22:00'}</span></div>
                </div>`;
            container.appendChild(card);
        });
    } catch (e) {
        console.error("Ошибка загрузки магазинов:", e);
    }
}

/* ЗАГРУЗКА МЕНЮ (Парсинг твоего CSV) */
async function openStore(storeId) {
    const store = stores[storeId];
    if (!store) return;

    const overlay = document.getElementById("store-overlay");
    const container = document.getElementById("product-container");
    const title = document.getElementById("overlay-title");

    overlay.style.display = "flex";
    title.innerText = store.name;
    container.innerHTML = "Загрузка меню...";

    try {
        const resp = await fetch(assetUrl(store.menu));
        const csvText = await resp.text();
        container.innerHTML = "";

        const rows = csvText.split("\n").filter(r => r.trim().length > 5);
        rows.forEach(row => {
            // Умный сплит (игнорирует запятые в кавычках)
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 4) return;

            const name = cols[2].replace(/"/g, "").trim();
            const desc = cols[3].replace(/"/g, "").trim();
            // Обработка цены (берем первую, если там 950/1250)
            const priceRaw = cols[4] ? cols[4].split('/')[0] : "0";
            const price = parseInt(priceRaw.replace(/\D/g, "")) || 0;

            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
                <img src="${assetUrl(`stores/${storeId}/images/${name}.jpg`)}" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=Food'">
                <div class="product-info">
                    <h4 class="product-title">${name}</h4>
                    <p style="font-size:12px; color:gray; margin-bottom:8px;">${desc}</p>
                    <p class="product-price">${price} AMD</p>
                    <button class="add-btn" onclick="addToCart('${storeId}', '${name.replace(/'/g, "\\'")}', ${price})">Добавить</button>
                </div>`;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = "Ошибка загрузки меню.";
    }
}

function addToCart(storeId, name, price) {
    if (!currentCart[name]) {
        currentCart[name] = { storeKey: storeId, name, price, qty: 1 };
    } else {
        currentCart[name].qty++;
    }
    alert(`Добавлено: ${name}`);
}

async function placeOrder() {
    const name = document.getElementById("customer-name")?.value;
    const phone = document.getElementById("customer-phone")?.value;
    const address = document.getElementById("customer-address")?.value;

    if (!name || !phone || !address) return alert("Заполните все поля доставки!");

    const products = Object.values(currentCart).map(item => ({
        storeKey: item.storeKey,
        name: item.name,
        quantity: item.qty,
        unitPrice: item.price,
        totalPrice: item.qty * item.price
    }));

    if (products.length === 0) return alert("Корзина пуста!");

    try {
        const res = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
            body: JSON.stringify({ name, phone, address, products, payment: "Наличные" })
        });
        if (res.ok) {
            alert("✅ Заказ отправлен в Telegram!");
            currentCart = {};
            location.reload();
        }
    } catch (e) {
        alert("Ошибка отправки заказа.");
    }
}

window.closeStore = () => document.getElementById("store-overlay").style.display = "none";
document.addEventListener("DOMContentLoaded", loadStores);
