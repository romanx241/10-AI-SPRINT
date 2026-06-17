import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not found in .env");
  process.exit(1);
}

console.log("Testing connection to Neon...");

const sql = neon(DATABASE_URL);

async function main() {
  try {
    const rows = await sql`SELECT version()`;
    console.log("OK:", rows[0].version);

    // Проверяем pgvector extension
    const ext = await sql`SELECT * FROM pg_extension WHERE extname = 'vector'`;
    console.log("Vector extension:", ext.length > 0 ? "INSTALLED" : "MISSING");

    // Проверяем embedding column
    const cols = await sql`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'chunks' AND column_name = 'embedding'
    `;
    console.log("Embedding column:", cols.length > 0 ? cols[0].data_type : "MISSING");

    // Список таблиц
    const tables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    const tableNames = tables.map((r: any) => r.table_name);
    console.log("Tables:", tableNames.join(", "));
  } catch (e: any) {
    console.error("ERROR:", e.constructor.name, "-", String(e.message).substring(0, 300));
  }
}

main().then(() => process.exit(0));
