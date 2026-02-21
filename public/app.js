/* ═══════════════════════════════════════════════════════════════════════
   AnonChat v2 – Client (Gender-Based 1-on-1 Pairing)
   ═══════════════════════════════════════════════════════════════════════ */

const socket = io();

// ── State ─────────────────────────────────────────────────────────────────
let myUsername = '';
let myGender = null;
let isConnected = false;   // true when paired with someone
let chatsUsed = 0;       // incremented each time matched
let typingTimer = null;
let isTyping = false;
let toastTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────
const $landing = document.getElementById('landing');
const $genderScreen = document.getElementById('genderScreen');
const $chatScreen = document.getElementById('chatScreen');

const $enterBtn = document.getElementById('enterBtn');
const $backFromGender = document.getElementById('backFromGender');
const $genderBtns = document.querySelectorAll('.gender-btn');
const $startChatBtn = document.getElementById('startChatBtn');

const $statsText = document.getElementById('statsText');

const $partnerBadge = document.getElementById('partnerBadge');
const $partnerLabel = document.getElementById('partnerLabel');
const $searchingBadge = document.getElementById('searchingBadge');
const $searchingLabel = document.getElementById('searchingLabel');

const $messages = document.getElementById('messages');
const $messageInput = document.getElementById('messageInput');
const $sendBtn = document.getElementById('sendBtn');
const $charCount = document.getElementById('charCount');
const $typingIndicator = document.getElementById('typingIndicator');
const $nextBtn = document.getElementById('nextBtn');
const $stopBtn = document.getElementById('stopBtn');
const $toast = document.getElementById('toast');

// ── Gender emoji & label helpers ──────────────────────────────────────────
const GENDER_EMOJI = { male: '👨', female: '👩', other: '🌈' };
const GENDER_LABEL = { male: 'Male Stranger', female: 'Female Stranger', other: 'Stranger' };

// ── Screen transitions ────────────────────────────────────────────────────
function showScreen(id) {
    ['landing', 'genderScreen', 'chatScreen'].forEach(s => {
        const el = document.getElementById(s);
        el.classList.toggle('hidden', s !== id);
    });
}

// ── Landing ───────────────────────────────────────────────────────────────
$enterBtn.addEventListener('click', () => {
    showScreen('genderScreen');
});

// ── Gender select ─────────────────────────────────────────────────────────
$backFromGender.addEventListener('click', () => showScreen('landing'));

$genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        $genderBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        myGender = btn.dataset.gender;
        $startChatBtn.disabled = false;
    });
});

$startChatBtn.addEventListener('click', () => {
    if (!myGender) return;
    showScreen('chatScreen');
    startFinding();
});

// ── Start finding a partner ───────────────────────────────────────────────
function startFinding() {
    if (chatsUsed >= 3) {
        showToast('🚫 Chat limit reached for this session. Please refresh to start a new session.', 5000, 'error');
        $nextBtn.disabled = true;
        $startChatBtn.disabled = true;
        return;
    }

    isConnected = false;
    setInputEnabled(false);
    showSearching(true);
    showPartnerBadge(false);
    $typingIndicator.classList.add('hidden');
    isTyping = false;

    showStateCard('searching');
    socket.emit('findPartner', { gender: myGender, chatsUsed });
}

// ── Next button ───────────────────────────────────────────────────────────
$nextBtn.addEventListener('click', () => {
    if (isConnected) {
        socket.emit('leaveSession');
    }
    startFinding();
});

// ── Stop button ───────────────────────────────────────────────────────────
$stopBtn.addEventListener('click', () => {
    if (isConnected) {
        socket.emit('leaveSession');
    }
    isConnected = false;
    myGender = null;
    // Deselect gender buttons for fresh pick
    $genderBtns.forEach(b => b.classList.remove('selected'));
    $startChatBtn.disabled = true;
    showScreen('genderScreen');
});

// ── Socket: identity ──────────────────────────────────────────────────────
socket.on('identity', ({ username }) => {
    myUsername = username;
});

// ── Socket: stats ─────────────────────────────────────────────────────────
socket.on('stats', ({ online, waiting }) => {
    $statsText.textContent = `${online} online · ${waiting} searching`;
});

// ── Socket: waiting (queued) ──────────────────────────────────────────────
socket.on('waiting', () => {
    showSearching(true);
    showStateCard('searching');
});

// ── Socket: matched ───────────────────────────────────────────────────────
socket.on('matched', ({ chatsRemaining }) => {
    isConnected = true;
    chatsUsed = 3 - chatsRemaining;
    showSearching(false);
    showPartnerBadge(true);
    setInputEnabled(true);
    $messages.innerHTML = '';
    appendSystemMsg('🎉 You are now connected with a stranger. Say hi!');
    // Show chats remaining hint
    appendSystemMsg(`💬 Chats remaining after this: ${chatsRemaining}`);
    $messageInput.focus();
});

// ── Socket: partner disconnected ──────────────────────────────────────────
socket.on('partnerDisconnected', () => {
    isConnected = false;
    setInputEnabled(false);
    showPartnerBadge(false);
    showSearching(false);
    $typingIndicator.classList.add('hidden');
    appendSystemMsg('👋 Your partner has disconnected.');
    showToast('Partner disconnected. Click ⏭ Next to find a new one.', 4000, 'info');
});

// ── Socket: message ───────────────────────────────────────────────────────
socket.on('message', ({ text, own, username, timestamp }) => {
    appendMessage({ text, own: !!own, username, timestamp });
    scrollBottom();
});

// ── Socket: message blocked ────────────────────────────────────────────────
socket.on('messageBlocked', ({ reason }) => {
    if (reason === 'phone') {
        showToast('🚫 Phone numbers are not allowed!', 3000, 'error');
    }
});

// ── Socket: chat limit reached ────────────────────────────────────────────
socket.on('chatLimitReached', () => {
    showToast('🚫 Chat limit reached for this session. Please refresh to start a new session.', 5000, 'error');
    $nextBtn.disabled = true;
    $startChatBtn.disabled = true;
});

// ── Socket: typing ────────────────────────────────────────────────────────
socket.on('typingUpdate', ({ isTyping }) => {
    $typingIndicator.classList.toggle('hidden', !isTyping);
});

// ── Input handling ─────────────────────────────────────────────────────────
$messageInput.addEventListener('input', () => {
    autoResize($messageInput);
    updateCharCount();

    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { isTyping: true });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', { isTyping: false });
    }, 1500);
});

$messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
$sendBtn.addEventListener('click', sendMessage);

function sendMessage() {
    const text = $messageInput.value.trim();
    if (!text || !isConnected) return;
    socket.emit('sendMessage', { text });
    $messageInput.value = '';
    autoResize($messageInput);
    updateCharCount();
    clearTimeout(typingTimer);
    isTyping = false;
    socket.emit('typing', { isTyping: false });
}

// ── UI helpers ────────────────────────────────────────────────────────────
function showSearching(show) {
    $searchingBadge.classList.toggle('hidden', !show);
}

function showPartnerBadge(show) {
    $partnerBadge.classList.toggle('hidden', !show);
    if (show) {
        $partnerLabel.textContent = '🎭 Stranger';
    }
}

function setInputEnabled(enabled) {
    $messageInput.disabled = !enabled;
    $sendBtn.disabled = !enabled;
    if (enabled) $messageInput.placeholder = 'Type a message… (Enter to send)';
    else $messageInput.placeholder = 'Waiting for connection…';
}

function appendMessage({ text, own, username, timestamp }) {
    const row = document.createElement('div');
    row.className = `msg-row ${own ? 'own' : 'other'}`;
    const time = formatTime(timestamp || Date.now());
    row.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${own ? 'You' : 'Stranger'}</span>
      <span>${time}</span>
    </div>
    <div class="msg-bubble">${escHtml(text)}</div>
  `;
    $messages.appendChild(row);
}

function appendSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'sys-message';
    el.textContent = text;
    $messages.appendChild(el);
}

function showStateCard(type) {
    $messages.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'state-card';

    if (type === 'searching') {
        card.innerHTML = `
      <div class="big-spinner"></div>
      <div class="state-title">Finding you a match…</div>
      <div class="state-desc">
        We're looking for a ${myGender === 'male' ? 'female' : myGender === 'female' ? 'male' : ''} stranger for you.
        If none is available, we'll match you with anyone online.
      </div>
    `;
    }
    $messages.appendChild(card);
}

function showToast(msg, duration = 3000, type = 'error') {
    clearTimeout(toastTimer);
    $toast.textContent = msg;
    $toast.className = 'toast';
    if (type === 'info') {
        $toast.style.background = 'rgba(56,189,248,0.15)';
        $toast.style.borderColor = 'rgba(56,189,248,0.35)';
        $toast.style.color = 'var(--accent2)';
    } else {
        $toast.style.background = 'rgba(248,113,113,0.18)';
        $toast.style.borderColor = 'rgba(248,113,113,0.4)';
        $toast.style.color = 'var(--red)';
    }
    $toast.classList.remove('hidden');
    toastTimer = setTimeout(() => $toast.classList.add('hidden'), duration);
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

function updateCharCount() {
    const len = $messageInput.value.length;
    $charCount.textContent = `${len}/500`;
    $charCount.className = 'char-count' + (len > 450 ? (len > 490 ? ' danger' : ' warn') : '');
}

function scrollBottom() {
    requestAnimationFrame(() => { $messages.scrollTop = $messages.scrollHeight; });
}

function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
    return str
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
