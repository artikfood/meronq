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
const LS_LAST="meronq_last_order";

function saveLast(o){ localStorage.setItem(LS_LAST,JSON.stringify(o)); }

function fillFromLastOrder(){
  const o=JSON.parse(localStorage.getItem(LS_LAST)||"null");
  if(!o) return alert("Нет данных");
  ["name","phone","address","district","payment","comment"].forEach(k=>{
    document.getElementById(k).value=o[k]||"";
  });
}

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
  const j=await r.json();
  if(!j.ok) return alert("Ошибка");

  saveLast(o);
  cart={}; updateCart(); goHome();
  alert("✅ Заказ отправлен");
}

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
