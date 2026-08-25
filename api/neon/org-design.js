// api/neon/org-design.js
// Public endpoint (no auth) — org design page is standalone/public
//
// GET  ?versionId=N (optional)                          → { versions:[{id,name}], activeVersionId, users:[...], data:{columns,panels}, slots:{slotId:user|null} }
// POST { slotId, userId, versionId }                    → upsert person assignment for a slot, scoped to a version
// POST { action:'save-data', versionId, data }           → overwrite a version's layout/labels
// POST { action:'create-version', name, fromVersionId }  → duplicate a version's data+slots into a new one
// POST { action:'rename-version', versionId, name }      → rename a version
// POST { action:'delete-version', versionId }            → delete a version (must not be the last one)

import { neon } from '@neondatabase/serverless';

var DEFAULT_DATA = {
  columns: [
    { key: 'shared', name: 'Shared Services', sub: 'Compliance, Security, IT and DevOps', domains: [
        { title: 'Security, Compliance & DevOps', spine: 3 },
        { title: 'IT Support', spine: 2 }
      ] },
    { key: 'api', name: 'API Suite', sub: 'Content, Live, Commerce, etc', domains: [
        { title: 'Content APIs', sub: 'VOD, Livestream, Audio, Taxonomies', spine: 1 },
        { title: 'Commerce APIs', sub: 'Product Catalogs', spine: 1 }
      ] },
    { key: 'platform', name: 'KERV Platform', sub: 'End-to-End Platform Experience covering Publishers suite, AdOps tools, Matching Engine and integrations', domains: [
        { title: 'Product Design', sub: 'UX/UI, Rapid Prototyping, Design System', spine: 1 },
        { title: 'Core and Publisher', sub: 'User & Org, Design System, VOD/LIVE/OLV', spine: 1 },
        { title: 'Ad Operations Tools', sub: 'Campaign Management, Creative Studio, Ad Formats, Partner Distribution', rowIcons: 2 }
      ] },
    { key: 'reporting', name: 'Research & Data', sub: 'Data & Technical Research', domains: [
        { title: 'Data', sub: 'Data Engineering, Analytics and Reporting' }
      ] }
  ],
  panels: {
    prd: {
      hiddenKeys: ['shared'],
      domainOverrides: {
        reporting: [{ title: 'R&D', off: true }, { title: 'Data', sub: 'Data Engineering, Analytics and Reporting', spine: 1 }]
      },
      qaColumns: [],
      qaSkipMap: {}
    },
    tec: {
      hiddenKeys: [],
      domainOverrides: {
        api:       [{ title: 'Content APIs', sub: 'VOD, Livestream, Audio, Taxonomies', spine: 3 }, { title: 'Commerce APIs', sub: 'Product Catalogs', spine: 1 }],
        reporting: [{ title: 'R&D', sub: 'Product Innovation, Research and POCs', spine: 1 }, { title: 'Data', sub: 'Data Engineering, Analytics and Reporting', spine: 3 }],
        platform:  [{ title: 'Product Design', off: true }, { title: 'Core and Publisher', sub: 'User & Org, Design System, VOD/LIVE/OLV', spine: 6 }, { title: 'Ad Operations Tools', sub: 'Campaign Management, Creative Studio, Ad Formats, Partner Distribution', spine: 6 }]
      },
      qaColumns: ['platform'],
      qaSkipMap: { platform: 1 }
    }
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS org_design_versions (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS org_design_slots (
      slot_id    TEXT NOT NULL,
      user_id    INTEGER,
      version_id INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE org_design_slots ADD COLUMN IF NOT EXISTS version_id INTEGER`;

  // Seed the first version from today's default layout the first time this ever runs
  let versions = await sql`SELECT id, name FROM org_design_versions ORDER BY id ASC`;
  let defaultVersionId;
  if (!versions.length) {
    const inserted = await sql`
      INSERT INTO org_design_versions (name, data) VALUES ('Version 1', ${JSON.stringify(DEFAULT_DATA)}::jsonb)
      RETURNING id
    `;
    defaultVersionId = inserted[0].id;
    versions = [{ id: defaultVersionId, name: 'Version 1' }];
  } else {
    defaultVersionId = versions[0].id;
  }

  // Backfill any slot rows saved before versioning existed onto the first version
  await sql`UPDATE org_design_slots SET version_id = ${defaultVersionId} WHERE version_id IS NULL`;

  // A slot is now unique per version, not globally — re-key the primary key once.
  // Guarded + exception-swallowed so concurrent requests racing this migration don't crash
  // each other with "multiple primary keys" — whichever request finishes first wins.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'org_design_slots' AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = 'version_id'
      ) THEN
        BEGIN
          ALTER TABLE org_design_slots DROP CONSTRAINT IF EXISTS org_design_slots_pkey;
          ALTER TABLE org_design_slots ADD CONSTRAINT org_design_slots_pkey PRIMARY KEY (version_id, slot_id);
        EXCEPTION WHEN OTHERS THEN
          NULL; -- a concurrent request already completed this migration
        END;
      END IF;
    END $$;
  `;

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const requestedId = req.query && req.query.versionId ? parseInt(req.query.versionId, 10) : null;
    const activeVersionId = (requestedId && versions.some(function(v) { return v.id === requestedId; }))
      ? requestedId : defaultVersionId;

    const [users, versionRows, slotRows] = await Promise.all([
      sql`
        SELECT id, first_name AS "firstName", last_name AS "lastName",
               email, photo_url AS "photoUrl", job_title AS "jobTitle", department
        FROM users ORDER BY first_name, last_name
      `,
      sql`SELECT data FROM org_design_versions WHERE id = ${activeVersionId}`,
      sql`SELECT slot_id AS "slotId", user_id AS "userId" FROM org_design_slots WHERE version_id = ${activeVersionId}`
    ]);

    const userMap = {};
    users.forEach(function(u) { userMap[u.id] = u; });
    const slotMap = {};
    slotRows.forEach(function(s) { slotMap[s.slotId] = s.userId ? (userMap[s.userId] || null) : null; });

    return res.status(200).json({
      versions,
      activeVersionId,
      users,
      data: versionRows.length ? versionRows[0].data : DEFAULT_DATA,
      slots: slotMap
    });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.action === 'save-data') {
      if (!body.versionId || !body.data) return res.status(400).json({ error: 'versionId and data required' });
      await sql`UPDATE org_design_versions SET data = ${JSON.stringify(body.data)}::jsonb, updated_at = NOW() WHERE id = ${body.versionId}`;
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'create-version') {
      const name = (body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const fromId = body.fromVersionId || defaultVersionId;
      const src = await sql`SELECT data FROM org_design_versions WHERE id = ${fromId}`;
      if (!src.length) return res.status(404).json({ error: 'Source version not found' });

      const inserted = await sql`
        INSERT INTO org_design_versions (name, data) VALUES (${name}, ${JSON.stringify(src[0].data)}::jsonb)
        RETURNING id
      `;
      const newId = inserted[0].id;

      const srcSlots = await sql`SELECT slot_id, user_id FROM org_design_slots WHERE version_id = ${fromId}`;
      for (const s of srcSlots) {
        await sql`INSERT INTO org_design_slots (slot_id, user_id, version_id) VALUES (${s.slot_id}, ${s.user_id}, ${newId})`;
      }

      return res.status(200).json({ ok: true, versionId: newId });
    }

    if (body.action === 'rename-version') {
      if (!body.versionId || !body.name) return res.status(400).json({ error: 'versionId and name required' });
      await sql`UPDATE org_design_versions SET name = ${body.name.trim()}, updated_at = NOW() WHERE id = ${body.versionId}`;
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'delete-version') {
      if (!body.versionId) return res.status(400).json({ error: 'versionId required' });
      const count = await sql`SELECT COUNT(*)::int AS n FROM org_design_versions`;
      if (count[0].n <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining version' });
      await sql`DELETE FROM org_design_slots WHERE version_id = ${body.versionId}`;
      await sql`DELETE FROM org_design_versions WHERE id = ${body.versionId}`;
      const remaining = await sql`SELECT id FROM org_design_versions ORDER BY id ASC LIMIT 1`;
      return res.status(200).json({ ok: true, nextVersionId: remaining[0].id });
    }

    // ── default: slot assignment upsert ─────────────────────────────────────
    const { slotId, userId, versionId } = body;
    if (!slotId) return res.status(400).json({ error: 'slotId required' });
    const vId = versionId || defaultVersionId;
    const uid = userId || null;
    await sql`
      INSERT INTO org_design_slots (slot_id, user_id, version_id, updated_at)
      VALUES (${slotId}, ${uid}, ${vId}, NOW())
      ON CONFLICT (version_id, slot_id) DO UPDATE
        SET user_id = ${uid}, updated_at = NOW()
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
