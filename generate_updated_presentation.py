import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

# Color Palette Constants (Dark Slate Theme matching original PPTX)
BG_DARK = RGBColor(0x0F, 0x17, 0x2A)      # #0F172A (Deep Slate Navy)
TOP_ACCENT = RGBColor(0x38, 0xBD, 0xF8)   # #38BDF8 (Sky Blue)
CARD_BG = RGBColor(0x1E, 0x29, 0x3B)      # #1E293B (Card Dark Slate)
CARD_BORDER = RGBColor(0x33, 0x41, 0x55)  # #334155 (Subtle Slate Border)
CARD_INNER_BG = RGBColor(0x0F, 0x17, 0x2A)# Inner Container
TEXT_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_TITLE = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_MUTED = RGBColor(0x94, 0xA3, 0xB8)   # Slate-400
TEXT_BODY = RGBColor(0xCB, 0xD5, 0xE1)    # Slate-300
TEXT_FOOTER = RGBColor(0x64, 0x74, 0x8B)  # Slate-500

ACCENT_BLUE = RGBColor(0x38, 0xBD, 0xF8)   # CS24B1025 Anirudh
ACCENT_GREEN = RGBColor(0x10, 0xB9, 0x81)  # CS24B1097 Krishna Chaitanya
ACCENT_AMBER = RGBColor(0xF5, 0x9E, 0x0B)  # CS24B1108 Harish
ACCENT_PINK = RGBColor(0xEC, 0x48, 0x99)   # CS24B1106 Manas Vivek
ACCENT_PURPLE = RGBColor(0x8B, 0x5C, 0xF6)

TOTAL_SLIDES = 10

def create_base_slide(prs, category_badge_text, title_text, subtitle_text, slide_num):
    """Creates a base slide with dark background, top accent line, category badge, titles, and footer."""
    blank_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank_layout)

    # 1. Background full-bleed rectangle
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG_DARK
    bg.line.fill.background()

    # 2. Top accent line
    top_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Emu(109728))
    top_line.fill.solid()
    top_line.fill.fore_color.rgb = TOP_ACCENT
    top_line.line.fill.background()

    # 3. Category Badge (Top left rounded rectangle)
    badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(731520), Emu(365760), Emu(3200000), Emu(292608))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(0x1A, 0x26, 0x39)
    badge.line.color.rgb = TOP_ACCENT
    badge.line.width = Pt(1)
    tf = badge.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Emu(20000)
    p = tf.paragraphs[0]
    p.text = category_badge_text
    p.font.name = "Segoe UI"
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = TOP_ACCENT

    # 4. Slide Title & Subtitle
    title_box = slide.shapes.add_textbox(Emu(731520), Emu(685800), Emu(10698480), Emu(868680))
    tf_title = title_box.text_frame
    tf_title.word_wrap = True
    tf_title.margin_left = tf_title.margin_right = tf_title.margin_top = tf_title.margin_bottom = 0
    
    p_title = tf_title.paragraphs[0]
    p_title.text = title_text
    p_title.font.name = "Segoe UI"
    p_title.font.size = Pt(21)
    p_title.font.bold = True
    p_title.font.color.rgb = TEXT_TITLE

    p_sub = tf_title.add_paragraph()
    p_sub.text = subtitle_text
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(11.5)
    p_sub.font.color.rgb = TEXT_MUTED
    p_sub.space_before = Pt(3)

    # 5. Bottom Footer
    footer_box = slide.shapes.add_textbox(Emu(731520), Emu(6446520), Emu(10698480), Emu(320040))
    tf_footer = footer_box.text_frame
    tf_footer.word_wrap = False
    tf_footer.margin_left = tf_footer.margin_right = tf_footer.margin_top = tf_footer.margin_bottom = 0
    p_foot = tf_footer.paragraphs[0]
    p_foot.text = f"LAN Collaborative Whiteboard • Computer Networks Lab Project • Slide {slide_num} of {TOTAL_SLIDES}"
    p_foot.font.name = "Segoe UI"
    p_foot.font.size = Pt(9.5)
    p_foot.font.color.rgb = TEXT_FOOTER

    return slide

def add_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER):
    """Adds a standard rounded card with consistent styling."""
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    card.line.color.rgb = border_color
    card.line.width = Pt(1)
    return card

def add_card_header_bar(slide, left, top, width, height, color):
    """Adds a colored accent strip to the top of a card."""
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    return bar

def build_presentation(output_path):
    prs = Presentation()
    prs.slide_width = Emu(12191695)   # 16:9 widescreen
    prs.slide_height = Emu(6858000)

    # ── SLIDE 1: TITLE SLIDE ─────────────────────────────────────────────
    blank_layout = prs.slide_layouts[6]
    s1 = prs.slides.add_slide(blank_layout)

    # Background & Top line
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = BG_DARK
    bg1.line.fill.background()

    top_line1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Emu(109728))
    top_line1.fill.solid()
    top_line1.fill.fore_color.rgb = TOP_ACCENT
    top_line1.line.fill.background()

    # Logo (if exists)
    logo_path = 'lan_whiteboard/logo.png'
    if os.path.exists(logo_path):
        s1.shapes.add_picture(logo_path, Emu(914400), Emu(780000), Emu(450000), Emu(450000))

    # Badge
    b1 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(1420000), Emu(822960), Emu(4389120), Emu(347472))
    b1.fill.solid()
    b1.fill.fore_color.rgb = RGBColor(0x1A, 0x26, 0x39)
    b1.line.color.rgb = TOP_ACCENT
    tf_b1 = b1.text_frame
    p_b1 = tf_b1.paragraphs[0]
    p_b1.text = "COMPUTER NETWORKS LAB PROJECT • FINAL PRESENTATION"
    p_b1.font.name = "Segoe UI"
    p_b1.font.size = Pt(10)
    p_b1.font.bold = True
    p_b1.font.color.rgb = TOP_ACCENT

    # Main Project Title & Subtitle
    t1 = s1.shapes.add_textbox(Emu(914400), Emu(1300000), Emu(10332720), Emu(1645920))
    tf_t1 = t1.text_frame
    tf_t1.word_wrap = True
    p1 = tf_t1.paragraphs[0]
    p1.text = "LAN & Cross-Network Collaborative Whiteboard"
    p1.font.name = "Segoe UI"
    p1.font.size = Pt(34)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE

    p1_sub = tf_t1.add_paragraph()
    p1_sub.text = "Real-Time Vector Synchronization, Deterministic RBAC Governance, Sandboxed Instances & Multi-Platform Deployment"
    p1_sub.font.name = "Segoe UI"
    p1_sub.font.size = Pt(14)
    p1_sub.font.color.rgb = TEXT_MUTED
    p1_sub.space_before = Pt(6)

    # Section Header
    t_sec = s1.shapes.add_textbox(Emu(914400), Emu(3154680), Emu(10332720), Emu(365760))
    p_sec = t_sec.text_frame.paragraphs[0]
    p_sec.text = "PROJECT TEAM MEMBERS"
    p_sec.font.name = "Segoe UI"
    p_sec.font.size = Pt(12)
    p_sec.font.bold = True
    p_sec.font.color.rgb = TEXT_MUTED

    # Team Members (4 Cards)
    members = [
        ("CS24B1025", "Anirudh", "Network Protocol, Berkeley Sockets &\nWebSocket Server Architecture", ACCENT_BLUE, Emu(914400)),
        ("CS24B1097", "Krishna Chaitanya", "Real-Time State Sync, Canvas Engine &\nMulti-Platform UI Architecture", ACCENT_GREEN, Emu(3557016)),
        ("CS24B1108", "Harish", "Group Chat, Session Isolation &\nSQLite Database Persistence", ACCENT_AMBER, Emu(6199632)),
        ("CS24B1106", "Manas Vivek", "Deterministic RBAC Governance,\nSandboxed Milestones & LAN Testing", ACCENT_PINK, Emu(8842248)),
    ]
    card_w = Emu(2423160)
    card_h = Emu(2057400)
    card_y = Emu(3566160)

    for roll, name, role, color, left_pos in members:
        add_card(s1, left_pos, card_y, card_w, card_h)
        add_card_header_bar(s1, left_pos, card_y, card_w, Emu(73152), color)

        tb = s1.shapes.add_textbox(left_pos + Emu(137160), card_y + Emu(182880), card_w - Emu(274320), card_h - Emu(274320))
        tf = tb.text_frame
        tf.word_wrap = True

        p_roll = tf.paragraphs[0]
        p_roll.text = roll
        p_roll.font.name = "Segoe UI"
        p_roll.font.size = Pt(13)
        p_roll.font.bold = True
        p_roll.font.color.rgb = color

        p_name = tf.add_paragraph()
        p_name.text = name
        p_name.font.name = "Segoe UI"
        p_name.font.size = Pt(14)
        p_name.font.bold = True
        p_name.font.color.rgb = TEXT_WHITE
        p_name.space_before = Pt(4)

        p_role = tf.add_paragraph()
        p_role.text = role
        p_role.font.name = "Segoe UI"
        p_role.font.size = Pt(10.5)
        p_role.font.color.rgb = TEXT_BODY
        p_role.space_before = Pt(6)

    # Key Specifications Bar
    spec_card = add_card(s1, Emu(914400), Emu(5806440), Emu(10332720), Emu(502920))
    tf_spec = spec_card.text_frame
    p_spec = tf_spec.paragraphs[0]
    p_spec.text = "Key Specifications: TCP/IP Berkeley Sockets • WebSocket Daemon • Newline-Delimited JSON • Sub-10ms Latency • Air-Gapped LAN Autonomy"
    p_spec.font.name = "Segoe UI"
    p_spec.font.size = Pt(10.5)
    p_spec.font.color.rgb = TEXT_MUTED
    p_spec.alignment = PP_ALIGN.CENTER

    # Footer
    f1 = s1.shapes.add_textbox(Emu(731520), Emu(6446520), Emu(10698480), Emu(320040))
    p_f1 = f1.text_frame.paragraphs[0]
    p_f1.text = "LAN Collaborative Whiteboard • Computer Networks Lab Project • Slide 1 of 10"
    p_f1.font.name = "Segoe UI"
    p_f1.font.size = Pt(9.5)
    p_f1.font.color.rgb = TEXT_FOOTER


    # ── SLIDE 2: PROJECT OVERVIEW ────────────────────────────────────────
    s2 = create_base_slide(prs, "PROJECT OVERVIEW", "Introduction, Problem Statement & Core Objectives", "Designing a resilient, zero-cloud collaborative workspace over Local Area Networks and Web", 2)

    col1_w = Emu(5120640)
    col1_x = Emu(731520)

    # Card 1: What is a Collaborative Whiteboard
    c1 = add_card(s2, col1_x, Emu(1691640), col1_w, Emu(1371600))
    tf1 = c1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = "What is a Collaborative Whiteboard?"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    p = tf1.add_paragraph()
    p.text = "A shared virtual workspace enabling multiple remote users to draw, annotate, design network topologies, and exchange technical data synchronously in real time."
    p.font.name = "Segoe UI"
    p.font.size = Pt(10.5)
    p.font.color.rgb = TEXT_BODY
    p.space_before = Pt(4)

    # Card 2: Limitations of Traditional & Cloud Solutions
    c2 = add_card(s2, col1_x, Emu(3200400), col1_w, Emu(1463040))
    tf2 = c2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = "Limitations of Traditional & Cloud Solutions"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_AMBER

    p = tf2.add_paragraph()
    p.text = "• Traditional single-user whiteboards cannot support multi-user team interaction.\n• Cloud whiteboards (Miro, Jamboard) strictly mandate WAN/Internet connectivity, expose proprietary diagrams to third-party clouds, and suffer network jitter."
    p.font.name = "Segoe UI"
    p.font.size = Pt(10.5)
    p.font.color.rgb = TEXT_BODY
    p.space_before = Pt(4)

    # Card 3: LAN Project Objectives
    c3 = add_card(s2, col1_x, Emu(4800600), col1_w, Emu(1508760))
    tf3 = c3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    p.text = "LAN Project Objectives & Offline Capability"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_GREEN

    p = tf3.add_paragraph()
    p.text = "• 100% Offline Autonomy: Operates within air-gapped institutional LANs with zero external internet dependencies.\n• Ultra-Low Latency: Direct socket transmission provides sub-10ms real-time stroke feedback.\n• Total Privacy: Sensitive technical blueprints remain entirely within the local intranet."
    p.font.name = "Segoe UI"
    p.font.size = Pt(10.5)
    p.font.color.rgb = TEXT_BODY
    p.space_before = Pt(4)

    # Right Column: Distributed LAN Collaboration Concept Diagram
    col2_x = Emu(6080760)
    col2_w = Emu(5349240)
    col2_h = Emu(4617720)
    c_diag = add_card(s2, col2_x, Emu(1691640), col2_w, col2_h)
    
    # Diagram Title
    tb_diag = s2.shapes.add_textbox(col2_x + Emu(182880), Emu(1828800), col2_w - Emu(365760), Emu(457200))
    p = tb_diag.text_frame.paragraphs[0]
    p.text = "Distributed LAN Collaboration Concept"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    # Central Hub
    hub = add_card(s2, Emu(7406640), Emu(3108960), Emu(2651760), Emu(1645920), bg_color=CARD_INNER_BG, border_color=ACCENT_BLUE)
    tf_hub = hub.text_frame
    tf_hub.word_wrap = True
    p = tf_hub.paragraphs[0]
    p.text = "SHARED DIGITAL CANVAS\n(Room SPZG)"
    p.font.name = "Segoe UI"
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE
    p.alignment = PP_ALIGN.CENTER
    p = tf_hub.add_paragraph()
    p.text = "Vector Stroke Engine\nGlobal Action State Log"
    p.font.name = "Segoe UI"
    p.font.size = Pt(10)
    p.font.color.rgb = TEXT_BODY
    p.alignment = PP_ALIGN.CENTER

    # Nodes
    nodes = [
        ("Host: user1\n172.17.244.101", Emu(6263640), Emu(2377440), ACCENT_BLUE),
        ("Peer: user2\n172.17.244.102", Emu(9692640), Emu(2377440), ACCENT_GREEN),
        ("Peer: user3\n172.17.244.103", Emu(6263640), Emu(4937760), ACCENT_AMBER),
        ("Peer: user4\n172.17.244.104", Emu(9692640), Emu(4937760), ACCENT_PINK)
    ]
    for text, nx, ny, ncol in nodes:
        node_card = add_card(s2, nx, ny, Emu(1645920), Emu(914400), border_color=ncol)
        tf_n = node_card.text_frame
        p = tf_n.paragraphs[0]
        p.text = text
        p.font.name = "Segoe UI"
        p.font.size = Pt(10)
        p.font.color.rgb = TEXT_BODY
        p.alignment = PP_ALIGN.CENTER

    tb_sub = s2.shapes.add_textbox(col2_x + Emu(182880), Emu(5943600), col2_w - Emu(365760), Emu(365760))
    p = tb_sub.text_frame.paragraphs[0]
    p.text = "Synchronous state broadcast across physical LAN without internet connectivity"
    p.font.name = "Segoe UI"
    p.font.size = Pt(10)
    p.font.color.rgb = TEXT_MUTED
    p.alignment = PP_ALIGN.CENTER


    # ── SLIDE 3: ARCHITECTURE & PROTOCOL ─────────────────────────────────
    s3 = create_base_slide(prs, "ARCHITECTURE & PROTOCOL", "System Architecture & Network Design", "Star Topology Client-Server Model Operating over TCP/IP Socket Layer", 3)

    c_arch = add_card(s3, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_arch = c_arch.text_frame
    tf_arch.word_wrap = True

    p = tf_arch.paragraphs[0]
    p.text = "Client-Server Network Paradigm"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    points = [
        ("• Centralized Coordination:", " The server acts as the single authoritative source of truth, routing table manager, and broadcast hub for all room sessions."),
        ("• Multi-Client Concurrency:", " Each client connects via a dedicated TCP socket. The server spawns a daemon worker thread per client with thread-safe queues."),
        ("• Reliable TCP Transport:", " TCP guarantees in-order, error-free packet delivery, eliminating packet loss and jitter common in UDP sketching implementations."),
        ("• Newline-Delimited Framing:", " Stream fragmentation and sticky packets are resolved using atomic Newline-Delimited JSON (NDJSON) framing."),
        ("• Room Isolation & Fan-Out:", " Server isolates traffic into discrete 4-letter session codes (e.g. SPZG). Events received from one client are broadcast strictly to room peers.")
    ]
    for bold_hdr, body_text in points:
        p = tf_arch.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(10.5)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(10)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(8)

    # Topology Diagram (Right)
    c_top = add_card(s3, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_t = s3.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(365760))
    p = tb_t.text_frame.paragraphs[0]
    p.text = "Network Topology: Client 1..4 → Server Dispatcher"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    # Central Server Box
    srv = add_card(s3, Emu(7589520), Emu(2926080), Emu(2800000), Emu(1800000), bg_color=CARD_INNER_BG, border_color=ACCENT_BLUE)
    tf_srv = srv.text_frame
    tf_srv.word_wrap = True
    p = tf_srv.paragraphs[0]
    p.text = "CENTRAL SERVER\n172.17.244.200:5050"
    p.font.name = "Segoe UI"
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE
    p.alignment = PP_ALIGN.CENTER
    p = tf_srv.add_paragraph()
    p.text = "• Session Directory\n• Worker Threads\n• Mutex Lock\n• Action Log\n• SQLite ChatDB"
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.font.color.rgb = TEXT_BODY
    p.alignment = PP_ALIGN.CENTER

    clients = [
        ("Client 1 (Host)\nuser1 (SPZG)", Emu(6080760), Emu(2377440), ACCENT_BLUE),
        ("Client 2\nuser2 (SPZG)", Emu(10058400), Emu(2377440), ACCENT_GREEN),
        ("Client 3\nuser3 (SPZG)", Emu(6080760), Emu(4754880), ACCENT_AMBER),
        ("Client 4\nuser4 (VOXB)", Emu(10058400), Emu(4754880), ACCENT_PINK)
    ]
    for text, cx, cy, col in clients:
        cc = add_card(s3, cx, cy, Emu(1554480), Emu(822960), border_color=col)
        tf_c = cc.text_frame
        p = tf_c.paragraphs[0]
        p.text = text
        p.font.name = "Segoe UI"
        p.font.size = Pt(9.5)
        p.font.color.rgb = TEXT_BODY
        p.alignment = PP_ALIGN.CENTER

    tb_sub2 = s3.shapes.add_textbox(Emu(6080760), Emu(5943600), Emu(5120640), Emu(365760))
    p = tb_sub2.text_frame.paragraphs[0]
    p.text = "Bidirectional TCP Streams (NDJSON) with Room Isolation & Broadcast Fan-out"
    p.font.name = "Segoe UI"
    p.font.size = Pt(10)
    p.font.color.rgb = TEXT_MUTED
    p.alignment = PP_ALIGN.CENTER


    # ── SLIDE 4: DRAWING ENGINE ──────────────────────────────────────────
    s4 = create_base_slide(prs, "DRAWING ENGINE", "Multi-User Whiteboard & Drawing Functionalities", "Comprehensive Vector Canvas, Geometric Shapes, and Windows 11 Fluent Ribbon", 4)

    c_draw = add_card(s4, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_draw = c_draw.text_frame
    tf_draw.word_wrap = True

    p = tf_draw.paragraphs[0]
    p.text = "Canvas Capabilities & Rendering Engine"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    draw_points = [
        ("• Shared Digital Canvas:", " High-performance Tkinter & Web canvas with coordinate transform scaling (15% to 400% infinite zoom and pan navigation)."),
        ("• Freehand & Artistic Brushes:", " Pencil (smooth spline), calligraphy brush, translucent highlighter with alpha blending, and precision object eraser."),
        ("• Geometric Shape Gallery:", " One-click creation of straight lines, directional arrows, rectangles, rounded rectangles, ellipses, triangles, diamonds, and stars."),
        ("• Color Palette & Font Sizing:", " 20-color quick palette, custom hex color picker, fill shape toggle, and selectable text font sizing (14–64 pt)."),
        ("• Dynamic Tables & Sticky Notes:", " Specify rows & cols, drag pill handle, inline cell text editing, and resizable sticky notes with handwriting typography."),
        ("• Ink-to-Text OCR:", " Converts freehand strokes into clean typographical text blocks.")
    ]
    for bold_hdr, body_text in draw_points:
        p = tf_draw.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(10)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(5)

    # Right Column: Toolbar Screenshots
    c_img_box = add_card(s4, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_it = s4.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_it.text_frame.paragraphs[0]
    p.text = "Actual Application Interface: Ribbon & Canvas Toolbars"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    # Add images
    img_tb1 = 'lan_whiteboard/Screenshot 2026-11-08 155726.png'
    if os.path.exists(img_tb1):
        s4.shapes.add_picture(img_tb1, Emu(6080760), Emu(2150000), Emu(5166360), Emu(950000))

    img_tb2 = 'C:/Users/len/.gemini/antigravity/brain/9150dc51-9572-4a17-9f82-e3d2d1b51ef2/.user_uploaded/media_1794323834640_65439449.png'
    if os.path.exists(img_tb2):
        s4.shapes.add_picture(img_tb2, Emu(6080760), Emu(3200000), Emu(5166360), Emu(850000))

    # Highlights Box
    h_box = add_card(s4, Emu(6080760), Emu(4200000), Emu(5166360), Emu(1950000))
    tf_h = h_box.text_frame
    tf_h.word_wrap = True
    p = tf_h.paragraphs[0]
    p.text = "Key Toolbar Sections Highlighted:"
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    hl_bullets = [
        "✔ Tools Group: Selection, Pan Hand, Pencil, Brush, Highlighter, Eraser, Table, and Shapes.",
        "✔ Text & Font Bar: 8 selectable typography families (14–64pt) with bold, italic, and color.",
        "✔ Dynamic Grids & Fill: One-click grid cycler (Square, Dot, Ruled, None) and shape fill toggle.",
        "✔ OCR & Utilities: Ink-to-Text conversion, 1-click zoom reset, undo/redo, and clear canvas."
    ]
    for b in hl_bullets:
        p = tf_h.add_paragraph()
        p.text = b
        p.font.name = "Segoe UI"
        p.font.size = Pt(9.5)
        p.font.color.rgb = TEXT_BODY
        p.space_before = Pt(3)


    # ── SLIDE 5: SESSION ISOLATION ───────────────────────────────────────
    s5 = create_base_slide(prs, "SESSION ISOLATION", "Session and Workspace Management", "Dynamic Room Creation, LAN IP Discovery, and Participant Lifecycle", 5)

    c_sess = add_card(s5, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_sess = c_sess.text_frame
    tf_sess.word_wrap = True

    p = tf_sess.paragraphs[0]
    p.text = "Room Lifecycle & Access Architecture"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    sess_points = [
        ("• Dynamic Room Creation:", " Any client can initiate an isolated collaboration session. The server generates a unique, collision-resistant 4-letter alphanumeric session code (e.g., VOXB, SPZG)."),
        ("• LAN IP Addressing:", " Clients specify the host machine's LAN IP (e.g., 172.17.244.200) and port (5050), allowing seamless routing across Wi-Fi or Ethernet switches."),
        ("• User Identity & Avatars:", " Participants select display usernames and customized avatar colors. The server generates unique initials badges (e.g., 'U1', 'U2') across the canvas and chat."),
        ("• Personal Offline Workspace:", " Standalone local scratchpad allowing private drafting and editing with zero network connection."),
        ("• Whiteboard Package Exchange:", " Complete session export/import via .whiteboard bundles, ensuring workspace portability and backup."),
        ("• Room PIN & Privacy:", " Optional password/PIN authentication prevents unauthorized peers on the subnet from joining private grading or exam sessions.")
    ]
    for bold_hdr, body_text in sess_points:
        p = tf_sess.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(10)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(5)

    # Right Column: Lobby Picture
    c_img_lobby = add_card(s5, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_l = s5.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_l.text_frame.paragraphs[0]
    p.text = "Actual Application: 'Join a Board' Lobby"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    img_lobby = 'lan_whiteboard/Screenshot 2026-11-08 155954.png'
    if os.path.exists(img_lobby):
        s5.shapes.add_picture(img_lobby, Emu(7300000), Emu(2150000), Emu(2700000), Emu(3950000))


    # ── SLIDE 6: EVENT PIPELINE ──────────────────────────────────────────
    s6 = create_base_slide(prs, "EVENT PIPELINE", "Real-Time Communication & Event Handling", "Thread-Safe Ingestion, Low-Latency Dispatching, and End-to-End Delivery Pipeline", 6)

    c_sock = add_card(s6, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_sock = c_sock.text_frame
    tf_sock.word_wrap = True

    p = tf_sock.paragraphs[0]
    p.text = "Socket Mechanics & Event Handling"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    sock_points = [
        ("• Dedicated Socket Reader Threads:", " Client and server use background reader threads with socket.makefile('r', encoding='utf-8') to stream incoming NDJSON objects without blocking the UI."),
        ("• Event Serialization:", " Every user action (mouse drag, shape drop, text insert) is serialized into an atomic JSON dictionary with timestamp and sequence tag."),
        ("• Server-Side Mutex Locking:", " Server handles concurrent incoming socket streams via thread-safe mutex locks (threading.Lock), serializing event order before broadcast."),
        ("• Fan-Out Broadcasting:", " Server broadcasts events in O(N) time to all connected sockets in that room, bypassing sender to avoid redundant echo loops."),
        ("• Clean Disconnect Lifecycle:", " Detects socket EOF / TCP RST immediately, safely pruning clients and broadcasting 'user_left' updates.")
    ]
    for bold_hdr, body_text in sock_points:
        p = tf_sock.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(10)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(6)

    # Right Column: Workflow Steps
    c_wf = add_card(s6, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_wf = s6.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_wf.text_frame.paragraphs[0]
    p.text = "Event Workflow: User Action → Peer Render"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    steps = [
        ("Step 1: User Action", "User draws stroke, types text, or picks color on canvas", ACCENT_BLUE),
        ("Step 2: Client Serialization", "Serialized into JSON: {'type':'stroke_pts', 'pts':[...]}", ACCENT_GREEN),
        ("Step 3: TCP Socket Transport", "Pushed over reliable TCP socket stream with '\\n' delimiter", ACCENT_AMBER),
        ("Step 4: Server Processing", "Server thread ingests, tags sequence number, updates session log", ACCENT_PURPLE),
        ("Step 5: Room Broadcast", "Server fan-out transmits JSON payload to all peer client sockets", ACCENT_PINK),
        ("Step 6: Peer Canvas Render", "Peers parse JSON and instantly draw vector stroke (<8ms)", ACCENT_BLUE)
    ]
    step_y = Emu(2200000)
    for s_title, s_desc, s_color in steps:
        sc = add_card(s6, Emu(6080760), step_y, Emu(5166360), Emu(620000), bg_color=CARD_INNER_BG, border_color=s_color)
        tf_s = sc.text_frame
        tf_s.word_wrap = True
        p = tf_s.paragraphs[0]
        p.text = f"{s_title}: "
        p.font.name = "Segoe UI"
        p.font.size = Pt(10)
        p.font.bold = True
        p.font.color.rgb = s_color

        run = p.add_run()
        run.text = s_desc
        run.font.name = "Segoe UI"
        run.font.size = Pt(9.5)
        run.font.color.rgb = TEXT_BODY
        step_y += Emu(660000)


    # ── SLIDE 7: MULTI-USER COLLABORATION ────────────────────────────────
    s7 = create_base_slide(prs, "MULTI-USER COLLABORATION", "Group Chat & Real-Time Collaboration", "Integrated Side-Drawer Chat, SQLite Persistence, and Google Meet-Style Controls", 7)

    c_chat = add_card(s7, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_chat = c_chat.text_frame
    tf_chat.word_wrap = True

    p = tf_chat.paragraphs[0]
    p.text = "In-App Messaging & Collaboration Suite"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    chat_points = [
        ("• Synchronous Group Chat:", " Real-time communication drawer docked directly on the right side of the canvas, allowing discussion without switching windows."),
        ("• Rich Message Metadata:", " Displays sender display name, unique avatar color badge, timestamp (HH:MM), and chronological order."),
        ("• SQLite Chat Persistence:", " Chat history is persisted in a thread-safe SQLite database on the server, ensuring historical retrieval upon room load."),
        ("• Live Remote Cursors:", " Visual tracking of peers' real-time mouse positions, user names, and colored pointers across the canvas."),
        ("• Presence & Audit Logs:", " System automatically logs and broadcasts join and leave events (e.g. 'user2 joined the session', 'user3 left the session')."),
        ("• Interactive Action Controls:", " Floating action bar featuring Raise Hand toggle, emoji reactions, grid cycle, and leave button.")
    ]
    for bold_hdr, body_text in chat_points:
        p = tf_chat.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(10)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(5)

    # Right Column: Screenshot Chat
    c_img_chat = add_card(s7, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_c = s7.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_c.text_frame.paragraphs[0]
    p.text = "Actual Application: Active Whiteboard with Chat Drawer"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    img_chat = 'lan_whiteboard/Screenshot 2026-11-08 155656.png'
    if os.path.exists(img_chat):
        s7.shapes.add_picture(img_chat, Emu(6080760), Emu(2194560), Emu(5166360), Emu(2907792))

    c_veri7 = add_card(s7, Emu(6080760), Emu(5212080), Emu(5166360), Emu(960120))
    tf_v7 = c_veri7.text_frame
    tf_v7.word_wrap = True
    p = tf_v7.paragraphs[0]
    p.text = "Verified Functionality in Screenshot:\n• Active room SPZG with 2 participants (user1, user2).\n• Real-time chat messages exchanged synchronously between user1 and user2 with timestamps."
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.font.color.rgb = TEXT_BODY


    # ── SLIDE 8: DETERMINISTIC HOST GOVERNANCE & RBAC MATRIX ─────────────
    s8 = create_base_slide(prs, "HOST GOVERNANCE", "Deterministic Role-Based Access Control & Selected Members Dialog", "4-Dimensional Permission Matrix, Host-Only Lockout, and Granular Member Selection", 8)

    c_rbac = add_card(s8, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_rbac = c_rbac.text_frame
    tf_rbac.word_wrap = True

    p = tf_rbac.paragraphs[0]
    p.text = "Deterministic Host Governance & Access Matrix"
    p.font.name = "Segoe UI"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    rbac_points = [
        ("• 4 Independent Policy Dimensions:", " Host has independent governance across Canvas Drawing, Group Chat, Instances Management, and Public Works Sharing."),
        ("• 3 Deterministic Policy Modes:", ""),
        ("   1. Host Only:", " Strictly locks capability to Host & Co-Hosts. Regular members receive can_draw = false, entering View-Only mode with locked tools."),
        ("   2. Selected Members:", " Dedicated dialog box with live search, Select All/Clear, and checkboxes to grant granular permissions to specific individuals."),
        ("   3. Everyone:", " Open collaborative mode where all attendees participate freely."),
        ("• View-Only Canvas Enforcement:", " Server rejects unauthorized stroke_pts, clear_canvas, or shape calls; restricted clients display full-width top lock banner: '🔒 You are in View-Only mode. Drawing is paused by the Host.'"),
        ("• Administrative Powers:", " Real-time member kicking, co-host delegation, and instant room-wide drawing freeze.")
    ]
    for bold_hdr, body_text in rbac_points:
        p = tf_rbac.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(9.5)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(3)

    # Right Column: Dual-Client RBAC Testing
    c_img_rbac = add_card(s8, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_rb = s8.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_rb.text_frame.paragraphs[0]
    p.text = "Dual-Client Testing: Multi-Drawing & RBAC Lock"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    img_rbac = 'lan_whiteboard/Screenshot 2026-11-08 161153.png'
    if os.path.exists(img_rbac):
        s8.shapes.add_picture(img_rbac, Emu(6080760), Emu(2194560), Emu(5166360), Emu(2907792))

    c_veri8 = add_card(s8, Emu(6080760), Emu(5212080), Emu(5166360), Emu(960120))
    tf_v8 = c_veri8.text_frame
    tf_v8.word_wrap = True
    p = tf_v8.paragraphs[0]
    p.text = "Empirical Results Demonstrated in Screenshot:\n• Multi-user cursors ('user2', 'user3') tracked live across nodes.\n• Client 2 displays enforced status: 'Host has disabled your drawing permission (View-Only)' with tool locking."
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.font.color.rgb = TEXT_BODY


    # ── SLIDE 9: MILESTONES, SANDBOX SIMULATION & STORAGE ────────────────
    s9 = create_base_slide(prs, "SIMULATION & STORAGE", "Milestones, Sandboxed Simulation & Private vs. Public Storage", "Isolated Instance Sandboxing, 3-Way Mode Toggle, and Two-Option Storage Workflows", 9)

    c_sim = add_card(s9, Emu(731520), Emu(1691640), Emu(4937760), Emu(4617720))
    tf_sim = c_sim.text_frame
    tf_sim.word_wrap = True

    p = tf_sim.paragraphs[0]
    p.text = "Milestones, Sandboxed Simulation & Storage Isolation"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE

    sim_points = [
        ("• Point-in-Time Whiteboard Milestones:", " Instant snapshots of the entire vector canvas, preserving historical states without halting active collaboration."),
        ("• Isolated Instance Sandbox Mode:", ""),
        ("   • Safe Scratchpad:", " Any attendee can enter an isolated simulation workspace from an instance. Sketches made inside do NOT modify the live board."),
        ("   • 3-Way Mode Switcher:", " Toggle between 📁 Original Snapshot, 🧪 Sandbox Simulation, and 👑 Host Sandbox (host's published view)."),
        ("• Host-Exclusive Live Canvas Restoration:", " Only the session host has administrative authority to restore a milestone or sandbox back onto the live room canvas."),
        ("• Privacy Separation (2-Option Save Workflow):", ""),
        ("   • 💾 Save in My Own System (Private):", " Stored strictly in local machine/browser storage. Private and never shown in room public space."),
        ("   • 🌐 Share to Public Works:", " Publishes to room-wide public gallery for all participants (guarded by host permissions).")
    ]
    for bold_hdr, body_text in sim_points:
        p = tf_sim.add_paragraph()
        run1 = p.add_run()
        run1.text = bold_hdr
        run1.font.name = "Segoe UI"
        run1.font.bold = True
        run1.font.size = Pt(9.5)
        run1.font.color.rgb = TEXT_WHITE

        run2 = p.add_run()
        run2.text = body_text
        run2.font.name = "Segoe UI"
        run2.font.size = Pt(9.5)
        run2.font.color.rgb = TEXT_BODY
        p.space_before = Pt(3)

    # Right Column: Sandbox Banner & State Sync Images
    c_img_sim = add_card(s9, Emu(5897880), Emu(1691640), Emu(5532120), Emu(4617720))
    tb_sm = s9.shapes.add_textbox(Emu(6080760), Emu(1783080), Emu(5120640), Emu(320040))
    p = tb_sm.text_frame.paragraphs[0]
    p.text = "Actual Application: Instance Sandbox Mode & Dual Synchronized Undo"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    # Top banner image
    img_banner = 'C:/Users/len/.gemini/antigravity/brain/9150dc51-9572-4a17-9f82-e3d2d1b51ef2/.user_uploaded/media_1794332270969_c3435815.png'
    if os.path.exists(img_banner):
        s9.shapes.add_picture(img_banner, Emu(6080760), Emu(2150000), Emu(5166360), Emu(420000))

    # Dual sync image
    img_undo = 'lan_whiteboard/Screenshot 2026-11-08 155900.png'
    if os.path.exists(img_undo):
        s9.shapes.add_picture(img_undo, Emu(6080760), Emu(2650000), Emu(5166360), Emu(2450000))

    c_veri9 = add_card(s9, Emu(6080760), Emu(5212080), Emu(5166360), Emu(960120))
    tf_v9 = c_veri9.text_frame
    tf_v9.word_wrap = True
    p = tf_v9.paragraphs[0]
    p.text = "Verified Functionality:\n• Sandboxed in Instance banner indicates isolated edits that do not affect the live whiteboard.\n• Synchronized undo/redo maintains deterministic vector state across all nodes."
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.font.color.rgb = TEXT_BODY


    # ── SLIDE 10: PROJECT CREDITS ────────────────────────────────────────
    blank_layout10 = prs.slide_layouts[6]
    s10 = prs.slides.add_slide(blank_layout10)

    bg10 = s10.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg10.fill.solid()
    bg10.fill.fore_color.rgb = BG_DARK
    bg10.line.fill.background()

    top_line10 = s10.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Emu(109728))
    top_line10.fill.solid()
    top_line10.fill.fore_color.rgb = TOP_ACCENT
    top_line10.line.fill.background()

    b10 = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(731520), Emu(365760), Emu(2926080), Emu(292608))
    b10.fill.solid()
    b10.fill.fore_color.rgb = RGBColor(0x1A, 0x26, 0x39)
    b10.line.color.rgb = TOP_ACCENT
    p = b10.text_frame.paragraphs[0]
    p.text = "PROJECT CREDITS"
    p.font.name = "Segoe UI"
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = TOP_ACCENT

    t10 = s10.shapes.add_textbox(Emu(731520), Emu(685800), Emu(10698480), Emu(868680))
    tf10 = t10.text_frame
    tf10.word_wrap = True
    p = tf10.paragraphs[0]
    p.text = "Individual Team Member Contributions"
    p.font.name = "Segoe UI"
    p.font.size = Pt(22)
    p.font.bold = True
    p.font.color.rgb = TEXT_TITLE

    p_sub = tf10.add_paragraph()
    p_sub.text = "Dedicated Core Responsibilities, Full-Stack Architecture, and System Deliverables"
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(12)
    p_sub.font.color.rgb = TEXT_MUTED
    p_sub.space_before = Pt(3)

    col_w = Emu(2468880)
    col_h = Emu(4617720)
    col_y = Emu(1691640)

    team_data = [
        ("CS24B1025", "Anirudh", "Network Protocol & Server Architecture", ACCENT_BLUE, Emu(731520), [
            "Engineered multi-threaded TCP socket daemon and client worker connection pool.",
            "Designed Newline-Delimited JSON (NDJSON) streaming protocol to eliminate packet fragmentation.",
            "Implemented Node.js WebSocket backend engine with room dispatching and connection lifecycle management.",
            "Optimized network transport with TCP_NODELAY (disabling Nagle's algorithm) achieving sub-5ms latency."
        ]),
        ("CS24B1097", "Krishna Chaitanya", "Real-Time State Sync, Canvas Engine & UI", ACCENT_GREEN, Emu(3419856), [
            "Developed high-performance vector rendering engine supporting strokes, shapes, and multiline text.",
            "Designed structured vector action serialization format (id, kind, points, color, width, fill).",
            "Engineered infinite canvas coordinate transforms, anchor-point zoom (15%–400%), and pan navigation.",
            "Created modern floating canvas toolbar, dynamic grid cycler (Square, Dot, Ruled, Plain), and Windows 11 Fluent UI."
        ]),
        ("CS24B1108", "Harish", "Group Chat, Session Management & Persistence", ACCENT_AMBER, Emu(6108192), [
            "Architected real-time side-drawer chat with sender avatars, timestamps, and live audit logging.",
            "Engineered SQLite database persistence layer for rooms, chat logs, user permissions, and milestones.",
            "Implemented 4-letter alphanumeric session code generation (SPZG, VOXB) and LAN IP discovery.",
            "Developed .whiteboard package export/import system and personal offline workspace isolation."
        ]),
        ("CS24B1106", "Manas Vivek", "Concurrency Control, RBAC & LAN Testing", ACCENT_PINK, Emu(8796528), [
            "Engineered deterministic Role-Based Access Control (RBAC): 4-policy matrix, View-Only canvas lock, and kick.",
            "Implemented Selected Members Dialog Box with live search, Select All/Clear, and granular checkboxes.",
            "Architected Isolated Milestone Sandbox mode with 3-way toggle (Original, Sandbox, Host Sandbox) and host restore.",
            "Authored private local system saves vs public works gallery workflow and conducted physical LAN benchmarking."
        ])
    ]

    for roll, name, title_role, color, left_pos, bullets in team_data:
        add_card(s10, left_pos, col_y, col_w, col_h)
        add_card_header_bar(s10, left_pos, col_y, col_w, Emu(91440), color)

        tb = s10.shapes.add_textbox(left_pos + Emu(128016), col_y + Emu(164592), col_w - Emu(256032), col_h - Emu(256032))
        tf = tb.text_frame
        tf.word_wrap = True

        p = tf.paragraphs[0]
        p.text = roll
        p.font.name = "Segoe UI"
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = color

        p = tf.add_paragraph()
        p.text = name
        p.font.name = "Segoe UI"
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = TEXT_WHITE
        p.space_before = Pt(3)

        p = tf.add_paragraph()
        p.text = title_role
        p.font.name = "Segoe UI"
        p.font.size = Pt(10)
        p.font.bold = True
        p.font.color.rgb = ACCENT_BLUE
        p.space_before = Pt(3)

        for b in bullets:
            p = tf.add_paragraph()
            p.text = f"✔ {b}"
            p.font.name = "Segoe UI"
            p.font.size = Pt(9)
            p.font.color.rgb = TEXT_BODY
            p.space_before = Pt(6)

    # Footer
    f10 = s10.shapes.add_textbox(Emu(731520), Emu(6446520), Emu(10698480), Emu(320040))
    p_f10 = f10.text_frame.paragraphs[0]
    p_f10.text = "LAN Collaborative Whiteboard • Computer Networks Lab Project • Slide 10 of 10"
    p_f10.font.name = "Segoe UI"
    p_f10.font.size = Pt(9.5)
    p_f10.font.color.rgb = TEXT_FOOTER

    # Save presentation
    prs.save(output_path)
    print(f"Presentation successfully generated at: {output_path}")

if __name__ == '__main__':
    out_file = 'lan_whiteboard/LAN_Collaborative_Whiteboard_Presentation.pptx'
    build_presentation(out_file)
