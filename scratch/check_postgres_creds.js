const { Client } = require('pg');

async function checkPostgres() {
  const client = new Client({
    connectionString: "postgres://postgres-wap:lift%26loop%402025@31.97.231.122:5432/wap"
  });

  try {
    await client.connect();
    const res = await client.query('SELECT * FROM waba_credentials WHERE "clientId" = 15');
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
}

checkPostgres();
