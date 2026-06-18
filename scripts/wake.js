// Wake up Neon DB
require('dotenv/config');
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql`SELECT 1`
  .then(() => console.log('Neon DB awake'))
  .catch(err => console.error('Error waking DB:', err));
