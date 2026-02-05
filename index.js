/* =========================================================
   НАСТРОЙКИ
========================================================= */
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; 

let stores = {};      
let carts = {};       

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
        console.error("Ошибка инициализации:", e);
    }
}

/* =========================================================
   МЕНЮ ТОВАРОВ
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
        if (!resp.ok) throw new Error("Меню не найдено");
        const csvText = await resp.text();
        
        container.innerHTML = "";
        const rows = csvText.split("\n").filter(r => r.trim().length > 5);

        rows.forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 4) return; // Минимум 4 колонки: Категория, Имя, Описание, Цена

            const pName = cols[1].replace(/"/g, "").trim();
            const pPrice = parseInt(cols[3].replace(/\D/g, "")) || 0; // Цена в 4-й колонке
            const pImg = assetUrl(`stores/${storeKey}/images/${pName}.jpg`);

            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
                <img src="${pImg}" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=Artik+Food'">
                <div class="product-info">
                    <h4 class="product-title">${pName}</h4>
                    <p class="product-price">${pPrice} AMD</p>
                    <button class="add-btn" onclick="addToCart('${storeKey}', '${pName.replace(/'/g, "\\'")}', ${pPrice})">Добавить</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = "<p>Не удалось загрузить товары.</p>";
    }
}

/* =========================================================
   КОРЗИНА И ОТПРАВКА
========================================================= */
function addToCart(storeKey, name, price) {
    if (!carts[storeKey]) carts[storeKey] = {};
    if (!carts[storeKey][name]) {
        carts[storeKey][name] = { qty: 1, price: price };
    } else {
        carts[storeKey][name].qty++;
    }
    updateCartBadge();
    alert(`Добавлено: ${name}`);
}

function updateCartBadge() {
    let count = 0;
    for (let s in carts) {
        for (let p in carts[s]) count += carts[s][p].qty;
    }
    const badge = document.getElementById("cart-badge");
    if (badge) badge.innerText = count;
}

async function placeOrder() {
    const name = document.getElementById("customer-name")?.value;
    const phone = document.getElementById("customer-phone")?.value;
    const address = document.getElementById("customer-address")?.value;

    if (!name || !phone || !address) return alert("Заполните данные доставки!");

    const products = [];
    let grandTotal = 0;

    for (let sKey in carts) {
        for (let pName in carts[sKey]) {
            const item = carts[sKey][pName];
            products.push({
                storeKey: sKey,
                name: pName,
                quantity: item.qty,
                unitPrice: item.price,
                totalPrice: item.qty * item.price
            });
            grandTotal += item.qty * item.price;
        }
    }

    if (products.length === 0) return alert("Корзина пуста!");

    const orderData = {
        name, phone, address,
        products,
        payment: "Наличные",
        totals: { grandTotal }
    };

    try {
        const res = await fetch(`${WORKER_URL}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
            body: JSON.stringify(orderData)
        });
        const result = await res.json();
        if (result.ok) {
            alert("✅ Заказ успешно отправлен!");
            carts = {};
            updateCartBadge();
            location.reload();
        }
    } catch (e) {
        alert("Ошибка при отправке заказа.");
    }
}

window.closeStore = () => document.getElementById("store-overlay").style.display = "none";
document.addEventListener("DOMContentLoaded", loadStores);
