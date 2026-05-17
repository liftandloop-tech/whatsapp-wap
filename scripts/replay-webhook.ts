import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env
dotenv.config({ path: resolve(__dirname, '../.env') });

const APP_SECRET = process.env.META_APP_SECRET || '';
const WEBHOOK_URL = `http://localhost:${process.env.PORT || 3000}/whatsapp/webhook`;

if (!APP_SECRET) {
  console.error('❌ META_APP_SECRET not found in .env');
  process.exit(1);
}

function getBasePayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '16505551111',
                phone_number_id: '1234567890',
              },
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

function getTextMessagePayload() {
  const payload = getBasePayload();
  const value = payload.entry[0].changes[0].value as any;
  value.contacts = [
    {
      profile: { name: 'John Doe' },
      wa_id: '12345678901',
    },
  ];
  value.messages = [
    {
      from: '12345678901',
      id: `wamid.${crypto.randomBytes(16).toString('hex')}`,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      text: { body: 'Hello from Replay Harness!' },
      type: 'text',
    },
  ];
  return payload;
}

function getImageMessagePayload() {
  const payload = getBasePayload();
  const value = payload.entry[0].changes[0].value as any;
  value.contacts = [
    {
      profile: { name: 'John Doe' },
      wa_id: '12345678901',
    },
  ];
  value.messages = [
    {
      from: '12345678901',
      id: `wamid.${crypto.randomBytes(16).toString('hex')}`,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      type: 'image',
      image: {
        id: `media.${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'image/jpeg',
        sha256: 'fake-sha256',
        caption: 'Behold this test image!',
      },
    },
  ];
  return payload;
}

function getStatusDeliveredPayload() {
  const payload = getBasePayload();
  const value = payload.entry[0].changes[0].value as any;
  value.statuses = [
    {
      id: `wamid.${crypto.randomBytes(16).toString('hex')}`,
      status: 'delivered',
      timestamp: Math.floor(Date.now() / 1000).toString(),
      recipient_id: '12345678901',
    },
  ];
  return payload;
}

async function replay(name: string, payload: any) {
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(body)
    .digest('hex');

  console.log(`\n🚀 Replaying [${name}] to ${WEBHOOK_URL}...`);
  
  try {
    const response = await axios.post(WEBHOOK_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
    });
    console.log(`✅ Success: ${response.status} ${response.statusText}`);
    console.log(`📄 Response:`, response.data);
  } catch (error: any) {
    console.error(`❌ Error: ${error.response?.status} ${error.response?.statusText}`);
    console.error(`📄 Response Body:`, error.response?.data);
  }
}

async function run() {
  const type = process.argv[2] || 'textMessage';
  const count = parseInt(process.argv[3] || '1');
  const targetWamid = process.argv[4];

  for (let i = 0; i < count; i++) {
    let payload;
    if (type === 'textMessage') {
      payload = getTextMessagePayload();
      if (targetWamid) (payload.entry[0].changes[0].value.messages[0] as any).id = targetWamid;
    } else if (type === 'imageMessage') {
      payload = getImageMessagePayload();
      if (targetWamid) (payload.entry[0].changes[0].value.messages[0] as any).id = targetWamid;
    } else if (type === 'statusDelivered') {
      payload = getStatusDeliveredPayload();
      if (targetWamid) (payload.entry[0].changes[0].value.statuses[0] as any).id = targetWamid;
    } else {
      console.error(`❌ Unknown payload type: ${type}`);
      console.log(`Available: textMessage, statusDelivered`);
      process.exit(1);
    }
    await replay(`${type} [Attempt ${i + 1}/${count}]`, payload);
  }
}

run().catch(console.error);
