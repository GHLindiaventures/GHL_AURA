const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable must be set.');
    process.exit(1);
  }
  const client = new Client({ connectionString });

  await client.connect();
  console.log('Connected to DigitalOcean PostgreSQL.');

  await client.query('ALTER TABLE "GhlDeals" ALTER COLUMN "CustomerId" DROP NOT NULL;');
  console.log('Successfully dropped NOT NULL on "GhlDeals"."CustomerId"');

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
