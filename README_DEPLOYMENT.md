# Collaborative Whiteboard — Real-Time LAN & Offline Workspace
**Computer Networks Laboratory Final Project • React 18 & Node.js WebSocket Full-Stack**

A production-scale, low-latency collaborative vector graphics whiteboard designed for institutional local area networks (LANs), laboratory subnets, and air-gapped environments with 100% offline autonomy, deterministic Role-Based Access Control (RBAC), and sandboxed simulation.

---

## 👥 Project Team & Authors
* **CS24B1025 — Anirudh:** Network Protocol Architecture, Node.js WebSocket Server, Berkeley TCP Socket Framing, UDP Physical LAN Scanner.
* **CS24B1097 — Krishna Chaitanya:** React 18 Canvas 2D Engine, 2D Affine Transformation Math (15%–400% Zoom), Synchronized Grids, Vector UI, Typography Ribbon.
* **CS24B1108 — Harish:** Synchronous Side-Drawer Group Chat, Session Isolation (4-Letter Codes), SQLite Database Persistence, `.whiteboard` File Bundle Engine.
* **CS24B1106 — Manas Vivek:** Deterministic 4-Dimensional RBAC Governance, Isolated Instance Sandbox Simulation (3-Way Toggle), Storage Privacy Separation, Physical LAN Benchmarking.

---

## 🌟 Key Features & Capabilities

1. **Native Desktop Application (`Collaborative_Whiteboard.exe`):**
   * Standalone compiled Windows desktop executable with official embedded icon.
   * Silently provisions background services and launches a dedicated, borderless desktop window (`--app` mode) with zero browser chrome or address bars.
   * Auto-terminates background server processes cleanly upon window exit.

2. **Full-Duplex WebSocket Engine (Node.js + TCP):**
   * Centralized star-topology event pipeline delivering sub-5 millisecond event propagation across local network nodes.
   * Monotonic sequence validation (`seq`), frame boundaries, and state hydration (`join_ack`) for late-joining participants.
   * UDP physical adapter scanner on port 45455 that automatically discovers host Wi-Fi/Ethernet IPs while filtering WSL/Hyper-V virtual interfaces.

3. **React 18 Vector Canvas & Synchronized Grids:**
   * Infinite 2D panning and smooth pointer-anchored zoom from 15% to 400%.
   * 4 Network-Synchronized Grid Styles: **Square Graph Grid**, **Dot Matrix**, **Ruled Notebook Lines**, and **Plain Canvas**.
   * Geometric shape gallery with custom stroke widths and interactive **Fill Color** palette toggle.
   * Dynamic interactive tables with column/row editing, drag handle pill, and corner resize handles.
   * Typography ribbon featuring 8 font families (Inter, JetBrains Mono, Caveat, etc.) and Ink-to-Text OCR.

4. **Deterministic Role-Based Access Control (RBAC Matrix):**
   * 4 Enforced Dimensions: **Canvas Drawing**, **Group Chat**, **Instance Management**, and **Public Works Sharing**.
   * 3 Policy Modes: **Host Only** (with client-side view-only lock banner and server-side packet rejection), **Selected Members** (multi-select modal dialog with search and checkboxes), and **Everyone**.

5. **Milestone Sandboxing & Storage Privacy Separation:**
   * Point-in-time immutable milestone snapshots.
   * **Isolated Instance Sandbox Mode** with orange banner and 3-way toggle:
     - 📁 **Original Snapshot** (unmodified base state)
     - 🧪 **Sandbox Simulation** (private experimental workspace)
     - 👑 **Host Sandbox** (view of host's published sandbox)
   * Two-option save workflow: **Save in My Own System (Private)** vs. **Share to Public Works (Room Gallery)**.
   * Host-exclusive live canvas restoration.

6. **Synchronous Chat & SQLite Persistence:**
   * Docked side-drawer group chat with timestamps, avatars, and server-side SQLite storage.
   * Live remote cursors with sub-10ms linear interpolation.
   * Presence audit logging for participant join/leave events.

---

## 🚀 How to Run the Desktop Application

### Option A: 1-Click Desktop Executable (Recommended)
1. Double-click **`Collaborative_Whiteboard.exe`** in the project folder.
2. The application will silently start the background services and open directly as a native desktop window!
3. To place a shortcut on your Windows Desktop, double-click **`Create_Desktop_Shortcut.bat`**.

### Option B: Batch / Silent Script Launcher
* Double-click **`Collaborative_Whiteboard.bat`** (or **`Collaborative_Whiteboard.vbs`**).
* It verifies Node.js, starts the local server silently, and opens the standalone desktop app window.

### Option C: Developer Mode (With Console Logs)
* Double-click **`start_web_whiteboard.bat`**.
* The server will boot with live terminal output on `http://localhost:5000` and launch in your default browser.

---

## 🛠️ Automated Setup & Build from Source

If running on a fresh computer, simply double-click:
```
install_dependencies.bat
```
This automated script will:
1. Verify Node.js (v18+).
2. Install server dependencies (`npm install` in `web_whiteboard/server`).
3. Install client dependencies (`npm install` in `web_whiteboard/client`).
4. Compile the React 18 production bundle via Vite.
5. Compile `Collaborative_Whiteboard.exe` with the official embedded WB icon via Microsoft .NET C# compiler (`csc.exe`).
6. Generate the desktop shortcut on your Windows desktop.

---

## 🌐 Connecting Partners Across Physical LAN / Wi-Fi Hotspot

1. Ensure the Host computer and partner devices are connected to the same Wi-Fi router, Ethernet switch, or mobile hotspot.
2. The Host launches `Collaborative_Whiteboard.exe` and creates a room (e.g., room code `SPZG`).
3. The Host's physical LAN IP (e.g. `192.168.1.15`) is displayed on the lobby card.
4. Partner devices simply open their browser and navigate to:
   ```
   http://<HOST-IP>:5000
   ```
5. Partners enter the 4-letter room code (`SPZG`) and join immediately with zero cloud login!

---

## 📁 Source Code Directory Structure

```
lan_whiteboard/
├── Collaborative_Whiteboard.exe       # Compiled Native Windows Desktop Executable
├── Collaborative_Whiteboard.bat       # Desktop Batch Launcher
├── Collaborative_Whiteboard.vbs       # Silent VBScript App Launcher (Hidden Console)
├── Create_Desktop_Shortcut.bat        # Generates Desktop Shortcut on Windows
├── install_dependencies.bat           # 1-Click Automated Setup & Build Script
├── start_web_whiteboard.bat           # Developer Server Runner with Console Logs
├── app.ico                            # Official Multi-Resolution Desktop Icon
├── LAN_Collaborative_Whiteboard_Presentation_Updated.pptx  # 10-Slide Project PPT
├── VIDEO_PRESENTATION_SCRIPT.md       # Name-Order-Wise Video Presentation Script
├── desktop_app/                       # C# Desktop Executable Source Code
│   └── Program.cs                     # Native Windows GUI launcher & process supervisor
└── web_whiteboard/                    # Full-Stack React + Node.js Source Code
    ├── package.json                   # Project scripts and configuration
    ├── server/                        # Node.js WebSocket Backend Server
    │   ├── server.js                  # Authoritative WebSocket & Express Server
    │   ├── package.json               # Backend dependencies (ws, express, etc.)
    │   └── data/                      # Persistent SQLite Database storage
    │       └── whiteboard_data.db     # SQLite tables (rooms, actions, messages, etc.)
    └── client/                        # React 18 + Vite Frontend Application
        ├── package.json               # Frontend dependencies (React 18, Lucide, Tailwind)
        ├── vite.config.js             # Vite build configuration
        ├── dist/                      # Production-compiled assets served by server
        └── src/                       # React Source Code
            ├── App.jsx                # Main Application State Router
            ├── components/            # UI Components
            │   ├── Hub.jsx            # Lobby & Room Discovery
            │   ├── Whiteboard.jsx     # HTML5 Canvas 2D Vector Engine
            │   ├── ParticipantsDrawer.jsx # 4D RBAC Permission Matrix & Selected Modal
            │   ├── ChatDrawer.jsx     # Synchronous Group Chat & Timestamps
            │   ├── ShapesModal.jsx    # Vector Shapes Gallery with Fill Toggle
            │   ├── PublicWorksModal.jsx # Gallery, Sandboxed Simulation & Restores
            │   ├── TypographyRibbon.jsx # Font selector (8 families) & OCR
            │   └── ...
            └── index.css              # Glassmorphic Tailwind Design Styles
```
