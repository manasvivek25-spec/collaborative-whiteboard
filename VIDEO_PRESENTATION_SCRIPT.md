# Complete Video Presentation Script
## Project: React & Node.js Collaborative Whiteboard
**Computer Networks Lab Project • Final Presentation & Demonstration**

---

### Video Details & Presentation Guidelines
* **Total Duration:** ~9 to 11 minutes (approx. 1 minute per slide).
* **Team Members & Speaking Roles:**
  * **Speaker 1 (Host / Intro / RBAC / Sandboxing):** Manas Vivek (CS24B1106)
  * **Speaker 2 (Network Architecture & Sockets):** Anirudh (CS24B1025)
  * **Speaker 3 (Canvas Engine & Vector UI):** Krishna Chaitanya (CS24B1097)
  * **Speaker 4 (Chat, Persistence & Sessions):** Harish (CS24B1108)
* *Note: If presented by a single speaker, simply read continuously through all speaker parts.*

---

## Slide 1: Title Slide & Team Introduction
* **Estimated Time:** 0:00 – 0:50 (50 seconds)
* **Visual on Screen:** Slide 1 with Dark Slate Theme, Circular "WB" Logo, Title, and 4 Team Member Cards.
* **Speaker:** **Manas Vivek (CS24B1106)**

### [Spoken Script]
> "Hello everyone, and welcome to our final project presentation for the Computer Networks Lab.
>
> Today, our team is proud to present the **React and Node.js Collaborative Whiteboard** — a high-performance, real-time vector synchronization and workspace platform engineered with deterministic Role-Based Access Control, sandboxed instance simulation, and pure local area network autonomy.
>
> Allow me to introduce our project team:
> * **Anirudh (CS24B1025)**, who engineered the network protocol, Berkeley TCP sockets, and Node.js WebSocket server architecture.
> * **Krishna Chaitanya (CS24B1097)**, who developed the high-performance React 18 Canvas 2D engine, coordinate transformation math, and multi-platform vector UI.
> * **Harish (CS24B1108)**, who architected the integrated synchronous group chat, SQLite state persistence, and session lifecycle management.
> * And myself, **Manas Vivek (CS24B1106)**, responsible for deterministic RBAC governance, the isolated instance sandbox engine, and physical LAN benchmarking.
>
> Together, we set out to build a collaborative workspace that combines the fluid interactivity of modern web applications with the reliability, privacy, and zero-internet autonomy of local network infrastructure. Let us dive into the motivation and problem statement."

---

## Slide 2: Project Overview & System Objectives
* **Estimated Time:** 0:50 – 1:55 (65 seconds)
* **Visual on Screen:** Slide 2 showing What is a Collaborative Whiteboard, Limitations of Cloud Solutions, Project Vision, and the Distributed Star-Topology Concept Diagram.
* **Speaker:** **Manas Vivek (CS24B1106)**

### [Spoken Script]
> "To understand why we built this, let us look at the current landscape of collaborative whiteboards.
>
> In engineering labs, design studios, and university classrooms, teams rely heavily on shared digital whiteboards to sketch system architectures, brainstorm concepts, and solve technical problems synchronously.
>
> However, prevailing cloud solutions like Miro or Google Jamboard come with critical bottlenecks:
> 1. First, **Strict WAN and Internet Dependency**: They cannot function inside air-gapped laboratory networks or low-connectivity environments. If the internet drops, collaboration stops.
> 2. Second, **Privacy and Security Risks**: Proprietary engineering blueprints, source code annotations, and internal diagrams are transmitted to third-party public cloud servers.
> 3. Third, **Network Jitter and Lag**: Unpredictable packet routes across the internet introduce latency spikes and stroke desynchronization.
>
> Our project directly solves these challenges through three core engineering objectives:
> * **100% Offline Autonomy:** Our platform runs entirely within a physical local area network — over Wi-Fi or Ethernet switches — with zero external internet dependencies.
> * **Sub-5 millisecond Latency:** By utilizing direct local socket transport, peer strokes render almost instantaneously on connected displays.
> * **Total Data Sovereignty:** All room sessions, vector histories, and chat communications remain confined within the local host machine and subnet.
>
> Next, Anirudh will explain the underlying system architecture and network protocol design."

---

## Slide 3: System Architecture & Full-Stack Network Topology
* **Estimated Time:** 1:55 – 3:05 (70 seconds)
* **Visual on Screen:** Slide 3 showing Centralized Authority, WebSocket Streaming, framing, and the Central Server Dispatcher topology diagram.
* **Speaker:** **Anirudh (CS24B1025)**

### [Spoken Script]
> "Thank you, Manas. Looking at Slide 3, our system follows a centralized Star-Topology Client-Server paradigm operating over full-duplex TCP WebSockets.
>
> At the core of the network sits our **Node.js Central Server**, running on port 5000. The server maintains active socket registries — mapping room codes to participant connections — and acts as the authoritative source of truth.
>
> Here are the key networking mechanisms we implemented:
> 1. **Persistent WebSocket Streaming:** Instead of relying on wasteful HTTP polling, every client establishes a single, persistent full-duplex WebSocket connection. This reduces transport overhead and guarantees sub-5ms event propagation across local nodes.
> 2. **Deterministic Packet Framing:** In streaming sockets, packet fragmentation and 'sticky packets' are classic problems. We solved this by serializing all events into atomic JSON payloads delimited by clean frame boundaries and tagged with monotonic sequence numbers (`seq`).
> 3. **Memory & Room Isolation:** Collaboration is partitioned using unique 4-letter alphanumeric session codes, such as `SPZG` or `TEST`. The server ensures events received from a client are broadcast strictly to peers within that specific room code.
> 4. **Physical LAN Discovery:** To make LAN connection seamless, we implemented a UDP broadcast scanner on port 45455. The server automatically detects the host machine's active physical network adapter — whether Wi-Fi or Ethernet — while intelligently filtering out virtual adapters like WSL, Docker, or Hyper-V.
>
> Now, Krishna Chaitanya will present our vector drawing engine and canvas features."

---

## Slide 4: React 18 Vector Canvas, Synchronized Grids & Typography
* **Estimated Time:** 3:05 – 4:25 (80 seconds)
* **Visual on Screen:** Slide 4 with the screenshot of the live React canvas, floating toolbar, dynamic table, vector shapes, and sticky note.
* **Speaker:** **Krishna Chaitanya (CS24B1097)**

### [Spoken Script]
> "Thank you, Anirudh. On Slide 4, you can see our actual React 18 Canvas application interface.
>
> Building a multi-user vector canvas requires high rendering precision and zero input lag. Here is how our drawing engine is structured:
> * **Infinite Canvas with Coordinate Transformation:** Users are not restricted to a fixed viewport. We engineered coordinate transformation matrices that allow infinite two-dimensional panning and smooth, pointer-anchored zooming from 15% all the way to 400%.
> * **Real-Time Synchronized Grids:** Collaboration requires structural alignment. We implemented a synchronized canvas grid system. With a single click on the floating toolbar, the host or permitted members can cycle between **Square Graph Grid**, **Dot Matrix**, **Ruled Notebook Lines**, and **Plain Canvas**. Crucially, this state is synchronized across the network — all connected clients update their canvas grid in unison.
> * **Rich Vector Toolset:** We provide freehand Pencils with spline smoothing, Calligraphy Brushes, Translucent Highlighters with alpha channel blending, and Object-level Erasers.
> * **Geometric Shape Gallery with Fill Toggle:** Users can drop rectangles, rounded boxes, circles, triangles, diamonds, and stars. Shapes support stroke width selection and an optional **Fill Color** palette toggle.
> * **Interactive Tables & Sticky Notes:** As seen in our screenshot, users can insert dynamic tables with custom rows and columns, reposition them using the top drag pill, resize them via corner handles, and edit cell text directly. Sticky notes feature realistic handwriting typography.
> * **Typography Ribbon & Ink-to-Text OCR:** Our text engine supports 8 font families — including Inter Modern, JetBrains Mono Code, and Caveat Handwriting — with font sizing from 14 to 64 points, bold, italic, and integrated OCR that converts freehand handwriting into digital typography.
>
> Next, Harish will discuss session management and workspace portability."

---

## Slide 5: Session Isolation, React Hub Lobby & Workspace Portability
* **Estimated Time:** 4:25 – 5:35 (70 seconds)
* **Visual on Screen:** Slide 5 with the screenshot of the React Hub Lobby, room code input, create room modal, and personal offline button.
* **Speaker:** **Harish (CS24B1108)**

### [Spoken Script]
> "Thank you, Krishna. Moving to Slide 5, we look at session lifecycle and workspace management.
>
> To make the application accessible to all users, we built the **React Hub Lobby**, shown in the screenshot on the right:
> * **Dynamic Room Provisioning:** Any participant can create a new collaborative session with a single click. The backend generates a collision-resistant, 4-letter alphanumeric room code — for example, `TEST` or `SPZG` — making joining frictionless across machines.
> * **Direct LAN Addressing:** Participants on the local subnet simply enter the host machine's LAN IP address and room code. The connection establishes instantly across local switches or Wi-Fi routers without needing cloud authentication.
> * **User Identity & Avatar Badges:** Users choose a display name and avatar color. The server assigns unique badge identifiers that display across the participant list, chat drawer, and live canvas cursor overlays.
> * **Personal Offline Workspace:** We recognized that users often need to draft ideas individually before presenting to a group. We engineered a standalone Personal Offline Workspace that leverages browser `localStorage` and client-side persistence, running completely disconnected from any network.
> * **Whiteboard Package Exchange (`.whiteboard`):** For archiving and sharing, our export engine packages all vector actions, strokes, tables, and milestone instances into a standardized `.whiteboard` file bundle. Anyone can import this package into their personal workspace for offline review.
>
> Now, Anirudh will walk through the low-latency WebSocket event pipeline."

---

## Slide 6: Low-Latency WebSocket Event Pipeline & Dispatching
* **Estimated Time:** 5:35 – 6:45 (70 seconds)
* **Visual on Screen:** Slide 6 showing the 6-Step Visual Delivery Pipeline and socket mechanics cards.
* **Speaker:** **Anirudh (CS24B1025)**

### [Spoken Script]
> "Thank you, Harish. Slide 6 illustrates the end-to-end event propagation pipeline that powers our real-time collaboration.
>
> Let us trace what happens when a user draws a stroke or moves an object on the canvas:
> * **Step 1: User Action:** The user performs a gesture on the React canvas — such as drawing a vector spline, dropping a shape, or typing text.
> * **Step 2: Client-Side Serialization:** The event is serialized into a compact JSON dictionary containing the action ID, tool type, coordinate points array, color, and timestamp.
> * **Step 3: WebSocket Transport:** The JSON frame is transmitted over the full-duplex TCP WebSocket connection. In local network benchmarks, this transit takes less than 2 milliseconds.
> * **Step 4: Server Processing & Mutex Log:** The Node.js server receives the frame, verifies the sender's RBAC drawing permissions, assigns a sequential sequence number, and appends the action to the SQLite transaction log.
> * **Step 5: Room Broadcast Fan-Out:** In $O(N)$ time, the server fans out the serialized payload to all connected peer sockets in that specific room, bypassing the sender to prevent redundant echo loops.
> * **Step 6: Peer Canvas Render:** Peer browsers parse the JSON frame and render the vector mutation on their local HTML5 Canvas in under 5 milliseconds total round-trip time.
>
> Furthermore, when a new attendee joins mid-session, the server executes **State Hydration** via `join_ack`, replaying the entire accumulated action history so the late-joiner's canvas instantly matches the room.
>
> Harish will now cover multi-user collaboration and group chat."

---

## Slide 7: Multi-User Collaboration & Synchronous Group Chat
* **Estimated Time:** 6:45 – 7:55 (70 seconds)
* **Visual on Screen:** Slide 7 with the screenshot of the active whiteboard canvas, live cursor overlay, and docked chat drawer.
* **Speaker:** **Harish (CS24B1108)**

### [Spoken Script]
> "Thank you, Anirudh. On Slide 7, you can see our multi-user collaboration and communication suite.
>
> A whiteboard is only as effective as the communication accompanying it. We integrated several synchronous collaboration tools:
> * **Integrated Side-Drawer Chat:** Docked cleanly on the right side of the canvas, attendees can exchange technical text messages, code snippets, and design feedback without switching windows or interrupting the presenter.
> * **Message Metadata & SQLite Persistence:** Every chat message displays the sender's display name, unique avatar badge, and exact timestamp. All conversations are stored in a dedicated server-side SQLite database table, ensuring full historical retrieval upon reconnection.
> * **Live Remote Cursors:** As peers move their pointers across the board, their real-time positions, names, and colored arrows glide smoothly across other participants' viewports with sub-10ms interpolation.
> * **Presence & Audit Logs:** The system maintains an automated audit trail. When participants join, disconnect, or rejoin, automated system announcements are posted directly into the chat feed — for instance, *'👋 user2 joined the session'* or *'🚪 user3 left the room'*.
> * **Interactive Controls:** At the bottom right, attendees have access to quick emoji reactions, Raise Hand toggles, and view centering.
>
> Now, Manas will explain our deterministic host governance and RBAC matrix."

---

## Slide 8: Deterministic Role-Based Access Control & RBAC Matrix
* **Estimated Time:** 7:55 – 9:15 (80 seconds)
* **Visual on Screen:** Slide 8 with the screenshot of the Participants Drawer, 4-Dimensional Permission Matrix, and View-Only Lockout.
* **Speaker:** **Manas Vivek (CS24B1106)**

### [Spoken Script]
> "Thank you, Harish. Slide 8 highlights one of the most critical engineering innovations of our project: **Deterministic Host Governance and Role-Based Access Control**.
>
> In open collaborative whiteboards, a major problem is chaos — attendees accidentally overwriting diagrams, moving elements during a lecture, or spamming the chat. We solved this by designing a **4-Dimensional Permission Policy Matrix**:
> 1. **Canvas Drawing:** Controls who can draw, erase, insert shapes, tables, or text.
> 2. **Group Chat:** Controls who can send room-wide messages.
> 3. **Instance Management:** Controls who can save and restore canvas snapshots.
> 4. **Public Works Sharing:** Controls who can publish screenshots to the room gallery.
>
> For each of these four dimensions, the session host can deterministically enforce three distinct policies:
> * **Policy 1 — Host Only:** Strictly locks the capability to the host and co-hosts. All regular members have their drawing permission instantly revoked. On the client side, drawing tools are disabled with a visual *'View-Only'* lock badge, keyboard shortcuts are neutralized, and a full-width top banner notifies the user: *'🔒 You are in View-Only mode. Drawing is paused by the Host.'*
> * **Policy 2 — Selected Members:** When the host selects this option, our dedicated **Selected Members Modal** pops up. The host can search for members, use *Select All* or *Deselect All*, and toggle checkboxes for specific trusted collaborators.
> * **Policy 3 — Everyone:** Opens the room to unrestricted collaboration.
>
> Crucially, this governance is enforced deterministically on **both frontend and backend**. If a modified client attempts to send a unauthorized drawing packet, the Node.js server rejects the frame, logs a security notice, and re-syncs the member's locked permissions.
>
> Next, let us examine our milestone sandboxing and storage isolation features."

---

## Slide 9: Milestones, Sandboxed Simulation & Storage Isolation
* **Estimated Time:** 9:15 – 10:25 (70 seconds)
* **Visual on Screen:** Slide 9 showing the Instance Sandbox Banner with mode toggles, save workflow, and synchronized client screenshots.
* **Speaker:** **Manas Vivek (CS24B1106)**

### [Spoken Script]
> "On Slide 9, we present our **Milestones, Sandboxed Simulation, and Storage Isolation Engine**.
>
> During complex design sessions, teams frequently want to explore alternative ideas without risking the live collaborative whiteboard. We engineered a comprehensive solution:
> * **Point-in-Time Milestones:** At any moment, attendees can capture an immutable vector snapshot of the whiteboard state.
> * **Isolated Instance Sandbox Mode:** Any attendee can enter an instance in **Sandbox Simulation mode**, as shown in the top orange banner in our screenshot. In this sandbox:
>   * Users can freely sketch, add shapes, or erase without their edits affecting the live whiteboard or other participants.
>   * We provide a **3-Way View Switcher**: attendees can toggle between **📁 Original Snapshot** (the unmodified base state), **🧪 Sandbox Simulation** (their active experimentation workspace), and **👑 Host Sandbox** (a view of the host's published sandbox).
> * **Host-Exclusive Live Restoration:** To preserve meeting integrity, only the session host has the administrative authority to restore an instance or sandbox simulation back onto the live whiteboard.
> * **Privacy Separation (Two-Option Save Workflow):** When saving a screenshot or milestone, users are presented with two explicit choices:
>   * 💾 **Save in My Own System (Private):** Saves directly to local browser storage or desktop download. It remains strictly private and is never shown in the room.
>   * 🌐 **Share to Public Works:** Publishes to the room-wide public gallery for all participants, subject to host permission.
>
> Finally, let us review our individual engineering deliverables."

---

## Slide 10: Project Credits, Engineering Deliverables & Conclusion
* **Estimated Time:** 10:25 – 11:30 (65 seconds)
* **Visual on Screen:** Slide 10 with the 4 team cards detailing individual contributions.
* **Speaker:** **All Team Members / Concluded by Manas Vivek (CS24B1106)**

### [Spoken Script]
> *(Anirudh speaks)*:
> "To summarize our individual engineering deliverables:
> * As **CS24B1025 (Anirudh)**: I engineered the Node.js WebSocket backend server, designed our atomic JSON streaming protocol with sequence validation, built the physical network adapter discovery module, and optimized socket transport for sub-5ms event delivery."
>
> *(Krishna Chaitanya speaks)*:
> "* As **CS24B1097 (Krishna Chaitanya)**: I developed the high-performance React 18 Canvas 2D rendering pipeline, created our vector serialization format, implemented coordinate transforms for infinite pan and zoom, and built our modern floating toolbar and typography ribbon."
>
> *(Harish speaks)*:
> "* As **CS24B1108 (Harish)**: I architected the synchronous side-drawer group chat, engineered the SQLite database persistence schema, built the 4-letter room code discovery engine, and developed our `.whiteboard` package export/import system."
>
> *(Manas Vivek speaks)*:
> "* And as **CS24B1106 (Manas Vivek)**: I engineered our 4-dimensional deterministic RBAC governance matrix, created the Selected Members modal, architected the Isolated Instance Sandbox simulation with 3-way toggle, and conducted multi-client physical LAN benchmarking.
>
> In conclusion, our Collaborative Whiteboard demonstrates that modern web standards — React 18, WebSockets, HTML5 Canvas, and SQLite — can deliver institutional-grade, zero-cloud collaboration with ultra-low latency, total data privacy, and robust meeting governance.
>
> Thank you very much for your time. We are now open to any questions and would be delighted to demonstrate the live application."

---
*(End of Video Presentation Script)*
