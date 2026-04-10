export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const SHEET_URL = "https://script.google.com/macros/s/AKfycbxV0z5qf0I0U4YiKivIm6S84s-CPyuevY4OAnBw7rftIoZi41KvHA5rGAihThM6GJxXNQ/exec";

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
