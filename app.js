/* =========================================================
   MERONQ - JavaScript Application
   Загрузка магазинов из GitHub + Корзина + Заказы
========================================================= */

/* НАСТРОЙКИ */
const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let currentCart = {};
let currentStoreId = null;

/* HELPER FUNCTIONS */
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
   ЗАГРУЗКА МАГАЗИНОВ ИЗ GITHUB
========================================================= */
async function loadStores() {
    const container = document.getElementById("shops-container");
    const loading = document.getElementById("loading-shops");
    
    if (!container) return;

    try {
        const resp = await fetch(https://github.com/artikfood/meronq/blob/main/stores/index.json);
        if (!resp.ok) throw new Error("Не удалось загрузить список магазинов");
        
        const data = await resp.json();
        
        if (loading) loading.style.display = "none";
        container.innerHTML = "";
        
        data.stores.forEach(store => {
            if (!store.enabled) return;
            
            stores[store.id] = store;
            
            const card = document.createElement("div");
            card.className = "shop-card";
            card.onclick = () => openStore(store.id);
            
            card.innerHTML = `
                <div class="shop-logo">
                    <img src="${assetUrl(store.logo)}" alt="${store.name}" 
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Crect fill=\\'%23333\\' width=\\'100\\' height=\\'100\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'%3E🏪%3C/text%3E%3C/svg%3E'">
                </div>
                <div class="shop-info">
                    <div class="shop-name">${store.name}</div>
                    <div class="shop-meta">
                        🕙 ${store.workingHours?.open || "09:00"} - ${store.workingHours?.close || "22:00"}
                    </div>
                </div>
            `;
            
            container.appendChild(card);
        });
        
    } catch (e) {
        console.error("Ошибка загрузки магазинов:", e);
        if (loading) {
            loading.innerHTML = `<div style="color: #ff6b6b;">❌ Ошибка загрузки: ${e.message}</div>`;
        }
    }
}

/* =========================================================
   ОТКРЫТИЕ МАГАЗИНА И ЗАГРУЗКА МЕНЮ ИЗ CSV
========================================================= */
async function openStore(storeId) {
    const store = stores[storeId];
    if (!store) return;
    
    currentStoreId = storeId;
    const container = document.getElementById("store-products");
    
    // Показываем страницу магазина
    showPage('store');
    
    // Обновляем заголовок
    const title = document.getElementById("store-title");
    if (title) title.textContent = store.name;
    
    container.innerHTML = '<div class="loading">Загрузка меню...</div>';
    
    try {
        const resp = await fetch(assetUrl(store.menu));
        if (!resp.ok) throw new Error("Не удалось загрузить меню");
        
        const csvText = await resp.text();
        const rows = csvText.split("\n").filter(r => r.trim().length > 5);
        
        // Группируем по категориям
        const categories = {};
        
        rows.slice(1).forEach(row => { // пропускаем заголовок
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 5) return;
            
            const category = cols[0]?.replace(/"/g, "").trim() || "Разное";
            const name = cols[1]?.replace(/"/g, "").trim();
            const desc = cols[2]?.replace(/"/g, "").trim() || "";
            const priceRaw = cols[3]?.trim() || "0";
            const image = cols[4]?.replace(/"/g, "").trim() || "";
            
            // Обработка цены вида "950/1250" -> берем первое значение
            const price = parseInt(priceRaw.split('/')[0].replace(/\D/g, "")) || 0;
            
            if (!categories[category]) categories[category] = [];
            
            categories[category].push({
                name,
                desc,
                price,
                image
            });
        });
        
        // Рендерим товары по категориям
        container.innerHTML = "";
        
        Object.keys(categories).sort().forEach(category => {
            const categoryDiv = document.createElement("div");
            categoryDiv.className = "category-section";
            
            const categoryTitle = document.createElement("h3");
            categoryTitle.className = "category-title";
            categoryTitle.textContent = category;
            categoryDiv.appendChild(categoryTitle);
            
            const productsGrid = document.createElement("div");
            productsGrid.className = "products-grid";
            
            categories[category].forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                
                const imagePath = product.image 
                    ? assetUrl(`stores/${storeId}/images/${product.image}`)
                    : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='60'%3E📦%3C/text%3E%3C/svg%3E`;
                
                card.innerHTML = `
                    <img src="${imagePath}" 
                         class="product-img" 
                         alt="${product.name}"
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23333\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'60\\'%3E📦%3C/text%3E%3C/svg%3E'">
                    <div class="product-info">
                        <h4 class="product-title">${product.name}</h4>
                        ${product.desc ? `<p class="product-desc">${product.desc}</p>` : ''}
                        <p class="product-price">${formatAmd(product.price)}</p>
                        <div class="product-actions">
                            <button class="btn-add" onclick="addToCart('${storeId}', '${product.name.replace(/'/g, "\\'")}', ${product.price})">
                                В корзину
                            </button>
                        </div>
                    </div>
                `;
                
                productsGrid.appendChild(card);
            });
            
            categoryDiv.appendChild(productsGrid);
            container.appendChild(categoryDiv);
        });
        
    } catch (e) {
        console.error("Ошибка загрузки меню:", e);
        container.innerHTML = `<div style="color: #ff6b6b; padding: 20px;">❌ Не удалось загрузить меню: ${e.message}</div>`;
    }
}

/* =========================================================
   КОРЗИНА
========================================================= */
function addToCart(storeId, productName, price) {
    if (!currentCart[storeId]) {
        currentCart[storeId] = {};
    }
    
    if (!currentCart[storeId][productName]) {
        currentCart[storeId][productName] = { qty: 0, price: price };
    }
    
    currentCart[storeId][productName].qty += 1;
    
    updateCartDisplay();
    showNotification(`${productName} добавлен в корзину`);
}

function updateCartQty(storeId, productName, delta) {
    if (!currentCart[storeId] || !currentCart[storeId][productName]) return;
    
    currentCart[storeId][productName].qty += delta;
    
    if (currentCart[storeId][productName].qty <= 0) {
        delete currentCart[storeId][productName];
        if (Object.keys(currentCart[storeId]).length === 0) {
            delete currentCart[storeId];
        }
    }
    
    updateCartDisplay();
}

function updateCartDisplay() {
    const cartContainer = document.getElementById("cart-items");
    const cartBadge = document.getElementById("cart-badge");
    const itemsTotalEl = document.getElementById("items-total");
    const deliveryEl = document.getElementById("delivery-cost");
    const grandTotalEl = document.getElementById("grand-total");
    
    let totalItems = 0;
    let itemsTotal = 0;
    
    if (!cartContainer) return;
    
    cartContainer.innerHTML = "";
    
    Object.keys(currentCart).forEach(storeId => {
        const store = stores[storeId] || { name: storeId };
        
        const storeSection = document.createElement("div");
        storeSection.className = "cart-store-section";
        
        const storeHeader = document.createElement("h4");
        storeHeader.className = "cart-store-name";
        storeHeader.textContent = store.name;
        storeSection.appendChild(storeHeader);
        
        Object.keys(currentCart[storeId]).forEach(productName => {
            const item = currentCart[storeId][productName];
            totalItems += item.qty;
            itemsTotal += item.qty * item.price;
            
            const itemDiv = document.createElement("div");
            itemDiv.className = "cart-item";
            itemDiv.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-name">${productName}</div>
                    <div class="cart-item-price">${formatAmd(item.price)} × ${item.qty} = ${formatAmd(item.price * item.qty)}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="btn-qty" onclick="updateCartQty('${storeId}', '${productName.replace(/'/g, "\\'")}', -1)">−</button>
                    <span class="qty">${item.qty}</span>
                    <button class="btn-qty" onclick="updateCartQty('${storeId}', '${productName.replace(/'/g, "\\'")}', 1)">+</button>
                </div>
            `;
            storeSection.appendChild(itemDiv);
        });
        
        cartContainer.appendChild(storeSection);
    });
    
    if (totalItems === 0) {
        cartContainer.innerHTML = '<div class="empty-cart">Корзина пуста</div>';
    }
    
    // Обновляем бейдж
    if (cartBadge) {
        if (totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.style.display = "block";
        } else {
            cartBadge.style.display = "none";
        }
    }
    
    // Обновляем итоги
    const district = document.getElementById("district-select")?.value || "Артик";
    const delivery = computeDelivery(district);
    const grandTotal = itemsTotal + delivery;
    
    if (itemsTotalEl) itemsTotalEl.textContent = formatAmd(itemsTotal);
    if (deliveryEl) deliveryEl.textContent = formatAmd(delivery);
    if (grandTotalEl) grandTotalEl.textContent = formatAmd(grandTotal);
}

/* =========================================================
   ОФОРМЛЕНИЕ ЗАКАЗА
========================================================= */
async function submitOrder() {
    const name = document.getElementById("name-input")?.value.trim();
    const phone = document.getElementById("phone-input")?.value.trim();
    const address = document.getElementById("address-input")?.value.trim();
    const district = document.getElementById("district-select")?.value;
    const payment = document.getElementById("payment-select")?.value;
    const comment = document.getElementById("comment-input")?.value.trim();
    
    if (!name || !phone || !address) {
        showNotification("Пожалуйста, заполните все обязательные поля", "error");
        return;
    }
    
    if (Object.keys(currentCart).length === 0) {
        showNotification("Корзина пуста", "error");
        return;
    }
    
    const btn = document.querySelector(".btn-order");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "ОТПРАВЛЯЕМ...";
    }
    
    // Формируем данные заказа
    const products = [];
    Object.keys(currentCart).forEach(storeId => {
        const store = stores[storeId];
        Object.keys(currentCart[storeId]).forEach(productName => {
            const item = currentCart[storeId][productName];
            products.push({
                storeKey: storeId,
                storeName: store?.name || storeId,
                name: productName,
                quantity: item.qty,
                unitPrice: item.price,
                totalPrice: item.qty * item.price
            });
        });
    });
    
    const itemsTotal = products.reduce((sum, p) => sum + p.totalPrice, 0);
    const delivery = computeDelivery(district);
    const grandTotal = itemsTotal + delivery;
    
    const orderData = {
        name,
        phone,
        address,
        district,
        payment,
        comment,
        products,
        totals: {
            itemsTotal,
            delivery,
            grandTotal
        }
    };
    
    try {
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            },
            body: JSON.stringify(orderData)
        });
        
        const result = await response.json();
        
        if (result.ok) {
            showNotification("✅ Заказ успешно отправлен!", "success");
            currentCart = {};
            updateCartDisplay();
            showPage('main');
        } else {
            throw new Error(result.error || "Неизвестная ошибка");
        }
        
    } catch (error) {
        console.error("Ошибка отправки заказа:", error);
        showNotification(`❌ Ошибка: ${error.message}`, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "ПОДТВЕРДИТЬ ЗАКАЗ";
        }
    }
}

/* =========================================================
   НАВИГАЦИЯ
========================================================= */
function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.style.display = "none";
    });
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.style.display = "block";
    }
    
    window.scrollTo(0, 0);
}

function showNotification(message, type = "info") {
    // Простое уведомление через alert
    // Можно заменить на более красивый toast
    alert(message);
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    loadStores();
    
    // Обработчик изменения района для пересчета доставки
    const districtSelect = document.getElementById("district-select");
    if (districtSelect) {
        districtSelect.addEventListener("change", updateCartDisplay);
    }
    
    // Кнопка оформления заказа
    const orderBtn = document.querySelector(".btn-order");
    if (orderBtn) {
        orderBtn.addEventListener("click", submitOrder);
    }
    
    // Кнопки навигации
    document.querySelectorAll("[data-page]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const pageId = e.target.getAttribute("data-page");
            showPage(pageId);
        });
    });
});
