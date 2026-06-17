import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function test() {
  try {
    const rows = await sql`SELECT version()`;
    console.log("OK: version =", rows[0].version.substring(0, 30));
    
    const count = await sql`SELECT count(*) as c FROM documents`;
    console.log("OK: documents count =", count[0].c);
    
    console.log("Database connection works perfectly.");
  } catch (e) {
    console.error("ERROR:", e.message?.substring(0, 300));
    console.error("Full error:", e);
  }
}

test();
