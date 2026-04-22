require("dotenv").config();
const { Pool } = require("pg");

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const sql = `
  CREATE TABLE IF NOT EXISTS document_recognition (
    document_id TEXT PRIMARY KEY,
    text_excerpt TEXT,
    doc_type TEXT,
    client_name TEXT,
    case_number TEXT,
    incident_date TEXT,
    confidence NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  `;

  await pool.query(sql);
  console.log("✅ document_recognition table ready");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

