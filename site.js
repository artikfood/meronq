/* =========================================================
   MERONQ / ARTIK FOOD — site.js (STABLE ARCHITECTURE)
   • image slug from CSV
   • no filename guessing
   • no кириллицы в путях
========================================================= */

const BASE_PATH = location.pathname.includes("/meronq/") ? "/meronq/" : "/";
const STORES_INDEX_URL = BASE_PATH + "stores/index.json";
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

let stores = {};
let cart = {};

/* ================= HELPERS ================= */

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
         d === "Нор-Кянк" || d === "Пемзашен" ? 1000 : 0;
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

/* ================= STORES ================= */

async function loadStores() {
  const list = $("shops-list");
  const loading = $("loading-shops");

  try {
    const r = await fetch(STORES_INDEX_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("stores index not found");
    const data = await r.json();

    loading.style.display = "none";
    list.innerHTML = "";

    data.stores.forEach(s => {
      if (!s.enabled) return;
      stores[s.id] = s;

      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <span class="icon">🏪</span>
        <div>${s.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">
          🕙 ${s.workingHours?.open || "09:00"} - ${s.workingHours?.close || "22:00"}
        </div>`;
      el.onclick = () => openStore(s.id);
      list.appendChild(el);
    });

  } catch (e) {
    loading.innerHTML = "❌ Ошибка загрузки магазинов";
    console.error(e);
  }
}

/* ================= MENU ================= */

async function openStore(storeId) {
  const store = stores[storeId];
  if (!store) return;

  showStore();
  $("store-title").textContent = store.name;
  $("store-products").innerHTML = `<div class="loading">Загрузка меню…</div>`;

  try {
    const r = await fetch(asset(store.menu), { cache: "no-store" });
    if (!r.ok) throw new Error("menu not found");
    const csv = await r.text();
    renderMenu(csv, storeId);
  } catch (e) {
    $("store-products").innerHTML = "❌ Ошибка меню";
    console.error(e);
  }
}

function renderMenu(csv, storeId) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return;

  const categories = {};
  for (let i = 1; i < lines.length; i++) {
    const [cat, name, desc, priceRaw, image] =
      lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
              .map(v => v?.replace(/^"|"$/g, "").trim());

    if (!name) continue;
    const price = parseInt(priceRaw?.replace(/\D/g, ""), 10) || 0;

    (categories[cat || "Разное"] ||= []).push({
      name, desc, price, image
    });
  }

  const box = $("store-products");
  box.innerHTML = "";

  Object.keys(categories).sort().forEach(cat => {
    box.innerHTML += `<h3 style="color:var(--accent-gold)">${cat}</h3>`;

    categories[cat].forEach(p => {
      const base = p.image || "no-image";
      const jpg = asset(`stores/${storeId}/images/${base}.jpg`);
      const png = asset(`stores/${storeId}/images/${base}.png`);
      const webp = asset(`stores/${storeId}/images/${base}.webp`);

      const safe = p.name.replace(/'/g, "\\'");

      const el = document.createElement("div");
      el.className = "product";
      el.innerHTML = `
        <img src="${jpg}"
             onerror="
              if(!this.dataset.try){this.dataset.try=1;this.src='${png}';}
              else if(this.dataset.try==1){this.dataset.try=2;this.src='${webp}';}
              else{this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\'%3E%3Crect fill=\\'%23333\\' width=\\'80\\' height=\\'80\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\' font-size=\\'26\\'%3E📦%3C/text%3E%3C/svg%3E';}
             ">
        <div style="flex:1">
          <h4>${p.name}</h4>
          <p>${p.desc || ""} • ${amd(p.price)}</p>
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${storeId}','${safe}',-1)">−</button>
          <span>${getQty(storeId,p.name)}</span>
          <button onclick="add('${storeId}','${safe}',${p.price})">+</button>
        </div>`;
      box.appendChild(el);
    });
  });

  updateCart();
}

/* ================= CART ================= */

function getQty(s,n){ return cart?.[s]?.[n]?.q || 0; }

function add(s,n,p){
  cart[s] ||= {};
  cart[s][n] ||= { q:0, p };
  cart[s][n].q++;
  updateCart();
}

function changeQty(s,n,d){
  if(!cart[s]?.[n]) return;
  cart[s][n].q+=d;
  if(cart[s][n].q<=0) delete cart[s][n];
  updateCart();
}

function updateCart(){
  const box=$("global-cart-items");
  if(!box) return;
  box.innerHTML="";
  let sum=0;

  for(const s in cart){
    box.innerHTML+=`<h4>${stores[s]?.name||s}</h4>`;
    for(const n in cart[s]){
      const i=cart[s][n];
      sum+=i.q*i.p;
      box.innerHTML+=`<div class="cart-item">${n} — ${i.q} × ${amd(i.p)}</div>`;
    }
  }

  const d=deliveryCost($("district")?.value);
  $("global-cart-total").textContent=`Товары: ${amd(sum)}`;
  $("delivery-total").textContent=`Доставка: ${amd(d)}`;
  $("grand-total").textContent=`Итого: ${amd(sum+d)}`;
}

window.add=add;
window.changeQty=changeQty;

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",()=>{
  showHome();
  loadStores();
  $("district")?.addEventListener("change",updateCart);
});
