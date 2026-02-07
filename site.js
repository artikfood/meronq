/* =========================================================
   MERONQ — site.js (STABLE VERSION)
   История заказов + Последний заказ + Корзина + Заказы
========================================================= */

const BASE_PATH = window.location.pathname.includes('/meronq/') ? '/meronq/' : '/';
const STORES_INDEX_URL = BASE_PATH + 'stores/index.json';
const WORKER_URL = "https://meronq.edulik844.workers.dev/orders";
const API_KEY = "meronq_Secret_2026!";

/* ================= STATE ================= */
let stores = {};
let cart = {};
let currentStoreId = null;

/* ================= HELPERS ================= */
function asset(p){ return p.startsWith('http') ? p : BASE_PATH + p.replace(/^\//,''); }
function amd(n){ return `${Number(n||0).toLocaleString()} AMD`; }

function computeDelivery(d){
  if(d==="Артик") return 500;
  if(d==="Арич") return 700;
  if(d==="Нор-Кянк") return 1000;
  if(d==="Пемзашен") return 1000;
  return 0;
}

function esc(s){
  return String(s??"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ================= NAV ================= */
function goHome(){
  document.getElementById("home-page")?.classList.remove("hidden");
  document.getElementById("store-page")?.classList.add("hidden");
}
function goBack(){ goHome(); }
function toggleTheme(){ document.body.classList.toggle("light-theme"); }

/* ================= STORES ================= */
async function loadStores(){
  const box = document.getElementById("shops-list");
  const loading = document.getElementById("loading-shops");
  if(!box) return;

  try{
    const r = await fetch(STORES_INDEX_URL,{cache:"no-store"});
    const j = await r.json();
    loading && (loading.style.display="none");
    box.innerHTML="";

    j.stores.forEach(s=>{
      if(!s.enabled) return;
      stores[s.id]=s;
      const d=document.createElement("div");
      d.className="card";
      d.onclick=()=>openStore(s.id);
      d.innerHTML=`<span class="icon">🏪</span><div>${esc(s.name)}</div>`;
      box.appendChild(d);
    });
  }catch(e){
    loading.innerHTML="Ошибка загрузки магазинов";
  }
}

async function openStore(id){
  currentStoreId=id;
  const s=stores[id];
  if(!s) return;

  document.getElementById("home-page")?.classList.add("hidden");
  document.getElementById("store-page")?.classList.remove("hidden");
  document.getElementById("store-title").textContent=s.name;

  const box=document.getElementById("store-products");
  box.innerHTML="Загрузка меню...";

  const r=await fetch(asset(s.menu),{cache:"no-store"});
  const csv=await r.text();
  renderMenu(csv,id);
}

/* ================= MENU ================= */
function renderMenu(csv,id){
  const box=document.getElementById("store-products");
  const lines=csv.split(/\r?\n/).filter(l=>l.trim());
  const cats={};

  lines.slice(1).forEach(l=>{
    const c=l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(x=>x.replace(/^"|"$/g,"").trim());
    const cat=c[0]||"Разное";
    const name=c[1]; if(!name) return;
    const price=parseInt(c[3])||0;
    (cats[cat]??=[]).push({name,price});
  });

  box.innerHTML="";
  Object.keys(cats).forEach(cat=>{
    const h=document.createElement("h3");
    h.textContent=cat;
    box.appendChild(h);

    cats[cat].forEach(p=>{
      const q=getQty(id,p.name);
      const row=document.createElement("div");
      row.className="product";
      row.innerHTML=`
        <div style="flex:1">
          <b>${esc(p.name)}</b><br>
          ${amd(p.price)}
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${id}','${p.name}',-1)">−</button>
          <span class="qty-number">${q}</span>
          <button onclick="addToCart('${id}','${p.name}',${p.price})">+</button>
        </div>`;
      box.appendChild(row);
    });
  });
}

/* ================= CART ================= */
function getQty(id,n){ return cart[id]?.[n]?.q||0; }

function addToCart(id,n,p){
  cart[id]??={};
  cart[id][n]??={q:0,p};
  cart[id][n].q++;
  updateCart();
}

function changeQty(id,n,d){
  if(!cart[id]?.[n]) return;
  cart[id][n].q+=d;
  if(cart[id][n].q<=0) delete cart[id][n];
  updateCart();
}

function updateCart(){
  const box=document.getElementById("global-cart-items");
  let sum=0; box.innerHTML="";
  Object.keys(cart).forEach(id=>{
    Object.keys(cart[id]).forEach(n=>{
      const it=cart[id][n];
      sum+=it.q*it.p;
      box.innerHTML+=`<div>${esc(n)} × ${it.q}</div>`;
    });
  });
  const d=document.getElementById("district")?.value||"";
  document.getElementById("global-cart-total").textContent=`Товары: ${amd(sum)}`;
  document.getElementById("delivery-total").textContent=`Доставка: ${amd(computeDelivery(d))}`;
  document.getElementById("grand-total").textContent=`Итого: ${amd(sum+computeDelivery(d))}`;
}

/* ================= ORDER + HISTORY ================= */

const LS_LAST = "meronq_last_order";
const LS_HISTORY = "meronq_order_history_v1";

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function saveLast(o){
  localStorage.setItem(LS_LAST, JSON.stringify(o));
}

function saveToHistory(o, serverResult){
  const history = safeParse(localStorage.getItem(LS_HISTORY), []);

  const record = {
    id: serverResult?.orderId || null,
    at: new Date().toISOString(),
    name: o.name || "",
    phone: o.phone || "",
    address: o.address || "",
    district: o.district || "",
    payment: o.payment || "",
    comment: o.comment || "",
    totals: o.totals || null,
    products: o.products || []
  };

  history.unshift(record);
  localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, 30)));
}

function fillFromLastOrder(){
  const o = safeParse(localStorage.getItem(LS_LAST), null);
  if(!o) return alert("Нет данных");

  ["name","phone","address","district","payment","comment"].forEach(k=>{
    const el = document.getElementById(k);
    if (el) el.value = o[k] || "";
  });

  // если есть блок карты — синхронизируем видимость
  const paymentSelect = document.getElementById("payment");
  const cardInfo = document.getElementById("card-info");
  if (paymentSelect && cardInfo) {
    cardInfo.style.display = (paymentSelect.value || "").toLowerCase().includes("перевод") ? "block" : "none";
  }
}

// История через твою модалку (#history-modal / #history-list)
function getHistory(){
  return safeParse(localStorage.getItem(LS_HISTORY), []);
}

function showOrderHistory(){
  const modal = document.getElementById("history-modal");
  const list = document.getElementById("history-list");
  if(!modal || !list) return;

  const history = getHistory();
  if(!history.length){
    list.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center">История пуста</div>`;
  } else {
    list.innerHTML = history.map((h, idx) => {
      const dt = new Date(h.at);
      const niceDt = isNaN(dt.getTime()) ? h.at : dt.toLocaleString();
      const grand = h?.totals?.grandTotal ?? null;

      return `
        <div style="
          border:1px solid var(--border-glass);
          background:linear-gradient(180deg,var(--bg-glass),rgba(255,255,255,0.02));
          border-radius:16px;
          padding:12px;
          margin-bottom:10px;
        ">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-weight:700;color:var(--text-main)">
              ${h.id ? `Заказ #${h.id}` : `Заказ`}
            </div>
            <div style="color:var(--text-muted);font-size:13px">${niceDt}</div>
          </div>
          <div style="margin-top:6px;color:var(--text-muted);font-size:13px">
            👤 ${h.name} • 📞 ${h.phone}
          </div>
          <div style="margin-top:4px;color:var(--text-muted);font-size:13px">
            📍 ${h.address} • 🏙 ${h.district} • 💳 ${h.payment}
          </div>
          <div style="margin-top:10px;font-weight:700;color:var(--accent-gold)">
            ${grand != null ? `Итого: ${Number(grand).toLocaleString()} AMD` : ""}
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
            <button onclick="useHistoryOrder(${idx})" style="
              padding:9px 12px;border-radius:999px;
              border:1px solid var(--border-glass);
              background:var(--bg-glass); color:var(--text-main);
              cursor:pointer;font-weight:600
            ">Заполнить форму</button>
          </div>
        </div>
      `;
    }).join("");
  }

  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeOrderHistory(){
  const modal = document.getElementById("history-modal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

function clearOrderHistory(){
  localStorage.removeItem(LS_HISTORY);
  showOrderHistory();
}

function useHistoryOrder(index){
  const history = getHistory();
  const h = history[index];
  if(!h) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("name", h.name);
  setVal("phone", h.phone);
  setVal("address", h.address);
  setVal("district", h.district);
  setVal("payment", h.payment);
  setVal("comment", h.comment);

  closeOrderHistory();
  document.getElementById("cart-page")?.scrollIntoView({ behavior: "smooth" });
}

window.fillFromLastOrder = fillFromLastOrder;
window.showOrderHistory = showOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.clearOrderHistory = clearOrderHistory;
window.useHistoryOrder = useHistoryOrder;

/* ================= ORDER SEND ================= */

async function placeOrder(){
  const o={
    name:name.value,phone:phone.value,address:address.value,
    district:district.value,payment:payment.value,comment:comment.value,
    products:[],totals:{itemsTotal:0,delivery:0,grandTotal:0}
  };

  Object.keys(cart).forEach(id=>{
    Object.keys(cart[id]).forEach(n=>{
      const it=cart[id][n];
      o.products.push({
        storeKey:id,name:n,quantity:it.q,
        unitPrice:it.p,totalPrice:it.q*it.p
      });
      o.totals.itemsTotal+=it.q*it.p;
    });
  });

  o.totals.delivery=computeDelivery(o.district);
  o.totals.grandTotal=o.totals.itemsTotal+o.totals.delivery;

  const r=await fetch(WORKER_URL,{
    method:"POST",
    headers:{'Content-Type':'application/json','x-api-key':API_KEY},
    body:JSON.stringify(o)
  });

  const j=await r.json().catch(()=>({ok:false,error:"Bad JSON"}));
  if(!j.ok) return alert("Ошибка заказа: " + (j.error || "Unknown"));

  // ✅ сохраняем последний заказ + историю
  saveLast(o);
  saveToHistory(o, j);

  cart={}; updateCart(); goHome();
  alert("✅ Заказ отправлен");
}

window.placeOrder = placeOrder;


/* ================= INIT ================= */
/* =======================
   ORDER HISTORY storage
======================= */
const LS_HISTORY_KEY = "meronq_order_history_v1";
const LS_LAST_ORDER_KEY = "meronq_last_order_v1";

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function saveOrderToLocal(orderData, resultFromServer) {
  const record = {
    id: resultFromServer?.orderId || resultFromServer?.id || null,
    at: new Date().toISOString(),
    customer: {
      name: orderData?.name || "",
      phone: orderData?.phone || "",
      address: orderData?.address || "",
      district: orderData?.district || "",
      payment: orderData?.payment || "",
      comment: orderData?.comment || "",
    },
    totals: orderData?.totals || null,
    products: Array.isArray(orderData?.products) ? orderData.products : [],
  };

  // последний заказ
  localStorage.setItem(LS_LAST_ORDER_KEY, JSON.stringify(record));

  // история (до 30)
  const history = safeParse(localStorage.getItem(LS_HISTORY_KEY), []);
  history.unshift(record);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
}

document.addEventListener("DOMContentLoaded",()=>{
  loadStores();
  document.getElementById("district")?.addEventListener("change",updateCart);
});

/* expose */
window.goHome=goHome;
window.goBack=goBack;
window.toggleTheme=toggleTheme;
window.fillFromLastOrder=fillFromLastOrder;
window.placeOrder=placeOrder;
