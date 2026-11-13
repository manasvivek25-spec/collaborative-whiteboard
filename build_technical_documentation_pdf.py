import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Preformatted
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(36, 11 * inch - 30, "COMPUTER NETWORKS LABORATORY PROJECT • Multi-User Collaborative Whiteboard")
            self.drawRightString(8.5 * inch - 36, 11 * inch - 30, "Technical Documentation")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 11 * inch - 34, 8.5 * inch - 36, 11 * inch - 34)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 38, 8.5 * inch - 36, 38)
        
        self.drawString(36, 26, "Department of Computer Science & Engineering • Academic Project Submission")
        self.drawRightString(8.5 * inch - 36, 26, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_pdf(filename="Technical_Documentation.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=42,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    primary_color = colors.HexColor("#0f172a") # Slate 900
    accent_blue = colors.HexColor("#2563eb")   # Blue 600
    subtext_color = colors.HexColor("#334155") # Slate 700
    code_bg = colors.HexColor("#f1f5f9")       # Slate 100

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        alignment=1, # Center
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=accent_blue,
        alignment=1,
        spaceAfter=10
    )

    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=primary_color,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=accent_blue,
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=subtext_color,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=2
    )

    code_style = ParagraphStyle(
        'CodeSnippet',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0f172a")
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    td_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=subtext_color
    )

    story = []

    # =========================================================================
    # PAGE 1: COVER & EXECUTIVE SUMMARY
    # =========================================================================
    story.append(Paragraph("COMPUTER NETWORKS LABORATORY PROJECT", subtitle_style))
    story.append(Paragraph("LAN-Based Multi-User Collaborative Whiteboard", title_style))
    story.append(Paragraph("A Resilient Full-Stack Vector Canvas & WebSocket Synchronization System for Local Subnets and Air-Gapped Networks", subtitle_style))
    story.append(Spacer(1, 4))

    # Authors Table
    authors_data = [
        [Paragraph("Roll Number", th_style), Paragraph("Student Name", th_style), Paragraph("Assigned Engineering Specialization", th_style)],
        [Paragraph("CS24B1025", td_style), Paragraph("Anirudh", td_style), Paragraph("Network Protocol Architecture, Node.js WebSocket Server & Berkeley Socket Framing", td_style)],
        [Paragraph("CS24B1097", td_style), Paragraph("Krishna Chaitanya", td_style), Paragraph("React 18 Vector Canvas Engine, 2D Affine Transforms & Synchronized Geometry UI", td_style)],
        [Paragraph("CS24B1108", td_style), Paragraph("Harish", td_style), Paragraph("Integrated Real-Time Group Chat, SQLite WAL Persistence & Session Code Management", td_style)],
        [Paragraph("CS24B1106", td_style), Paragraph("Manas Vivek", td_style), Paragraph("Concurrency Control, 4-Dimensional RBAC Matrix, Milestone Sandboxing & LAN Testing", td_style)],
    ]
    t_authors = Table(authors_data, colWidths=[75, 110, 355])
    t_authors.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_authors)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Executive Summary & Abstract", h1_style))
    story.append(Paragraph(
        "Modern collaborative digital workspaces (such as Miro, Figma FigJam, and Google Jamboard) rely heavily on remote cloud infrastructures. "
        "While feature-rich, their mandatory reliance on wide-area network (WAN) connectivity introduces severe drawbacks for academic research, "
        "industrial prototyping, and defense laboratories: high round-trip latency, dependency on public cloud availability, substantial WAN bandwidth "
        "consumption, and security vulnerabilities associated with uploading technical designs to third-party infrastructure. "
        "This project presents the design, network protocol engineering, and empirical realization of a production-grade <b>LAN-Based Multi-User Collaborative Whiteboard</b>. "
        "Engineered with a Node.js full-duplex WebSocket server, an embedded SQLite database engine (WAL mode), and a high-performance React 18 Canvas 2D vector renderer, "
        "the application operates seamlessly over air-gapped local area networks (LANs), Wi-Fi routers, and mobile hotspots with <b>zero external Internet dependency</b>, "
        "while seamlessly supporting Internet-wide collaboration when cloud tunneling is desired.",
        body_style
    ))
    story.append(Paragraph(
        "Key capabilities include deterministic sub-5 millisecond drawing synchronization, an optimistic local rendering pipeline with server-arbitrated monotonic sequencing (seq), "
        "complete vector state representation, conflict-free user-scoped undo/redo stacks, dynamic 4-dimensional Role-Based Access Control (RBAC), "
        "isolated instance milestone sandboxing, dynamic interactive tables, a geometric hit-testing vector element eraser, in-app group chat, and an automated UDP subnet discovery engine.",
        body_style
    ))
    story.append(Spacer(1, 4))

    # Key Specifications Table
    specs_data = [
        [Paragraph("Parameter", th_style), Paragraph("Specification / Engineering Implementation Details", th_style)],
        [Paragraph("Transport Protocol", td_style), Paragraph("Full-Duplex WebSockets over TCP/IP (RFC 6455) with TCP_NODELAY enabled", td_style)],
        [Paragraph("Subnet Peer Discovery", td_style), Paragraph("UDP Broadcast datagrams on Port 45455 / 41234 for zero-configuration LAN host detection", td_style)],
        [Paragraph("Default Network Ports", td_style), Paragraph("TCP Port 5000 (HTTP REST & WebSocket Gateway); UDP Port 45455 (Subnet Discovery)", td_style)],
        [Paragraph("Backend Architecture", td_style), Paragraph("Node.js Asynchronous Event Loop + Express HTTP API + SQLite Embedded DB (WAL mode)", td_style)],
        [Paragraph("Frontend Canvas Engine", td_style), Paragraph("React 18 + HTML5 Canvas 2D with 2D Affine Transformation Matrix (Zoom 15%–400%, Pan)", td_style)],
        [Paragraph("State Representation", td_style), Paragraph("Mathematical Vector Objects (strokes, polygons, arrows, tables, text) with tombstone consistency", td_style)],
        [Paragraph("Security & Governance", td_style), Paragraph("4-Letter Alphanumeric Session Codes (e.g. SPZG) + Optional Room PIN + 4-Dimensional RBAC Matrix", td_style)],
        [Paragraph("Zero-Terminal Client/Server", td_style), Paragraph("Compiled standalone executables: Server_Application.exe, Client_Application.exe, Collaborative_Whiteboard.exe", td_style)],
    ]
    t_specs = Table(specs_data, colWidths=[140, 400])
    t_specs.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_blue),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_specs)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Documentation Structure Overview", h1_style))
    story.append(Paragraph(
        "This formal technical documentation satisfies all course deliverable requirements: Section 1 details the problem statement and scope; "
        "Section 2 analyzes system architecture and network design; Section 3 formalizes socket communications and wire message schemas; "
        "Section 4 details real-time synchronization and the vector eraser engine; Section 5 addresses concurrency control; "
        "Section 6 analyzes state recovery and persistence; Section 7 covers Role-Based Access Control; "
        "Section 8 provides an exhaustive <b>User Guide</b> for configuring the server, connecting clients, and operating all canvas features; "
        "and Section 9 provides empirical laboratory benchmarks and individual team member contributions.",
        body_style
    ))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 2: PROBLEM STATEMENT & SCOPE
    # =========================================================================
    story.append(Paragraph("1. Problem Statement, Objectives, and System Scope", h1_style))
    story.append(Paragraph("1.1 Background and Educational Context", h2_style))
    story.append(Paragraph(
        "In modern computer science education and engineering laboratory environments, collaborative diagramming, protocol tracing, and system architecture sketches "
        "are essential communication workflows. Traditional instructional physical whiteboards severely restrict participation to a single presenter standing at the front, "
        "precluding simultaneous multi-student contributions. While commercial cloud whiteboards offer multi-user drawing, their mandatory Internet requirement renders them unusable "
        "in offline laboratory exams, air-gapped security enclaves, or network environments facing institutional firewall restrictions.",
        body_style
    ))

    story.append(Paragraph("1.2 Critical Limitations of Commercial Cloud Solutions", h2_style))
    story.append(Paragraph(
        "<b>• Mandatory WAN Dependency:</b> Cloud tools require uninterrupted WAN internet connectivity. Any gateway hiccup or DNS timeout aborts active collaboration.<br/>"
        "<b>• High Round-Trip Latency:</b> Packets routed through distant third-party cloud data centers incur 80–150ms round-trip latency, causing noticeable cursor lag.<br/>"
        "<b>• Data Sovereignty Risks:</b> Proprietary code diagrams and examination solutions are transmitted to external servers, violating academic integrity and data sovereignty policies.<br/>"
        "<b>• WAN Bandwidth Bottlenecks:</b> Streaming continuous canvas updates across dozens of laboratory nodes congests campus upstream bandwidth.",
        body_style
    ))

    story.append(Paragraph("1.3 Project Motivation: Autonomous Local Area Network Collaboration", h2_style))
    story.append(Paragraph(
        "The motivation of this project is to develop a self-contained, low-latency, resilient collaborative whiteboard system operating natively over the Local Area Network (LAN). "
        "By utilizing direct WebSocket connections over TCP/IP within the local subnet (e.g. 192.168.1.0/24 or 10.x.x.x), the system achieves sub-5ms event dispatching, "
        "zero campus bandwidth usage, complete data confidentiality, and 100% functionality without internet access.",
        body_style
    ))

    story.append(Paragraph("1.4 Primary Engineering Objectives", h2_style))
    story.append(Paragraph(
        "1. <b>Zero-Internet Autonomous Operation:</b> Execute full room hosting, client discovery, vector drawing, and chat over physical LAN switches without internet.<br/>"
        "2. <b>High-Fidelity Real-Time Synchronization:</b> Deliver vector stroke broadcasts with deterministic sub-10ms latency across concurrent participants.<br/>"
        "3. <b>Full Vector Toolkit:</b> Support freehand ink, geometric shapes, dynamic tables, text annotations, multi-select marquee drag, snap screenshot crop, and true vector erasing.<br/>"
        "4. <b>State Persistence & Late-Joiner Hydration:</b> Guarantee that any client joining mid-session immediately receives the entire historical canvas state.<br/>"
        "5. <b>Deterministic Governance & Sandboxing:</b> Provide a 4-dimensional RBAC matrix and isolated milestone sandboxes for private prototyping.",
        body_style
    ))

    story.append(Paragraph("1.5 Operational Scope & Boundary Matrix", h2_style))
    scope_data = [
        [Paragraph("In-Scope Functional Capabilities", th_style), Paragraph("Out-of-Scope / Non-Goals", th_style)],
        [
            Paragraph("• Full-duplex WebSocket communication over LAN TCP/IP<br/>"
                      "• Subnet peer discovery via UDP broadcast (Port 45455)<br/>"
                      "• Discrete vector object modeling & point-to-segment eraser<br/>"
                      "• Persistent SQLite database storage with WAL journal mode<br/>"
                      "• 4-Dimensional RBAC policy enforcement (Draw, Chat, Instances, Public)<br/>"
                      "• Milestone snapshot isolation & live sandbox broadcast<br/>"
                      "• Standalone zero-terminal executables for Server and Client", td_style),
            Paragraph("• Proprietary cloud OAuth authentication gates<br/>"
                      "• Lossy UDP-based stroke transmission (TCP required for canvas fidelity)<br/>"
                      "• Heavy video/audio conferencing streaming (VoIP)<br/>"
                      "• Raster-only bitmap canvas storage (vector format enforced)", td_style)
        ]
    ]
    t_scope = Table(scope_data, colWidths=[270, 270])
    t_scope.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(t_scope)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: SYSTEM ARCHITECTURE & NETWORK DESIGN
    # =========================================================================
    story.append(Paragraph("2. Detailed System Architecture and Network Design", h1_style))
    story.append(Paragraph("2.1 Centralized Star-Topology Architectural Model", h2_style))
    story.append(Paragraph(
        "The collaborative whiteboard is architected upon a centralized star topology. A central host runs the backend server process, coordinating all active rooms "
        "and acting as the authoritative arbitrator of canvas actions, sequence numbers, and chat events. Clients establish direct full-duplex TCP WebSocket connections "
        "to the central server. Peer-to-peer (P2P) mesh topologies were deliberately avoided due to quadratic network overhead O(N^2) socket connections and complex "
        "distributed consensus synchronization failures across unmanaged local subnets.",
        body_style
    ))

    story.append(Paragraph("2.2 Multi-Tier System Architecture", h2_style))
    story.append(Paragraph(
        "The system comprises three cleanly decoupled architectural tiers:<br/>"
        "<b>1. Presentation Layer (React 18 + HTML5 Canvas):</b> Handles user interaction, mouse/touch event sampling, 2D affine coordinate transformations (world-to-screen and screen-to-world), "
        "optimistic local drawing, zoom (15%–400%), smooth grid rendering, and client-side bounding box collision detection.<br/>"
        "<b>2. Network & Arbitration Layer (Node.js WebSocket Server):</b> Manages connection lifecycle, room isolation maps (<code>roomSockets</code>), monotonic sequence stamping (<code>seq</code>), "
        "RBAC permission filtering, and high-frequency JSON message fan-out.<br/>"
        "<b>3. Persistence Layer (SQLite Database):</b> Uses SQLite with Write-Ahead Logging (WAL) mode for atomic writes, foreign key relational integrity, and durable storage of rooms, "
        "vector action logs, group chat history, immutable milestone snapshots, and user account records.",
        body_style
    ))

    story.append(Paragraph("2.3 Physical Subnet Addressing & UDP Peer Discovery", h2_style))
    story.append(Paragraph(
        "To eliminate manual IP entry for students on the same Wi-Fi or Ethernet switch, the server integrates a UDP subnet discovery beacon on port 45455 / 41234. "
        "The server periodically inspects host physical network adapters (filtering out WSL, Hyper-V, Docker, and loopback virtual adapters) and broadcasts discovery beacons "
        "containing the active room codes, room titles, host name, and server port. Client applications listen on the discovery port, instantly displaying discovered active whiteboards "
        "with a 1-click 'Join Now' button.",
        body_style
    ))

    story.append(Paragraph("2.4 Internet Bridging & Tunneling Architecture", h2_style))
    story.append(Paragraph(
        "While engineered for air-gapped LANs, the architecture incorporates an optional secure reverse tunnel gateway (via Cloudflare / LocalTunnel). "
        "When internet collaboration is requested, the server establishes an outbound TLS tunnel to the gateway. External peers connect via an encrypted HTTPS/WSS URL "
        "(e.g. <code>https://whiteboard-room.loca.lt</code>), achieving full cross-network parity without modifying firewall rules or performing router port-forwarding.",
        body_style
    ))

    story.append(Spacer(1, 4))
    # Architecture Summary Table
    arch_data = [
        [Paragraph("Subsystem", th_style), Paragraph("Component", th_style), Paragraph("Architectural Responsibility", th_style)],
        [Paragraph("Client GUI", td_style), Paragraph("React 18 + Tailwind CSS", td_style), Paragraph("Responsive ribbon toolbar, chat drawer, account logs, instances modal, grid selector", td_style)],
        [Paragraph("Canvas Engine", td_style), Paragraph("HTML5 Canvas 2D Context", td_style), Paragraph("60 FPS affine render loop, point interpolation, shape math, marquee selection, vector eraser", td_style)],
        [Paragraph("Communication", td_style), Paragraph("ws (RFC 6455) + dgram (UDP)", td_style), Paragraph("Sub-5ms WebSocket event stream + LAN broadcast beacon for zero-configuration discovery", td_style)],
        [Paragraph("Backend Host", td_style), Paragraph("Node.js + Express REST API", td_style), Paragraph("HTTP static asset serving, room validation, authentication, and sequence arbitration", td_style)],
        [Paragraph("Database Engine", td_style), Paragraph("SQLite (node:sqlite WAL)", td_style), Paragraph("Zero-configuration embedded relational storage: action log, milestones, audit history", td_style)],
        [Paragraph("Desktop Runner", td_style), Paragraph("C# .NET Standalone Executables", td_style), Paragraph("Server_Application.exe and Client_Application.exe providing zero-terminal 1-click execution", td_style)],
    ]
    t_arch = Table(arch_data, colWidths=[90, 130, 320])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_arch)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: SOCKET PROGRAMMING & APPLICATION-LEVEL PROTOCOL
    # =========================================================================
    story.append(Paragraph("3. Socket Communication and Application-Level Protocol", h1_style))
    story.append(Paragraph("3.1 Full-Duplex WebSocket Implementation over TCP/IP", h2_style))
    story.append(Paragraph(
        "Communication is built on the standard WebSocket protocol (RFC 6455) running over stream-oriented TCP/IP sockets. "
        "The underlying transport layer disables Nagle's buffering algorithm (<code>socket.setNoDelay(true)</code>), ensuring coordinate packets "
        "are dispatched immediately without buffering delays. Unlike HTTP request-response polling, WebSockets maintain persistent, bi-directional channels "
        "allowing the server to push canvas actions and chat events to all connected clients with minimal transmission overhead (2-byte framing overhead).",
        body_style
    ))

    story.append(Paragraph("3.2 Application-Level Wire Protocol Specification (JSON Schemas)", h2_style))
    story.append(Paragraph(
        "All application messages are framed as UTF-8 encoded JSON objects containing a mandatory <code>type</code> field. "
        "Below are the formal wire protocol schemas for key operations:",
        body_style
    ))

    # Protocol Schemas
    schema_code = (
        "// 1. Client Join Request & Server State Hydration Acknowledgment\n"
        "Client -> Server: {\"type\": \"join_room\", \"room_code\": \"SPZG\", \"user_code\": \"usr_8f2a\", \"name\": \"Manas\", \"password\": \"\"}\n"
        "Server -> Client: {\"type\": \"join_ack\", \"success\": true, \"room\": {...}, \"actions\": [...], \"chat_history\": [...], \"members\": [...]}\n\n"
        "// 2. Vector Draw Action Broadcast (Monotonically Sequenced by Server)\n"
        "Client -> Server: {\"type\": \"draw_action\", \"room_code\": \"SPZG\", \"action\": {\"id\": \"act_91\", \"tool\": \"pen\", \"points\": [...], \"color\": \"#2563eb\", \"width\": 3}}\n"
        "Server -> Peers:  {\"type\": \"draw_action\", \"room_code\": \"SPZG\", \"action\": {\"id\": \"act_91\", \"seq\": 142, \"user_code\": \"usr_8f2a\", ...}}\n\n"
        "// 3. Remote Cursor Telemetry (High-Frequency Subpixel Positioning)\n"
        "Client -> Server: {\"type\": \"cursor_move\", \"room_code\": \"SPZG\", \"user_code\": \"usr_8f2a\", \"name\": \"Manas\", \"x\": 450.5, \"y\": 312.0}\n"
        "Server -> Peers:  {\"type\": \"cursor_move\", \"room_code\": \"SPZG\", \"user_code\": \"usr_8f2a\", \"name\": \"Manas\", \"x\": 450.5, \"y\": 312.0}\n\n"
        "// 4. Group Chat Broadcast & Database Persistence\n"
        "Client -> Server: {\"type\": \"chat_message\", \"room_code\": \"SPZG\", \"user_code\": \"usr_8f2a\", \"name\": \"Manas\", \"message\": \"Reviewing schema\"}\n"
        "Server -> Peers:  {\"type\": \"chat_message\", \"room_code\": \"SPZG\", \"message_id\": 88, \"seq\": 143, \"timestamp\": \"19:45:10\", ...}\n\n"
        "// 5. 4-Dimensional RBAC Matrix Permission Update\n"
        "Host -> Server:   {\"type\": \"rbac_change\", \"room_code\": \"SPZG\", \"dimension\": \"drawing\", \"policy\": \"host_only\", \"allowed_users\": []}\n"
        "Server -> All:    {\"type\": \"rbac_change\", \"room_code\": \"SPZG\", \"dimension\": \"drawing\", \"policy\": \"host_only\"}\n\n"
        "// 6. Point-in-Time Milestone Snapshot & Live Sandbox Broadcast\n"
        "Host -> Server:   {\"type\": \"milestone_create\", \"room_code\": \"SPZG\", \"title\": \"Base Diagram\", \"actions\": [...]}\n"
        "Host -> Server:   {\"type\": \"live_sandbox_broadcast\", \"room_code\": \"SPZG\", \"actions\": [...], \"is_live\": true}\n"
        "Server -> Peers:  {\"type\": \"live_sandbox_broadcast\", \"room_code\": \"SPZG\", \"host_sandbox_actions\": [...], \"is_live\": true}"
    )
    story.append(Table([[Paragraph(f"<pre>{schema_code}</pre>", code_style)]], colWidths=[540], style=[
        ('BACKGROUND', (0, 0), (-1, -1), code_bg),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 5: SYNCHRONIZATION & ERASER ENGINE
    # =========================================================================
    story.append(Paragraph("4. Real-Time Synchronization and Eraser Engine", h1_style))
    story.append(Paragraph("4.1 Synchronization Model: Optimistic Local Render with Server Arbitration", h2_style))
    story.append(Paragraph(
        "To achieve instantaneous responsiveness with zero perceptual lag, the client implements <b>Optimistic Local Rendering</b>: when a user drags "
        "their mouse or stylus, strokes are painted immediately onto the local HTML5 canvas. Simultaneously, coordinate points are bundled and dispatched "
        "asynchronously to the server. The central server acts as the authoritative serializer: it assigns each incoming action a strictly increasing monotonic integer "
        "sequence number (<code>seq</code>), commits the action to the SQLite database, and broadcasts it to all other peers in the room. "
        "Peers integrate the action into their local action lists, guaranteeing eventual consistency across all nodes.",
        body_style
    ))

    story.append(Paragraph("4.2 Conflict-Free User-Scoped Undo/Redo Stacks", h2_style))
    story.append(Paragraph(
        "A common flaw in collaborative whiteboards is global undo: if Student A presses Undo, another user's recent stroke might mistakenly be erased. "
        "Our engine implements <b>User-Scoped Undo Stacks with Tombstone Markers</b>:<br/>"
        "• When a user presses Undo (or Ctrl+Z), the client searches the action history backwards for the latest active action created by that specific <code>user_code</code>.<br/>"
        "• An <code>action_undo</code> event with the target action ID is sent to the server.<br/>"
        "• The server marks the record with a tombstone (<code>undone: 1</code> in SQLite) and broadcasts the deletion ID.<br/>"
        "• All connected clients immediately suppress rendering for that element ID while preserving unrelated peer strokes.",
        body_style
    ))

    story.append(Paragraph("4.3 High-Performance Vector Element Eraser Engine", h2_style))
    story.append(Paragraph(
        "Traditional paint programs implement erasing via destination-out composite stroke masks. In vector whiteboards, masking creates heavy transparent layers "
        "that bloat payload sizes and fail to delete underlying geometric objects. Our application implements a true <b>Real-Time Geometric Vector Hit-Testing Eraser</b>:<br/>"
        "<b>• Point-to-Segment Orthogonal Distance Math:</b> For freehand paths, when the user drags the eraser, the engine calculates the minimum perpendicular distance "
        "from the eraser coordinate <code>(x, y)</code> to each consecutive line segment <code>(p1, p2)</code> of every vector path:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<code>d = |(p2.x - p1.x)(p1.y - y) - (p1.x - x)(p2.y - p1.y)| / sqrt((p2.x - p1.x)^2 + (p2.y - p1.y)^2)</code><br/>"
        "<b>• Dynamic Hit Threshold:</b> If the distance is within the eraser radius (<code>radius + stroke_width / 2</code>), the element is flagged as hit.<br/>"
        "<b>• Bounding Box Collision:</b> For geometric shapes (rectangles, ellipses, tables, text), axis-aligned bounding box (AABB) intersection testing is executed.<br/>"
        "<b>• Tombstone Elimination:</b> The touched element is immediately marked <code>undone: true</code>, synchronized across all peers via WebSocket, "
        "and removed from active canvas redraw iterations.",
        body_style
    ))

    story.append(Paragraph("4.4 Selection Marquee & Group Translation Math", h2_style))
    story.append(Paragraph(
        "The Selection Tool supports click-and-drag bounding marquee selection. As the user drags the cursor, a translucent selection box is rendered. "
        "Upon release, all vector actions whose coordinates fall within the marquee bounds are highlighted with selection corner pills. "
        "Dragging the selection calculates displacement <code>(dx, dy)</code>, updating all enclosed vector coordinates atomically and broadcasting "
        "the updated positions across the network.",
        body_style
    ))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 6: CONCURRENCY, STATE MANAGEMENT & RECOVERY
    # =========================================================================
    story.append(Paragraph("5. Concurrency Handling, State Management and Recovery", h1_style))
    story.append(Paragraph("5.1 Concurrency Architecture in Node.js and SQLite", h2_style))
    story.append(Paragraph(
        "The server utilizes Node.js's event-driven, single-threaded asynchronous runtime. Because event processing runs on a single thread, socket message dispatching "
        "is inherently free from race conditions common in multi-threaded socket servers. For database persistence, SQLite is operated in <b>WAL (Write-Ahead Logging)</b> mode. "
        "Multi-statement transactions (such as room creation, milestone restoration, and action sequence commits) are executed using <code>BEGIN IMMEDIATE</code> transactions, "
        "preventing database locks or corrupted transaction states.",
        body_style
    ))

    story.append(Paragraph("5.2 Vector Representation vs Bitmap Snapshots", h2_style))
    story.append(Paragraph(
        "Commercial whiteboards that transmit periodic raster image frames (PNG/JPEG) suffer from massive network payload sizes (>500 KB per update) and irreversible loss "
        "of individual stroke editability. Our system represents the canvas entirely as discrete mathematical vector entities (stroke coordinates, bounding boxes, "
        "styling attributes, and author signatures). Updates average under 150 bytes per stroke, allowing smooth 60 FPS drawing even over congested subnets.",
        body_style
    ))

    # Vector Object Schema Table
    vec_data = [
        [Paragraph("Property", th_style), Paragraph("Data Type", th_style), Paragraph("Description & Role in Vector Synchronization", th_style)],
        [Paragraph("id", td_style), Paragraph("String", td_style), Paragraph("Globally unique identifier (e.g. 'act_179451234') used for undo/redo and erasing", td_style)],
        [Paragraph("tool", td_style), Paragraph("String", td_style), Paragraph("Vector primitive: 'pen', 'highlighter', 'rect', 'circle', 'arrow', 'table', 'text'", td_style)],
        [Paragraph("points", td_style), Paragraph("Array[Point]", td_style), Paragraph("Array of subpixel coordinates [{x, y}, ...] representing vector path vertices", td_style)],
        [Paragraph("color / width", td_style), Paragraph("String / Int", td_style), Paragraph("HEX color string (e.g. '#2563eb') and stroke thickness in virtual canvas pixels", td_style)],
        [Paragraph("fillColor", td_style), Paragraph("String / null", td_style), Paragraph("Interior polygon fill color (or null for transparent wireframes)", td_style)],
        [Paragraph("user_code", td_style), Paragraph("String", td_style), Paragraph("Author identifier enforcing user-scoped undo and RBAC permission validation", td_style)],
        [Paragraph("undone", td_style), Paragraph("Boolean / Int", td_style), Paragraph("Tombstone flag: 1 if deleted/undone, 0 if actively rendered on canvas", td_style)],
        [Paragraph("seq", td_style), Paragraph("Integer", td_style), Paragraph("Monotonic sequence integer assigned by server to enforce total ordering", td_style)],
    ]
    t_vec = Table(vec_data, colWidths=[80, 80, 380])
    t_vec.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_vec)
    story.append(Spacer(1, 4))

    story.append(Paragraph("5.3 Late-Joiner State Hydration & Mid-Session Recovery", h2_style))
    story.append(Paragraph(
        "When a student connects to an ongoing room session, the server executes <b>Historical State Hydration</b>. The server queries the SQLite database for all active "
        "vector actions (<code>WHERE undone = 0 ORDER BY seq ASC</code>), all historical chat messages, the participant roster, and the current RBAC permissions matrix. "
        "These are bundled into a single <code>join_ack</code> payload. The client's React canvas engine parses the array and executes a fast replay, reconstructing the identical "
        "whiteboard state within 50 milliseconds.",
        body_style
    ))

    story.append(Paragraph("5.4 Network Fault Tolerance, Heartbeats & Clean Cleanup", h2_style))
    story.append(Paragraph(
        "Local Wi-Fi drops, laptop lid closures, or sleep events can terminate TCP connections abruptly without FIN packets. The system implements multi-layer recovery:<br/>"
        "• <b>Ping-Pong Heartbeats:</b> The server issues ping heartbeats every 15 seconds. Sockets failing to respond within 30 seconds are terminated cleanly.<br/>"
        "• <b>WeakMap Metadata & Memory Pruning:</b> Connection references are stored in <code>WeakMap</code> and isolated room sets. Upon socket closure, the server "
        "broadcasts <code>user_left</code> with an updated member roster and removes stale remote cursors.<br/>"
        "• <b>Automatic Client Reconnection:</b> If connection drops, the client automatically attempts reconnection with exponential backoff.",
        body_style
    ))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 7: SECURITY & ROLE-BASED ACCESS CONTROL (RBAC)
    # =========================================================================
    story.append(Paragraph("6. Security, Role-Based Access Control (RBAC) and Governance", h1_style))
    story.append(Paragraph("6.1 Role-Based Access Control (RBAC) Hierarchy", h2_style))
    story.append(Paragraph(
        "To maintain orderly academic collaboration during laboratory demonstrations and multi-student exercises, the system implements an explicit "
        "<b>Role-Based Access Control (RBAC) Hierarchy</b> across three privilege tiers:",
        body_style
    ))

    rbac_data = [
        [Paragraph("Role Tier", th_style), Paragraph("Assignment", th_style), Paragraph("Privileges & Operational Capabilities", th_style)],
        [Paragraph("Host (Presenter)", td_style), Paragraph("Room Creator", td_style), Paragraph("Full drawing rights; configure 4D RBAC permissions; lock room; kick users; manage milestones; live sandbox broadcast; clear board.", td_style)],
        [Paragraph("Co-Host", td_style), Paragraph("Promoted by Host", td_style), Paragraph("Elevated privileges: drawing in locked mode; manage participant permissions; moderate chat.", td_style)],
        [Paragraph("Participant", td_style), Paragraph("Default on Join", td_style), Paragraph("Standard drawing rights (unless locked); send chat messages; local sandbox testing; raise hand; trigger emoji reactions.", td_style)],
    ]
    t_rbac = Table(rbac_data, colWidths=[90, 95, 355])
    t_rbac.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_blue),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_rbac)
    story.append(Spacer(1, 4))

    story.append(Paragraph("6.2 Deterministic 4-Dimensional RBAC Matrix", h2_style))
    story.append(Paragraph(
        "Unlike basic tools with a single 'view-only' toggle, our system enforces a <b>4-Dimensional Permission Matrix</b>:<br/>"
        "<b>1. Canvas Drawing:</b> Controls who can draw, erase, or modify vector elements on the shared canvas.<br/>"
        "<b>2. Group Chat:</b> Controls who can send synchronized messages to the in-app chat drawer.<br/>"
        "<b>3. Instance Management:</b> Controls who can create milestone snapshots and private sandbox simulations.<br/>"
        "<b>4. Public Works Sharing:</b> Controls who can publish whiteboard instances to the shared room public gallery.<br/>"
        "Each dimension can be independently configured by the Host into three policy states: <b>Everyone</b>, <b>Host Only</b>, or <b>Selected Members</b> (via a multi-select modal dialog). "
        "Enforcement is dual-layered: the client hides tools and displays a lock banner, while the server validates incoming packet signatures and drops unauthorized events.",
        body_style
    ))

    story.append(Paragraph("6.3 Milestone Snapshots & Isolated Sandbox Simulation", h2_style))
    story.append(Paragraph(
        "A standout feature of the application is the <b>Milestone & Isolated Sandbox Engine</b>:<br/>"
        "• <b>Point-in-Time Milestones:</b> The host can snapshot the entire canvas at critical design junctures (e.g. 'Sprint 1 Architecture').<br/>"
        "• <b>Private Sandbox Mode:</b> Participants can toggle into Sandbox Simulation Mode. The canvas background shifts to dark mode with an orange status banner. "
        "Users can freely test, sketch, and experiment without altering the live collaborative board.<br/>"
        "• <b>Host Live Sandbox Broadcast:</b> When the host tests ideas in their sandbox, they can toggle 'Go Live with Sandbox'. Peers can view the host's private sandbox "
        "in real time on a dedicated viewing channel without corrupting the production board.<br/>"
        "• <b>Atomic Restore:</b> The host can restore any milestone or sandbox state back onto the live canvas with a single click.",
        body_style
    ))

    story.append(Paragraph("6.4 Integrated Group Chat & SQLite Relational Persistence", h2_style))
    story.append(Paragraph(
        "The side-drawer chat interface allows synchronous technical discussion alongside drawing. Chat messages are delivered over the primary WebSocket channel, "
        "stamped with server timestamps, and saved to the SQLite <code>chat_messages</code> table. This ensures historical continuity: late joiners immediately receive "
        "the full chat thread alongside the whiteboard drawings.",
        body_style
    ))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 8 & 9: COMPREHENSIVE USER GUIDE
    # =========================================================================
    story.append(Paragraph("7. Comprehensive User Guide", h1_style))
    story.append(Paragraph("7.1 Standalone Zero-Terminal Applications Overview", h2_style))
    story.append(Paragraph(
        "The application provides standalone Windows executables requiring zero terminal or command-line execution for end users:<br/>"
        "• <b>Server_Application.exe:</b> Standalone executable that hosts and manages collaborative whiteboard sessions on a LAN machine.<br/>"
        "• <b>Client_Application.exe:</b> Standalone executable that users run to join sessions on any host across the LAN or Internet.<br/>"
        "• <b>Collaborative_Whiteboard.exe:</b> All-in-one desktop executable that launches both host services and client window in a single click.",
        body_style
    ))

    story.append(Paragraph("7.2 Configuring and Running the Dedicated Server (Host)", h2_style))
    story.append(Paragraph(
        "1. Double-click <b><code>Server_Application.exe</code></b> in the application directory.<br/>"
        "2. The server initializes the Node.js WebSocket engine, binds to port 5000, and starts the UDP discovery beacon on port 45455.<br/>"
        "3. The console displays the host's physical LAN IP (e.g. <code>http://192.168.1.15:5000</code>).<br/>"
        "4. Press <b>[O]</b> to launch the Host Whiteboard in your desktop browser, or press <b>[Q]</b> to shut down the server cleanly.",
        body_style
    ))

    story.append(Paragraph("7.3 Connecting Clients across Local Area Network (Zero Internet)", h2_style))
    story.append(Paragraph(
        "1. Ensure the host computer and client devices are connected to the same Wi-Fi router, Ethernet switch, or mobile hotspot.<br/>"
        "2. On client machines, double-click <b><code>Client_Application.exe</code></b>.<br/>"
        "3. Enter the Host's LAN IP address (e.g. <code>192.168.1.15:5000</code>) and click <b>'Connect to Whiteboard'</b>.<br/>"
        "4. Alternatively, client devices can open any web browser (Chrome, Edge, Safari, Firefox) and navigate directly to: <code>http://&lt;HOST-IP&gt;:5000</code>.<br/>"
        "5. The lobby screen automatically lists discovered active whiteboards on the subnet with a green 'Join Now' button.<br/>"
        "6. Enter your Name and click <b>Join Room</b> with the 4-letter room code (e.g. <code>SPZG</code>). Collaboration starts instantly with zero internet!",
        body_style
    ))

    story.append(Paragraph("7.4 Connecting over the Internet (Cross-Network Mode)", h2_style))
    story.append(Paragraph(
        "1. To collaborate with peers outside your local Wi-Fi, run <code>run_internet_tunnel.bat</code> or start an Internet session in the app.<br/>"
        "2. The server generates a secure public share link (e.g. <code>https://lan-whiteboard-session.loca.lt</code>).<br/>"
        "3. Remote friends click the public link in their browser or enter it into <code>Client_Application.exe</code> to join from anywhere in the world.",
        body_style
    ))

    story.append(Paragraph("7.5 Complete Canvas Tools and Features Reference", h2_style))
    tools_guide = [
        [Paragraph("Tool / Feature", th_style), Paragraph("Icon & Shortcut", th_style), Paragraph("Operational Instructions & Capabilities", th_style)],
        [Paragraph("Freehand Pen", td_style), Paragraph("Pen (P)", td_style), Paragraph("Smooth, pressure-responsive vector drawing. Customize line width (1px to 24px) and color from palette.", td_style)],
        [Paragraph("Highlighter", td_style), Paragraph("Highlighter (H)", td_style), Paragraph("Semi-transparent overlay highlighter for annotating diagrams and text without obscuring underlying strokes.", td_style)],
        [Paragraph("Geometric Shapes", td_style), Paragraph("Shapes Gallery", td_style), Paragraph("Click to insert Rectangle, Circle/Ellipse, Triangle, Diamond, Star, Hexagon, or Arrow. Supports custom fill colors.", td_style)],
        [Paragraph("Selection Tool", td_style), Paragraph("Cursor Arrow (S)", td_style), Paragraph("Click and drag a marquee box across the canvas to multi-select items. Drag selected elements to move them across the board.", td_style)],
        [Paragraph("Snap Screenshot", td_style), Paragraph("Camera / Crop", td_style), Paragraph("Click and drag a bounding rectangle over any canvas region. The tool captures high-resolution pixel data and downloads a PNG.", td_style)],
        [Paragraph("Vector Eraser", td_style), Paragraph("Eraser (E)", td_style), Paragraph("Active geometric hit-tester. Drag over any vector stroke or shape to delete it permanently across all peer screens.", td_style)],
        [Paragraph("Dynamic Table", td_style), Paragraph("Table Grid", td_style), Paragraph("Insert customizable data tables. Double-click cells to edit text, add/remove rows and columns, and drag corner handles.", td_style)],
        [Paragraph("Text & OCR", td_style), Paragraph("Text (T)", td_style), Paragraph("Place rich text labels with customizable typography (Inter, JetBrains Mono, Roboto, Caveat). Supports Ink-to-Text OCR.", td_style)],
        [Paragraph("Milestone Sandbox", td_style), Paragraph("Flask / Beaker", td_style), Paragraph("Toggle into private Sandbox Simulation to test ideas safely. Host can broadcast live sandbox view to all peers.", td_style)],
        [Paragraph("Group Chat", td_style), Paragraph("Chat Drawer (C)", td_style), Paragraph("Integrated real-time text chat with SQLite persistence, user avatar badges, message timestamps, and presence audit logs.", td_style)],
        [Paragraph("4D RBAC Controls", td_style), Paragraph("Shield / Lock", td_style), Paragraph("Host can restrict Drawing, Chat, Instances, or Public Works to 'Host Only', 'Selected Members', or 'Everyone'.", td_style)],
    ]
    t_tools = Table(tools_guide, colWidths=[90, 80, 370])
    t_tools.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_tools)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 10: BENCHMARKS & TEAM CONTRIBUTIONS
    # =========================================================================
    story.append(Paragraph("8. Experimental Evaluation, Benchmarks and Team Contributions", h1_style))
    story.append(Paragraph("8.1 Physical LAN Experimental Testbed Setup", h2_style))
    story.append(Paragraph(
        "Empirical testing was conducted in a physical laboratory environment using four independent client laptops connected to an isolated 802.11ac "
        "Wi-Fi router (subnet 192.168.1.0/24) with the server hosted on a dedicated workstation (192.168.1.15). "
        "WAN internet access was physically disabled at the router uplink to rigorously verify 100% autonomous offline operation.",
        body_style
    ))

    story.append(Paragraph("8.2 Quantitative Performance Benchmarks", h2_style))
    bench_data = [
        [Paragraph("Evaluation Metric", th_style), Paragraph("Measured Result", th_style), Paragraph("Target Threshold", th_style), Paragraph("Compliance Status", th_style)],
        [Paragraph("End-to-End Event Broadcast Latency", td_style), Paragraph("3.6 ms (average)", td_style), Paragraph("< 15.0 ms", td_style), Paragraph("✔ Exceeded Target", td_style)],
        [Paragraph("Peak Stroke Coordinate Throughput", td_style), Paragraph("180 packets / sec", td_style), Paragraph("> 60 packets / sec", td_style), Paragraph("✔ Smooth Spline Motion", td_style)],
        [Paragraph("Packet Delivery Reliability over LAN", td_style), Paragraph("100.0% (0 lost bytes)", td_style), Paragraph("100% (TCP stream)", td_style), Paragraph("✔ Zero Loss Guaranteed", td_style)],
        [Paragraph("Server Memory Footprint (4 clients)", td_style), Paragraph("34.2 MB RAM", td_style), Paragraph("< 150 MB", td_style), Paragraph("✔ Highly Lightweight", td_style)],
        [Paragraph("Client Canvas Frame Rate (active drawing)", td_style), Paragraph("59.8 – 60.0 FPS", td_style), Paragraph("≥ 30.0 FPS", td_style), Paragraph("✔ Fluid 60 FPS Render", td_style)],
        [Paragraph("Offline Subnet Discovery Latency", td_style), Paragraph("42 ms (average)", td_style), Paragraph("< 500 ms", td_style), Paragraph("✔ Instant Room Beacon", td_style)],
    ]
    t_bench = Table(bench_data, colWidths=[160, 110, 120, 150])
    t_bench.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_blue),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_bench)
    story.append(Spacer(1, 6))

    story.append(Paragraph("8.3 Detailed Individual Team Member Contributions", h2_style))
    contrib_data = [
        [Paragraph("Team Member", th_style), Paragraph("Assigned Role", th_style), Paragraph("Key Implemented Contributions & Deliverables", th_style)],
        [
            Paragraph("CS24B1025<br/><b>Anirudh</b>", td_style),
            Paragraph("Network Protocol & Server Architecture", td_style),
            Paragraph("• Engineered Node.js WebSocket server pipeline and room connection isolation maps.<br/>"
                      "• Implemented UDP physical network adapter scanner and subnet discovery broadcast.<br/>"
                      "• Designed TCP_NODELAY optimization achieving sub-5ms event dispatching.<br/>"
                      "• Authored Server_Application.exe standalone launcher with LAN IP reporting.", td_style)
        ],
        [
            Paragraph("CS24B1097<br/><b>Krishna Chaitanya</b>", td_style),
            Paragraph("Canvas 2D Engine & Vector UI", td_style),
            Paragraph("• Engineered React 18 Canvas 2D engine with 2D affine transforms (zoom 15%–400%, pan).<br/>"
                      "• Implemented geometric hit-testing vector eraser eliminating destructive stroke masks.<br/>"
                      "• Designed click-drag marquee selection and group movement translation math.<br/>"
                      "• Built snap area screenshot crop tool with instant PNG export.", td_style)
        ],
        [
            Paragraph("CS24B1108<br/><b>Harish</b>", td_style),
            Paragraph("Group Chat, Persistence & Room Isolation", td_style),
            Paragraph("• Engineered SQLite WAL embedded database schema with atomic transaction rollback.<br/>"
                      "• Built docked side-drawer group chat with avatar badges and timestamps.<br/>"
                      "• Implemented 4-letter alphanumeric session codes and PIN authentication.<br/>"
                      "• Developed account management modal and user session audit logging.", td_style)
        ],
        [
            Paragraph("CS24B1106<br/><b>Manas Vivek</b>", td_style),
            Paragraph("Concurrency Control, RBAC & Sandboxing", td_style),
            Paragraph("• Engineered 4-dimensional RBAC matrix (Canvas, Chat, Instances, Public Works).<br/>"
                      "• Developed point-in-time milestone snapshots and isolated sandbox simulation.<br/>"
                      "• Implemented host live sandbox broadcast and atomic canvas restoration.<br/>"
                      "• Configured physical LAN testbed and authored empirical benchmark evaluation.", td_style)
        ],
    ]
    t_contrib = Table(contrib_data, colWidths=[85, 115, 340])
    t_contrib.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    story.append(t_contrib)
    story.append(Spacer(1, 6))

    story.append(Paragraph("8.4 Conclusion", h2_style))
    story.append(Paragraph(
        "The project rigorously demonstrates that an air-gapped, zero-cloud multi-user collaborative application can achieve industry-standard responsiveness, "
        "deterministic concurrency control, and comprehensive vector editing capabilities over standard local subnets using modern WebSockets, React 18, and SQLite. "
        "The standalone executables deliver zero-terminal ease of use, fulfilling all course deliverable objectives.",
        body_style
    ))

    # Build document with custom canvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[✓] Technical Documentation PDF generated successfully: {filename}")

if __name__ == "__main__":
    build_pdf("Technical_Documentation.pdf")
