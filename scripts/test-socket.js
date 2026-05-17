const { io } = require('socket.io-client');

const TENANT_ID = 'cmp0x7mqu0000kjbi5xuwf0y6'; // From seed
const SOCKET_URL = 'http://localhost:3000/realtime';

console.log(`🚀 Connecting to ${SOCKET_URL} for tenant ${TENANT_ID}...`);

const socket = io(SOCKET_URL, {
  query: { tenantId: TENANT_ID },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected to Realtime Gateway');
  console.log('Client ID:', socket.id);
});

socket.on('message.received', (data) => {
  console.log('📥 [Realtime] Message Received:', data);
});

socket.on('conversation.updated', (data) => {
  console.log('🔄 [Realtime] Conversation Updated:', data);
});

socket.on('message.status_updated', (data) => {
  console.log('📊 [Realtime] Status Updated:', data);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('⚠️ Connection Error:', error.message);
});
