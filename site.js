/* =========================================================
   MERONQ / ARTIK FOOD — site.js (CATEGORIES FIRST)
   • Магазин → Категории → Товары категории
   • Logos from stores/index.json
   • CSV delimiter autodetect (comma OR semicolon)
   • Image slug from CSV column "image" (no extension)
========================================================= */

const BASE_PATH = location.pathname.includes("/meronq/") ? "/meronq/" : "/";
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";

let stores = {};
let cart = {};

// Меню по магазинам: { storeId: { categories: {cat:[{...}]} } }
let menus = {};
let currentStoreId = null;
let currentCategory = null;

const $ = (id) => document.getElementById(id);

function asset(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : BASE_PATH + path.replace(/^\/+/, "");
}

function amd(n) {
  return `${Number(n || 0).toLocaleString()} AMD`;
}

function deliveryCost(d) {
  return d === "Артик" ? 500 :
         d === "Арич" ? 700 :
         (d === "Нор-Кянк" || d === "Пемзашен") ? 1000 : 0;
}

/* ================= NAV ================= */

function showHome() {
  $("home-page")?.classList.remove("hidden");
  $("store-page")?.classList.add("hidden");
  scrollTo(0, 0);
}

function showStore() {
  $("home-page")?.classList.add("hidden");
  $("store-page")?.classList.remove("hidden");
  scrollTo(0, 0);
}

// Назад: если мы в товарах категории -> назад к категориям, иначе -> на главную
function goBack() {
  if ($("store-page") && !$("store-page").classList.contains("hidden")) {
    if (currentStoreId && currentCategory) {
      showCategories(currentStoreId);
      return;
    }
  }
  showHome();
}

window.goHome = showHome;
window.goBack = goBack;
window.toggleTheme = () => document.body.classList.toggle("light-theme");

// чтобы клики в шапке не ломали сайт
window.showOrderHistory = () => alert("История — скоро");
window.fillFromLastOrder = () => alert("Данные из последнего заказа — скоро");
window.submitReview = () => alert("Отзывы — скоро");

/* ================= STORES ================= */

async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");
  if (!list) return;

  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`stores/index.json HTTP ${r.status}`);
    const data = await r.json();

    if (loading) loading.style.display = "none";
    list.innerHTML = "";

    (data.stores || []).forEach((s) => {
      if (!s?.enabled) return;
      stores[s.id] = s;

      const el = document.createElement("div");
      el.className = "card";
      el.onclick = () => openStore(s.id);

      const logoSrc = asset(s.logo);

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <img src="${logoSrc}"
               alt="${escapeHtml(s.name)}"
               style="width:72px;height:72px;border-radius:16px;object-fit:cover;box-shadow:var(--shadow-soft);background:rgba(0,0,0,0.06)"
               onerror="this.style.display='none'">
          <div style="font-weight:700">${escapeHtml(s.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">
            🕙 ${escapeHtml(s.workingHours?.open || "09:00")} - ${escapeHtml(s.workingHours?.close || "22:00")}
          </div>
        </div>
      `;

      list.appendChild(el);
    });

    if (!list.children.length) {
      list.innerHTML = `<div class="loading">Магазины не найдены</div>`;
    }
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

/* ================= MENU FLOW ================= */

async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  currentStoreId = storeId;
  currentCategory = null;

  showStore();
  $("store-title") && ($("store-title").textContent = store.name);

  $("store-products") && ($("store-products").innerHTML = "");
  $("categories-list") && ($("categories-list").innerHTML = "");
  $("categories-block")?.classList.remove("hidden");

  // Если меню уже загружали — просто показываем категории
  if (menus[storeId]?.categories) {
    showCategories(storeId);
    return;
  }

  // Иначе грузим CSV
  const box = $("store-products");
  if (box) box.innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const menuUrl = asset(store.menu);
    const r = await fetch(menuUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено: ${menuUrl} (HTTP ${r.status})`);
    const csv = await r.text();

    menus[storeId] = { categories: parseMenuToCategories(csv) };

    showCategories(storeId);
  } catch (e) {
    console.error(e);
    if (box) box.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

function showCategories(storeId) {
  currentCategory = null;

  const catBlock = $("categories-block");
  const catList = $("categories-list");
  const productsBox = $("store-products");
  if (!catList || !productsBox) return;

  // показываем категории, очищаем товары
  catBlock?.classList.remove("hidden");
  productsBox.innerHTML = "";

  const cats = Object.keys(menus[storeId]?.categories || {}).sort();
  catList.innerHTML = "";

  if (!cats.length) {
    productsBox.innerHTML = `<div class="loading" style="color:#ff6b6b;">Меню пустое или не распознано</div>`;
    return;
  }

  cats.forEach((cat) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.textAlign = "left";

    const count = (menus[storeId].categories[cat] || []).length;
    card.innerHTML = `
      <div style="font-weight:700">${escapeHtml(cat)}</div>
      <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Товаров: ${count}</div>
    `;
    card.onclick = () => showCategoryProducts(storeId, cat);
    catList.appendChild(card);
  });

  // optional: прокрутка к верху раздела
  scrollTo(0, 0);
}

function showCategoryProducts(storeId, category) {
  currentCategory = category;

  const productsBox = $("store-products");
  const catBlock = $("categories-block");
  if (!productsBox) return;

  // прячем блок категорий (чтобы было чисто)
  catBlock?.classList.add("hidden");

  const items = menus[storeId]?.categories?.[category] || [];
  productsBox.innerHTML = "";

  // Заголовок категории
  const h = document.createElement("h3");
  h.style.margin = "18px 0 8px";
  h.style.color = "var(--accent-gold)";
  h.textContent = category;
  productsBox.appendChild(h);

  if (!items.length) {
    productsBox.innerHTML += `<div class="loading">В этой категории нет товаров</div>`;
    return;
  }

  items.forEach((p) => {
    const base = (p.image || "").trim() || "no-image";
    const jpg = asset(`stores/${storeId}/images/${base}.jpg`);
    const png = asset(`stores/${storeId}/images/${base}.png`);
    const webp = asset(`stores/${storeId}/images/${base}.webp`);

    const safeName = p.name.replace(/'/g, "\\'");

    const row = document.createElement("div");
    row.className = "product";
    row.innerHTML = `
      <img src="${jpg}"
           alt="${escapeHtml(p.name)}"
           onerror="
             if(!this.dataset.step){this.dataset.step='png'; this.src='${png}';}
             else if(this.dataset.step==='png'){this.dataset.step='webp'; this.src='${webp}';}
             else{this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect fill=\\'%23333\\' width=\\'80\\' height=\\'80\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\' font-size=\\'26\\'%3E📦%3C/text%3E%3C/svg%3E';}
           ">
      <div style="flex:1">
        <h4>${escapeHtml(p.name)}</h4>
        <p>${escapeHtml(p.desc || "")}${p.desc ? " • " : ""}${amd(p.price)}</p>
      </div>
      <div class="qty-controls">
        <button onclick="changeQty('${storeId}','${safeName}',-1)">−</button>
        <span class="qty-number">${getQty(storeId, p.name)}</span>
        <button onclick="addToCart('${storeId}','${safeName}',${p.price})">+</button>
      </div>
    `;
    productsBox.appendChild(row);
  });

  updateCart();
  scrollTo(0, 0);
}

/* ================= CSV PARSE ================= */

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line, delim) {
  const re = new RegExp(`${escapeRegExp(delim)}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line
    .split(re)
    .map((v) => (v ?? "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim());
}

// returns {cat:[{name,desc,price,image}]}
function parseMenuToCategories(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return {};

  const delim = detectDelimiter(lines[0]);
  const categories = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);

    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const imageSlug = (cols[4] || "").trim(); // без расширения

    if (!name) continue;

    const price = parseInt(String(priceRaw).split("/")[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({
      name,
      desc,
      price,
      image: imageSlug,
    });
  }

  return categories;
}

/* ================= CART ================= */

function getQty(storeId, name) {
  return cart?.[storeId]?.[name]?.q || 0;
}

function addToCart(storeId, name, price) {
  cart[storeId] ||= {};
  cart[storeId][name] ||= { q: 0, p: price };
  cart[storeId][name].q++;
  updateCart();
}

function changeQty(storeId, name, delta) {
  const item = cart?.[storeId]?.[name];
  if (!item) return;
  item.q += delta;
  if (item.q <= 0) delete cart[storeId][name];
  if (Object.keys(cart[storeId]).length === 0) delete cart[storeId];
  updateCart();
}

function updateCart() {
  const box = $("global-cart-items");
  if (!box) return;

  box.innerHTML = "";
  let sum = 0;

  for (const sid of Object.keys(cart)) {
    const storeName = stores[sid]?.name || sid;

    const header = document.createElement("div");
    header.style.margin = "12px 0 6px";
    header.style.fontWeight = "700";
    header.style.color = "var(--accent-gold)";
    header.textContent = storeName;
    box.appendChild(header);

    for (const name of Object.keys(cart[sid])) {
      const it = cart[sid][name];
      sum += it.q * it.p;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div style="flex:1;text-align:left;">
          <div style="font-weight:600;">${escapeHtml(name)}</div>
          <span>${amd(it.p)} × ${it.q} = ${amd(it.p * it.q)}</span>
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${sid}','${name.replace(/'/g,"\\'")}',-1)">−</button>
          <span class="qty-number">${it.q}</span>
          <button onclick="addToCart('${sid}','${name.replace(/'/g,"\\'")}',${it.p})">+</button>
        </div>
      `;
      box.appendChild(row);
    }
  }

  if (!Object.keys(cart).length) {
    box.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Корзина пуста</p>`;
  }

  const district = $("district")?.value || "";
  const d = deliveryCost(district);

  $("global-cart-total") && ($("global-cart-total").textContent = `Товары: ${amd(sum)}`);
  $("delivery-total") && ($("delivery-total").textContent = `Доставка: ${amd(d)}`);
  $("grand-total") && ($("grand-total").textContent = `Итого: ${amd(sum + d)}`);
}

/* ================= UTILS ================= */

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {
  showHome();
  loadStores();
  $("district")?.addEventListener("change", updateCart);
});

window.openStore = openStore;
window.addToCart = addToCart;
window.changeQty = changeQty;

// HTML calls this
window.placeOrder = () => alert("Отправка заказа — подключим следующим шагом");
