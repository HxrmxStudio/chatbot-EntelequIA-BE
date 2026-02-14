/**
 * CI-only: validates CHATBOT_DB_URL is set and uses Supavisor pooler, not direct db.*.supabase.co.
 * Exits 1 with message on failure. Logs host:port on success.
 */
const raw = process.env.CHATBOT_DB_URL ?? '';
if (!raw.trim()) {
  console.error('CHATBOT_DB_URL is empty in workflow env.');
  process.exit(1);
}

let parsed: URL;
try {
  parsed = new URL(raw);
} catch {
  console.error('CHATBOT_DB_URL is not a valid URL.');
  process.exit(1);
}

const host = parsed.hostname.toLowerCase();
const directSupabaseHost = /^db\..+\.supabase\.co$/.test(host);
if (directSupabaseHost) {
  console.error(
    `Invalid CI DB host (${host}). Use Supabase Supavisor pooler (IPv4-ready), not direct db.<project-ref>.supabase.co.`,
  );
  process.exit(1);
}

const port = parsed.port || '5432';
console.log(`WF1 quality loop using DB host ${host}:${port}`);
