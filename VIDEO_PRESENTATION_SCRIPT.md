# Video Presentation Script: LAN Collaborative Whiteboard
## Project: React 18 & Node.js Real-Time Collaborative Whiteboard
**Computer Networks Laboratory Project • Video Presentation & Demonstration**

---

### Video Overview & Recording Instructions
* **Total Estimated Duration:** ~10 to 12 minutes (approx. 2.5 to 3 minutes per speaker).
* **Format:** **Name Order Wise** — Every team member has their entire continuous dialogue, slide transitions, and on-screen demonstration cues grouped in their own dedicated section.
* **Recording Tip for Team Members:** Each speaker can record their entire audio and video segment in a single take by reading their designated section from top to bottom.
* **Team Members & Presentation Order:**
  1. **Speaker 1:** **Anirudh (CS24B1025)** — Project Welcome, System Architecture, Berkeley Sockets & WebSocket Event Pipeline *(Slides 1, 3, 6, 10)*
  2. **Speaker 2:** **Krishna Chaitanya (CS24B1097)** — React 18 Canvas 2D Engine, Coordinate Transforms, Synchronized Grids & Vector UI *(Slides 4, 10)*
  3. **Speaker 3:** **Harish (CS24B1108)** — React Hub Lobby, Session Lifecycle, Group Chat & SQLite Persistence *(Slides 5, 7, 10)*
  4. **Speaker 4:** **Manas Vivek (CS24B1106)** — Problem Statement, Deterministic RBAC Governance, Sandboxed Simulation & Conclusion *(Slides 2, 8, 9, 10)*

---

# Speaker 1: Anirudh (CS24B1025)
* **Primary Role:** Network Protocol Designer, Node.js WebSocket Server Architect, Berkeley Socket Implementer
* **Slides Covered:** Slide 1 (Project Title & Team Intro), Slide 3 (System Architecture & Network Topology), Slide 6 (Low-Latency WebSocket Event Pipeline), Slide 10 (Individual Deliverables Summary)
* **Total Speaking Duration:** ~3 minutes

---

### [Part 1.1: Project Welcome & Team Introduction]
* **Current Slide:** **Slide 1 — Title Slide & Team Cards**
* **Visual on Screen:** Presentation displays Slide 1 with the modern dark slate background, the official circular WB logo, project title, and the 4 member cards.
* **Visual Action:** Highlight or point the cursor over the team cards as names and roll numbers are announced.

#### [Spoken Script]
> "Hello everyone, and welcome to our final video presentation and demonstration for the Computer Networks Lab.
>
> Today, our team is proud to present our project: the **React and Node.js Real-Time Collaborative Whiteboard** — an institutional-grade, zero-cloud collaborative vector graphics platform engineered specifically for local area network environments.
>
> Before we dive into the technical architecture, let me introduce our project team:
> * First, myself, **Anirudh (CS24B1025)** — I engineered the network protocol, Berkeley TCP sockets, and the centralized Node.js WebSocket server architecture.
> * Second, **Krishna Chaitanya (CS24B1097)** — who developed our high-performance React 18 Canvas 2D engine, coordinate transformation mathematics, and multi-platform vector UI.
> * Third, **Harish (CS24B1108)** — who architected the integrated synchronous group chat, session isolation, and SQLite state persistence.
> * And fourth, **Manas Vivek (CS24B1106)** — who designed our 4-dimensional deterministic Role-Based Access Control matrix, sandboxed instance simulation, and LAN benchmarking suite.
>
> Together, we set out to solve the critical problem of real-time multi-user synchronization within air-gapped local networks with sub-5 millisecond latency and complete privacy."

---

### [Part 1.2: System Architecture & Full-Stack Network Topology]
* **Transition:** `[Switch to Slide 3]`
* **Current Slide:** **Slide 3 — System Architecture & Full-Stack Network Topology**
* **Visual on Screen:** Star-topology diagram showing the Central Node.js Server on port 5000, connected client nodes (Laptop, Tablet, Workstation), and the physical LAN discovery box.
* **Visual Action:** Point cursor to the central server box, trace the bi-directional arrows to client nodes, and hover over the UDP scanner box (port 45455).

#### [Spoken Script]
> "Now, moving to **Slide 3**, let us examine the core network architecture that powers our collaborative whiteboard.
>
> Our platform is engineered upon a centralized **Star-Topology Client-Server Paradigm** running over full-duplex TCP WebSockets. 
>
> At the center of our network topology sits the **Node.js Central Server**, running as an authoritative service on port 5000. In real-time multi-user applications, relying on stateless HTTP request-response cycles or short polling creates massive header overhead, packet fragmentation, and unacceptable lag. To eliminate this, every client establishes a single, persistent full-duplex WebSocket connection. This ensures continuous bi-directional event streaming with sub-5 millisecond local transit times.
>
> To support dynamic physical networks, we implemented two critical networking features:
> 1. **Zero-Configuration Physical LAN Discovery:** We built an automated UDP broadcast scanner on port 45455. When the server boots up, it scans the host machine's physical network adapters — whether connected via Gigabit Ethernet or 5GHz Wi-Fi. Crucially, our network filter automatically detects and ignores virtual host interfaces such as WSL, Hyper-V, and Docker bridges, ensuring clients on the LAN are always provided with the genuine physical subnet IP.
> 2. **Session & Room Isolation:** Collaboration is partitioned using collision-resistant, 4-letter alphanumeric session codes like `SPZG` or `TEST`. The server maintains active socket connection registries mapped to each room code, ensuring that vector events and chat messages are strictly contained within their intended workspace."

---

### [Part 1.3: Low-Latency WebSocket Event Pipeline & Dispatching]
* **Transition:** `[Switch to Slide 6]`
* **Current Slide:** **Slide 6 — Low-Latency WebSocket Event Pipeline & Dispatching**
* **Visual on Screen:** 6-step visual event delivery pipeline: Client Gesture → JSON Serialization → TCP Transport → Server Mutex & Log → Fan-Out Broadcast → Peer Canvas Render.
* **Visual Action:** Trace each step of the pipeline across the screen from left to right as you describe the event lifecycle.

#### [Spoken Script]
> "On **Slide 6**, we trace the lifecycle of an event through our **Low-Latency Event Propagation Pipeline**.
>
> When any participant draws on their screen, how does that stroke replicate deterministically across all peers in under 5 milliseconds? Here is the exact 6-step pipeline:
> * **Step 1 — User Action:** The user draws a stroke, drops a shape, or edits a table cell on the React canvas.
> * **Step 2 — Client-Side Serialization:** The canvas engine serializes the gesture into an atomic JSON packet containing a unique action ID, tool type, coordinate points array, color, line width, and timestamp.
> * **Step 3 — TCP WebSocket Transport:** The JSON frame is transmitted over the full-duplex socket. On a local Wi-Fi or Ethernet switch, this transit takes less than 2 milliseconds.
> * **Step 4 — Server Ingestion & Mutex Log:** The Node.js server receives the packet, verifies the sender's drawing permissions against the active RBAC matrix, assigns a strictly increasing monotonic sequence number (`seq`), and writes the action to the SQLite transaction log.
> * **Step 5 — Room Fan-Out Broadcast:** In $O(N)$ time, the server fans out the serialized payload to all active client sockets in that room code, intentionally bypassing the sender's socket to prevent redundant echo re-rendering.
> * **Step 6 — Peer Canvas Render:** Peer client browsers parse the payload and execute vector mutations on their local 2D HTML5 canvas. The total round-trip latency consistently benchmarks under 5 milliseconds.
>
> Furthermore, when a participant joins mid-session, the server triggers **State Hydration** via an authoritative `join_ack` message, sequentially replaying the entire accumulated action history so the new attendee's canvas instantly matches the room's live state."

---

### [Part 1.4: Anirudh's Individual Deliverables Summary]
* **Transition:** `[Keep ready for Slide 10 / Final Summary]`
* **Current Slide:** **Slide 10 — Project Credits & Engineering Deliverables**
* **Visual on Screen:** Card 1: CS24B1025 — Anirudh highlighted.

#### [Spoken Script]
> "To summarize my individual engineering contributions:
> * As **CS24B1025 (Anirudh)**: I architected the Node.js WebSocket backend server, designed our atomic JSON event protocol with monotonic sequence tagging, implemented the UDP network adapter discovery module for physical LANs, and tuned socket dispatching for sub-5 millisecond event propagation.
>
> Now, I hand over the presentation to **Krishna Chaitanya**, who will take you through the React 18 Canvas engine, synchronized grids, and vector typography."

---

# Speaker 2: Krishna Chaitanya (CS24B1097)
* **Primary Role:** Frontend Canvas Architect, React 18 UI/UX Engineer, Vector Graphics & Coordinate Math Specialist
* **Slides Covered:** Slide 4 (React 18 Vector Canvas, Synchronized Grids & Typography Ribbon), Slide 10 (Individual Deliverables Summary)
* **Total Speaking Duration:** ~2.5 minutes

---

### [Part 2.1: React 18 Vector Canvas, Synchronized Grids & Typography]
* **Transition:** `[Switch to Slide 4]`
* **Current Slide:** **Slide 4 — React 18 Vector Canvas, Synchronized Grids & Typography**
* **Visual on Screen:** High-resolution screenshot of the live React application showing the infinite canvas, floating glassmorphic toolbar, dynamic table with resize pill, vector shapes, sticky note, and top header with logo.
* **Visual Action:** Point to the floating bottom toolbar, demonstrate the grid toggle button, highlight the dynamic table and sticky note, and show the typography ribbon.

#### [Spoken Script]
> "Thank you, Anirudh.
>
> Looking at **Slide 4**, you can see our production React 18 Canvas application interface.
>
> When designing a real-time collaborative whiteboard, the canvas engine is the heart of user experience. It must deliver sub-frame rendering responsiveness, support vector-level precision, and scale seamlessly across diverse display resolutions. Here is how we engineered our frontend architecture:
>
> * **Infinite Canvas with Coordinate Transformation Math:** Users are never confined to a static viewport. We implemented 2D affine transformation matrices that support infinite two-dimensional panning and smooth, pointer-anchored zooming ranging from 15% all the way up to 400%. Mouse wheel and pinch gestures map directly to local canvas coordinates without loss of precision.
> * **Real-Time Synchronized Grids:** For technical schematics, mathematical layouts, and UI wireframing, structural alignment is essential. We engineered a synchronized canvas grid system. Directly from the floating toolbar, the host or authorized members can cycle through four distinct background modes:
>   1. **Square Graph Grid:** Standard engineering grid for diagrams and wireframes.
>   2. **Dot Matrix:** Minimalist layout for freeform flowcharts.
>   3. **Ruled Notebook Lines:** Ideal for handwritten lecture notes.
>   4. **Plain Canvas:** Clean background for freeform illustration.
>   Crucially, when the host switches the grid style, a synchronized socket event broadcasts the state change across the LAN, instantly updating the canvas background on every connected attendee's screen in real time.
> * **Rich Vector Toolset:** We built freehand Pencils with cubic Bézier smoothing, Calligraphy Brushes with angle-sensitive stroke widths, Translucent Highlighters with alpha-channel compositing, and smart Object-level Erasers that delete whole paths cleanly.
> * **Geometric Shape Gallery with Fill Toggle:** Users can insert rectangles, rounded boxes, circles, triangles, diamonds, and stars. We added an interactive **Fill Color** toggle: users can select an outline stroke and optionally choose an interior solid or translucent fill color.
> * **Interactive Tables & Sticky Notes:** As visible in our screenshot, users can insert dynamic tabular data structures. Tables feature custom rows and columns, a top drag handle pill for easy repositioning, corner handles for dynamic resizing, and in-cell text editing. Sticky notes feature realistic pastel backgrounds and handwriting typography.
> * **Typography Ribbon & Ink-to-Text OCR:** Our text engine supports 8 specialized font families — including Inter Modern, JetBrains Mono for code snippets, and Caveat Handwriting. Users can adjust sizes from 14 to 64 points, apply bold or italic formatting, and invoke our integrated OCR engine to convert handwritten strokes directly into digital vector typography."

---

### [Part 2.2: Krishna Chaitanya's Individual Deliverables Summary]
* **Transition:** `[Keep ready for Slide 10 / Final Summary]`
* **Current Slide:** **Slide 10 — Project Credits & Engineering Deliverables**
* **Visual on Screen:** Card 2: CS24B1097 — Krishna Chaitanya highlighted.

#### [Spoken Script]
> "To summarize my individual engineering contributions:
> * As **CS24B1097 (Krishna Chaitanya)**: I engineered the high-performance React 18 Canvas 2D rendering engine, developed our 2D coordinate transformation matrix for infinite pan and zoom, built the synchronized grid subsystem, created the interactive shape gallery with fill toggles, and designed our modern floating toolbar and typography ribbon.
>
> I now invite **Harish** to present our React Hub lobby, session management, and synchronous group chat suite."

---

# Speaker 3: Harish (CS24B1108)
* **Primary Role:** Session Management Architect, Database Engineer, Synchronous Chat & Presence Developer
* **Slides Covered:** Slide 5 (Session Isolation, React Hub Lobby & Workspace Portability), Slide 7 (Multi-User Collaboration & Synchronous Group Chat), Slide 10 (Individual Deliverables Summary)
* **Total Speaking Duration:** ~2.5 to 3 minutes

---

### [Part 3.1: Session Isolation, React Hub Lobby & Workspace Portability]
* **Transition:** `[Switch to Slide 5]`
* **Current Slide:** **Slide 5 — Session Isolation, React Hub Lobby & Workspace Portability**
* **Visual on Screen:** Screenshot of the React Hub Lobby showing the room code entry card, host room creation button, active rooms directory, and the 'Personal Offline Workspace' entry.
* **Visual Action:** Point to the 4-letter room code input box, show the Create Room modal trigger, and highlight the Personal Offline mode button.

#### [Spoken Script]
> "Thank you, Krishna.
>
> Turning to **Slide 5**, we present our **React Hub Lobby, Session Isolation, and Workspace Portability** architecture.
>
> In real-world enterprise and educational settings, collaboration must be intuitive and frictionless. We developed the React Hub Lobby to manage session discovery and user onboarding:
> * **Dynamic Room Provisioning:** Any participant can launch a collaborative workspace with a single click. The backend generates a collision-resistant, 4-letter alphanumeric room code — such as `SPZG` or `TEST`. This short code makes joining instantaneous without typing long, complex URLs.
> * **Direct LAN IP Addressing:** Users on the local Wi-Fi or Ethernet switch simply enter the host machine's LAN IP address and room code. The WebSocket connection handshake completes immediately over the physical LAN without requiring third-party cloud accounts or external internet access.
> * **User Identity & Avatar Badging:** Each participant selects a display name and avatar color upon joining. The system assigns a distinct visual identity that is synchronized across the participant drawer, chat feed, and live cursor indicators.
> * **Personal Offline Workspace:** We recognized that engineers and students often need to brainstorm individually before joining a live meeting. We built a standalone Personal Offline Workspace. Powered by browser `localStorage`, users can sketch, insert tables, and draft designs completely disconnected from any network.
> * **Whiteboard Package Exchange (`.whiteboard`):** To ensure workspace portability, our export engine packages all canvas vector strokes, tables, shapes, and metadata into a standardized `.whiteboard` file bundle. Users can export their meeting's work and import it into any other browser or offline session with 100% vector fidelity."

---

### [Part 3.2: Multi-User Collaboration & Synchronous Group Chat]
* **Transition:** `[Switch to Slide 7]`
* **Current Slide:** **Slide 7 — Multi-User Collaboration & Synchronous Group Chat**
* **Visual on Screen:** Screenshot of the live whiteboard with the docked right-hand chat drawer, real-time message bubbles with timestamps, live cursor overlays, and bottom interactive controls.
* **Visual Action:** Hover over the chat drawer on the right, point to the timestamps and sender avatars, highlight the remote user cursor arrow on the canvas, and point to the Raise Hand and reaction buttons.

#### [Spoken Script]
> "On **Slide 7**, you see our **Synchronous Group Chat and Real-Time Presence Suite**.
>
> Real-time visual collaboration is only complete when team members can communicate synchronously alongside their work:
> * **Integrated Side-Drawer Chat:** Docked cleanly on the right side of the canvas, attendees can exchange technical text messages, coordinate actions, and share notes without leaving the canvas or relying on secondary communication tools.
> * **SQLite Persistence & Message Metadata:** Every chat message displays the sender's name, avatar badge, and high-precision timestamp. Chat logs are persisted directly in a server-side SQLite database table. When an attendee refreshes their page or rejoins, their chat history is immediately re-hydrated.
> * **Smooth Remote Cursors:** As collaborators navigate the board, their cursor positions, display names, and color-coded arrows glide across peer viewports with sub-10ms linear interpolation, providing a strong sense of shared co-presence.
> * **Automated Presence & Audit Trail:** Whenever a participant connects, disconnects, or rejoins the room, the server automatically broadcasts system audit notices into the chat feed — such as *'👋 user2 joined the session'* or *'🚪 user3 left the room'*.
> * **Interactive Audience Controls:** Attendees have access to quick emoji reaction overlays, a Raise Hand toggle for structured classroom or meeting moderation, and a quick-centering button to snap the viewport directly back to the active drawing bounds."

---

### [Part 3.3: Harish's Individual Deliverables Summary]
* **Transition:** `[Keep ready for Slide 10 / Final Summary]`
* **Current Slide:** **Slide 10 — Project Credits & Engineering Deliverables**
* **Visual on Screen:** Card 3: CS24B1108 — Harish highlighted.

#### [Spoken Script]
> "To summarize my individual engineering contributions:
> * As **CS24B1108 (Harish)**: I developed the synchronous side-drawer group chat, engineered the SQLite database persistence layer for room states and messages, built the React Hub lobby with 4-letter room code provisioning, and implemented our `.whiteboard` package export and import engine.
>
> I now hand over the presentation to **Manas Vivek**, who will walk you through our project objectives, deterministic RBAC governance, sandboxed simulation, and conclusion."

---

# Speaker 4: Manas Vivek (CS24B1106)
* **Primary Role:** System Architect, RBAC Governance Designer, Sandboxed Simulation Engineer, Physical LAN Benchmark Lead
* **Slides Covered:** Slide 2 (Project Overview & Objectives), Slide 8 (Deterministic RBAC Governance & Matrix), Slide 9 (Milestones, Sandboxed Simulation & Storage Isolation), Slide 10 (Conclusion & Deliverables Summary)
* **Total Speaking Duration:** ~3.5 minutes

---

### [Part 4.1: Project Overview & Core System Objectives]
* **Transition:** `[Switch to Slide 2]`
* **Current Slide:** **Slide 2 — Project Overview & System Objectives**
* **Visual on Screen:** Slide 2 illustrating What is a Collaborative Whiteboard, Limitations of Cloud Solutions, Project Vision, and the LAN distributed concept diagram.
* **Visual Action:** Point to the 3 limitation cards (Internet Dependency, Privacy Risks, Latency Jitter) and contrast them with our 3 engineering objectives on the right.

#### [Spoken Script]
> "Thank you, Harish.
>
> Looking at **Slide 2**, let us examine the fundamental engineering motivation behind our collaborative whiteboard.
>
> In modern software development, hardware engineering, and academic labs, synchronous visual collaboration is essential. However, commercial cloud whiteboards — like Miro, FigJam, or Jamboard — present three severe limitations:
> 1. **Strict Internet Dependency:** They cannot function inside isolated, air-gapped laboratory networks or environments with intermittent connectivity.
> 2. **Data Sovereignty & Privacy Concerns:** Proprietary engineering schematics, trade secrets, and source code annotations are uploaded to third-party public cloud servers.
> 3. **Unpredictable Latency and Jitter:** Routing packets across the public internet introduces variable ping times, jitter, and stroke desynchronization.
>
> Our project was engineered to overcome these exact hurdles through three foundational objectives:
> * **100% Offline Autonomy:** Our platform operates entirely over local physical network infrastructure — Ethernet switches or local Wi-Fi — with zero dependency on the external internet.
> * **Deterministic Sub-5ms Synchronization:** By leveraging direct TCP sockets on local subnets, vector strokes and cursor movements propagate nearly instantaneously.
> * **Absolute Data Sovereignty:** All room state, vector undo/redo stacks, chat logs, and milestones remain strictly confined to the local host machine and physical subnet."

---

### [Part 4.2: Deterministic Role-Based Access Control & RBAC Matrix]
* **Transition:** `[Switch to Slide 8]`
* **Current Slide:** **Slide 8 — Deterministic Role-Based Access Control & RBAC Matrix**
* **Visual on Screen:** Screenshot of the Participants Drawer open on the right, showing the 4-dimensional permission matrix dropdowns, the Selected Members modal dialog with search and checkboxes, and the top View-Only warning banner.
* **Visual Action:** Point to the 4 permission dimensions, demonstrate the Selected Members dialog, and show the top View-Only banner.

#### [Spoken Script]
> "Now, moving to **Slide 8**, we present one of our project's most significant technical innovations: **Deterministic Host Governance and our 4-Dimensional Role-Based Access Control Matrix**.
>
> In unmoderated whiteboards, open collaboration frequently degenerates into chaos — students accidentally erasing a professor's lecture diagram, attendees moving elements simultaneously, or chat spam. We resolved this by engineering a fine-grained **4-Dimensional Permission Matrix**:
> 1. **Canvas Drawing:** Controls who can draw, erase, insert shapes, drop tables, or place sticky notes.
> 2. **Group Chat:** Controls who can post text messages into the public chat feed.
> 3. **Instance Management:** Controls who has authority to capture snapshots and restore canvas instances.
> 4. **Public Works Sharing:** Controls who is allowed to publish screenshots to the room's shared gallery.
>
> For each of these dimensions, the room host can enforce three deterministic policies:
> * **Policy 1 — Host Only:** Strictly restricts the action to the host. When enforced on Canvas Drawing, all regular participants are instantly locked out. Drawing tools are visually disabled, keyboard shortcuts are suppressed, and an amber banner notifies the user: *'🔒 You are in View-Only mode. Drawing is paused by the Host.'*
> * **Policy 2 — Selected Members:** When selected, our dedicated **Selected Members Modal** opens automatically. The host can search attendees by name, click *Select All* or *Deselect All*, and toggle specific checkboxes to grant granular privileges to trusted contributors.
> * **Policy 3 — Everyone:** Unlocks unrestricted collaboration for the entire room.
>
> Crucially, this governance is enforced **both client-side and server-side**. If an unauthorized client attempts to transmit a drawing packet, the Node.js server validates the sender's identity, rejects the packet, logs an audit warning, and broadcasts a permission resync frame."

---

### [Part 4.3: Milestones, Sandboxed Simulation & Storage Isolation]
* **Transition:** `[Switch to Slide 9]`
* **Current Slide:** **Slide 9 — Milestones, Sandboxed Simulation & Storage Isolation**
* **Visual on Screen:** Screenshot showing the top orange Instance Sandbox banner, the 3-way toggle switcher, the two-option save workflow dialog, and synchronized peer screens.
* **Visual Action:** Point to the top orange sandbox banner, highlight the 3 mode buttons (Original, Sandbox, Host Sandbox), and explain the private vs public save dialog.

#### [Spoken Script]
> "On **Slide 9**, we present our **Milestones, Sandboxed Simulation, and Storage Isolation Engine**.
>
> During complex collaborative problem solving, users often need to explore alternative hypotheses or test modifications without corrupting the live meeting canvas. We engineered a complete sandboxing workflow:
> * **Point-in-Time Milestones:** Participants can take immutable snapshots of the canvas at any critical milestone.
> * **Isolated Instance Sandbox Mode:** As highlighted by the prominent orange banner in our screenshot, any user can enter an instance in **Sandbox Simulation mode**. In this sandbox:
>   * The participant can freely sketch, experiment, or delete objects without their actions affecting the live whiteboard or peer displays.
>   * We provide a **3-Way View Switcher**: users can seamlessly toggle between **📁 Original Snapshot** (the pristine baseline), **🧪 Sandbox Simulation** (their personal experimental branch), and **👑 Host Sandbox** (a view of the host's published sandbox).
> * **Host-Exclusive Live Restoration:** To maintain structural integrity, only the host has administrative permission to restore a saved instance or sandbox state back onto the live production whiteboard.
> * **Privacy Separation via Two-Option Save Workflow:** When capturing a screenshot or saving an instance, the system prompts the user with two explicit choices:
>   1. 💾 **Save in My Own System (Private):** Saves directly to local browser storage or initiates a desktop PNG download. This remains 100% private and is never broadcast to the room.
>   2. 🌐 **Share to Public Works:** Publishes the asset to the room-wide shared gallery, subject to host permission.
>
> This guarantees total privacy for personal notes while enabling structured sharing for team milestones."

---

### [Part 4.4: Deliverables Summary, Project Conclusion & Q&A]
* **Transition:** `[Switch to Slide 10]`
* **Current Slide:** **Slide 10 — Project Credits, Engineering Deliverables & Conclusion**
* **Visual on Screen:** Slide 10 showing the 4 complete team member deliverable cards and the final conclusion box.
* **Visual Action:** Point to Card 4 (Manas Vivek), summarize deliverables, then make concluding eye contact with the camera.

#### [Spoken Script]
> "To summarize my individual engineering contributions:
> * As **CS24B1106 (Manas Vivek)**: I architected the 4-dimensional deterministic RBAC governance matrix, created the Selected Members modal dialog, engineered the Isolated Instance Sandbox simulation engine with 3-way view toggling, built the two-option privacy storage workflow, and conducted multi-client benchmarking across physical LAN subnets.
>
> In conclusion, our Collaborative Whiteboard project proves that standard modern web technologies — React 18, Node.js WebSockets, HTML5 Canvas 2D, and SQLite — can deliver institutional-grade, zero-cloud visual collaboration. We have achieved deterministic sub-5ms synchronization, airtight Role-Based Access Control, safe sandboxed experimentation, and complete data privacy within a standalone local area network.
>
> On behalf of **Anirudh, Krishna Chaitanya, Harish, and myself**, thank you very much for your time and attention. We are now excited to demonstrate the live application and answer any technical questions."

---

### Quick Reference: Speaker to Slide Mapping Matrix

| Speaker | Roll Number | Key Deliverables & Responsibilities | Slides Covered | Time Allocation |
| :--- | :--- | :--- | :--- | :--- |
| **Anirudh** | **CS24B1025** | Node.js WebSocket Server, TCP Socket Framing, UDP LAN Adapter Discovery, Low-Latency Dispatcher | **Slide 1, Slide 3, Slide 6, Slide 10** | ~3.0 min |
| **Krishna Chaitanya** | **CS24B1097** | React 18 Canvas 2D Engine, Coordinate Transforms (15%–400%), Synchronized Grids, Vector UI, Typography | **Slide 4, Slide 10** | ~2.5 min |
| **Harish** | **CS24B1108** | React Hub Lobby (4-Letter Codes), Synchronous Group Chat, SQLite State Persistence, `.whiteboard` Bundles | **Slide 5, Slide 7, Slide 10** | ~2.5 min |
| **Manas Vivek** | **CS24B1106** | Problem Statement, Deterministic 4D RBAC Matrix, Instance Sandbox Mode (3-Way Toggle), Storage Privacy | **Slide 2, Slide 8, Slide 9, Slide 10** | ~3.5 min |
| **Total Video Duration** | | **Comprehensive 10-Slide Video Presentation & Architecture Walkthrough** | **Slides 1 – 10** | **~11.5 min** |
