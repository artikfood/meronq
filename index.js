// Cloudflare Worker — Meronq (Artik Food)
// KV namespace: ORDERS_KV
// Env: BOT_TOKEN, API_KEY, ADMIN_CHAT_ID, COURIERS_CHAT_ID, STORE_CHAT_MAP_JSON

function json(res, status = 200) {
  return new Response(JSON.stringify(res, null, 2), {
    status,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key"
    },
  });
}

function text(res, status = 200) {
  return new Response(res, {
    status,
    headers: { 
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
  });
}

function requireApiKey(req, env) {
  const key = req.headers.get("x-api-key") || "";
  return key && env.API_KEY && key === env.API_KEY;
}

function nowIso() {
  return new Date().toISOString();
}

function safeParseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function makeOrderId() {
  return "ord_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function formatAmd(n) {
  return `${Number(n || 0)} AMD`;
}

function computeDelivery(district) {
  if (district === "Артик") return 500;
  if (district === "Арич") return 700;
  if (district === "Нор-Кянк") return 1000;
  if (district === "Пемзашен") return 1000;
  return 0;
}

function extractStoresFromCarts(carts) {
  const storeKeys = [];
  if (!carts || typeof carts !== "object") return storeKeys;
  for (const storeKey of Object.keys(carts)) {
    const bag = carts[storeKey];
    if (!bag || typeof bag !== "object") continue;
    const hasItems = Object.values(bag).some(qty => Number(qty) > 0);
    if (hasItems) storeKeys.push(storeKey);
  }
  return storeKeys;
}

function buildItemsByStore(storesCatalog, carts, productsArray) {
  if (productsArray && Array.isArray(productsArray) && productsArray.length > 0) {
    const result = {};
    for (const prod of productsArray) {
      const sk = prod.storeKey || "";
      if (!sk) continue;
      if (!result[sk]) result[sk] = [];
      result[sk].push({
        name: prod.name || "?",
        qty: Number(prod.quantity || 0),
        price: Number(prod.unitPrice || 0),
      });
    }
    return result;
  }

  const result = {};
  if (!carts || typeof carts !== "object") return result;
  for (const storeKey of Object.keys(carts)) {
    const bag = carts[storeKey];
    if (!bag || typeof bag !== "object") continue;
    const items = [];
    for (const productName of Object.keys(bag)) {
      const qty = Number(bag[productName] || 0);
      if (qty <= 0) continue;
      let price = null;
      if (storesCatalog && storesCatalog[storeKey] && Array.isArray(storesCatalog[storeKey].products)) {
        const p = storesCatalog[storeKey].products.find(x => x.name === productName);
        if (p && typeof p.price === "number") price = p.price;
      }
      items.push({ name: productName, qty, price });
    }
    if (items.length) result[storeKey] = items;
  }
  return result;
}

function sumItems(itemsByStore) {
  let total = 0;
  for (const storeKey of Object.keys(itemsByStore)) {
    for (const it of itemsByStore[storeKey]) {
      if (typeof it.price === "number") total += it.price * it.qty;
    }
  }
  return total;
}

function storeKeyToHuman(storeKey, storeNameMap) {
  return (storeNameMap && storeNameMap[storeKey]) ? storeNameMap[storeKey] : storeKey;
}

async function tgCall(env, method, payload) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) return { ok: false, status: r.status, data };
  return { ok: true, data };
}

function buildAdminText(order, storeNameMap) {
  const stores = order.storeKeys.map(k => `• ${storeKeyToHuman(k, storeNameMap)}`).join("\n");
  const lines = [];
  lines.push(`🛒 *Новый заказ №${order.id.slice(-6)}*`);
  lines.push(`🕒 ${order.createdAtIso}`);
  lines.push(``);
  lines.push(`👤 ${order.customer.name}`);
  lines.push(`📞 ${order.customer.phone}`);
  lines.push(`📍 ${order.customer.address}`);
  lines.push(`🏘 ${order.customer.district || "-"}`);
  lines.push(`💳 ${order.customer.payment || "-"}`);
  if (order.customer.comment) lines.push(`📝 ${order.customer.comment}`);
  lines.push(``);
  lines.push(`🏪 Магазины:\n${stores}`);
  lines.push(``);
  for (const sk of Object.keys(order.itemsByStore)) {
    lines.push(`*${storeKeyToHuman(sk, storeNameMap)}:*`);
    for (const it of order.itemsByStore[sk]) {
      if (typeof it.price === "number" && it.price > 0) {
        lines.push(`  • ${it.name} × ${it.qty} = ${formatAmd(it.price * it.qty)}`);
      } else {
        lines.push(`  • ${it.name} × ${it.qty}`);
      }
    }
  }
  lines.push(``);
  lines.push(`💰 *Итого: ${formatAmd(order.grandTotal)}*`);
  return lines.join("\n");
}

function buildStoreText(order, storeKey, storeNameMap) {
  const items = order.itemsByStore[storeKey] || [];
  const lines = [];
  lines.push(`🏪 *Заказ №${order.id.slice(-6)}*`);
  lines.push(`🕒 ${order.createdAtIso}`);
  lines.push(`📍 ${order.customer.district}, ${order.customer.address}`);
  lines.push(``);
  for (const it of items) {
    if (typeof it.price === "number" && it.price > 0) {
      lines.push(`• ${it.name} × ${it.qty} = ${formatAmd(it.price * it.qty)}`);
    } else {
      lines.push(`• ${it.name} × ${it.qty}`);
    }
  }
  return lines.join("\n");
}

function buildCourierText(order, storeNameMap) {
  const stores = order.storeKeys.map(k => storeKeyToHuman(k, storeNameMap)).join(", ");
  const lines = [];
  lines.push(`🚴 *Заказ №${order.id.slice(-6)}*`);
  lines.push(`📍 ${order.customer.district}, ${order.customer.address}`);
  lines.push(`📞 ${order.customer.phone}`);
  lines.push(`🏪 ${stores}`);
  lines.push(`💰 ${formatAmd(order.grandTotal)}`);
  return lines.join("\n");
}

function kbForAdmin(orderId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Оплата подтверждена", callback_data: `o:${orderId}:payment_ok` },
        { text: "❌ Отменить", callback_data: `o:${orderId}:cancel` },
      ],
    ],
  };
}

function kbForStore(orderId, storeKey) {
  return {
    inline_keyboard: [
      [{ text: "🍳 Готовим", callback_data: `o:${orderId}:preparing:${storeKey}` }],
      [{ text: "✅ Собрано", callback_data: `o:${orderId}:ready:${storeKey}` }],
    ],
  };
}

function kbForCourier(orderId) {
  return {
    inline_keyboard: [
      [{ text: "🚚 Принял заказ", callback_data: `o:${orderId}:accepted` }],
      [{ text: "🚗 Еду к клиенту", callback_data: `o:${orderId}:onway` }],
      [{ text: "📦 Доставлено", callback_data: `o:${orderId}:delivered` }],
    ],
  };
}

async function saveOrder(env, order) {
  await env.ORDERS_KV.put(`order:${order.id}`, JSON.stringify(order));
  const idxRaw = await env.ORDERS_KV.get("order:index");
  const idx = safeParseJson(idxRaw || "[]", []);
  idx.unshift({ id: order.id, createdAt: order.createdAt, status: order.status });
  await env.ORDERS_KV.put("order:index", JSON.stringify(idx.slice(0, 200)));
}

async function loadOrder(env, id) {
  const raw = await env.ORDERS_KV.get(`order:${id}`);
  if (!raw) return null;
  return safeParseJson(raw, null);
}

async function updateOrder(env, id, patchFn) {
  const order = await loadOrder(env, id);
  if (!order) return null;
  const updated = patchFn(order) || order;
  await env.ORDERS_KV.put(`order:${id}`, JSON.stringify(updated));
  const idxRaw = await env.ORDERS_KV.get("order:index");
  const idx = safeParseJson(idxRaw || "[]", []);
  for (const row of idx) {
    if (row.id === id) row.status = updated.status;
  }
  await env.ORDERS_KV.put("order:index", JSON.stringify(idx));
  return updated;
}

async function notifyAll(env, order, storeChatMap, storeNameMap) {
  // Админ
  await tgCall(env, "sendMessage", {
    chat_id: env.ADMIN_CHAT_ID,
    text: buildAdminText(order, storeNameMap),
    parse_mode: "Markdown",
    reply_markup: kbForAdmin(order.id),
  });

  // Магазины
  for (const sk of order.storeKeys) {
    const chatId = storeChatMap[sk];
    if (!chatId) continue;
    await tgCall(env, "sendMessage", {
      chat_id: chatId,
      text: buildStoreText(order, sk, storeNameMap),
      parse_mode: "Markdown",
      reply_markup: kbForStore(order.id, sk),
    });
  }

  // Курьеры
  await tgCall(env, "sendMessage", {
    chat_id: env.COURIERS_CHAT_ID,
    text: buildCourierText(order, storeNameMap),
    parse_mode: "Markdown",
    reply_markup: kbForCourier(order.id),
  });
}

function ensureEnv(env) {
  const missing = [];
  for (const k of ["BOT_TOKEN","API_KEY","ADMIN_CHAT_ID","COURIERS_CHAT_ID","STORE_CHAT_MAP_JSON"]) {
    if (!env[k]) missing.push(k);
  }
  return missing;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key"
        }
      });
    }

    if (url.pathname === "/") {
      const missing = ensureEnv(env);
      return text(missing.length ? `OK, but missing: ${missing.join(", ")}` : "OK");
    }

    if (url.pathname === "/tg/webhook" && req.method === "POST") {
      const update = await req.json().catch(() => null);
      if (!update) return json({ ok: true });

      if (update.callback_query) {
        const cq = update.callback_query;
        const data = cq.data || "";
        const parts = data.split(":");
        
        if (parts[0] === "o" && parts[1]) {
          const orderId = parts[1];
          const action = parts[2] || "";
          const storeKey = parts[3] || "";

          const storeChatMap = safeParseJson(env.STORE_CHAT_MAP_JSON, {});
          const storeNameMap = {};

          let newOrder = await updateOrder(env, orderId, (o) => {
            if (!o.history) o.history = [];
            const stamp = { at: nowIso(), by: cq.from?.username || cq.from?.id || "?", action };

            if (action === "payment_ok") {
              o.status = "PAYMENT_OK";
              o.history.push(stamp);
            } else if (action === "cancel") {
              o.status = "CANCELLED";
              o.history.push(stamp);
            } else if (action === "preparing") {
              o.status = "PREPARING";
              o.history.push(stamp);
            } else if (action === "ready") {
              o.status = "READY";
              o.history.push(stamp);
            } else if (action === "accepted") {
              o.status = "ACCEPTED";
              o.history.push(stamp);
            } else if (action === "onway") {
              o.status = "ON_WAY";
              o.history.push(stamp);
            } else if (action === "delivered") {
              o.status = "DELIVERED";
              o.history.push(stamp);
            }
            return o;
          });

          await tgCall(env, "answerCallbackQuery", {
            callback_query_id: cq.id,
            text: "✅ Принято",
          });

          if (newOrder) {
            // Уведомление админу об обновлении
            const emoji = {
              'PAYMENT_OK': '✅',
              'CANCELLED': '❌',
              'PREPARING': '🍳',
              'READY': '📦',
              'ACCEPTED': '🚚',
              'ON_WAY': '🚗',
              'DELIVERED': '✅'
            };
            
            await tgCall(env, "sendMessage", {
              chat_id: env.ADMIN_CHAT_ID,
              text: `${emoji[newOrder.status] || '📋'} Заказ №${newOrder.id.slice(-6)}\nСтатус: *${newOrder.status}*`,
              parse_mode: "Markdown",
            });
          }

          return json({ ok: true });
        }
      }

      return json({ ok: true });
    }

    if (url.pathname === "/orders" && req.method === "POST") {
      if (!requireApiKey(req, env)) return json({ error: "Unauthorized" }, 401);

      const missing = ensureEnv(env);
      if (missing.length) return json({ error: "Missing env vars", missing }, 500);

      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "Bad JSON" }, 400);

      const customer = {
        name: String(body.name || "").trim(),
        phone: String(body.phone || "").trim(),
        address: String(body.address || "").trim(),
        district: String(body.district || "").trim(),
        payment: String(body.payment || "").trim(),
        comment: String(body.comment || "").trim(),
      };
      if (!customer.name || !customer.phone || !customer.address) {
        return json({ error: "Missing required fields" }, 400);
      }

      const carts = body.carts || {};
      const storeKeys = extractStoresFromCarts(carts);
      if (!storeKeys.length) return json({ error: "Empty cart" }, 400);

      const productsArray = body.products || null;
      const storesCatalog = body.storesCatalog || null;
      const itemsByStore = buildItemsByStore(storesCatalog, carts, productsArray);

      const itemsTotal = sumItems(itemsByStore);
      const delivery = computeDelivery(customer.district);
      const grandTotal = itemsTotal + delivery;

      const order = {
        id: makeOrderId(),
        createdAt: Date.now(),
        createdAtIso: nowIso(),
        status: "NEW",
        customer,
        carts,
        itemsByStore,
        storeKeys,
        itemsTotal,
        delivery,
        grandTotal,
        history: [{ at: nowIso(), by: "site", action: "created" }],
      };

      await saveOrder(env, order);

      const storeChatMap = safeParseJson(env.STORE_CHAT_MAP_JSON, {});
      const storeNameMap = {};

      ctx.waitUntil(notifyAll(env, order, storeChatMap, storeNameMap));

      return json({ ok: true, id: order.id });
    }

    if (url.pathname === "/orders" && req.method === "GET") {
      if (!requireApiKey(req, env)) return json({ error: "Unauthorized" }, 401);
      const idxRaw = await env.ORDERS_KV.get("order:index");
      const idx = safeParseJson(idxRaw || "[]", []);
      return json({ ok: true, orders: idx });
    }

    if (url.pathname.startsWith("/orders/") && req.method === "GET") {
      if (!requireApiKey(req, env)) return json({ error: "Unauthorized" }, 401);
      const id = url.pathname.split("/")[2] || "";
      const order = await loadOrder(env, id);
      if (!order) return json({ error: "Not found" }, 404);
      return json({ ok: true, order });
    }

    return json({ error: "Not found" }, 404);
  },
};
