const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Anonymous name generator ───────────────────────────────────────────────
const adjectives = [
  'Silent', 'Hidden', 'Shadow', 'Phantom', 'Ghost', 'Mystic', 'Cosmic', 'Neon',
  'Velvet', 'Crimson', 'Azure', 'Jade', 'Ember', 'Frost', 'Storm', 'Lunar',
  'Solar', 'Starry', 'Dark', 'Bright', 'Wild', 'Calm', 'Swift', 'Bold'
];
const nouns = [
  'Fox', 'Wolf', 'Raven', 'Hawk', 'Bear', 'Tiger', 'Panda', 'Drake',
  'Lynx', 'Cobra', 'Falcon', 'Otter', 'Viper', 'Crane', 'Moose', 'Bison',
  'Gecko', 'Finch', 'Owl', 'Elk', 'Pike', 'Sabre', 'Rook', 'Wren'
];
function generateName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}_${noun}${num}`;
}

// ── Phone number detection (server-side block) ─────────────────────────────
// Matches: 10-digit runs, +country-code variants, formatted (xxx) xxx-xxxx,
// xxx-xxx-xxxx, xxx.xxx.xxxx, and spaced-out digits.
const PHONE_REGEX = /(\+?\d[\s\-.]?){10,}/g;

function containsPhone(text) {
  // strip common word-number contexts to reduce false positives, then test
  const stripped = text.replace(/\b(19|20)\d{2}\b/g, '');  // ignore 4-digit years
  return PHONE_REGEX.test(stripped);
}

// Reset lastIndex after test (stateful regex)
function hasDangerousContent(text) {
  PHONE_REGEX.lastIndex = 0;
  const stripped = text.replace(/\b(19|20)\d{2}\b/g, '');
  PHONE_REGEX.lastIndex = 0;
  return PHONE_REGEX.test(stripped);
}

// ── Waiting queues per gender ──────────────────────────────────────────────
// Each entry: { socketId, gender, username }
const queues = { male: [], female: [], other: [] };

// ── Active sessions ────────────────────────────────────────────────────────
// sessionId -> { users: [socketId, socketId] }
const sessions = {};

// socketId -> { username, gender, sessionId | null }
const users = {};

// ── Helpers ────────────────────────────────────────────────────────────────
function removeFromQueues(socketId) {
  for (const g of Object.keys(queues)) {
    queues[g] = queues[g].filter(u => u.socketId !== socketId);
  }
}

function oppositeGender(gender) {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null; // 'other' has no strict opposite
}

function pickFromQueue(excluding, preferGender) {
  // 1. Try preferred gender first
  if (preferGender && queues[preferGender].length) {
    const idx = queues[preferGender].findIndex(u => u.socketId !== excluding);
    if (idx !== -1) return queues[preferGender].splice(idx, 1)[0];
  }
  // 2. Try 'other' queue
  if (queues.other.length) {
    const idx = queues.other.findIndex(u => u.socketId !== excluding);
    if (idx !== -1) return queues.other.splice(idx, 1)[0];
  }
  // 3. Fallback: anyone
  for (const g of ['male', 'female', 'other']) {
    const idx = queues[g].findIndex(u => u.socketId !== excluding);
    if (idx !== -1) return queues[g].splice(idx, 1)[0];
  }
  return null;
}

function totalWaiting() {
  return queues.male.length + queues.female.length + queues.other.length;
}

function destroySession(socketId) {
  const user = users[socketId];
  if (!user || !user.sessionId) return null;

  const sid = user.sessionId;
  const session = sessions[sid];
  if (!session) return null;

  // Find partner
  const partnerId = session.users.find(id => id !== socketId);
  delete sessions[sid];

  if (users[socketId]) users[socketId].sessionId = null;
  if (partnerId && users[partnerId]) users[partnerId].sessionId = null;

  return partnerId;
}

// Broadcast live user count to everyone every few seconds
function broadcastStats() {
  io.emit('stats', {
    online: Object.keys(users).length,
    waiting: totalWaiting()
  });
}

// ── Socket events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const username = generateName();
  users[socket.id] = { username, gender: null, sessionId: null, chatCount: 0 };

  socket.emit('identity', { username });
  broadcastStats();

  // ── User sets gender & wants a partner ──────────────────────────────────
  socket.on('findPartner', ({ gender }) => {
    if (!['male', 'female', 'other'].includes(gender)) return;

    // Enforce 3-chat limit
    if (users[socket.id].chatCount >= 3) {
      socket.emit('chatLimitReached');
      return;
    }

    // Update gender
    users[socket.id].gender = gender;

    // If already in a session, leave it first
    const prevPartner = destroySession(socket.id);
    if (prevPartner) {
      io.to(prevPartner).emit('partnerDisconnected');
    }
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });

    // Try to match immediately
    const prefer = oppositeGender(gender);
    removeFromQueues(socket.id); // ensure not double-queued
    const match = pickFromQueue(socket.id, prefer);

    if (match) {
      // Create session
      const sessionId = uuidv4();
      const room = `session:${sessionId}`;

      sessions[sessionId] = { users: [socket.id, match.socketId] };
      users[socket.id].sessionId = sessionId;
      users[match.socketId].sessionId = sessionId;

      // Increment chat count for both
      users[socket.id].chatCount++;
      users[match.socketId].chatCount++;

      socket.join(room);
      io.sockets.sockets.get(match.socketId)?.join(room);

      // Notify both — gender deliberately NOT shared
      const myRemaining = 3 - users[socket.id].chatCount;
      const matchRemaining = 3 - users[match.socketId].chatCount;
      socket.emit('matched', { sessionId, chatsRemaining: myRemaining });
      io.to(match.socketId).emit('matched', { sessionId, chatsRemaining: matchRemaining });
    } else {
      // Add to queue
      queues[gender].push({ socketId: socket.id, gender, username });
      socket.emit('waiting');
    }

    broadcastStats();
  });

  // ── User clicks "Next" to find a new partner ─────────────────────────────
  socket.on('leaveSession', () => {
    const partnerId = destroySession(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partnerDisconnected');
    }
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    broadcastStats();
  });

  // ── Message ───────────────────────────────────────────────────────────────
  socket.on('sendMessage', ({ text }) => {
    const user = users[socket.id];
    if (!user || !user.sessionId) return;
    if (!text || text.trim().length === 0) return;

    const clean = text.trim().substring(0, 500);

    // Phone number check
    if (hasDangerousContent(clean)) {
      socket.emit('messageBlocked', { reason: 'phone' });
      return;
    }

    const msg = {
      id: uuidv4(),
      username: user.username,
      text: clean,
      timestamp: Date.now(),
      own: false
    };

    const room = `session:${user.sessionId}`;
    // Send to partner (not own= flag is false for partner)
    socket.to(room).emit('message', { ...msg, own: false });
    // Echo back to sender with own = true
    socket.emit('message', { ...msg, own: true });
  });

  // ── Typing ────────────────────────────────────────────────────────────────
  socket.on('typing', ({ isTyping }) => {
    const user = users[socket.id];
    if (!user || !user.sessionId) return;
    const room = `session:${user.sessionId}`;
    socket.to(room).emit('typingUpdate', { isTyping });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    removeFromQueues(socket.id);
    const partnerId = destroySession(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partnerDisconnected');
    }
    delete users[socket.id];
    broadcastStats();
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀  AnonChat running at http://localhost:${PORT}\n`);
});
