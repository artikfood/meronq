const CHATS = {
  "admin": "-1003454266368",
  "courier": "-5082321386",
  "danielyan": "-5162168772",
  "edem": "-1003782123005",
  "million": "-5237106191",
  "mush": "-5273013143",
  "tonoyan": "-5236058643",
  "tonoyans_sity": "-5236058643",
  "hay_grill": "-5106855256"
};

export default {
  async fetch(request, env) {
    const BOT_TOKEN = env.BOT_TOKEN;
    const url = new URL(request.url);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    // Если это заказ с сайта
    if (request.method === "POST" && !url.pathname.includes("webhook")) {
      const data = await request.json();
      const orderId = Math.floor(1000 + Math.random() * 9000);
      
      let adminText = `📦 *ЗАКАЗ №${orderId}*\n👤 ${data.name}\n📞 ${data.phone}\n📍 ${data.address}\n💰 *Сумма: ${data.total}*`;

      for (const [storeId, items] of Object.entries(data.carts)) {
        if (Object.keys(items).length === 0) continue;
        let list = Object.entries(items).map(([n, q]) => `• ${n} x${q}`).join('\n');
        
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            chat_id: CHATS[storeId],
            text: `🛒 *ЗАКАЗ №${orderId}*\n\n${list}`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "✅ Собрано", callback_data: `ready_${orderId}_${storeId}` }]] }
          })
        });
        adminText += `\n\n🏬 *${storeId}:*\n${list}`;
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ chat_id: CHATS.admin, text: adminText, parse_mode: "Markdown" })
      });

      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    return new Response("Worker is Running");
  }
};
