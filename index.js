const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev";
const API_KEY = "meronq_Secret_2026!"; 

let stores = {};      
let carts = {};       

function assetUrl(path) {
    if (!path) return '';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return BASE_PATH + cleanPath;
}

async function loadStores() {
    const container = document.getElementById("hero-shops"); 
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
                    <div class="shop-info"><span>🕙 ${s.workingHours.open} - ${s.workingHours.close}</span></div>
                </div>`;
            container.appendChild(card);
        });
    } catch (e) { console.error("Ошибка загрузки магазинов:", e); }
}

async function openStore(storeKey) {
    const store = stores[storeKey];
    document.getElementById("store-overlay").style.display = "flex";
    document.getElementById("overlay-title").innerText = store.name;
    const container = document.getElementById("product-container");
    container.innerHTML = "<div class='loader'>Загрузка...</div>";

    try {
        const resp = await fetch(assetUrl(store.menu));
        const csvText = await resp.text();
        container.innerHTML = "";

        const rows = csvText.split("\n").filter(r => r.trim().length > 5);
        rows.forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 4) return;

            const name = cols[2].replace(/"/g, "").trim();
            const desc = cols[3].replace(/"/g, "").trim();
            // Берем первую цену из колонки (например "950" из "950/1250")
            const priceRaw = cols[4] ? cols[4].split('/')[0] : "0";
            const price = parseInt(priceRaw.replace(/\D/g, "")) || 0;
            
            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
                <img src="${assetUrl(`stores/${storeKey}/images/${name}.jpg`)}" class="product-img" onerror="this.src='https://via.placeholder.com/150?text=Artik+Food'">
                <div class="product-info">
                    <h4 class="product-title">${name}</h4>
                    <p style="font-size:12px; color:#aaa; margin-bottom:8px;">${desc}</p>
                    <p class="product-price">${price} AMD</p>
                    <button class="add-btn" onclick="addToCart('${storeKey}', '${name.replace(/'/g, "\\'")}', ${price})">Добавить</button>
                </div>`;
            container.appendChild(card);
        });
    } catch (e) { container.innerHTML = "<p>Ошибка загрузки меню.</p>"; }
}

function addToCart(storeKey, name, price) {
    if (!carts[storeKey]) carts[storeKey] = {};
    carts[storeKey][name] = (carts[storeKey][name] || { qty: 0, price }).qty + 1;
    alert(`Добавлено: ${name}`);
}

async function placeOrder() {
    const name = document.getElementById("customer-name").value;
    const phone = document.getElementById("customer-phone").value;
    const address = document.getElementById("customer-address").value;
    if (!name || !phone || !address) return alert("Заполните поля!");

    const products = [];
    for (let sKey in carts) {
        for (let pName in carts[sKey]) {
            products.push({
                storeKey: sKey,
                name: pName,
                quantity: carts[sKey][pName],
                unitPrice: carts[sKey][pName].price
            });
        }
    }

    const res = await fetch(`${WORKER_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ name, phone, address, products, payment: "Наличные" })
    });
    if (res.ok) { alert("Заказ отправлен!"); location.reload(); }
}

window.closeStore = () => document.getElementById("store-overlay").style.display = "none";
document.addEventListener("DOMContentLoaded", loadStores);
