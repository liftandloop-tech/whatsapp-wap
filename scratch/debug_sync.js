
const axios = require('axios');

async function test() {
    const components = [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://scontent.whatsapp.net/v/t61.29466-34/616262873_1759470498352852_3005139979055952928_n.png?ccb=1-7&_nc_sid=8b1bef&_nc_ohc=GB5Gi2YwgjIQ7kNvwERwlil&_nc_oc=AdpnfJR6QoFbY9Seeq5hyWgtHPscJ1mPSVFXnVr8-ifUVHrnXDrslcUYevKzuZTN4lzTRWh_1EUmi6OXEcUgGCv_&_nc_zt=3&_nc_ht=scontent.whatsapp.net&edm=AH51TzQEAAAA&_nc_gid=Is_3ZKJJ-fHbHXynC6_YNg&_nc_tpa=Q5bMBQH9GJfXj9xofIXwy_YHNVIghaWgGwXFjWkdsDzyKf8BWaB7RICCiiEQ_ENH_9gx8DUeyUIfd73Lfw&oh=01_Q5Aa4gEg1TFLLjCJ1Ijc7fVAzC6ubXGHT54y8yuBXaVB-guIYQ&oe=6A2CE7CA"
          ]
        }
      }
    ];

    for (const comp of components) {
        console.log('Comp Type:', comp.type);
        console.log('Comp Format:', comp.format);
        if (comp.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(comp.format)) {
            console.log('Match found!');
            const handleUrl = comp.example?.header_handle?.[0];
            console.log('Handle URL:', handleUrl);
            if (handleUrl && handleUrl.startsWith('http')) {
                console.log('Attempting download...');
                try {
                    const response = await axios.get(handleUrl, { responseType: 'arraybuffer' });
                    console.log('Download success, length:', response.data.length);
                } catch (e) {
                    console.log('Download failed:', e.message);
                }
            }
        }
    }
}

test();
