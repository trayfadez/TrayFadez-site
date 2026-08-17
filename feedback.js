import { neon } from "@neondatabase/serverless";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS site_feedback (
      id BIGSERIAL PRIMARY KEY,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function stats(sql) {
  const rows = await sql`
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average, COUNT(*)::int AS count
    FROM site_feedback
  `;
  return { average: Number(rows[0].average), count: Number(rows[0].count) };
}

export async function GET() {
  try {
    const sql = await getSql();
    await ensureTable(sql);
    return json(await stats(sql));
  } catch (error) {
    console.error(error);
    return json({ error: "Feedback service is not configured yet." }, 503);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.website) return json({ error: "Invalid submission." }, 400);
    const rating = Number(body.rating);
    const comment = String(body.comment || "").trim().slice(0, 500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: "Rating must be between 1 and 5." }, 400);
    }
    const sql = await getSql();
    await ensureTable(sql);
    await sql`INSERT INTO site_feedback (rating, comment) VALUES (${rating}, ${comment || null})`;
    return json(await stats(sql), 201);
  } catch (error) {
    console.error(error);
    return json({ error: "Could not save feedback right now." }, 500);
  }
}
