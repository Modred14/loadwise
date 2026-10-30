// Makes an existing user a department administrator (creating the department if needed).
// Usage: DATABASE_URL=postgres://... node scripts/grant-role.mjs admin@school.edu "Department of Computer Science"
import pg from "pg";

const [email, department] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !email || !department) {
  console.error('Usage: DATABASE_URL=... node scripts/grant-role.mjs <user-email> "<Department name>"');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  const u = await client.query("select id from users where lower(email) = lower($1)", [email]);
  if (!u.rowCount) throw new Error(`No user with email ${email}. Ask them to register first.`);
  let d = await client.query("select id from departments where lower(name) = lower($1)", [department]);
  if (!d.rowCount) d = await client.query("insert into departments (name) values ($1) returning id", [department]);
  await client.query("update users set role = 'dept_admin', department_id = $2, updated_at = now() where id = $1", [u.rows[0].id, d.rows[0].id]);
  await client.query("commit");
  console.log(`${email} is now an administrator of "${department}".`);
} catch (e) {
  await client.query("rollback");
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
