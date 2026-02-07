// Cloudflare Worker — Meronq / ArtikFood dispatcher (Telegram + KV)

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-api-key",
    };

    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // ========== Health ==========
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, ts: new Date().toISOString() }, 200, cors);
    }

    // ========== Debug config (protected) ==========
    // GET /debug-config  (только если ключ верный)
    if (request.method === "GET" && url.pathname === "/debug-config") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, 401, cors);
      }
      return json(
        {
          ok: true,
          hasBOT_TOKEN: !!env.BOT_TOKEN,
          hasAPI_KEY: !!env.API_KEY,
          hasADMIN_CHAT_ID: !!env.ADMIN_CHAT_ID,
          hasCOURIERS_CHAT_ID: !!env.COURIERS_CHAT_ID,
          storeMapKeys: Object.keys(safeJsonParse(env.STORE_CHAT_MAP_JSON, {})),
        },
        200,
        cors
      );
    }

    // ========== Telegram webhook ==========
    if (
      request.method === "POST" &&
      (url.pathname === "/tg-webhook" || url.pathname === "/tg/webhook")
    ) {
      const update = await request.json().catch(() => null);
      if (update) ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("ok", { status: 200, headers: cors });
    }

    // ========== Create order from site ==========
    if (request.method === "POST" && url.pathname === "/orders") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, 401, cors);
      }

      const orderIn = await request.json().catch(() => null);
      if (!orderIn) return json({ ok: false, error: "Bad JSON" }, 400, cors);

      try {
        const created = await createOrder(orderIn, env);
        return json({ ok: true, orderId: created.id }, 200, cors);
      } catch (e) {
        console.log("createOrder error", e);
        return json({ ok: false, error: "Create order failed" }, 500, cors);
      }
    }

    // ========== Read status for site sync ==========
    if (request.method === "GET" && url.pathname === "/order-status") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, 401, cors);
      }

      const id = url.searchParams.get("id") || "";
      if (!id) return json({ ok: false, error: "Missing id" }, 400, cors);

      const order = await loadOrder(id, env);
      if (!order) return json({ ok: false, error: "Not found" }, 404, cors);

      return json(
        { ok: true, id: order.id, status: order.status, updatedAt: order.updatedAt },
        200,
        cors
      );
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};

/* =========================================================
   AUTH (FIXED)
========================================================= */

function isAuthorized(request, env) {
  const keyFromClient = (request.headers.get("x-api-key") || "").trim();
  const keyFromEnv = String(env.API_KEY || "").trim(); // может быть secret или variable

  // если ключ в env не задан — это конфигурационная ошибка, но НЕ принимаем запросы
  if (!keyFromEnv) return false;

  return keyFromClient && keyFromClient === keyFromEnv;
}

/* =========================================================
   HELPERS
========================================================= */

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...(cors || {}), "Content-Type": "application/json" },
  });
}

const STATUS = {
  new: "new",
  payment_confirmed: "payment_confirmed",
  preparing: "preparing",
  assembled: "assembled",
  picked: "picked",
  on_the_way: "on_the_way",
  delivered: "delivered",
};

const STATUS_LABEL = {
  [STATUS.new]: "🆕 Новый заказ",
  [STATUS.payment_confirmed]: "✅ Оплата подтверждена",
  [STATUS.preparing]: "🧺 Собираем заказ",
  [STATUS.assembled]: "📦 Заказ собран",
  [STATUS.picked]: "🛵 Курьер забрал заказ",
  [STATUS.on_the_way]: "🚗 В пути",
  [STATUS.delivered]: "🎉 Доставлено",
};

function normalizePayment(p) {
  const s = String(p || "").toLowerCase();
  if (s.includes("перевод")) return "Перевод";
  return "Наличные";
}

function nowIso() {
  return new Date().toISOString();
}

function orderKey(id) {
  return `order:${id}`;
}

async function loadOrder(id, env) {
  const raw = await env.ORDERS_KV.get(orderKey(id));
  return raw ? JSON.parse(raw) : null;
}

async function saveOrder(order, env) {
  await env.ORDERS_KV.put(orderKey(order.id), JSON.stringify(order));
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function getStoreKeysFromProducts(products) {
  return uniq((products || []).map((p) => p.storeKey).filter(Boolean));
}

function formatProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return "-";
  return products
    .map((p) => {
      const unit = Number(p.unitPrice ?? 0);
      const qty = Number(p.quantity ?? 0);
      const total = Number(p.totalPrice ?? unit * qty);
      const store = p.storeName || p.storeKey || "";
      return `• ${p.name} × ${qty} — ${total} AMD (${store})`;
    })
    .join("\n");
}

/* =========================================================
   TELEGRAM API (MarkdownV2)
========================================================= */

async function tgCall(method, env, payload) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) console.log("TG error", method, data);
  return data;
}

async function tgSendMessage(env, chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgCall("sendMessage", env, payload);
}

async function tgAnswerCallback(env, callbackQueryId, text = "✅") {
  return tgCall("answerCallbackQuery", env, {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

function escapeMd(s) {
  return String(s ?? "").replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/* =========================================================
   BUTTONS
========================================================= */

function kbAdminTransferConfirm(orderId) {
  return {
    inline_keyboard: [[{ text: "✅ Подтвердить перевод", callback_data: `confirm_payment:${orderId}` }]],
  };
}

function kbStore(orderId) {
  return {
    inline_keyboard: [
      [
        { text: "🧺 Собираем заказ", callback_data: `set_status:${orderId}:${STATUS.preparing}` },
        { text: "📦 Заказ собран", callback_data: `set_status:${orderId}:${STATUS.assembled}` },
      ],
    ],
  };
}

function kbCourier(orderId) {
  return {
    inline_keyboard: [
      [
        { text: "🛵 Забрать заказ", callback_data: `set_status:${orderId}:${STATUS.picked}` },
        { text: "🚗 В пути", callback_data: `set_status:${orderId}:${STATUS.on_the_way}` },
      ],
      [{ text: "🎉 Доставлено", callback_data: `set_status:${orderId}:${STATUS.delivered}` }],
    ],
  };
}

/* =========================================================
   ORDER FLOW
========================================================= */

async function createOrder(orderIn, env) {
  const id = (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString());
  const paymentNorm = normalizePayment(orderIn.payment);

  const storeChatMap = safeJsonParse(env.STORE_CHAT_MAP_JSON, {});
  const products = Array.isArray(orderIn.products) ? orderIn.products : [];
  const storeKeys = getStoreKeysFromProducts(products);

  const order = {
    id,
    createdAt: orderIn.createdAt || nowIso(),
    updatedAt: nowIso(),
    status: STATUS.new,
    payment: paymentNorm,
    customer: {
      name: orderIn.name || "",
      phone: orderIn.phone || "",
      address: orderIn.address || "",
      district: orderIn.district || "",
      comment: orderIn.comment || "",
    },
    totals: orderIn.totals || null,
    products,
    storeKeys,
    history: [{ at: nowIso(), status: STATUS.new, by: "site" }],
  };

  await saveOrder(order, env);

  if (env.ADMIN_CHAT_ID && (!storeKeys || storeKeys.length === 0)) {
    await tgSendMessage(
      env,
      env.ADMIN_CHAT_ID,
      escapeMd(`⚠️ У заказа #${order.id} не найден storeKey в products.\nПроверь products[].storeKey`)
    );
  }

  const text =
    `*${escapeMd(STATUS_LABEL[STATUS.new])}*  \\#${escapeMd(order.id)}\n\n` +
    `👤 *${escapeMd(order.customer.name)}*\n` +
    `📞 ${escapeMd(order.customer.phone)}\n` +
    `📍 ${escapeMd(order.customer.address)}\n` +
    `🏙 Район: ${escapeMd(order.customer.district)}\n` +
    `💳 Оплата: *${escapeMd(order.payment)}*\n` +
    (order.customer.comment ? `💬 ${escapeMd(order.customer.comment)}\n` : "") +
    `\n🛒 Товары:\n${escapeMd(formatProducts(order.products))}\n\n` +
    `💰 Итого: *${escapeMd(order.totals?.grandTotal ?? "-")} AMD*`;

  if (env.ADMIN_CHAT_ID) {
    if (order.payment === "Перевод") {
      await tgSendMessage(env, env.ADMIN_CHAT_ID, text + "\n\n" + escapeMd("⚠️ Требуется подтверждение перевода."), kbAdminTransferConfirm(order.id));
    } else {
      await tgSendMessage(env, env.ADMIN_CHAT_ID, text);
    }
  }

  if (order.payment === "Наличные") {
    await notifyStoresNewOrder(order, env, storeChatMap);
    await notifyCouriersNewOrder(order, env);
  }

  return order;
}

async function notifyStoresNewOrder(order, env, storeChatMap) {
  for (const sk of order.storeKeys || []) {
    const chatId = storeChatMap[sk];

    if (!chatId) {
      if (env.ADMIN_CHAT_ID) {
        await tgSendMessage(env, env.ADMIN_CHAT_ID, escapeMd(`⚠️ Магазин не найден в STORE_CHAT_MAP_JSON\nstoreKey: "${sk}"\norderId: #${order.id}`));
      }
      continue;
    }

    const storeOnlyProducts = (order.products || []).filter((p) => p.storeKey === sk);

    const text =
      `🛒 *${escapeMd("Новый заказ")}*  \\#${escapeMd(order.id)}\n` +
      `💳 Оплата: *${escapeMd(order.payment)}*\n\n` +
      `👤 ${escapeMd(order.customer.name)}\n` +
      `📞 ${escapeMd(order.customer.phone)}\n` +
      `📍 ${escapeMd(order.customer.address)}\n\n` +
      `Товары:\n${escapeMd(formatProducts(storeOnlyProducts))}\n\n` +
      `${escapeMd("➡️ Нажмите статус:")}`;

    await tgSendMessage(env, chatId, text, kbStore(order.id));
  }
}

async function notifyCouriersNewOrder(order, env) {
  if (!env.COURIERS_CHAT_ID) return;

  const text =
    `🚚 *${escapeMd("Новый заказ")}*  \\#${escapeMd(order.id)}\n` +
    `💳 Оплата: *${escapeMd(order.payment)}*\n` +
    `📍 ${escapeMd(order.customer.address)}\n\n` +
    `${escapeMd("Ждём сборку, затем забрать/в пути/доставлено.")}`;

  await tgSendMessage(env, env.COURIERS_CHAT_ID, text, kbCourier(order.id));
}

/* =========================================================
   TELEGRAM UPDATE HANDLER
========================================================= */

async function handleTelegramUpdate(update, env) {
  const cq = update.callback_query;
  if (!cq?.data) return;

  const data = cq.data;
  const callbackId = cq.id;

  if (data.startsWith("confirm_payment:")) {
    const orderId = data.split(":")[1];
    const order = await loadOrder(orderId, env);
    if (!order) return tgAnswerCallback(env, callbackId, "Заказ не найден");

    if (order.payment !== "Перевод") return tgAnswerCallback(env, callbackId, "Это заказ с наличными");

    await setStatus(orderId, STATUS.payment_confirmed, env, `admin:${cq.from?.id || "?"}`);
    await tgAnswerCallback(env, callbackId, "Перевод подтверждён");

    const fresh = await loadOrder(orderId, env);
    if (!fresh) return;

    const storeChatMap = safeJsonParse(env.STORE_CHAT_MAP_JSON, {});
    if (env.ADMIN_CHAT_ID) {
      await tgSendMessage(env, env.ADMIN_CHAT_ID, escapeMd(`✅ Перевод подтверждён для заказа #${orderId}\nДальше: магазин собирает → курьер доставляет.`));
    }
    await notifyStoresNewOrder(fresh, env, storeChatMap);
    await notifyCouriersNewOrder(fresh, env);
    return;
  }

  if (data.startsWith("set_status:")) {
    const [, orderId, nextStatus] = data.split(":");
    const order = await loadOrder(orderId, env);
    if (!order) return tgAnswerCallback(env, callbackId, "Заказ не найден");

    const allowed = isTransitionAllowed(order.status, nextStatus, order.payment);
    if (!allowed) return tgAnswerCallback(env, callbackId, "Нельзя поставить этот статус сейчас");

    await setStatus(orderId, nextStatus, env, `tg:${cq.from?.id || "?"}`);
    await tgAnswerCallback(env, callbackId, "Статус обновлён");

    await broadcastStatus(orderId, nextStatus, env);
    return;
  }

  return tgAnswerCallback(env, callbackId, "OK");
}

/* =========================================================
   STATUS FLOW
========================================================= */

function isTransitionAllowed(current, next, payment) {
  const flowCash = [STATUS.new, STATUS.preparing, STATUS.assembled, STATUS.picked, STATUS.on_the_way, STATUS.delivered];
  const flowTransfer = [STATUS.new, STATUS.payment_confirmed, STATUS.preparing, STATUS.assembled, STATUS.picked, STATUS.on_the_way, STATUS.delivered];
  const flow = payment === "Перевод" ? flowTransfer : flowCash;

  const ci = flow.indexOf(current);
  const ni = flow.indexOf(next);
  if (ci === -1 || ni === -1) return false;
  return ni === ci || ni === ci + 1;
}

async function setStatus(orderId, status, env, by) {
  const order = await loadOrder(orderId, env);
  if (!order) return;

  order.status = status;
  order.updatedAt = nowIso();
  order.history = Array.isArray(order.history) ? order.history : [];
  order.history.push({ at: nowIso(), status, by });

  await saveOrder(order, env);
}

async function broadcastStatus(orderId, status, env) {
  const order = await loadOrder(orderId, env);
  if (!order) return;

  const storeChatMap = safeJsonParse(env.STORE_CHAT_MAP_JSON, {});
  const label = STATUS_LABEL[status] || status;

  const msg =
    `*${escapeMd(label)}*  \\#${escapeMd(order.id)}\n\n` +
    `👤 ${escapeMd(order.customer.name)}\n` +
    `📍 ${escapeMd(order.customer.address)}\n` +
    `💳 Оплата: *${escapeMd(order.payment)}*`;

  if (env.ADMIN_CHAT_ID) await tgSendMessage(env, env.ADMIN_CHAT_ID, msg);

  for (const sk of order.storeKeys || []) {
    const chatId = storeChatMap[sk];
    if (!chatId) continue;
    await tgSendMessage(env, chatId, msg, kbStore(order.id));
  }

  if (env.COURIERS_CHAT_ID) await tgSendMessage(env, env.COURIERS_CHAT_ID, msg, kbCourier(order.id));
}
