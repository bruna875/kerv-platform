export const config = { runtime: "edge" };

export default async function handler(req) {
  const SHEET_URL = "https://script.google.com/macros/s/AKfycbwFrVCmNoPCZ7OiDlM1bUaYrf7K9Na5Uq1-5SSfywzGYNgA3ut-pLlPzxUvaXzb3-CC/exec";

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
