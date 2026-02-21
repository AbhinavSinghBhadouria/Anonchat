# AnonChat – Anonymous 1-on-1 Chat

A modern, high-performance anonymous chat application built for real-time interaction with absolute privacy.

## 🚀 Key Features

- **Gender-Based 1-on-1 Pairing**: Intelligently matches users with the opposite gender first, falling back to random pairing to ensure minimal wait times.
- **Absolute Anonymity**: Partner genders are hidden (both sides see "🎭 Stranger"), and no personal data is stored or logged.
- **3-Chat Session Limit**: Keeps conversations fresh and safe by limiting users to 3 different chats per session.
- **Integrated Phone Block**: Server-side filtering automatically prevents the sharing of phone numbers to protect user privacy.
- **Premium Real-Time UI**: Modern dark-themed interface with smooth animations, typing indicators, and instant system notifications.

## 🛠️ How It Works (The Technical "Procedure")

AnonChat is built using **Node.js**, **Express**, and **Socket.IO** for low-latency, real-time communication.

### 1. Real-Time Connectivity
Upon visiting the site, a persistent WebSocket connection is established. This allows the server and client to push data to each other instantly without page reloads.

### 2. Matchmaking Architecture
The server manages three internal queues: `Male`, `Female`, and `Other`.
- When a user joins, the engine performs a tiered search:
    1. **Preferred Match**: Tries to find someone in the specified "opposite" gender bucket.
    2. **Fallback**: If no preferred match is available, it looks in the `Other` bucket.
    3. **Global**: If still no match, it pulls the next available user from any bucket.

### 3. Private Encapsulated Rooms
Once paired, the server generates a unique UUID for the session and "locks" both users into a private virtual room. Messages shared in this room are completely isolated and invisible to anyone else on the server.

### 4. Security & Privacy Layers
- **Regex Filter**: Every message is scanned by a server-side regular expression before broadcasting. If a phone number pattern is detected, the message is blocked.
- **Stateless Sessions**: The server is designed to be stateless. As soon as a user clicks "Next" or closes the tab, all session data and associations are immediately wiped.

## 📦 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (installed with Node.js)

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/AbhinavSinghBhadouria/Anonchat.git
   cd Anonchat
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`.

## 🌐 Deployment

The project is configured for easy deployment on platforms like **Railway**, **Render**, or **Heroku**. 

1. Push your code to a GitHub repository.
2. Link the repository to your chosen hosting platform.
3. The platform will automatically detect `server.js` and the `start` script to launch the app.
