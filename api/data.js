export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const SHEET_URL = "https://script.google.com/macros/s/AKfycbwFrVCmNoPCZ7OiDlM1bUaYrf7K9Na5Uq1-5SSfywzGYNgA3ut-pLlPzxUvaXzb3-CC/exec";

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
