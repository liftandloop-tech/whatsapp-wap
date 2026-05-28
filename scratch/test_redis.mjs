import IORedis from 'ioredis';

async function testConnections() {
    const urls = [
        'redis://swakora:Swakora2026@31.97.231.122:5435/0',
        'redis://:Swakora2026@31.97.231.122:5435/0',
        'redis://default:Swakora2026@31.97.231.122:5435/0'
    ];

    for (const url of urls) {
        console.log(`Testing connection to: ${url.replace('Swakora2026', '****')}`);
        const client = new IORedis(url, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000
        });

        try {
            await client.ping();
            console.log(`✅ Success for ${url.replace('Swakora2026', '****')}`);
        } catch (err) {
            console.error(`❌ Failed for ${url.replace('Swakora2026', '****')}:`, err.message);
        } finally {
            await client.quit();
        }
    }
}

testConnections();
