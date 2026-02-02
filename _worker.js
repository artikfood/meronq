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
    const url = new URL(request.url);

    if (request.method === "POST") {
      try {
        const data = await request.json();
        const BOT_TOKEN = env.BOT_TOKEN;
        const orderId = Math.floor(1000 + Math.random() * 9000);
        
        let adminText = `📦 ЗАКАЗ №${orderId}\n👤 ${data.name}\n📞 ${data.phone}\n📍 ${data.address}\n💰 ${data.total}`;
        
        // Рассылка по магазинам
        for (const [storeId, items] of Object.entries(data.carts)) {
          if (Object.keys(items).length === 0) continue;
          let list = Object.entries(items).map(([n, q]) => `• ${n} x${q}`).join('\n');
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
              chat_id: CHATS[storeId] || CHATS.admin,
              text: `🛒 ЗАКАЗ №${orderId}\n\n${list}`
            })
          });
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ chat_id: CHATS.admin, text: adminText })
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // Показывает index.html, если это не POST запрос
    return env.ASSETS.fetch(request);
  }
};
