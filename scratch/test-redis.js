const Redis = require('ioredis');

async function test() {
  console.log('Testing with URI: redis://:Swakora2026@31.97.231.122:5435/0');
  try {
    const client1 = new Redis('redis://:Swakora2026@31.97.231.122:5435/0');
    await client1.ping();
    console.log('client1 ping successful!');
    await client1.quit();
  } catch (err) {
    console.error('client1 error:', err);
  }

  console.log('\nTesting with object (no username):');
  try {
    const client2 = new Redis({
      host: '31.97.231.122',
      port: 5435,
      password: 'Swakora2026',
      db: 0
    });
    await client2.ping();
    console.log('client2 ping successful!');
    await client2.quit();
  } catch (err) {
    console.error('client2 error:', err);
  }

  console.log('\nTesting with username explicitly empty:');
  try {
    const client3 = new Redis({
      host: '31.97.231.122',
      port: 5435,
      username: '',
      password: 'Swakora2026',
      db: 0
    });
    await client3.ping();
    console.log('client3 ping successful!');
    await client3.quit();
  } catch (err) {
    console.error('client3 error:', err);
  }

  console.log('\nTesting with username "default":');
  try {
    const client4 = new Redis({
      host: '31.97.231.122',
      port: 5435,
      username: 'default',
      password: 'Swakora2026',
      db: 0
    });
    await client4.ping();
    console.log('client4 ping successful!');
    await client4.quit();
  } catch (err) {
    console.error('client4 error:', err);
  }
}

test();
