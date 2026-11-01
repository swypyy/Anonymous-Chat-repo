# ⚡ Swypyy Messenger

A modern, high-end, web-based anonymous ephemeral messaging app built with a sleek dark-violet aesthetic. Designed for secure, temporary chat rooms that completely vanish when closed.

🔗 **Live App:** [View Live App](https://sanjay-messenger.onrender.com)

---

## ✨ Features
* **Zero Trace / Ephemeral:** No permanent databases, user accounts, or chat logs. Once the host leaves or closes the room, the session data is completely destroyed from memory.
* **Custom Display Names:** Both hosts and guests can choose their own custom nicknames before entering a room.
* **Instant Share System:** Includes a 1-tap native mobile Web Share API button to instantly invite friends via WhatsApp, Instagram, Discord, or SMS.
* **WhatsApp-Style UI:** Clean, full-screen mobile-first interface featuring dark glassmorphism (`#090712`), gradient accents, and responsive layout scaling.
* **Exit Functionality:** Clean leave-room handling with real-time socket updates.

---

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla), Socket.IO Client
* **Backend:** Node.js, Express, Socket.IO Server
* **Hosting:** Render.com (Web Service)

---

## 🚀 Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/anazyy/ephemeral-chat.git
   cd ephemeral-chat
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```

4. Open your browser and navigate to `http://localhost:3000`.

---

## 📄 License
This project is open source and available under the MIT License.