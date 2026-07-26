// api/neon/org-design.js
// Public endpoint (no auth) — org design page is standalone/public
// GET  → { users: [...], slots: { slotId: { userId, firstName, lastName, photoUrl, jobTitle } } }
// POST { slotId, userId }  → upsert assignment (userId null = clear)

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS org_design_slots (
      slot_id    TEXT PRIMARY KEY,
      user_id    INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const [users, slots] = await Promise.all([
      sql`
        SELECT id, first_name AS "firstName", last_name AS "lastName",
               email, photo_url AS "photoUrl", job_title AS "jobTitle", department
        FROM users ORDER BY first_name, last_name
      `,
      sql`SELECT slot_id AS "slotId", user_id AS "userId" FROM org_design_slots`
    ]);

    // Build slot map slotId → user data (joined)
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const slotMap = {};
    slots.forEach(s => {
      if (s.userId && userMap[s.userId]) {
        slotMap[s.slotId] = userMap[s.userId];
      } else if (s.userId === null) {
        slotMap[s.slotId] = null;
      }
    });

    return res.status(200).json({ users, slots: slotMap });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { slotId, userId } = req.body || {};
    if (!slotId) return res.status(400).json({ error: 'slotId required' });

    const uid = userId || null;
    await sql`
      INSERT INTO org_design_slots (slot_id, user_id, updated_at)
      VALUES (${slotId}, ${uid}, NOW())
      ON CONFLICT (slot_id) DO UPDATE
        SET user_id = ${uid}, updated_at = NOW()
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
