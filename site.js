/* =========================================================
   MERONQ / ARTIK FOOD — site.js (STABLE + LOGOS + CSV ;/,)
   • Logos from stores/index.json
   • CSV delimiter autodetect (comma OR semicolon)
   • Image slug from CSV column "image" (no extension)
========================================================= */

const BASE_PATH = location.pathname.includes("/meronq/") ? "/meronq/" : "/";
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let cart = {};

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

window.goHome = showHome;
window.goBack = showHome;
window.toggleTheme = () => document.body.classList.toggle("light-theme");

/* (не ломаем клики в шапке) */
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

/* ================= MENU ================= */

async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  showStore();
  $("store-title") && ($("store-title").textContent = store.name);

  const box = $("store-products");
  if (!box) return;
  box.innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const menuUrl = asset(store.menu);
    const r = await fetch(menuUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`Меню не найдено: ${menuUrl} (HTTP ${r.status})`);
    const csv = await r.text();
    renderMenu(csv, storeId);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="loading" style="color:#ff6b6b;">❌ ${e.message}</div>`;
  }
}

/* ---- CSV parsing that supports , OR ; and quoted fields ---- */

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  // если в файле больше ; чем , (часто после Excel) — берём ;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line, delim) {
  // split by delimiter that is NOT inside quotes
  const re = new RegExp(`${escapeRegExp(delim)}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line.split(re).map((v) => (v ?? "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim());
}

function renderMenu(csvText, storeId) {
  const box = $("store-products");
  if (!box) return;

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    box.innerHTML = `<div class="loading">Меню пустое</div>`;
    return;
  }

  const delim = detectDelimiter(lines[0]);
  const categories = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);

    // ожидаем: category,name,description,price,image
    const category = cols[0] || "Разное";
    const name = cols[1] || "";
    const desc = cols[2] || "";
    const priceRaw = cols[3] || "0";
    const imageSlug = (cols[4] || "").trim(); // без расширения

    if (!name) continue;
    const price = parseInt(String(priceRaw).split("/")[0].replace(/[^\d]/g, ""), 10) || 0;

    (categories[category] ||= []).push({ name, desc, price, image: imageSlug });
  }

  box.innerHTML = "";

  const cats = Object.keys(categories).sort();
  if (!cats.length) {
    box.innerHTML = `<div class="loading" style="color:#ff6b6b;">
      Меню прочиталось, но товары не распознаны.<br>
      Проверь CSV: 5 колонок (category;name;description;price;image) и чтобы разделитель был одинаковый.
    </div>`;
    return;
  }

  cats.forEach((cat) => {
    const h = document.createElement("h3");
    h.style.margin = "18px 0 8px";
    h.style.color = "var(--accent-gold)";
    h.textContent = cat;
    box.appendChild(h);

    categories[cat].forEach((p) => {
      const base = p.image || "no-image"; // slug без расширения
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
      box.appendChild(row);
    });
  });

  updateCart();
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

/* ================= ORDER (placeholder) ================= */

async function submitOrder() {
  alert("Отправка заказа — подключим следующим шагом");
}
window.placeOrder = () => submitOrder();

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
