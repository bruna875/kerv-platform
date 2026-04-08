import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET") {
    try {
      const state = await kv.get("kerv_state");
      res.status(200).json(state || {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      await kv.set("kerv_state", body);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}
