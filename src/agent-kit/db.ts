import { createConnection, type Connection } from 'mysql2/promise';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}. Copy .env.example to .env, then export it: set -a; source .env; set +a`);
    process.exit(2);
  }
  return v;
}

/**
 * The single place any agent repo opens a connection to the API-owned MariaDB. Assembled from separate
 * DB_* vars, never a hand-authored connection string.
 *
 * What each agent DOES with it differs and is not this module's business: the Knowledge Engine writes
 * curated species records and blogposts through its own upsert SQL, while the Plant Doctor only ever
 * READS (every doctor write goes through the API's proposal mediator). Neither difference is expressible
 * as a connection option, which is why one function serves both.
 */
export async function connectToDb(): Promise<Connection> {
  return createConnection({
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 3306),
    user: requireEnv('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: requireEnv('DB_NAME'),
  });
}
