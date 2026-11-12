# Collaborative Whiteboard (v2.0 Full-Stack Upgrade)

Production-scale collaborative whiteboard system featuring:
- **Cross-Network Connectivity:** Devices on **mobile data (4G/5G)** and **Wi-Fi** connect simultaneously without router port forwarding or firewall blocks.
- **User Accounts & Auto-Generated Account Code:** Simple sign-up (Name, Email, Avatar) generates a unique `USR-XXXX` code (e.g. `USR-3VNG`).
- **Host Member Enrollment:** Hosts can add members by typing their `USR-XXXX` code, Email, or IP, or by 1-clicking active users on the server.
- **SQLite Database Persistence:** All users, rooms, drawing actions, chat logs, and milestones are stored permanently in `server/data/whiteboard_data.db`.
- **Modern React + Vite UI:** Google Classroom-style dashboard with Group vs Personal switcher, interactive HTML5 canvas, ink-to-font conversion, remote cursors, and live chat.
- **Dual Connection Modes:** Works **With Internet (Cloud & Cross-Network)** and **Without Internet (Direct Wi-Fi / Hotspot)**, plus the original desktop Python `.exe` applications!

---

## 🚀 Quick Start Guide

### Mode 1: Run Locally or on LAN / Wi-Fi Hotspot
1. Double-click **`start_web_whiteboard.bat`** (or open terminal and run `cd web_whiteboard && node server/server.js`).
2. Open your web browser at:
   ```
   http://localhost:5000
   ```
3. Any device on the same Wi-Fi router or mobile hotspot can connect by visiting:
   ```
   http://<YOUR-LAPTOP-IP>:5000
   ```

---

### Mode 2: Connect Devices Across Different Networks (Mobile Data + Wi-Fi)

To allow a phone using **cellular mobile data (4G/5G)** and a laptop on **home/college Wi-Fi** to connect together:

1. Keep **`start_web_whiteboard.bat`** running on port 5000.
2. Double-click **`run_internet_tunnel.bat`**.
3. It gives you a public HTTPS link (e.g., `https://brave-frog-42.loca.lt`).
4. Share this link with your partner on mobile data. They can open it on their phone browser and join your whiteboard session instantly!

---

### Mode 3: Deploy to Free Cloud Hosting (Render / Railway) - RECOMMENDED

Deploying to the cloud eliminates the need to run any terminal, batch file, or local server on your computer! Your whiteboard will have a permanent public HTTPS URL (e.g., `https://collaborative-whiteboard.onrender.com`) that anyone on mobile data (4G/5G) or Wi-Fi can open directly in their browser.

#### Deploy to Render.com (100% Free, No Credit Card Required):
1. **Create a GitHub Repository:**
   - Go to [github.com/new](https://github.com/new) and create a repository (e.g., `collaborative-whiteboard`).
   - In your project folder, run:
     ```bash
     git init
     git add .
     git commit -m "Initial commit of full-stack collaborative whiteboard"
     git branch -M main
     git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
     git push -u origin main
     ```
2. **Deploy on Render:**
   - Go to [render.com](https://render.com) and log in with your GitHub account.
   - Click **New +** -> **Web Service**.
   - Select your GitHub repository.
   - Configure the following settings:
     - **Name:** `collaborative-whiteboard` (or your choice)
     - **Root Directory:** `web_whiteboard`
     - **Runtime:** `Node`
     - **Build Command:** `npm run install-all && npm run build`
     - **Start Command:** `node --experimental-sqlite server/server.js`
     - **Instance Type:** `Free`
   - Click **Deploy Web Service**.
3. **Done!** Render gives you a permanent `https://your-app.onrender.com` link. Anyone worldwide can open it and collaborate in real-time!

---

## 👥 How to Add Members in Whiteboard

1. **Sign Up:** Each user creates an account (Name & Email). The system assigns them a unique **Account Code** (e.g. `USR-3VNG`).
2. **Copy Code:** The user clicks **Copy Code** on their profile card in the top right.
3. **Host Adds Member:**
   - Inside any active whiteboard room, the Host clicks the blue **`➕ Add Member`** button.
   - The host pastes the user's `USR-XXXX` code (or types their email).
   - The server pushes a real-time invitation to the member's screen!
   - When the member accepts, they enter the room with complete drawing history and synchronized state.



---

## 💻 System App & Desktop Launchers (For You & Partners)

The whiteboard can now be run as a **native system desktop application** (without browser toolbars, tabs, or command terminal clutter):

### 1. 1-Click Desktop Shortcut (Windows)
Double-click **`Create_Desktop_Shortcut.bat`**. This creates an official **"Collaborative Whiteboard"** shortcut directly on your Windows Desktop with its own custom app icon!

### 2. Silent Desktop Launcher
Double-click **`Collaborative_Whiteboard.vbs`** or **`Collaborative_Whiteboard.bat`**:
- Silently boots the background server on port 5000 (no lingering black terminal windows).
- Instantly launches the whiteboard inside a frameless native system desktop window (`--app` mode).

### 3. PWA Desktop App for Any Device (Windows, Mac, iPad, Android)
- When opening the whiteboard in Chrome, Edge, Safari, or Samsung Internet, click the **"Desktop App"** button in the header or the **Install App (+)** icon in the address bar.
- The whiteboard installs into the host operating system, appearing in the Start Menu, Applications folder, and Taskbar.
- Partners connected to your Wi-Fi or Mobile Hotspot can open your Host IP (e.g. `http://192.168.1.15:5000`) and tap "Desktop App" to install it directly on their devices for full offline drawing!
