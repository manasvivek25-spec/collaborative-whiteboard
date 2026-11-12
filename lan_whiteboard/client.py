"""
LAN Whiteboard CLIENT (Windows 11 MS Paint Redesign - Fixed & Fully Working)
----------------------------------------------------------------------------
Collaborative multi-user whiteboard featuring:
  - Windows 11 MS Paint layout (white chrome, ice-blue buttons, left vertical pill sliders)
  - Google Meet style floating bottom control bar (hand raise, reactions, grid, lock, share, leave)
  - Role-Based Access Control (host permissions: toggle draw, promote co-host, kick, room lock)
  - Full vector shapes gallery: line, arrow, rect, rounded rect, oval, triangle, diamond, star, sticky note
  - Table tool with editable cells and Image insertion via base64 PhotoImage
  - Highlighter brush with soft stipple layering
  - Toggleable workspace grid (None, Square, Dot)
  - Sequence tracking, gap recovery (resend), reconnect & resume session token
  - User avatar badges with initials in header, participants list, and chat
  - PostScript & JSON snapshot export

Standard library only: tkinter, socket, threading, json, base64, os, time, math, queue, random, string, uuid.
"""

import base64
import copy
import glob
import json
import math
import os
import queue
import random
import re
import socket
import string
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, simpledialog, ttk
import uuid

try:
    from lan_whiteboard.handwriting import HandwritingToFontEngine, render_actions_to_image, image_to_base64_thumbnail
except ImportError:
    try:
        from handwriting import HandwritingToFontEngine, render_actions_to_image, image_to_base64_thumbnail
    except ImportError:
        HandwritingToFontEngine = None
        render_actions_to_image = None
        image_to_base64_thumbnail = None

# Enable Per-Monitor DPI awareness on Windows to prevent DWM bitmap scaling / blurriness
if os.name == "nt":
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            windll.user32.SetProcessDPIAware()
        except Exception:
            pass

PORT = 5050
DISCOVERY_PORT = 5052
DEFAULT_W, DEFAULT_H = 1000, 650

# Paint Palette
PALETTE = [
    "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200",
    "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
    "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0",
    "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7",
]

AVATAR_COLORS = [
    "#0284c7", "#16a34a", "#dc2626", "#d97706",
    "#7c3aed", "#db2777", "#0d9488", "#ea580c"
]

CLOSED_SHAPES = ("rect", "rounded_rect", "oval", "triangle", "diamond", "star", "sticky")
SETTINGS_FILE = os.path.join(os.path.expanduser("~"), ".lan_whiteboard.json")


def load_settings():
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_settings(data):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


# --------------------------------------------------------------------
# Embedded Server & LAN UDP Discovery Helpers
# --------------------------------------------------------------------
_embedded_server_proc = None


def get_local_ip_info():
    """Detects primary physical network adapter IP (Wi-Fi, Mobile Hotspot, or Ethernet).
    Excludes virtual internal switches (WSL, Hyper-V, VirtualBox, VMware) and APIPA (169.254.x.x)."""
    try:
        import psutil
        stats = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        candidates = []
        for iface, if_addrs in addrs.items():
            iface_lower = iface.lower()
            if any(v in iface_lower for v in ["vethernet", "hyper-v", "wsl", "virtualbox", "vmware", "loopback", "bluetooth"]):
                continue
            stat = stats.get(iface)
            is_up = stat.isup if stat else False
            for a in if_addrs:
                if a.family == socket.AF_INET:
                    ip = a.address
                    if ip.startswith("127.") or ip.startswith("169.254."):
                        continue
                    priority = 10
                    if any(w in iface_lower for w in ["wi-fi", "wifi", "wireless"]):
                        priority = 1
                    elif any(e in iface_lower for e in ["ethernet", "lan"]):
                        priority = 2
                    elif any(h in iface_lower for h in ["hotspot", "hosted", "local area connection"]):
                        priority = 3
                    candidates.append((priority, is_up, iface, ip))
        candidates.sort(key=lambda c: (c[0], not c[1]))
        if candidates:
            best = candidates[0]
            return best[3], best[2]
    except Exception:
        pass

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ip = probe.getsockname()[0]
        probe.close()
        if not ip.startswith("127.") and not ip.startswith("169.254."):
            return ip, "LAN"
    except Exception:
        pass

    try:
        _h, _aliases, ips = socket.gethostbyname_ex(socket.gethostname())
        for ip in ips:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                return ip, "LAN"
    except Exception:
        pass

    return "127.0.0.1", "Localhost"


def get_local_ip():
    ip, _ = get_local_ip_info()
    return ip


def is_port_listening(host, port, timeout=0.25):
    """Check if a TCP port is currently open and accepting connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ensure_local_server():
    """Starts server as a background process (server.exe or server.py) if not already running."""
    global _embedded_server_proc
    if is_port_listening("127.0.0.1", PORT):
        return True

    if getattr(sys, "frozen", False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    server_exe = os.path.join(base_dir, "server.exe")
    server_script = os.path.join(base_dir, "server.py")

    if os.path.isfile(server_exe):
        cmd = [server_exe]
    elif os.path.isfile(server_script):
        cmd = [sys.executable, server_script]
    else:
        return False

    try:
        flags = 0
        if os.name == "nt":
            flags = 0x08000000  # CREATE_NO_WINDOW
        _embedded_server_proc = subprocess.Popen(
            cmd,
            cwd=base_dir,
            creationflags=flags
        )
        for _ in range(25):
            time.sleep(0.1)
            if is_port_listening("127.0.0.1", PORT):
                return True
        return False
    except Exception as e:
        print(f"[!] Failed to auto-launch local server: {e}")
        return False


def cleanup_embedded_server():
    """Terminates the embedded server subprocess if one was launched by this process."""
    global _embedded_server_proc
    if _embedded_server_proc and _embedded_server_proc.poll() is None:
        try:
            _embedded_server_proc.terminate()
        except Exception:
            pass


def discover_lan_rooms(timeout=1.0):
    """Broadcasts a UDP discovery probe to find servers and public rooms on the LAN / Hotspot."""
    discovered = []
    try:
        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        udp.settimeout(0.25)
        payload = json.dumps({"type": "discover"}).encode("utf-8")

        targets = ["255.255.255.255", "<broadcast>", "127.0.0.1"]
        lip = get_local_ip()
        if "." in lip:
            parts = lip.split(".")
            if len(parts) == 4:
                targets.append(f"{parts[0]}.{parts[1]}.{parts[2]}.255")

        for target in targets:
            try:
                udp.sendto(payload, (target, DISCOVERY_PORT))
            except Exception:
                pass

        start = time.time()
        while time.time() - start < timeout:
            try:
                data, addr = udp.recvfrom(4096)
                resp = json.loads(data.decode("utf-8").strip())
                if resp.get("type") == "discover_reply":
                    ip = addr[0]
                    resp["ip"] = ip
                    if not any(d.get("ip") == ip for d in discovered):
                        discovered.append(resp)
            except socket.timeout:
                continue
            except Exception:
                break
        udp.close()
    except Exception:
        pass
    return discovered


# ====================================================================
# Pure Board Logic & Replay (Action Log -> Canvas Objects)
# ====================================================================
def replay(actions):
    """Replay the action log into rendered objects and canvas background color."""
    objs, bg = {}, "#ffffff"
    for a in actions:
        if a.get("undone"):
            continue
        k = a.get("kind")
        if k in ("stroke", "shape", "text", "sticky", "table", "image"):
            o = dict(a)
            o["dx"] = o.get("dx", 0.0)
            o["dy"] = o.get("dy", 0.0)
            objs[a["id"]] = o
        elif k == "fill":
            tgt = a.get("target")
            if tgt == "bg":
                bg = a.get("color", "#ffffff")
            elif tgt in objs:
                objs[tgt]["fill"] = a.get("color")
        elif k == "move":
            tgt = a.get("target")
            if tgt in objs:
                objs[tgt]["dx"] = objs[tgt].get("dx", 0.0) + a.get("dx", 0.0)
                objs[tgt]["dy"] = objs[tgt].get("dy", 0.0) + a.get("dy", 0.0)
        elif k == "delete":
            objs.pop(a.get("target"), None)
        elif k == "table_edit":
            tgt = a.get("target")
            if tgt in objs and objs[tgt].get("kind") == "table":
                cells = objs[tgt].setdefault("cells", {})
                cells[f"{a.get('r')},{a.get('c')}"] = a.get("text", "")
        elif k == "sticky_edit":
            tgt = a.get("target")
            if tgt in objs and objs[tgt].get("kind") == "sticky":
                objs[tgt]["text"] = a.get("text", "")
        elif k == "text_edit":
            tgt = a.get("target")
            if tgt in objs and objs[tgt].get("kind") == "text":
                if "text" in a:
                    objs[tgt]["text"] = a.get("text")
                if "size" in a:
                    objs[tgt]["size"] = int(a.get("size"))
                if "color" in a:
                    objs[tgt]["color"] = a.get("color")
                if "font" in a:
                    objs[tgt]["font"] = a.get("font")
        elif k == "clear":
            objs.clear()
            bg = "#ffffff"
    return objs, bg


def seg_dist(px, py, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    if dx == 0 and dy == 0:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def hit(o, x, y, tol):
    k = o.get("kind")
    if k == "stroke":
        if o.get("brush") == "eraser":
            return False
        pts = o.get("points", [])
        r = tol + o.get("width", 3)
        if len(pts) == 1:
            return math.hypot(x - pts[0][0], y - pts[0][1]) <= r
        return any(seg_dist(x, y, *pts[i], *pts[i + 1]) <= r for i in range(len(pts) - 1))
    if k in ("shape", "sticky", "table"):
        s = o.get("shape", "")
        x0, y0 = o.get("x0", 0), o.get("y0", 0)
        x1, y1 = o.get("x1", 0), o.get("y1", 0)
        if s in ("line", "arrow"):
            return seg_dist(x, y, x0, y0, x1, y1) <= tol + o.get("width", 2)
        xa, xb = sorted((x0, x1))
        ya, yb = sorted((y0, y1))
        return (xa - tol <= x <= xb + tol) and (ya - tol <= y <= yb + tol)
    if k == "text":
        lines = str(o.get("text", "")).split("\n")
        w = max(len(l) for l in lines) * o.get("size", 14) * 0.65
        h = len(lines) * o.get("size", 14) * 1.3
        ox, oy = o.get("x", 0), o.get("y", 0)
        return (ox - tol <= x <= ox + w + tol) and (oy - tol <= y <= oy + h + tol)
    if k == "image":
        ox, oy = o.get("x", 0), o.get("y", 0)
        w, h = o.get("w", 100), o.get("h", 100)
        return (ox - tol <= x <= ox + w + tol) and (oy - tol <= y <= oy + h + tol)
    return False


def hit_test(objs, wx, wy, tol):
    for o in reversed(list(objs.values())):
        ox = wx - o.get("dx", 0.0)
        oy = wy - o.get("dy", 0.0)
        if hit(o, ox, oy, tol):
            return o
    return None


# ====================================================================
# Vector Icons (32x32 coordinate grid rendered on Tkinter Canvas)
# ====================================================================
DARK = "#374151"
BLUE = "#0284c7"
LIGHT_BLUE = "#38bdf8"
GRAY = "#9ca3af"


def L(pts, col=DARK, w=2, smooth=False):
    return ("line", pts, col, w, smooth)


def R(x0, y0, x1, y1, outline=DARK, fill=None, w=1):
    return ("rect", x0, y0, x1, y1, outline, fill, w)


def O(x0, y0, x1, y1, outline=DARK, fill=None, w=1):
    return ("oval", x0, y0, x1, y1, outline, fill, w)


def P(pts, outline=DARK, fill=None, w=1):
    return ("poly", pts, outline, fill, w)


def A(x0, y0, x1, y1, start=0, extent=180, style="arc", outline=DARK, w=1):
    return ("arc", x0, y0, x1, y1, start, extent, style, outline, w)


def T(x, y, text, col="#ffffff", font=("Times New Roman", 17, "bold")):
    return ("text", x, y, text, col, font)


def dashes(x0, y0, x1, y1, col=DARK, w=2, on=4, off=3):
    d = math.hypot(x1 - x0, y1 - y0)
    if d == 0:
        return []
    out, t = [], 0.0
    while t < d:
        e = min(t + on, d)
        out.append(L([x0 + (x1 - x0) * t / d, y0 + (y1 - y0) * t / d,
                      x0 + (x1 - x0) * e / d, y0 + (y1 - y0) * e / d], col, w))
        t += on + off
    return out


WAVE = [4, 22, 10, 11, 16, 21, 22, 11, 28, 20]

ICONS = {
    "save": [
        R(5, 5, 27, 27, "#0369a1", "#0284c7", 1),
        R(9, 5, 23, 13, "#0369a1", "#ffffff", 1),
        R(9, 17, 23, 27, "#0369a1", "#e0f2fe", 1),
        R(18, 6, 21, 11, "#0369a1", "#0284c7", 1),
    ],
    "undo": [
        L([26, 24, 26, 17, 21, 12, 12, 12], BLUE, 3),
        P([14, 5, 14, 19, 4, 12], BLUE, BLUE),
    ],
    "redo": [
        L([6, 24, 6, 17, 11, 12, 20, 12], BLUE, 3),
        P([18, 5, 18, 19, 28, 12], BLUE, BLUE),
    ],
    "select": dashes(5, 6, 25, 6) + dashes(25, 6, 25, 20) + dashes(25, 20, 5, 20) + dashes(5, 20, 5, 6) + [
        P([13, 12, 13, 28, 18, 24, 22, 30, 25, 28, 21, 22, 27, 21], DARK, "#ffffff", 1.5)
    ],
    "pencil": [
        P([23, 7, 26, 4, 29, 7, 26, 10], outline="#ffffff", fill="#f8fafc", w=1.5),
        P([21, 9, 23, 7, 26, 10, 24, 12], outline="#ffffff", fill="#94a3b8", w=1.2),
        P([12, 18, 21, 9, 24, 12, 15, 21], outline="#ffffff", fill="#f59e0b", w=1.5),
        L([13, 19, 22, 10], col="#fef08a", w=1.2),
        P([8, 22, 12, 18, 15, 21, 11, 25], outline="#ffffff", fill="#fef3c7", w=1.2),
        P([5, 25, 8, 22, 11, 25], outline="#ffffff", fill="#1e293b", w=1.2),
    ],
    "fill": [
        P([7, 15, 14, 8, 22, 16, 15, 23], outline="#ffffff", fill="#1e293b", w=1.5),
        P([12, 10, 15, 7, 22, 14, 19, 17], outline="#38bdf8", fill="#38bdf8", w=1),
        L([9, 11, 13, 4, 18, 7], col="#cbd5e1", w=1.5, smooth=True),
        P([22, 18, 26, 23, 25, 27, 21, 27, 19, 23], outline="#ffffff", fill="#f97316", w=1.5),
        O(21, 23, 23, 25, outline="", fill="#ffffff"),
    ],
    "text": [
        T(16, 16, "A", col="#ffffff", font=("Times New Roman", 17, "bold")),
    ],
    "eraser": [
        P([13, 11, 20, 4, 27, 11, 20, 18], outline="#ffffff", fill="#fb7185", w=1.5),
        P([13, 11, 16, 8, 23, 1, 20, 4], outline="#ffffff", fill="#fca5a5", w=1),
        P([7, 17, 13, 11, 20, 18, 14, 24], outline="#ffffff", fill="#f8fafc", w=1.5),
        L([9, 19, 16, 12], col="#0284c7", w=1.5),
        L([13, 26, 24, 26], col="#ffffff", w=2),
    ],
    "picker": [
        O(19, 3, 29, 13, outline="#ffffff", fill="#38bdf8", w=1.5),
        P([17, 13, 20, 10, 23, 13, 20, 16], outline="#ffffff", fill="#38bdf8", w=1.5),
        P([10, 20, 17, 13, 20, 16, 13, 23], outline="#ffffff", fill="#1e293b", w=1.5),
        L([12, 19, 18, 13], col="#ffffff", w=1.2),
        P([5, 26, 10, 20, 13, 23], outline="#ffffff", fill="#ffffff", w=1.5),
        L([5, 26, 7, 24], col="#38bdf8", w=2),
    ],
    "zoom": [
        O(4, 4, 20, 20, outline="#ffffff", fill="#1e293b", w=2),
        L([8, 12, 16, 12], col="#38bdf8", w=2.2),
        L([12, 8, 12, 16], col="#38bdf8", w=2.2),
        L([18, 18, 27, 27], col="#ffffff", w=3),
    ],
    "b_pencil": [L(WAVE, DARK, 2, True)],
    "b_brush": [L(WAVE, "#0f172a", 6, True)],
    "b_marker": [L(WAVE, "#f59e0b", 8, True)],
    "b_highlighter": [L(WAVE, "#84cc16", 10, True)],
    "b_dashed": dashes(4, 25, 28, 7, DARK, 3, 5, 4),
    "s_line": [L([5, 27, 27, 5], DARK, 3)],
    "s_arrow": [
        L([5, 27, 21, 11], DARK, 3),
        P([28, 4, 16, 8, 23, 15], DARK, DARK),
    ],
    "s_rect": [R(5, 7, 27, 25, DARK, None, 2.5)],
    "s_rounded_rect": [
        R(7, 6, 25, 26, DARK, None, 2.5),
        O(5, 6, 9, 10, DARK, None, 2),
        O(23, 6, 27, 10, DARK, None, 2),
        O(5, 22, 9, 26, DARK, None, 2),
        O(23, 22, 27, 26, DARK, None, 2),
    ],
    "s_oval": [O(4, 7, 28, 25, DARK, None, 2.5)],
    "s_triangle": [P([16, 5, 28, 27, 4, 27], DARK, None, 2.5)],
    "s_diamond": [P([16, 4, 28, 16, 16, 28, 4, 16], DARK, None, 2.5)],
    "s_star": [P([16, 3, 20, 12, 29, 13, 22, 19, 25, 29, 16, 23, 7, 29, 10, 19, 3, 13, 12, 12], DARK, None, 2)],
    "s_sticky": [
        R(5, 5, 27, 27, "#d97706", "#fef08a", 2),
        L([9, 11, 23, 11], "#b45309", 1.5),
        L([9, 16, 23, 16], "#b45309", 1.5),
        L([9, 21, 18, 21], "#b45309", 1.5),
    ],
    "table": [
        R(4, 5, 28, 27, DARK, None, 2),
        L([4, 12, 28, 12], DARK, 1.5),
        L([4, 19, 28, 19], DARK, 1.5),
        L([12, 5, 12, 27], DARK, 1.5),
        L([20, 5, 20, 27], DARK, 1.5),
    ],
    "image": [
        R(4, 5, 28, 27, DARK, "#e0f2fe", 2),
        O(8, 9, 13, 14, "#f59e0b", "#f59e0b", 1),
        P([6, 25, 14, 15, 20, 22, 26, 16, 27, 25], DARK, "#38bdf8", 1),
    ],
    "grid": [
        R(4, 4, 28, 28, "#3B82F6", "#F0F9FF", 1.8),
        L([12, 4, 12, 28], col="#94A3B8", w=1.2),
        L([20, 4, 20, 28], col="#94A3B8", w=1.2),
        L([4, 12, 28, 12], col="#94A3B8", w=1.2),
        L([4, 20, 28, 20], col="#94A3B8", w=1.2),
    ],
    "clear": [
        R(7, 8, 25, 27, "#ef4444", None, 2),
        L([5, 8, 27, 8], "#ef4444", 2.5),
        R(12, 5, 20, 8, "#ef4444", None, 1.5),
        L([11, 12, 11, 23], "#ef4444", 1.5),
        L([16, 12, 16, 23], "#ef4444", 1.5),
        L([21, 12, 21, 23], "#ef4444", 1.5),
    ],
    "share": [
        O(5, 12, 12, 19, "#0369A1", "#38BDF8", 1.5),
        O(20, 5, 27, 12, "#0369A1", "#38BDF8", 1.5),
        O(20, 19, 27, 26, "#0369A1", "#38BDF8", 1.5),
        L([11, 14, 21, 9], col="#0284C7", w=2),
        L([11, 17, 21, 22], col="#0284C7", w=2),
    ],
    "lock": [
        O(10, 4, 22, 17, "#475569", "", 2.5),
        R(7, 12, 25, 27, "#B45309", "#F59E0B", 1.8),
        O(14, 16, 18, 20, "", "#78350F"),
        L([16, 19, 16, 23], col="#78350F", w=2),
    ],
    "unlock": [
        O(13, 3, 25, 16, "#475569", "", 2.5),
        R(7, 12, 25, 27, "#047857", "#10B981", 1.8),
        O(14, 16, 18, 20, "", "#064E3B"),
        L([16, 19, 16, 23], col="#064E3B", w=2),
    ],
    "users": [
        O(7, 6, 17, 16, DARK, "#cbd5e1", 1.5),
        P([4, 26, 8, 19, 16, 19, 20, 26], DARK, "#94a3b8", 1.5),
        O(17, 8, 25, 16, BLUE, "#bae6fd", 1.5),
        P([17, 26, 19, 20, 25, 20, 27, 26], BLUE, "#7dd3fc", 1.5),
    ],
    "leave": [
        R(5, 5, 18, 27, "#ef4444", None, 2),
        L([14, 16, 27, 16], "#ef4444", 2.5),
        P([23, 11, 28, 16, 23, 21], "#ef4444", "#ef4444"),
    ],
    "hand": [
        P([8, 18, 6, 14, 8, 12, 11, 15, 11, 8, 14, 8, 14, 15, 14, 6, 17, 6, 17, 15, 17, 7, 20, 7, 20, 16, 20, 10, 23, 10, 23, 18, 22, 23, 19, 27, 11, 27, 8, 22],
          "#B45309", "#F59E0B", 1.8),
        L([11, 19, 18, 19], col="#D97706", w=1.2),
        L([13, 22, 17, 22], col="#D97706", w=1.2),
    ],
    "reaction": [
        O(3, 5, 25, 27, "#D97706", "#FBBF24", 1.8),
        O(8, 11, 11, 15, "", "#78350F"),
        O(9, 11, 10, 13, "", "#FFFFFF"),
        O(17, 11, 20, 15, "", "#78350F"),
        O(18, 11, 19, 13, "", "#FFFFFF"),
        P([8, 18, 14, 24, 20, 18], "#B45309", "#78350F", 1.5),
        P([11, 21, 14, 24, 17, 21], "", "#F43F5E"),
        P([25, 4, 27, 2, 29, 4, 29, 6, 25, 10, 21, 6, 21, 4, 23, 2], "#BE123C", "#EF4444", 1),
    ],
    "history": [
        O(4, 4, 28, 28, DARK, "#f1f5f9", 2),
        L([16, 8, 16, 16, 22, 16], BLUE, 2.5),
    ],
}


def draw_icon(c, prims, s=1.0):
    def sc(pts):
        return [round(v * s) for v in pts]
    for p in prims:
        k = p[0]
        if k == "line":
            c.create_line(*sc(p[1]), fill=p[2], width=max(1, round(p[3] * s)),
                          capstyle="round", joinstyle="round", smooth=p[4])
        elif k == "rect":
            c.create_rectangle(*sc(p[1:5]), outline=p[5], fill=p[6] or "", width=max(1, round(p[7] * s)))
        elif k == "oval":
            c.create_oval(*sc(p[1:5]), outline=p[5], fill=p[6] or "", width=max(1, round(p[7] * s)))
        elif k == "poly":
            c.create_polygon(*sc(p[1]), outline=p[2], fill=p[3] or "", width=max(1, round(p[4] * s)),
                             joinstyle="round")
        elif k == "arc":
            c.create_arc(*sc(p[1:5]), start=p[5], extent=p[6], style=p[7],
                         outline=p[8], width=max(1, round(p[9] * s)))
        elif k == "text":
            font_spec = p[5]
            if isinstance(font_spec, tuple) and len(font_spec) >= 2:
                font_name, font_sz = font_spec[0], max(8, round(font_spec[1] * s))
                rest = font_spec[2:]
                font_spec = (font_name, font_sz, *rest)
            c.create_text(round(p[1] * s), round(p[2] * s), text=p[3], fill=p[4], font=font_spec)


def _rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    a, b = _rgb(c1), _rgb(c2)
    return "#%02x%02x%02x" % tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def style_buttons(root):
    """Flat modern look + hover effect for every tk.Button under root."""
    for w in root.winfo_children():
        if isinstance(w, tk.Button) and not getattr(w, "_styled", False):
            w._styled = True
            try:
                base = w.cget("bg")
                hov = mix(base, "#0284c7", 0.12)
                edge = mix(base, "#475569", 0.30)
                w.config(relief="flat", bd=0, highlightthickness=1, highlightbackground=edge,
                         cursor="hand2", activebackground=mix(base, "#0284c7", 0.25))
                w.bind("<Enter>", lambda e, w=w, h=hov: w.config(bg=h), add="+")
                w.bind("<Leave>", lambda e, w=w, b=base: w.config(bg=b), add="+")
            except Exception:
                pass
        style_buttons(w)


class Tip:
    def __init__(self, widget, text):
        self.w = widget
        self.text = text
        self.tw = None
        self.job = None
        widget.bind("<Enter>", self.schedule, add="+")
        widget.bind("<Leave>", self.hide, add="+")
        widget.bind("<ButtonPress>", self.hide, add="+")

    def schedule(self, _e=None):
        self.hide()
        self.job = self.w.after(350, self.show)

    def show(self):
        try:
            x = self.w.winfo_rootx() + 8
            y = self.w.winfo_rooty() + self.w.winfo_height() + 6
            self.tw = tk.Toplevel(self.w)
            self.tw.wm_overrideredirect(True)
            self.tw.wm_geometry(f"+{x}+{y}")
            self.tw.config(bg="#334155")
            try:
                self.tw.attributes("-topmost", True)
            except Exception:
                pass
            tk.Label(self.tw, text=self.text, bg="#0f172a", fg="#f8fafc", relief="flat",
                     font=("Segoe UI", 9), padx=8, pady=3).pack(padx=1, pady=1)
        except Exception:
            pass

    def hide(self, _e=None):
        if self.job:
            self.w.after_cancel(self.job)
            self.job = None
        if self.tw:
            try:
                self.tw.destroy()
            except Exception:
                pass
            self.tw = None


def round_rect_pts(x0, y0, x1, y1, r=4):
    """Generate vertices for a crisp rounded rectangle with exact coordinates."""
    return [
        x0 + r, y0,
        x1 - r, y0,
        x1 - r * 0.29, y0 + r * 0.29,
        x1, y0 + r,
        x1, y1 - r,
        x1 - r * 0.29, y1 - r * 0.29,
        x1 - r, y1,
        x0 + r, y1,
        x0 + r * 0.29, y1 - r * 0.29,
        x0, y1 - r,
        x0, y0 + r,
        x0 + r * 0.29, y0 + r * 0.29
    ]


class PaintIconButton(tk.Canvas):
    """Clean vector icon button with hover / pressed / active states (Light & Dark modes)."""
    RAD = 4
    LIGHT_STYLES = {
        "normal":   ("#ffffff", "#d3e5f8", 1),
        "hover":    ("#e0f2fe", "#38bdf8", 1),
        "pressed":  ("#bae6fd", "#0284c7", 1),
        "selected": ("#bae6fd", "#0284c7", 1.5),
    }
    DARK_STYLES = {
        "normal":   ("", "", 0),
        "hover":    ("#2c323d", "#485260", 1),
        "pressed":  ("#182230", "#0284c7", 1),
        "selected": ("#1b2a3d", "#38bdf8", 1.5),
    }

    def __init__(self, parent, icon_name, command, tip="", size=34, dark=False):
        self.dark = dark
        try:
            pbg = parent.cget("bg")
        except Exception:
            pbg = "#20242a" if dark else "#ffffff"
        super().__init__(parent, width=size, height=size, bg=pbg, cursor="hand2",
                         highlightthickness=0, bd=0)
        self.selected = False
        self.command = command
        self.icon_name = icon_name
        self.size = size
        self.paint()
        self.bind("<Enter>", lambda e: self.paint("hover"))
        self.bind("<Leave>", lambda e: self.paint())
        self.bind("<ButtonPress-1>", lambda e: self.paint("pressed"))
        self.bind("<ButtonRelease-1>", lambda e: self.on_click())
        if tip:
            Tip(self, tip)

    def on_click(self):
        self.paint("hover")
        if self.command:
            self.command()

    def paint(self, state=None):
        if state is True:
            state = "hover"
        if not state or state is False:
            state = "selected" if self.selected else "normal"
        elif state == "hover" and self.selected:
            state = "selected"

        styles = self.DARK_STYLES if self.dark else self.LIGHT_STYLES
        bg_col, border_col, bw = styles.get(state, styles["normal"])
        s, r = self.size, self.RAD
        self.delete("all")

        # Crisp rounded card background
        if bg_col or border_col:
            pts = round_rect_pts(1, 1, s - 1, s - 1, r=r)
            self.create_polygon(pts, fill=bg_col or "", outline=border_col or "", width=bw)

        # Center and render icon
        if self.icon_name in ICONS:
            draw_icon(self, ICONS[self.icon_name], s / 32.0)

        # Active indicator line at bottom
        if state == "selected":
            bar_col = "#38bdf8" if self.dark else "#0284c7"
            self.create_line(round(s * 0.22), s - 2, round(s * 0.78), s - 2, fill=bar_col, width=2, capstyle="round")

    def set_selected(self, state):
        self.selected = bool(state)
        self.paint()


class MeetLeaveButton(tk.Canvas):
    """Google Meet-style modern red pill-shaped Leave button."""
    def __init__(self, parent, command):
        super().__init__(parent, width=82, height=34, bg=parent.cget("bg"), highlightthickness=0, cursor="hand2")
        self.command = command
        self.bg_col = "#EF4444"
        self.hover_col = "#DC2626"
        self.draw(self.bg_col)
        self.bind("<Enter>", lambda e: self.draw(self.hover_col))
        self.bind("<Leave>", lambda e: self.draw(self.bg_col))
        self.bind("<ButtonRelease-1>", lambda e: self.command())
        Tip(self, "Leave Whiteboard Session")

    def draw(self, color):
        self.delete("all")
        # Pill rounded background
        self.create_oval(1, 1, 33, 33, fill=color, outline=color)
        self.create_oval(49, 1, 81, 33, fill=color, outline=color)
        self.create_rectangle(17, 1, 65, 33, fill=color, outline=color)

        # White door frame
        self.create_line(12, 9, 21, 9, 21, 25, 12, 25, fill="#FFFFFF", width=2)
        # Exit arrow
        self.create_line(15, 17, 26, 17, fill="#FFFFFF", width=2)
        self.create_polygon([23, 13, 28, 17, 23, 21], fill="#FFFFFF", outline="#FFFFFF")

        # "Leave" label
        self.create_text(52, 17, text="Leave", fill="#FFFFFF", font=("Segoe UI", 9, "bold"))


# ====================================================================
# Left Vertical Pill Sliders (Windows 11 MS Paint style)
# ====================================================================
class VerticalPillSlider(tk.Canvas):
    """
    Vertical pill slider on the left of the canvas for Brush Size and Opacity.
    Features top and bottom dot indicators, track line, and a draggable pill thumb.
    """
    def __init__(self, parent, min_val, max_val, init_val, title="", on_change=None, width=32, height=180):
        super().__init__(parent, width=width, height=height, bg="#ffffff", highlightthickness=0, cursor="hand2")
        self.min_val = min_val
        self.max_val = max_val
        self.val = init_val
        self.title = title
        self.on_change = on_change
        self.w, self.h = width, height
        self.track_top = 22
        self.track_bot = height - 22

        self.bind("<ButtonPress-1>", self.on_press)
        self.bind("<B1-Motion>", self.on_drag)
        self.bind("<ButtonRelease-1>", self.on_drag)
        self.redraw()
        Tip(self, f"{title}: {self.val}")

    def val_to_y(self, v):
        ratio = (v - self.min_val) / max(1e-5, (self.max_val - self.min_val))
        return self.track_bot - ratio * (self.track_bot - self.track_top)

    def y_to_val(self, y):
        clamped_y = max(self.track_top, min(self.track_bot, y))
        ratio = (self.track_bot - clamped_y) / (self.track_bot - self.track_top)
        return self.min_val + ratio * (self.max_val - self.min_val)

    def redraw(self):
        self.delete("all")
        cx = self.w / 2
        # Outline pill track
        self.create_line(cx, self.track_top, cx, self.track_bot, fill="#cbd5e1", width=4, capstyle="round")

        # Top indicator (large circle)
        self.create_oval(cx - 5, self.track_top - 12, cx + 5, self.track_top - 2, fill="#0284c7", outline="")
        # Bottom indicator (small circle)
        self.create_oval(cx - 2, self.track_bot + 4, cx + 2, self.track_bot + 8, fill="#94a3b8", outline="")

        # Draggable thumb pill
        cy = self.val_to_y(self.val)
        self.create_oval(cx - 8, cy - 8, cx + 8, cy + 8, fill="#ffffff", outline="#0284c7", width=2)
        self.create_oval(cx - 4, cy - 4, cx + 4, cy + 4, fill="#0284c7", outline="")

        # Tooltip or label
        val_str = f"{int(self.val)}" if isinstance(self.val, int) or self.max_val > 10 else f"{int(self.val * 100)}%"
        self.create_text(cx, self.h - 5, text=val_str, fill="#64748b", font=("Segoe UI", 7, "bold"))

    def on_press(self, e):
        self.set_from_y(e.y)

    def on_drag(self, e):
        self.set_from_y(e.y)

    def set_from_y(self, y):
        new_v = self.y_to_val(y)
        if isinstance(self.min_val, int) and isinstance(self.max_val, int):
            new_v = int(round(new_v))
        self.val = new_v
        self.redraw()
        if self.on_change:
            self.on_change(self.val)

    def set_val(self, v):
        self.val = max(self.min_val, min(self.max_val, v))
        self.redraw()


# ====================================================================
# Network Wrapper (Socket Threading + Inbox Queue)
# ====================================================================
class Net:
    def __init__(self, host, port=PORT):
        if isinstance(host, str) and ":" in host:
            try:
                h_part, p_part = host.split(":", 1)
                self.host = h_part.strip()
                self.port = int(p_part.strip())
            except Exception:
                self.host = host.strip()
                self.port = port
        else:
            self.host = host.strip() if isinstance(host, str) else host
            self.port = port
        self.inbox = queue.Queue()
        self.sock = None
        self._lock = threading.Lock()
        self.connect()

    def connect(self, timeout=4):
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass
        s = socket.create_connection((self.host, self.port), timeout=timeout)
        s.settimeout(None)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.sock = s
        threading.Thread(target=self._reader, args=(s,), daemon=True).start()

    def _reader(self, s):
        try:
            f = s.makefile("r", encoding="utf-8")
            while True:
                line = f.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line)
                    self.inbox.put(msg)
                except Exception:
                    continue
        except Exception:
            pass
        self.inbox.put({"type": "disconnected", "_sock": s})

    def close(self):
        self.drop()

    def send(self, msg):
        try:
            data = (json.dumps(msg, default=str) + "\n").encode("utf-8")
            with self._lock:
                if self.sock:
                    self.sock.sendall(data)
        except Exception:
            pass

    def drop(self):
        try:
            if self.sock:
                self.sock.shutdown(socket.SHUT_RDWR)
                self.sock.close()
        except Exception:
            pass


# ====================================================================
# Text Entry & Font Size Dialog
# ====================================================================
class TextEntryDialog(tk.Toplevel):
    """Clean modal dialog for entering text and choosing font size."""

    def __init__(self, parent, title="Add Text", initial_text="", initial_size=18):
        super().__init__(parent)
        self.title(title)
        self.result = None
        self.transient(parent)
        self.grab_set()
        self.configure(bg="#ffffff")
        self.resizable(False, False)

        card = tk.Frame(self, bg="#ffffff", padx=20, pady=16)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="Text Content:", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#0f172a").pack(anchor="w", pady=(0, 4))
        self.txt_entry = tk.Entry(card, font=("Segoe UI", 11), width=32, relief="solid", bd=1,
                                  highlightthickness=1, highlightcolor="#0284c7", highlightbackground="#cbd5e1")
        self.txt_entry.pack(fill="x", ipady=4, pady=(0, 12))
        if initial_text:
            self.txt_entry.insert(0, initial_text)

        size_frame = tk.Frame(card, bg="#ffffff")
        size_frame.pack(fill="x", pady=(0, 16))
        tk.Label(size_frame, text="Font Size:", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#0f172a").pack(side="left")

        self.size_var = tk.StringVar(value=str(initial_size))
        sizes = ["10", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "64", "72"]
        self.cb_size = ttk.Combobox(size_frame, textvariable=self.size_var, values=sizes, width=6, state="normal",
                                    font=("Segoe UI", 9))
        self.cb_size.pack(side="left", padx=8)
        tk.Label(size_frame, text="pt", font=("Segoe UI", 9), bg="#ffffff", fg="#64748b").pack(side="left")

        btn_box = tk.Frame(card, bg="#ffffff")
        btn_box.pack(fill="x")

        tk.Button(btn_box, text="OK", width=9, bg="#0284c7", fg="#ffffff", font=("Segoe UI", 9, "bold"),
                  relief="flat", cursor="hand2", command=self.on_ok).pack(side="right", padx=(6, 0))
        tk.Button(btn_box, text="Cancel", width=9, bg="#f1f5f9", fg="#475569", font=("Segoe UI", 9),
                  relief="flat", cursor="hand2", command=self.destroy).pack(side="right")

        self.txt_entry.bind("<Return>", lambda e: self.on_ok())
        self.cb_size.bind("<Return>", lambda e: self.on_ok())
        self.txt_entry.focus_set()

        self.update_idletasks()
        w, h = self.winfo_reqwidth(), self.winfo_reqheight()
        px = parent.winfo_rootx() + (parent.winfo_width() - w) // 2
        py = parent.winfo_rooty() + (parent.winfo_height() - h) // 2
        self.geometry(f"+{max(0, px)}+{max(0, py)}")

        self.wait_window(self)

    def on_ok(self):
        txt = self.txt_entry.get().strip()
        if not txt:
            self.destroy()
            return
        try:
            sz = int(self.size_var.get().strip())
            sz = max(6, min(150, sz))
        except (ValueError, TypeError):
            sz = 18
        self.result = (txt, sz)
        self.destroy()


# ====================================================================
# Connect & Lobby Dialog
# ====================================================================
class ConnectDialog:
    """Windows 11 modern white card lobby dialog styled with Aura minimalist aesthetics."""
    def __init__(self):
        self.saved = load_settings()
        self.result = None
        self.mode = "create"  # 'create' or 'join'
        self.avatar_color = self.saved.get("avatar_color", AVATAR_COLORS[0])
        self.local_ip, self.local_iface = get_local_ip_info()
        self.show_pass = False

        self.root = tk.Tk()
        self.root.title("LAN Whiteboard - Welcome")
        self.root.configure(bg="#f4f4f5")
        self.root.resizable(False, False)

        card = tk.Frame(self.root, bg="#ffffff", highlightthickness=1, highlightbackground="#e4e4e7", padx=36, pady=24)
        card.pack(padx=28, pady=24)

        # ── Top Subtle Mesh & Brand Header ──
        self.head_cv = tk.Canvas(card, width=370, height=50, bg="#ffffff", highlightthickness=0)
        self.head_cv.pack(fill="x")
        # Soft blue-gray grid
        for x in range(25, 360, 36):
            self.head_cv.create_line(x, 0, x, 50, fill="#f1f5f9", width=1)
        for y in range(10, 50, 16):
            self.head_cv.create_line(0, y, 370, y, fill="#f1f5f9", width=1)
        # Blue semicircle dome + brand title
        self.head_cv.create_arc(135, 12, 161, 38, start=0, extent=180, fill="#2563eb", outline="")
        self.head_cv.create_text(169, 19, text="Whiteboard", font=("Segoe UI", 12, "bold"), fill="#09090b", anchor="w")

        # ── Main Title & Subtitle ──
        self.h_title = tk.Label(card, text="Welcome back", font=("Segoe UI", 21, "bold"), bg="#ffffff", fg="#09090b")
        self.h_title.pack(anchor="center", pady=(6, 2))

        self.sub_label = tk.Label(card, text="Please enter your details to sign in", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a")
        self.sub_label.pack(anchor="center", pady=(0, 14))

        # ── 3 Circular Action Buttons (Host, Join, Scan) ──
        circ_box = tk.Frame(card, bg="#ffffff")
        circ_box.pack(fill="x", pady=(0, 14))
        circ_inner = tk.Frame(circ_box, bg="#ffffff")
        circ_inner.pack(anchor="center")

        self.circ_btns = []
        items = [
            ("create", "👑", "Host"),
            ("join", "🔗", "Join"),
            ("scan", "📡", "Scan"),
        ]
        for m_id, icon, lbl in items:
            cv = tk.Canvas(circ_inner, width=54, height=54, bg="#ffffff", highlightthickness=0, cursor="hand2")
            cv.pack(side="left", padx=10)
            self.circ_btns.append((m_id, cv, icon, lbl))

            def make_handler(target_m):
                def _h(e):
                    if target_m == "scan":
                        self.browse_rooms()
                    else:
                        self.set_mode(target_m)
                return _h

            cv.bind("<Button-1>", make_handler(m_id))

            def make_hover(canvas, target_m):
                def _in(e):
                    if target_m != self.mode:
                        canvas.itemconfig("bg_oval", outline="#a1a1aa")
                def _out(e):
                    if target_m != self.mode:
                        canvas.itemconfig("bg_oval", outline="#e4e4e7")
                return _in, _out

            h_in, h_out = make_hover(cv, m_id)
            cv.bind("<Enter>", h_in)
            cv.bind("<Leave>", h_out)

        # ── "OR" Divider ──
        div_frame = tk.Frame(card, bg="#ffffff")
        div_frame.pack(fill="x", pady=(0, 14))
        tk.Frame(div_frame, bg="#e4e4e7", height=1).pack(side="left", fill="x", expand=True)
        tk.Label(div_frame, text="OR", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#a1a1aa", padx=10).pack(side="left")
        tk.Frame(div_frame, bg="#e4e4e7", height=1).pack(side="left", fill="x", expand=True)

        # ── Form Inputs ──
        self.v_user = tk.StringVar(value=self.saved.get("user") or "harish")
        self.v_host = tk.StringVar(value=self.saved.get("host", "127.0.0.1"))
        self.v_code = tk.StringVar(value=self.saved.get("code") or "VOXB")
        self.v_pass = tk.StringVar()
        self.v_public = tk.BooleanVar(value=True)
        self.v_autohost = tk.BooleanVar(value=True)

        # Name Field
        self.make_styled_field(card, "Your Name", self.v_user)

        # Profile Avatar Color Swatches
        av_box = tk.Frame(card, bg="#ffffff")
        av_box.pack(fill="x", pady=(0, 10))
        tk.Label(av_box, text="Profile Avatar Color", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#27272a").pack(anchor="w", pady=(0, 4))
        av_row = tk.Frame(av_box, bg="#ffffff")
        av_row.pack(fill="x")
        self.av_swatches = []
        for c in AVATAR_COLORS:
            cv = tk.Canvas(av_row, width=22, height=22, bg="#ffffff", highlightthickness=0, cursor="hand2")
            cv.pack(side="left", padx=3)
            self.draw_avatar_preview(cv, c, selected=(c == self.avatar_color))
            cv.bind("<Button-1>", lambda e, col=c: self.pick_avatar_color(col))
            self.av_swatches.append((cv, c))

        # Server IP Address Field
        self.make_styled_field(card, "Server IP Address", self.v_host)

        # Mode Container for dynamic fields
        self.mode_container = tk.Frame(card, bg="#ffffff")
        self.mode_container.pack(fill="x")

        # Join Code Box (Join Mode only)
        self.code_box = tk.Frame(self.mode_container, bg="#ffffff")
        self.make_styled_field(self.code_box, "Room Code (4 Letters)", self.v_code)

        # Password Field with Eye Toggle Icon (Aura style)
        self.pass_box = tk.Frame(card, bg="#ffffff")
        self.pass_box.pack(fill="x", pady=(0, 8))
        tk.Label(self.pass_box, text="Password (Optional)", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#27272a").pack(anchor="w", pady=(0, 4))
        
        pass_wrap = tk.Frame(self.pass_box, bg="#ffffff", highlightthickness=1, highlightbackground="#e4e4e7", highlightcolor="#18181b")
        pass_wrap.pack(fill="x")
        
        self.e_pass = tk.Entry(pass_wrap, textvariable=self.v_pass, show="*", font=("Segoe UI", 10), relief="flat",
                               bg="#ffffff", fg="#09090b", insertbackground="#09090b")
        self.e_pass.pack(side="left", fill="x", expand=True, ipady=6, padx=(10, 0))
        self.e_pass.bind("<Return>", lambda e: self.submit())

        self.eye_lbl = tk.Label(pass_wrap, text="👁", font=("Segoe UI", 11), bg="#ffffff", fg="#71717a", cursor="hand2")
        self.eye_lbl.pack(side="right", padx=10)
        self.eye_lbl.bind("<Button-1>", self.toggle_eye_pass)

        # ── Checkbox & Info Link Row ──
        self.opt_row = tk.Frame(card, bg="#ffffff")
        self.opt_row.pack(fill="x", pady=(2, 12))

        self.cb_opt = tk.Checkbutton(self.opt_row, text="Auto-start server on this PC", variable=self.v_autohost,
                                     bg="#ffffff", activebackground="#ffffff", font=("Segoe UI", 9), fg="#27272a")
        self.cb_opt.pack(side="left")

        self.link_right = tk.Label(self.opt_row, text=f"📍 LAN IP: {self.local_ip}", font=("Segoe UI", 9, "underline"),
                                   bg="#ffffff", fg="#2563eb", cursor="hand2")
        self.link_right.pack(side="right")
        self.link_right.bind("<Button-1>", self.on_right_link_click)

        # ── Main Primary Button (Sleek Dark #18181b) ──
        self.btn_submit = tk.Button(card, text="Start Room (Host)", font=("Segoe UI", 10, "bold"),
                                    bg="#18181b", fg="#ffffff", activebackground="#27272a", activeforeground="#ffffff",
                                    relief="flat", bd=0, cursor="hand2", pady=10, command=self.submit)
        self.btn_submit.pack(fill="x", pady=(2, 8))
        self.btn_submit.bind("<Enter>", lambda e: self.btn_submit.config(bg="#27272a"))
        self.btn_submit.bind("<Leave>", lambda e: self.btn_submit.config(bg="#18181b"))

        self.err_lbl = tk.Label(card, text="", font=("Segoe UI", 9), bg="#ffffff", fg="#ef4444")
        self.err_lbl.pack(fill="x", pady=(0, 4))

        # ── Footer Link (Aura Style) ──
        self.foot_box = tk.Frame(card, bg="#ffffff")
        self.foot_box.pack(fill="x", pady=(2, 2))
        
        self.foot_prefix = tk.Label(self.foot_box, text="Looking to join an existing session? ", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a")
        self.foot_prefix.pack(side="left", expand=True, anchor="e")
        
        self.foot_link = tk.Label(self.foot_box, text="Join room", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#09090b", cursor="hand2")
        self.foot_link.pack(side="left", anchor="w")
        self.foot_link.bind("<Button-1>", lambda e: self.toggle_mode())

        self.refresh_mode()
        self.root.update_idletasks()
        w, h = self.root.winfo_width(), self.root.winfo_height()
        self.root.geometry(f"+{(self.root.winfo_screenwidth() - w) // 2}+{(self.root.winfo_screenheight() - h) // 3}")
        self.root.mainloop()

    def make_styled_field(self, parent, label, var):
        box = tk.Frame(parent, bg="#ffffff")
        box.pack(fill="x", pady=(0, 10))
        tk.Label(box, text=label, font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#27272a").pack(anchor="w", pady=(0, 4))
        entry_wrap = tk.Frame(box, bg="#ffffff", highlightthickness=1, highlightbackground="#e4e4e7", highlightcolor="#18181b")
        entry_wrap.pack(fill="x")
        e = tk.Entry(entry_wrap, textvariable=var, font=("Segoe UI", 10), relief="flat", bg="#ffffff", fg="#09090b", insertbackground="#09090b")
        e.pack(fill="x", ipady=6, padx=10)
        e.bind("<Return>", lambda ev: self.submit())
        return e

    def toggle_eye_pass(self, _e=None):
        self.show_pass = not self.show_pass
        self.e_pass.config(show="" if self.show_pass else "*")
        self.eye_lbl.config(text="🙈" if self.show_pass else "👁")

    def on_right_link_click(self, _e=None):
        if self.mode == "create":
            # Copy or auto-populate LAN IP
            self.v_host.set(self.local_ip)
            self.err_lbl.config(text=f"Copied {self.local_ip} to Server IP field.", fg="#0284c7")
        else:
            self.browse_rooms()

    def draw_avatar_preview(self, cv, color, selected=False):
        cv.delete("all")
        cv.create_oval(2, 2, 20, 20, fill=color, outline="#18181b" if selected else "#ffffff", width=2 if selected else 1)
        if selected:
            cv.create_oval(7, 7, 15, 15, fill="#ffffff", outline="")

    def pick_avatar_color(self, c):
        self.avatar_color = c
        for cv, col in self.av_swatches:
            self.draw_avatar_preview(cv, col, selected=(col == c))

    def set_mode(self, m):
        if self.mode != m:
            self.mode = m
            self.refresh_mode()

    def toggle_mode(self):
        self.mode = "join" if self.mode == "create" else "create"
        self.refresh_mode()

    def redraw_circular_buttons(self):
        for m_id, cv, icon, lbl in self.circ_btns:
            cv.delete("all")
            is_active = (m_id == self.mode)
            if is_active:
                cv.create_oval(3, 3, 51, 51, outline="#18181b", width=2, fill="#f8fafc", tags="bg_oval")
            else:
                cv.create_oval(3, 3, 51, 51, outline="#e4e4e7", width=1.5, fill="#ffffff", tags="bg_oval")
            cv.create_text(27, 20, text=icon, font=("Segoe UI Emoji", 13))
            cv.create_text(27, 38, text=lbl, font=("Segoe UI", 8, "bold"), fill="#18181b" if is_active else "#71717a")

    def refresh_mode(self):
        is_create = self.mode == "create"
        self.sub_label.config(text="Please enter your details to host a whiteboard" if is_create else "Please enter your details to join a session")
        self.btn_submit.config(text="Start Room (Host)" if is_create else "Join Room")

        if is_create:
            self.code_box.pack_forget()
            self.cb_opt.config(text="Auto-start server on this PC", variable=self.v_autohost)
            self.link_right.config(text=f"📍 LAN IP: {self.local_ip}", fg="#2563eb")
            self.foot_prefix.config(text="Looking to join an existing session? ")
            self.foot_link.config(text="Join room")
            if self.v_host.get().strip() in ("", "127.0.0.1", "localhost"):
                self.v_host.set("127.0.0.1")
        else:
            self.code_box.pack(fill="x")
            self.cb_opt.config(text="Remember credentials", variable=self.v_public)
            self.link_right.config(text="🔍 Auto-Discover LAN", fg="#0284c7")
            self.foot_prefix.config(text="Want to host a new whiteboard session? ")
            self.foot_link.config(text="Create room")

        self.redraw_circular_buttons()
        self.err_lbl.config(text="")

    def browse_rooms(self):
        self.err_lbl.config(text="Scanning LAN / Hotspot via UDP...", fg="#0284c7")
        self.root.update_idletasks()

        # 1. Run UDP discovery across LAN / Hotspot
        discovered = discover_lan_rooms(timeout=1.0)

        # 2. Check the manual IP entered in self.v_host as fallback
        fallback_host = self.v_host.get().strip()
        if fallback_host and not any(d.get("ip") == fallback_host for d in discovered):
            try:
                s = socket.create_connection((fallback_host, PORT), timeout=1.0)
                s.sendall(json.dumps({"type": "list_rooms"}).encode("utf-8") + b"\n")
                line = s.makefile("r", encoding="utf-8").readline()
                s.close()
                msg = json.loads(line)
                rooms = msg.get("rooms", [])
                if rooms:
                    discovered.append({
                        "ip": fallback_host,
                        "port": PORT,
                        "rooms": rooms
                    })
            except Exception:
                pass

        self.err_lbl.config(text="")

        all_rooms = []
        for d in discovered:
            ip = d.get("ip")
            for r in d.get("rooms", []):
                all_rooms.append({
                    "ip": ip,
                    "code": r["code"],
                    "host": r["host"],
                    "users": r.get("users", 1),
                    "has_password": r.get("has_password", False)
                })

        if not all_rooms:
            messagebox.showinfo(
                "LAN Discovery",
                f"No active public rooms discovered on your local network.\n\n"
                f"• Ensure the host computer has started the board.\n"
                f"• Check that you are connected to the same Wi-Fi, Hotspot, or Ethernet.\n"
                f"• If UDP broadcast is blocked by your firewall, manually enter the host's IP ({self.local_ip}) in the box."
            )
            return

        win = tk.Toplevel(self.root)
        win.title("Discovered LAN Rooms")
        win.geometry("460x360")
        win.configure(bg="#ffffff")
        win.resizable(False, False)

        tk.Label(win, text="Active Rooms on Local Network", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#0f172a").pack(pady=(12, 4))
        tk.Label(win, text="Double-click or select a room to auto-fill IP and Room Code:", font=("Segoe UI", 9), bg="#ffffff", fg="#64748b").pack(pady=(0, 8))

        lb = tk.Listbox(win, font=("Segoe UI", 10), selectbackground="#bae6fd", selectforeground="#0f172a", relief="flat", highlightthickness=1, highlightbackground="#cbd5e1")
        lb.pack(fill="both", expand=True, padx=16, pady=4)
        for r in all_rooms:
            lock_str = "🔒 Password" if r.get("has_password") else "🔓 Open"
            lb.insert("end", f"Room {r['code']}   ·   Host: {r['host']}   ·   IP: {r['ip']}   ·   ({r['users']} users) [{lock_str}]")

        lb.selection_set(0)

        def on_sel():
            sel = lb.curselection()
            if sel:
                chosen = all_rooms[sel[0]]
                self.v_code.set(chosen["code"])
                self.v_host.set(chosen["ip"])
                self.set_mode("join")
                win.destroy()

        lb.bind("<Double-Button-1>", lambda e: on_sel())

        btn_box = tk.Frame(win, bg="#ffffff")
        btn_box.pack(fill="x", padx=16, pady=12)
        tk.Button(btn_box, text="Connect to Selected Room", bg="#18181b", fg="#ffffff", font=("Segoe UI", 10, "bold"),
                  relief="flat", bd=0, pady=8, cursor="hand2", command=on_sel).pack(fill="x")

    def submit(self):
        u = self.v_user.get().strip()
        h = self.v_host.get().strip()
        c = self.v_code.get().strip().upper()
        p = self.v_pass.get().strip()
        if not u:
            self.err_lbl.config(text="Please enter your name.", fg="#ef4444")
            return
        if not h:
            self.err_lbl.config(text="Please enter server IP address.", fg="#ef4444")
            return
        if self.mode == "join" and not c:
            self.err_lbl.config(text="Please enter the 4-letter room code.", fg="#ef4444")
            return

        # Auto-start server if hosting locally and server is not running
        if self.mode == "create" and self.v_autohost.get():
            if h in ("127.0.0.1", "localhost", self.local_ip):
                self.err_lbl.config(text="Initializing local whiteboard server...", fg="#0284c7")
                self.root.update_idletasks()
                ok = ensure_local_server()
                if not ok and not is_port_listening("127.0.0.1", PORT):
                    self.err_lbl.config(text="⚠️ Could not start server. Please verify server.exe / server.py exists.", fg="#ef4444")
                    return

        save_settings({"user": u, "host": h, "avatar_color": self.avatar_color})
        self.result = {
            "mode": self.mode,
            "user": u,
            "host": h,
            "code": c,
            "password": p or None,
            "public": self.v_public.get(),
            "avatar_color": self.avatar_color,
        }
        self.root.destroy()


# ====================================================================
# Offline Board Storage Manager (Apple Notes / Personal Workspaces)
# ====================================================================
if getattr(sys, "frozen", False):
    APP_ROOT = os.path.dirname(sys.executable)
else:
    APP_ROOT = os.path.dirname(os.path.abspath(__file__))

BOARDS_DIR = os.path.join(APP_ROOT, "saves", "boards")

class BoardManager:
    """Manages persistent whiteboards (Group & Personal) stored as structured JSON files."""
    @staticmethod
    def ensure_dir():
        try:
            os.makedirs(BOARDS_DIR, exist_ok=True)
        except Exception:
            pass

    @classmethod
    def list_boards(cls, board_type=None):
        cls.ensure_dir()
        boards = []
        files = glob.glob(os.path.join(BOARDS_DIR, "board_*.json"))
        for path in files:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "id" in data:
                        # Purge any legacy seed markings
                        if "actions" in data and isinstance(data["actions"], list):
                            data["actions"] = [a for a in data["actions"] if isinstance(a, dict) and "stroke_figure" not in str(a.get("id", ""))]
                        data["count"] = len(data.get("actions", []))
                        b_type = data.get("board_type")
                        if not b_type:
                            b_type = "group" if data.get("code") else "personal"
                            data["board_type"] = b_type
                        if board_type is None or b_type == board_type:
                            boards.append(data)
            except Exception:
                continue

        boards.sort(key=lambda b: b.get("timestamp", 0), reverse=True)
        return boards

    @classmethod
    def find_by_code(cls, code):
        if not code:
            return None
        code_u = code.strip().upper()
        for b in cls.list_boards(board_type="group"):
            if b.get("code", "").strip().upper() == code_u:
                return b
        return None

    @classmethod
    def create_board(cls, title="Untitled Whiteboard", color=None, board_type="personal", code="", host="127.0.0.1", is_host=True, actions=None, instances=None):
        cls.ensure_dir()
        ts = time.time()
        uid = uuid.uuid4().hex[:6]
        bid = f"board_{int(ts)}_{uid}"
        palette = ["#0d9488", "#2563eb", "#e11d48", "#d97706", "#7c3aed", "#059669", "#0891b2"]
        chosen_color = color or random.choice(palette)

        clean_actions = [a for a in (actions or []) if isinstance(a, dict) and "stroke_figure" not in str(a.get("id", ""))]
        clean_instances = [inst for inst in (instances or []) if isinstance(inst, dict)]
        data = {
            "id": bid,
            "title": title.strip() or ("Personal Whiteboard" if board_type == "personal" else "Group Whiteboard"),
            "board_type": board_type,
            "code": code.strip().upper() if code else "",
            "host": host or "127.0.0.1",
            "is_host": is_host,
            "color": chosen_color,
            "timestamp": ts,
            "created_at": time.strftime("%d %b, %I:%M %p"),
            "updated_at": time.strftime("%I:%M %p"),
            "actions": clean_actions,
            "instances": clean_instances,
            "count": len(clean_actions)
        }
        cls.save_raw(bid, data)
        return data

    @classmethod
    def get_board_path(cls, board_id):
        return os.path.join(BOARDS_DIR, f"{board_id}.json")

    @classmethod
    def load_board(cls, board_id):
        path = cls.get_board_path(board_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    # Purge any legacy seed markings
                    if "actions" in data and isinstance(data["actions"], list):
                        data["actions"] = [a for a in data["actions"] if isinstance(a, dict) and "stroke_figure" not in str(a.get("id", ""))]
                        data["count"] = len(data["actions"])
                return data
        except Exception as e:
            print(f"[!] Failed to load board {board_id}: {e}")
            return None

    @classmethod
    def save_raw(cls, board_id, data):
        cls.ensure_dir()
        path = cls.get_board_path(board_id)
        tmp = path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            if os.path.exists(path):
                os.remove(path)
            os.rename(tmp, path)
            return True
        except Exception as e:
            print(f"[!] Failed to save board {board_id}: {e}")
            return False

    @classmethod
    def save_board(cls, board_id, actions=None, title=None, code=None, host=None, board_type=None, is_host=None, instances=None):
        data = cls.load_board(board_id)
        if not data:
            data = {
                "id": board_id,
                "title": title or "Untitled Whiteboard",
                "color": "#0d9488",
                "created_at": time.strftime("%d %b, %I:%M %p"),
                "board_type": board_type or ("group" if code else "personal"),
            }
        if actions is not None:
            # Purge legacy seed markings
            clean_acts = [a for a in actions if isinstance(a, dict) and "stroke_figure" not in str(a.get("id", ""))]
            data["actions"] = clean_acts
            data["count"] = len(clean_acts)
        if title:
            data["title"] = title
        if code:
            data["code"] = code.strip().upper()
        if host:
            data["host"] = host
        if board_type:
            data["board_type"] = board_type
        if is_host is not None:
            data["is_host"] = is_host
        if instances is not None:
            data["instances"] = instances
        data["timestamp"] = time.time()
        data["updated_at"] = time.strftime("%I:%M %p")
        return cls.save_raw(board_id, data)

    @classmethod
    def rename_board(cls, board_id, new_title):
        data = cls.load_board(board_id)
        if data:
            data["title"] = new_title.strip() or "Untitled Whiteboard"
            data["timestamp"] = time.time()
            data["updated_at"] = time.strftime("%I:%M %p")
            return cls.save_raw(board_id, data)
        return False

    @classmethod
    def delete_board(cls, board_id):
        path = cls.get_board_path(board_id)
        try:
            if os.path.exists(path):
                os.remove(path)
                return True
        except Exception as e:
            print(f"[!] Failed to delete board {board_id}: {e}")
        return False


# ====================================================================
# Main Application Window (Windows 11 MS Paint Layout)
# ====================================================================
class WhiteboardApp:
    def __init__(self, net, config, root=None, on_back_cb=None):
        self.net = net
        self.config = config
        self.on_back_cb = on_back_cb
        self.is_offline = (net is None) or config.get("is_offline", False)
        self.board_id = config.get("board_id", None)
        self.board_title = config.get("board_title", "Untitled Whiteboard")
        self.redo_stack = []
        self.user = config["user"].strip()[:20]
        self.avatar_color = config.get("avatar_color", "#0284c7")

        # Session & sync state
        self.actions = []
        self.by_id = {}
        self.bg = "#ffffff"
        self.users = {}          # name -> info dict
        self.cursors = {}        # name -> (x, y)
        self.zoom = 1.0
        self.grid_mode = "none"  # "none", "square", "dot"

        # Tool state
        self.tool = "pencil"
        self.brush = "pencil"
        self.shape = "rect"
        self.color1 = "#000000"
        self.color2 = "#ffffff"
        self.brush_size = 3
        self.font_size = 18
        self.opacity = 1.0
        self.fill_shape = False
        self._setting_zoom = False

        # Drawing interaction state
        self.counter = 0
        self.cur_stroke = None
        self.last_pt = None
        self.drag0 = None
        self.selected = None
        self.sel_drag = None
        self.photo_images = {}  # Keep references for images rendered

        # Host & permissions
        self.is_host = True if self.is_offline else False
        self.is_cohost = False
        self.can_draw = True
        self.room_locked = False
        self.presentation_mode = False
        self.hand_raised = False
        self.selected_users = {}  # username -> tk.BooleanVar for multi-user host actions
        self._on_clients_list_cb = None

        # Reliability & protocol
        self.token = None
        self.session_code = config.get("code") or "VOXB"
        self.last_seq = 0
        self.pending = {}
        self.last_resend = 0.0
        self.online = True
        self.resyncing = False
        self.reconnecting = False
        self.last_rx = time.time()
        self.last_cursor_sent = 0.0
        self.drawer_tab = "chat"

        # Real LAN-based chat records & de-duplication state
        self.chat_messages = []
        self.seen_message_ids = set()
        self.pending_acks = set()

        # Connected participants (starts with self until server sends users_info)
        self.users = {
            self.user: {"name": self.user, "avatar_color": self.avatar_color, "is_host": self.is_host, "can_draw": True}
        }

        # Typography & Auto-Beautify State
        self.font_family = "Segoe UI"
        self.auto_beautify = False
        self.recent_handwritten_strokes = []
        self._beautify_timer = None

        # Session Works & Instance Permissions State
        self.session_works = []
        self.instance_save_perm = "everyone"
        self.instance_save_allowed = {self.user}
        self.can_save_instances = True

        # Pan interaction state
        self._pan_start = None

        # Load saved board actions if existing; otherwise start fresh and blank
        loaded_board = None
        if self.board_id:
            loaded_board = BoardManager.load_board(self.board_id)

        if loaded_board and loaded_board.get("actions"):
            # Purge any legacy seed markings completely
            self.actions = [a for a in loaded_board.get("actions", []) if isinstance(a, dict) and "stroke_figure" not in str(a.get("id", ""))]
            self.by_id = {a["id"]: a for a in self.actions if isinstance(a, dict) and "id" in a}
            self.session_works = loaded_board.get("instances", [])
        else:
            # Completely fresh start: no written or markings on the canvas
            self.actions = []
            self.by_id = {}
            self.session_works = []

        # Build UI
        if root is not None:
            self.root = root
        else:
            self.root = tk.Tk()

        if self.is_offline:
            self.root.title(f"LAN Whiteboard - [Offline Note] - {self.board_title} - {self.user}")
        else:
            self.root.title(f"Collaborative Whiteboard - {self.board_title} - {self.user}")
        self.root.geometry("1280x820")
        self.root.minsize(1050, 700)
        self.root.configure(bg="#ffffff")

        self.build_top_menu_row()
        self.build_ribbon()
        self.build_workspace()
        self.build_floating_meet_bar()
        self.build_status_bar()

        # Keyboard shortcuts (robust against chat entry focus & caps lock)
        self.root.bind_all("<Control-z>", self.on_ctrl_z)
        self.root.bind_all("<Control-Z>", self.on_ctrl_y)
        self.root.bind_all("<Control-y>", self.on_ctrl_y)
        self.root.bind_all("<Control-Y>", self.on_ctrl_y)
        self.canvas.bind("<Delete>", lambda e: self.delete_selected())
        self.canvas.bind("<BackSpace>", lambda e: self.delete_selected())
        self.root.protocol("WM_DELETE_WINDOW", self.quit)

        # Initial render of the canvas
        self.render()

        if not self.is_offline and self.net:
            # Initial send
            msg = {
                "type": config["mode"],
                "user": self.user,
                "session": config.get("code", ""),
                "title": self.board_title,
                "room_name": self.board_title,
                "avatar_color": self.avatar_color,
                "password": config.get("password"),
                "public": config.get("public", True),
                "actions": self.actions,
            }
            self.net.send(msg)

            # Start poll and heartbeat loops
            self.poll()
            self.heartbeat()
        else:
            self.status.config(text=f"📝 Offline Workspace · Auto-saving locally ({len(self.actions)} elements)")

    def save_board_state(self):
        if not self.board_id:
            return
        try:
            b_type = "personal" if self.is_offline else "group"
            BoardManager.save_board(
                board_id=self.board_id,
                actions=self.actions,
                title=self.board_title,
                code=self.session_code,
                host=self.config.get("host", "127.0.0.1"),
                board_type=b_type,
                is_host=self.is_host,
                instances=self.session_works
            )
            if hasattr(self, "status"):
                self.status.config(text=f"Saved ({len(self.actions)} elements) at {time.strftime('%I:%M:%S %p')}")
        except Exception as ex:
            print(f"[!] Save board error: {ex}")

    def auto_save_offline(self):
        self.save_board_state()

    def back_to_hub(self):
        self.quit()

    def run(self):
        self.root.mainloop()

    # ----------------------------------------------------------------
    # Keyboard & Shortcut Handlers
    # ----------------------------------------------------------------
    def on_ctrl_z(self, _e=None):
        try:
            if hasattr(self, "chat_entry") and self.root.focus_get() == self.chat_entry:
                return
        except Exception:
            pass
        self.undo()

    def on_ctrl_y(self, _e=None):
        try:
            if hasattr(self, "chat_entry") and self.root.focus_get() == self.chat_entry:
                return
        except Exception:
            pass
        self.redo()

    # ----------------------------------------------------------------
    # Top Menu & Title Row (White #FFFFFF)
    # ----------------------------------------------------------------
    def build_top_menu_row(self):
        top = tk.Frame(self.root, bg="#ffffff", height=38, highlightthickness=0)
        top.pack(side="top", fill="x", padx=6, pady=2)

        # Left: Return to Whiteboard Logs Button + Brand + Menus
        hub_btn = tk.Button(top, text="← Whiteboard Logs", bg="#0d9488", fg="#ffffff",
                            font=("Segoe UI", 9, "bold"), relief="flat", bd=0, padx=10, pady=2,
                            activebackground="#0f766e", activeforeground="#ffffff",
                            cursor="hand2", command=self.back_to_hub)
        hub_btn.pack(side="left", padx=(2, 8))

        brand_box = tk.Frame(top, bg="#ffffff")
        brand_box.pack(side="left", padx=(2, 10))
        left_box = tk.Frame(top, bg="#ffffff")
        left_box.pack(side="left")

        # Menu bar buttons
        for lbl, cmd in [("File", self.show_file_menu), ("Edit", self.show_edit_menu), ("View", self.show_view_menu)]:
            b = tk.Label(left_box, text=lbl, bg="#ffffff", fg="#1f2937", font=("Segoe UI", 9), padx=7, pady=2, cursor="hand2")
            b.pack(side="left")
            b.bind("<Enter>", lambda e, w=b: w.config(bg="#f1f5f9"))
            b.bind("<Leave>", lambda e, w=b: w.config(bg="#ffffff"))
            b.bind("<Button-1>", lambda e, c=cmd: c())

        tk.Frame(left_box, bg="#e5e7eb", width=1, height=18).pack(side="left", padx=8, pady=4)

        # Quick Access: Save, Undo, Redo
        self.qa_save = PaintIconButton(left_box, "save", self.save_board, tip="Save to Server", size=28)
        self.qa_save.pack(side="left", padx=2)
        self.qa_undo = PaintIconButton(left_box, "undo", self.undo, tip="Undo (Ctrl+Z)", size=28)
        self.qa_undo.pack(side="left", padx=2)
        self.qa_redo = PaintIconButton(left_box, "redo", self.redo, tip="Redo (Ctrl+Y)", size=28)
        self.qa_redo.pack(side="left", padx=2)

        # Center: Room badge & Share
        center_box = tk.Frame(top, bg="#ffffff")
        center_box.pack(side="left", expand=True)

        self.room_badge = tk.Label(center_box, text=f"Room: {self.board_title}", bg="#f0f9ff", fg="#0284c7",
                                   font=("Segoe UI", 9, "bold"), padx=10, pady=3, relief="flat", bd=0, highlightthickness=1)
        self.room_badge.config(highlightbackground="#bae6fd")
        self.room_badge.pack(side="left", padx=6)

        self.lock_badge = tk.Label(center_box, text="🔓 Open", bg="#f0fdf4", fg="#16a34a",
                                   font=("Segoe UI", 8, "bold"), padx=8, pady=3, relief="flat", bd=0, highlightthickness=1,
                                   highlightbackground="#86efac")
        self.lock_badge.pack(side="left", padx=4)

        if self.is_offline:
            self.room_badge.config(
                text=f"📝 {self.board_title}", bg="#f0fdf4", fg="#16a34a",
                highlightbackground="#86efac"
            )
            self.lock_badge.config(
                text="🔒 Local Offline Board", bg="#f1f5f9", fg="#475569",
                highlightbackground="#cbd5e1"
            )

        btn_share = tk.Button(center_box, text="Share Code", font=("Segoe UI", 8, "bold"), bg="#0284c7", fg="#ffffff",
                              relief="flat", bd=0, padx=8, pady=2, cursor="hand2", command=self.copy_invite)
        btn_share.pack(side="left", padx=4)

        btn_save_inst = tk.Button(center_box, text="📸 Save Instance", font=("Segoe UI", 8, "bold"), bg="#10b981", fg="#ffffff",
                                  relief="flat", bd=0, padx=8, pady=2, cursor="hand2", command=self.save_instance_dialog)
        btn_save_inst.pack(side="left", padx=4)
        Tip(btn_save_inst, "Capture milestone snapshot: save to local PC or share to Session Works")

        self.btn_session_works = tk.Button(center_box, text=f"📁 Session Works ({len(self.session_works)})", font=("Segoe UI", 8, "bold"),
                                           bg="#f1f5f9", fg="#334155", relief="flat", bd=0, padx=8, pady=2, cursor="hand2",
                                           command=self.open_session_works_gallery)
        self.btn_session_works.pack(side="left", padx=4)
        Tip(self.btn_session_works, "View all saved session instances from start to finish")

        btn_share_session = tk.Button(center_box, text="📤 Share All Instances", font=("Segoe UI", 8, "bold"), bg="#6366f1", fg="#ffffff",
                                      relief="flat", bd=0, padx=8, pady=2, cursor="hand2", command=self.export_full_session_bundle)
        btn_share_session.pack(side="left", padx=4)
        Tip(btn_share_session, "Export complete whiteboard bundle with all saved instances to share with others")

        # Right: Branding Block ("WB" Logo + "Collaborative Whiteboard") + Profile + Drawer Toggle
        right_box = tk.Frame(top, bg="#ffffff")
        right_box.pack(side="right", padx=6)

        # 48x48 Vector "WB" Logo Canvas
        self.logo_canvas = tk.Canvas(brand_box, width=48, height=48, bg="#ffffff", highlightthickness=0)
        self.logo_canvas.pack(side="left", padx=(0, 4))
        self.draw_wb_logo(self.logo_canvas)

        # "Collaborative Whiteboard" Title
        title_lbl = tk.Label(brand_box, text="Collaborative Whiteboard", font=("Segoe UI", 14, "bold"),
                             bg="#ffffff", fg="#0F172A")
        title_lbl.pack(side="left", padx=(0, 10))

        # Thin divider between branding and profile
        tk.Frame(brand_box, bg="#e5e7eb", width=1, height=28).pack(side="left", padx=(0, 4))

        # User Profile Avatar circle
        self.avatar_canvas = tk.Canvas(right_box, width=32, height=32, bg="#ffffff", highlightthickness=0)
        self.avatar_canvas.pack(side="left", padx=(0, 6))
        self.draw_profile_avatar(self.avatar_canvas, self.user, self.avatar_color)

        self.user_lbl = tk.Label(right_box, text=self.user, bg="#ffffff", fg="#0f172a", font=("Segoe UI", 9, "bold"))
        self.user_lbl.pack(side="left", padx=(0, 4))
        tk.Label(right_box, text="● Online", bg="#ffffff", fg="#16a34a",
                 font=("Segoe UI", 8)).pack(side="left", padx=(0, 8))

        # Drawer toggle button
        self.btn_collab = PaintIconButton(right_box, "users", self.toggle_drawer, tip="Toggle Collaboration Drawer", size=30)
        self.btn_collab.pack(side="left", padx=2)

        # Thin light-gray divider below top row
        div = tk.Frame(self.root, bg="#e5e7eb", height=1)
        div.pack(side="top", fill="x")

    def draw_wb_logo(self, cv):
        cv.delete("all")
        cv.create_arc(4, 4, 44, 44, start=45, extent=285, style="arc", outline="#0A66C2", width=3.5)
        w_pts = [11, 15, 14.5, 31, 18.5, 21, 22.5, 31, 39, 31]
        cv.create_line(*w_pts, fill="#0A66C2", width=3.5, capstyle="round", joinstyle="round")
        cv.create_line(24.5, 14, 24.5, 30, fill="#4B5563", width=3.2, capstyle="round")
        cv.create_line(24.5, 14, 32, 14, 35, 17.5, 32, 21, 24.5, 21,
                       fill="#4B5563", width=2.8, smooth=True, capstyle="round")
        cv.create_line(24.5, 21, 33, 21, 36.5, 25.5, 33, 30, 24.5, 30,
                       fill="#4B5563", width=2.8, smooth=True, capstyle="round")

    def draw_profile_avatar(self, cv, name, color):
        cv.delete("all")
        cv.create_oval(2, 2, 28, 28, fill=color, outline="#ffffff", width=1.5)
        initials = (name[:2] if len(name) >= 2 else name[:1]).upper()
        cv.create_text(15, 15, text=initials, fill="#ffffff", font=("Segoe UI", 9, "bold"))

    def show_file_menu(self):
        m = tk.Menu(self.root, tearoff=0, bg="#ffffff", fg="#1f2937")
        m.add_command(label="Save Board to Server...", command=self.save_board)
        m.add_command(label="Open Saved Board... (Host)", command=self.open_board)
        m.add_separator()
        m.add_command(label="Export Canvas as PostScript (.ps)...", command=self.export_ps)
        m.add_command(label="Export Action Log as JSON...", command=self.export_json)
        m.add_separator()
        m.add_command(label="Exit", command=self.quit)
        m.tk_popup(self.root.winfo_pointerx(), self.root.winfo_pointery())

    def show_edit_menu(self):
        m = tk.Menu(self.root, tearoff=0, bg="#ffffff", fg="#1f2937")
        m.add_command(label="Undo (Ctrl+Z)", command=self.undo)
        m.add_command(label="Redo (Ctrl+Y)", command=self.redo)
        m.add_separator()
        m.add_command(label="Delete Selected (Del)", command=self.delete_selected)
        m.add_command(label="Clear Canvas (Host)", command=self.clear_canvas)
        m.tk_popup(self.root.winfo_pointerx(), self.root.winfo_pointery())

    def show_view_menu(self):
        m = tk.Menu(self.root, tearoff=0, bg="#ffffff", fg="#1f2937")
        m.add_command(label="Toggle Grid (None/Square/Dot)", command=self.cycle_grid)
        m.add_command(label="Zoom In (+)", command=lambda: self.set_zoom(self.zoom * 1.25))
        m.add_command(label="Zoom Out (-)", command=lambda: self.set_zoom(self.zoom / 1.25))
        m.add_command(label="Zoom 100%", command=lambda: self.set_zoom(1.0))
        m.tk_popup(self.root.winfo_pointerx(), self.root.winfo_pointery())

    # ----------------------------------------------------------------
    # Top Ribbon Toolbar (Windows 11 MS Paint Sections)
    # ----------------------------------------------------------------
    def ribbon_group(self, parent, title, dark=False):
        bg = "#20242a" if dark else "#eef6ff"
        border = "#333842" if dark else "#d3e5f8"
        fg_lbl = "#cbd5e1" if dark else "#4b6a8a"
        g = tk.Frame(parent, bg=bg, highlightthickness=1, highlightbackground=border)
        g.pack(side="left", fill="y", padx=4, pady=3)
        content = tk.Frame(g, bg=bg, padx=6 if dark else 4, pady=3 if dark else 2)
        content.pack(side="top", expand=True, fill="both")
        lbl = tk.Label(g, text=title, bg=bg, fg=fg_lbl, font=("Segoe UI", 8, "bold" if dark else "normal"))
        lbl.pack(side="bottom", pady=(2, 2) if dark else (3, 0))
        return content

    def build_ribbon(self):
        rib = tk.Frame(self.root, bg="#f8fbff", height=82)
        rib.pack(side="top", fill="x", padx=6, pady=4)

        self.tool_btns = {}
        self.brush_btns = {}
        self.shape_btns = {}

        # 1. Selection
        g_sel = self.ribbon_group(rib, "Selection")
        b_sel = PaintIconButton(g_sel, "select", lambda: self.set_tool("select"), tip="Select / Move / Delete", size=42)
        b_sel.pack(padx=2, pady=4)
        self.tool_btns["select"] = b_sel

        # 2. Image & Insert
        g_img = self.ribbon_group(rib, "Image & Insert")
        PaintIconButton(g_img, "image", self.insert_image, tip="Insert Image (PNG/GIF)", size=32).grid(row=0, column=0, padx=2, pady=1)
        PaintIconButton(g_img, "table", self.insert_table, tip="Insert Table Grid", size=32).grid(row=0, column=1, padx=2, pady=1)
        PaintIconButton(g_img, "grid", self.cycle_grid, tip="Toggle Canvas Grid", size=32).grid(row=1, column=0, padx=2, pady=1)
        PaintIconButton(g_img, "clear", self.clear_canvas, tip="Clear Canvas (Host)", size=32).grid(row=1, column=1, padx=2, pady=1)

        # 3. Tools (2x3 Grid - Windows 11 Dark Mode Tools)
        g_tools = self.ribbon_group(rib, "Tools", dark=True)
        tools_list = [
            ("pencil", "Pencil tool"),
            ("fill", "Color Fill (Bucket)"),
            ("text", "Text tool"),
            ("eraser", "Eraser tool"),
            ("picker", "Color Picker"),
            ("zoom", "Magnifier (Left-click zoom in, Right-click zoom out)"),
        ]
        for i, (t_name, tip) in enumerate(tools_list):
            b = PaintIconButton(g_tools, t_name, lambda n=t_name: self.set_tool(n), tip=tip, size=32, dark=True)
            b.grid(row=i // 3, column=i % 3, padx=2, pady=1)
            self.tool_btns[t_name] = b

        # 3b. Text & Ink Typography Group
        g_text = self.ribbon_group(rib, "Text & Font")
        t_box = tk.Frame(g_text, bg="#eef6ff")
        t_box.pack(side="top", padx=2, pady=1)

        # Row 1: Font Family and Size side-by-side
        row1 = tk.Frame(t_box, bg="#eef6ff")
        row1.pack(fill="x", pady=1)

        f_box = tk.Frame(row1, bg="#eef6ff")
        f_box.pack(side="left", padx=(0, 4))
        tk.Label(f_box, text="Font:", font=("Segoe UI", 7, "bold"), bg="#eef6ff", fg="#334155").pack(anchor="w")
        self.font_family_var = tk.StringVar(value=getattr(self, "font_family", "Segoe UI"))
        self.cb_font_family = ttk.Combobox(
            f_box, textvariable=self.font_family_var,
            values=["Segoe UI", "Segoe Script", "Segoe Print", "Arial", "Comic Sans MS", "Times New Roman", "Georgia", "Consolas", "Courier New", "Impact", "Verdana"],
            width=10, state="readonly", font=("Segoe UI", 8)
        )
        self.cb_font_family.pack(anchor="w")
        self.cb_font_family.bind("<<ComboboxSelected>>", self.on_font_family_changed)
        Tip(self.cb_font_family, "Select font family for text and handwriting ink-to-font conversion")

        s_box = tk.Frame(row1, bg="#eef6ff")
        s_box.pack(side="left")
        tk.Label(s_box, text="Size:", font=("Segoe UI", 7, "bold"), bg="#eef6ff", fg="#334155").pack(anchor="w")
        self.font_size_var = tk.StringVar(value=str(self.font_size))
        self.cb_font_size = ttk.Combobox(
            s_box, textvariable=self.font_size_var,
            values=["10", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "64", "72"],
            width=4, state="normal", font=("Segoe UI", 8)
        )
        self.cb_font_size.pack(anchor="w")
        self.cb_font_size.bind("<<ComboboxSelected>>", self.on_font_size_changed)
        self.cb_font_size.bind("<Return>", self.on_font_size_changed)
        self.cb_font_size.bind("<FocusOut>", self.on_font_size_changed)
        Tip(self.cb_font_size, "Select or type font size")

        # Row 2: Ink-to-Font Buttons
        row2 = tk.Frame(t_box, bg="#eef6ff")
        row2.pack(fill="x", pady=(2, 0))

        self.btn_auto_ink = tk.Button(
            row2, text="✨ Auto Font: OFF", font=("Segoe UI", 7, "bold"),
            bg="#f1f5f9", fg="#475569", relief="flat", bd=0, padx=3, pady=1, cursor="hand2",
            command=self.toggle_auto_ink_to_font
        )
        self.btn_auto_ink.pack(side="left", padx=(0, 2))
        Tip(self.btn_auto_ink, "When ON, hand-written words/digits/symbols are automatically turned into clean text in the selected font")

        btn_convert_now = tk.Button(
            row2, text="🔤 Convert Ink", font=("Segoe UI", 7),
            bg="#e0f2fe", fg="#0284c7", relief="flat", bd=0, padx=3, pady=1, cursor="hand2",
            command=self.convert_recent_handwriting
        )
        btn_convert_now.pack(side="left")
        Tip(btn_convert_now, "Convert recent hand-drawn strokes to selected font right now")

        # 4. Brushes Gallery
        g_brushes = self.ribbon_group(rib, "Brushes")
        brushes_list = [
            ("pencil", "Pencil"),
            ("brush", "Calligraphy Brush"),
            ("marker", "Marker"),
            ("highlighter", "Highlighter (Translucent)"),
            ("dashed", "Dashed Stroke"),
        ]
        for i, (b_name, tip) in enumerate(brushes_list):
            btn = PaintIconButton(g_brushes, "b_" + b_name, lambda n=b_name: self.pick_brush(n), tip=tip, size=28)
            btn.grid(row=i // 3, column=i % 3, padx=1, pady=1)
            self.brush_btns[b_name] = btn

        # 5. Shapes Gallery
        g_shapes = self.ribbon_group(rib, "Shapes")
        shapes_frame = tk.Frame(g_shapes, bg="#eef6ff")
        shapes_frame.pack(side="top")

        shapes_list = [
            ("line", "Line"), ("arrow", "Arrow"), ("rect", "Rectangle"),
            ("rounded_rect", "Rounded Rectangle"), ("oval", "Oval"),
            ("triangle", "Triangle"), ("diamond", "Diamond Decision"),
            ("star", "5-Point Star"), ("sticky", "Sticky Note"),
        ]
        for i, (s_name, tip) in enumerate(shapes_list):
            btn = PaintIconButton(shapes_frame, "s_" + s_name, lambda n=s_name: self.pick_shape(n), tip=tip, size=26)
            btn.grid(row=i // 5, column=i % 5, padx=1, pady=1)
            self.shape_btns[s_name] = btn

        # Fill toggle checkbox inside shapes
        self.v_fill = tk.BooleanVar(value=False)
        cb_fill = tk.Checkbutton(g_shapes, text="Fill Shape", variable=self.v_fill, bg="#eef6ff",
                                 activebackground="#eef6ff", font=("Segoe UI", 7))
        cb_fill.pack(side="bottom")

        # 6. Colours Section
        g_colors = self.ribbon_group(rib, "Colours")
        c_left = tk.Frame(g_colors, bg="#eef6ff")
        c_left.pack(side="left", padx=4)

        # Primary & Secondary color preview boxes
        self.cv_col1 = tk.Canvas(c_left, width=32, height=32, bg="#eef6ff", highlightthickness=0, cursor="hand2")
        self.cv_col1.pack(pady=1)
        self.draw_color_indicator(self.cv_col1, self.color1, "1")
        self.cv_col1.bind("<Button-1>", lambda e: self.edit_primary_color())
        Tip(self.cv_col1, "Color 1 (Foreground)")

        # 2x10 Palette Grid
        pal_frame = tk.Frame(g_colors, bg="#eef6ff")
        pal_frame.pack(side="left", padx=4)
        for i, col in enumerate(PALETTE):
            c_lbl = tk.Label(pal_frame, bg=col, width=2, height=1, relief="flat", bd=0, cursor="hand2",
                             highlightthickness=1, highlightbackground="#cbd5e1")
            c_lbl.grid(row=i // 10, column=i % 10, padx=1, pady=1)
            c_lbl.bind("<Button-1>", lambda e, c=col: self.set_primary_color(c))
            c_lbl.bind("<Button-3>", lambda e, c=col: self.set_secondary_color(c))
            c_lbl.bind("<Enter>", lambda e, w=c_lbl: w.config(highlightbackground="#0284c7", highlightthickness=2), add="+")
            c_lbl.bind("<Leave>", lambda e, w=c_lbl: w.config(highlightbackground="#cbd5e1", highlightthickness=1), add="+")
            Tip(c_lbl, col.upper() + "  (right-click = Color 2)")

        # Rainbow Edit Colors button
        self.btn_edit_col = tk.Button(g_colors, text="Edit\nColours", font=("Segoe UI", 8), bg="#ebf5ff",
                                      fg="#0284c7", activebackground="#cbe4ff", relief="flat", bd=0, padx=4,
                                      cursor="hand2", command=self.edit_primary_color)
        self.btn_edit_col.pack(side="left", padx=4)

        style_buttons(rib)
        tk.Frame(self.root, bg="#e5e7eb", height=1).pack(side="top", fill="x")

    def draw_color_indicator(self, cv, color, label):
        cv.delete("all")
        cv.create_rectangle(2, 2, 30, 30, fill=color, outline="#0284c7", width=2)
        cv.create_text(16, 16, text=label, fill="#ffffff" if color in ("#000000", "#3f48cc", "#880015") else "#000000",
                       font=("Segoe UI", 9, "bold"))

    def set_primary_color(self, c):
        self.color1 = c
        self.draw_color_indicator(self.cv_col1, self.color1, "1")

    def set_secondary_color(self, c):
        self.color2 = c

    def edit_primary_color(self):
        c = colorchooser.askcolor(color=self.color1, parent=self.root)[1]
        if c:
            self.set_primary_color(c)

    # ----------------------------------------------------------------
    # Central Workspace & Canvas (Pill Sliders on Left + Centered White Canvas)
    # ----------------------------------------------------------------
    def build_workspace(self):
        self.workspace_frame = tk.Frame(self.root, bg="#e9eef5")
        self.workspace_frame.pack(fill="both", expand=True)

        # Left Vertical Pill Sliders container
        self.left_sidebar = tk.Frame(self.workspace_frame, bg="#ffffff", width=46, highlightthickness=1)
        self.left_sidebar.config(highlightbackground="#e5e7eb")
        self.left_sidebar.pack(side="left", fill="y", padx=(0, 2))

        lbl_s = tk.Label(self.left_sidebar, text="SIZE", font=("Segoe UI", 7, "bold"), bg="#ffffff", fg="#64748b")
        lbl_s.pack(side="top", pady=(8, 0))
        self.size_slider = VerticalPillSlider(self.left_sidebar, min_val=1, max_val=40, init_val=3,
                                              title="Size", on_change=self.on_size_change, height=170)
        self.size_slider.pack(side="top", pady=4)

        tk.Frame(self.left_sidebar, bg="#e5e7eb", height=1).pack(fill="x", padx=4, pady=8)

        lbl_o = tk.Label(self.left_sidebar, text="OPAC", font=("Segoe UI", 7, "bold"), bg="#ffffff", fg="#64748b")
        lbl_o.pack(side="top", pady=(2, 0))
        self.opacity_slider = VerticalPillSlider(self.left_sidebar, min_val=0.1, max_val=1.0, init_val=1.0,
                                                 title="Opacity", on_change=self.on_opacity_change, height=150)
        self.opacity_slider.pack(side="top", pady=4)

        # Right Drawer (Collapsible: Participants + Host controls + Chat)
        self.right_drawer = tk.Frame(self.workspace_frame, bg="#ffffff", width=330, highlightthickness=1)
        self.right_drawer.config(highlightbackground="#e5e7eb")
        self.right_drawer.pack_propagate(False)
        self.drawer_visible = True
        self.right_drawer.pack(side="right", fill="y")
        self.build_drawer_content()

        # Canvas Area (Centered White Board with scrollbars)
        self.canvas_container = tk.Frame(self.workspace_frame, bg="#e9eef5")
        self.canvas_container.pack(side="left", fill="both", expand=True)

        self.canvas = tk.Canvas(self.canvas_container, bg="#ffffff", width=DEFAULT_W, height=DEFAULT_H,
                                scrollregion=(0, 0, DEFAULT_W, DEFAULT_H), highlightthickness=1,
                                highlightbackground="#d1d5db")
        self.xs = ttk.Scrollbar(self.canvas_container, orient="horizontal", command=self.canvas.xview)
        self.ys = ttk.Scrollbar(self.canvas_container, orient="vertical", command=self.canvas.yview)
        self.canvas.config(xscrollcommand=self.xs.set, yscrollcommand=self.ys.set)
        self.xs.pack(side="bottom", fill="x")
        self.ys.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True, padx=6, pady=6)

        # Canvas bindings
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_move)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Motion>", self.on_hover)
        self.canvas.bind("<Double-Button-1>", self.on_double_click)
        self.canvas.bind("<Button-3>", lambda e: self.set_zoom(self.zoom / 1.25) if self.tool == "zoom" else None)
        self.canvas.bind("<MouseWheel>", self.on_canvas_wheel)
        self.canvas.bind("<Control-MouseWheel>", self.on_touchpad_zoom)
        self.canvas.bind("<Button-4>", lambda e: self.set_zoom(self.zoom * 1.15))
        self.canvas.bind("<Button-5>", lambda e: self.set_zoom(self.zoom / 1.15))
        self.canvas.bind("<ButtonPress-2>", self.on_pan_start)
        self.canvas.bind("<B2-Motion>", self.on_pan_move)
        self.canvas.bind("<Configure>", self.on_canvas_configure)

    def on_size_change(self, v):
        self.brush_size = int(v)

    def on_opacity_change(self, v):
        self.opacity = float(v)

    def toggle_drawer(self):
        if self.drawer_visible:
            self.right_drawer.pack_forget()
            self.drawer_visible = False
            self.btn_collab.set_selected(False)
        else:
            self.right_drawer.pack(side="right", fill="y")
            self.drawer_visible = True
            self.btn_collab.set_selected(True)

    # ----------------------------------------------------------------
    # Right Drawer: Modern Tabs (Participants / Chat) & Interactive Panel
    # ----------------------------------------------------------------
    def build_drawer_content(self):
        for w in self.right_drawer.winfo_children():
            w.destroy()

        # 1. Top Tab Bar
        tab_bar = tk.Frame(self.right_drawer, bg="#ffffff", height=44)
        tab_bar.pack(side="top", fill="x")
        tab_bar.pack_propagate(False)

        tabs_box = tk.Frame(tab_bar, bg="#ffffff")
        tabs_box.pack(side="left", padx=(12, 0), fill="y")

        self.tab_lbl_people = tk.Label(tabs_box, text=f"👥  Participants ({len(self.users)})",
                                       font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#64748b",
                                       cursor="hand2", padx=6)
        self.tab_lbl_people.pack(side="left", fill="y", pady=(6, 0))
        self.tab_lbl_people.bind("<Button-1>", lambda e: self.switch_drawer_tab("people"))

        self.tab_lbl_chat = tk.Label(tabs_box, text="💬  Chat",
                                     font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#0284c7",
                                     cursor="hand2", padx=8)
        self.tab_lbl_chat.pack(side="left", fill="y", pady=(6, 0), padx=(4, 0))
        self.tab_lbl_chat.bind("<Button-1>", lambda e: self.switch_drawer_tab("chat"))

        # Right-side menu button ⋮
        menu_box = tk.Frame(tab_bar, bg="#ffffff")
        menu_box.pack(side="right", padx=(0, 12), fill="y")
        btn_menu = tk.Label(menu_box, text="⋮", font=("Segoe UI", 12, "bold"), bg="#ffffff",
                            fg="#64748b", cursor="hand2", padx=4)
        btn_menu.pack(side="right", pady=(4, 0))
        btn_menu.bind("<Button-1>", lambda e: self.show_drawer_menu(e))

        # Bottom border with active blue indicator line
        self.tab_indicator = tk.Canvas(self.right_drawer, height=3, bg="#e5e7eb", highlightthickness=0)
        self.tab_indicator.pack(side="top", fill="x")

        # 2. Main content frames
        self.tab_chat = tk.Frame(self.right_drawer, bg="#ffffff")
        self.tab_people = tk.Frame(self.right_drawer, bg="#ffffff")

        # --- BUILD CHAT VIEW ---
        # Bottom modern input capsule
        input_container = tk.Frame(self.tab_chat, bg="#ffffff", padx=10, pady=8)
        input_container.pack(side="bottom", fill="x")

        capsule = tk.Frame(input_container, bg="#ffffff", highlightthickness=1,
                           highlightbackground="#cbd5e1", padx=6, pady=3)
        capsule.pack(fill="x")

        # Emoji button
        btn_emoji = tk.Label(capsule, text="😊", font=("Segoe UI", 11), bg="#ffffff", cursor="hand2")
        btn_emoji.pack(side="left", padx=(2, 4))
        btn_emoji.bind("<Button-1>", lambda e: self.show_emoji_chat_picker(e))
        Tip(btn_emoji, "Insert Emoji")

        # Chat text entry with placeholder
        self.chat_entry = tk.Entry(capsule, font=("Segoe UI", 9), relief="flat", bd=0, bg="#ffffff", fg="#94a3b8")
        self.chat_entry.insert(0, "Type a message...")
        self.chat_entry.pack(side="left", fill="x", expand=True, padx=4)

        def on_cf_in(_e):
            if self.chat_entry.get() == "Type a message...":
                self.chat_entry.delete(0, "end")
                self.chat_entry.config(fg="#0f172a")

        def on_cf_out(_e):
            if not self.chat_entry.get().strip():
                self.chat_entry.delete(0, "end")
                self.chat_entry.insert(0, "Type a message...")
                self.chat_entry.config(fg="#94a3b8")

        self.chat_entry.bind("<FocusIn>", on_cf_in)
        self.chat_entry.bind("<FocusOut>", on_cf_out)
        self.chat_entry.bind("<Return>", lambda e: self.send_chat())

        # Attachment paperclip button
        btn_attach = tk.Label(capsule, text="📎", font=("Segoe UI", 11), bg="#ffffff", fg="#64748b", cursor="hand2")
        btn_attach.pack(side="left", padx=4)
        btn_attach.bind("<Button-1>", lambda e: self.insert_image())
        Tip(btn_attach, "Attach Image")

        # Blue Send button with white airplane icon
        self.btn_send_cv = tk.Canvas(capsule, width=28, height=28, bg="#ffffff", highlightthickness=0, cursor="hand2")
        self.btn_send_cv.pack(side="right", padx=(2, 0))
        self.draw_send_button("#0284c7")
        self.btn_send_cv.bind("<Enter>", lambda e: self.draw_send_button("#0369a1"))
        self.btn_send_cv.bind("<Leave>", lambda e: self.draw_send_button("#0284c7"))
        self.btn_send_cv.bind("<Button-1>", lambda e: self.send_chat())
        Tip(self.btn_send_cv, "Send Message (Enter)")

        # Scrollable Cards Canvas in Chat View
        chat_list_box = tk.Frame(self.tab_chat, bg="#ffffff")
        chat_list_box.pack(side="top", fill="both", expand=True)

        self.chat_canvas = tk.Canvas(chat_list_box, bg="#ffffff", highlightthickness=0)
        self.chat_scroll = ttk.Scrollbar(chat_list_box, orient="vertical", command=self.chat_canvas.yview)
        self.chat_canvas.config(yscrollcommand=self.chat_scroll.set)

        self.chat_cards_frame = tk.Frame(self.chat_canvas, bg="#ffffff")
        self.chat_cards_frame.bind("<Configure>", lambda e: self.chat_canvas.configure(scrollregion=self.chat_canvas.bbox("all")))
        self.chat_win = self.chat_canvas.create_window((0, 0), window=self.chat_cards_frame, anchor="nw")
        self.chat_canvas.bind("<Configure>", lambda e: self.chat_canvas.itemconfig(self.chat_win, width=e.width))

        self.chat_canvas.pack(side="left", fill="both", expand=True)
        self.chat_scroll.pack(side="right", fill="y")  # Ensure scrollbar is packed

        def _on_chat_mousewheel(event):
            delta = int(-1 * (event.delta / 120)) if event.delta else 0
            if delta != 0:
                self.chat_canvas.yview_scroll(delta, "units")
            return "break"

        self.chat_canvas.bind("<MouseWheel>", _on_chat_mousewheel)
        self.chat_cards_frame.bind("<MouseWheel>", _on_chat_mousewheel)
        self._chat_mousewheel_fn = _on_chat_mousewheel

        # --- BUILD PARTICIPANTS VIEW ---
        p_hdr = tk.Frame(self.tab_people, bg="#ffffff", padx=12, pady=6)
        p_hdr.pack(fill="x")
        self.p_count_lbl = tk.Label(p_hdr, text=f"Participants ({len(self.users)})  ·  all online",
                                    font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#334155")
        self.p_count_lbl.pack(side="left")

        self.btn_add_member = tk.Button(
            p_hdr,
            text="➕ Add Member",
            font=("Segoe UI", 8, "bold"),
            bg="#0284c7",
            fg="#ffffff",
            activebackground="#0369a1",
            activeforeground="#ffffff",
            relief="flat",
            bd=0,
            padx=8,
            pady=2,
            cursor="hand2",
            command=self.open_add_member_dialog
        )
        if self.is_host or self.is_cohost:
            self.btn_add_member.pack(side="right")

        # Scrollable Participants List Frame
        p_container = tk.Frame(self.tab_people, bg="#ffffff")
        p_container.pack(fill="x", padx=6, pady=2)

        self.p_scroll = ttk.Scrollbar(p_container, orient="vertical")
        self.p_list_canvas = tk.Canvas(p_container, bg="#ffffff", highlightthickness=0, height=200,
                                       yscrollcommand=self.p_scroll.set)
        self.p_scroll.config(command=self.p_list_canvas.yview)

        self.p_frame = tk.Frame(self.p_list_canvas, bg="#ffffff")
        self.p_frame.bind("<Configure>", lambda e: self.p_list_canvas.configure(scrollregion=self.p_list_canvas.bbox("all")))
        self.p_list_canvas.create_window((0, 0), window=self.p_frame, anchor="nw")

        self.p_scroll.pack(side="right", fill="y")
        self.p_list_canvas.pack(side="left", fill="both", expand=True)

        # Host quick room-wide toggles (visible if host)
        self.host_ctrl_container = tk.Frame(self.tab_people, bg="#ffffff")
        self.host_ctrl_container.pack(fill="x", padx=6, pady=4)

        self.host_ctrl_frame = tk.Frame(self.host_ctrl_container, bg="#f0f9ff", padx=8, pady=6, highlightthickness=1)
        self.host_ctrl_frame.config(highlightbackground="#bae6fd")

        tk.Label(self.host_ctrl_frame, text="Host Management & Permissions", font=("Segoe UI", 8, "bold"),
                 bg="#f0f9ff", fg="#0369a1").pack(anchor="w", pady=(0, 2))

        # Row 1: Master All-Users permission controls
        row_all = tk.Frame(self.host_ctrl_frame, bg="#f0f9ff")
        row_all.pack(fill="x", pady=2)
        btn_add_mem = tk.Button(row_all, text="➕ Add Member", font=("Segoe UI", 7, "bold"),
                                bg="#e0f2fe", fg="#0369a1", activebackground="#bae6fd", relief="solid", bd=1,
                                cursor="hand2", padx=5, pady=2, command=self.open_add_member_dialog)
        btn_add_mem.pack(side="left", padx=2)
        btn_block_all = tk.Button(row_all, text="🚫 Block All Users", font=("Segoe UI", 7, "bold"),
                                  bg="#fee2e2", fg="#dc2626", activebackground="#fca5a5", relief="solid", bd=1,
                                  cursor="hand2", padx=4, pady=2, command=self.block_all_users)
        btn_block_all.pack(side="left", padx=2)
        btn_allow_all = tk.Button(row_all, text="✅ Allow All Users", font=("Segoe UI", 7, "bold"),
                                  bg="#dcfce7", fg="#16a34a", activebackground="#86efac", relief="solid", bd=1,
                                  cursor="hand2", padx=4, pady=2, command=self.allow_all_users)
        btn_allow_all.pack(side="left", padx=2)

        # Row 2: Selected Users controls
        row_sel = tk.Frame(self.host_ctrl_frame, bg="#f0f9ff")
        row_sel.pack(fill="x", pady=2)
        btn_block_sel = tk.Button(row_sel, text="🚫 Block Selected", font=("Segoe UI", 7),
                                  bg="#ffffff", fg="#b91c1c", relief="solid", bd=1,
                                  cursor="hand2", padx=4, pady=1, command=lambda: self.set_selected_permissions(False))
        btn_block_sel.pack(side="left", padx=2)
        btn_allow_sel = tk.Button(row_sel, text="✅ Allow Selected", font=("Segoe UI", 7),
                                  bg="#ffffff", fg="#15803d", relief="solid", bd=1,
                                  cursor="hand2", padx=4, pady=1, command=lambda: self.set_selected_permissions(True))
        btn_allow_sel.pack(side="left", padx=2)

        # Row 3: Room Lock and Presentation Mode
        h_btn_row = tk.Frame(self.host_ctrl_frame, bg="#f0f9ff")
        h_btn_row.pack(fill="x", pady=(3, 1))

        self.btn_lock_room = tk.Button(h_btn_row, text="Lock Room", font=("Segoe UI", 7, "bold"), bg="#ffffff",
                                       fg="#0284c7", relief="solid", bd=1, cursor="hand2", command=self.toggle_room_lock)
        self.btn_lock_room.pack(side="left", padx=2)

        self.btn_pres_mode = tk.Button(h_btn_row, text="Presentation Mode", font=("Segoe UI", 7, "bold"), bg="#ffffff",
                                       fg="#0284c7", relief="solid", bd=1, cursor="hand2", command=self.toggle_presentation_mode)
        self.btn_pres_mode.pack(side="left", padx=2)

        # Show Chat by default as in the figure
        self.switch_drawer_tab(getattr(self, "drawer_tab", "chat"))
        self.render_chat_cards()
        self.update_participants_list()

    def _bind_mousewheel_recursive(self, widget):
        if hasattr(self, "_chat_mousewheel_fn"):
            widget.bind("<MouseWheel>", self._chat_mousewheel_fn, add="+")
        for child in widget.winfo_children():
            self._bind_mousewheel_recursive(child)

    def draw_send_button(self, col):
        self.btn_send_cv.delete("all")
        self.btn_send_cv.create_oval(1, 1, 27, 27, fill=col, outline="")
        self.btn_send_cv.create_polygon(8, 8, 22, 14, 8, 20, 11, 14, fill="#ffffff", outline="")

    def switch_drawer_tab(self, tab):
        self.drawer_tab = tab
        if tab == "chat":
            self.tab_people.pack_forget()
            self.tab_chat.pack(fill="both", expand=True)
        else:
            self.tab_chat.pack_forget()
            self.tab_people.pack(fill="both", expand=True)
            self.update_participants_list()
        self.update_tab_indicator()

    def update_tab_indicator(self):
        self.tab_indicator.delete("all")
        w = self.right_drawer.winfo_width() or 330
        self.tab_indicator.create_line(0, 2, w, 2, fill="#e5e7eb", width=1)
        if self.drawer_tab == "chat":
            self.tab_lbl_chat.config(fg="#0284c7")
            self.tab_lbl_people.config(fg="#64748b")
            self.tab_indicator.create_line(152, 1, 218, 1, fill="#0284c7", width=3, capstyle="round")
        else:
            self.tab_lbl_people.config(fg="#0284c7")
            self.tab_lbl_chat.config(fg="#64748b")
            self.tab_indicator.create_line(14, 1, 138, 1, fill="#0284c7", width=3, capstyle="round")

    def scroll_chat_to_bottom(self):
        self.chat_canvas.update_idletasks()
        bbox = self.chat_canvas.bbox("all")
        if not bbox:
            return
        content_h = bbox[3] - bbox[1]
        visible_h = self.chat_canvas.winfo_height()
        if content_h > visible_h and content_h > 0:
            frac = max(0.0, min(1.0, (content_h - visible_h) / float(content_h)))
            self.chat_canvas.yview_moveto(frac)
        else:
            self.chat_canvas.yview_moveto(0.0)

    def render_chat_cards(self):
        for w in self.chat_cards_frame.winfo_children():
            w.destroy()

        # Chat Room Header
        room_name = self.board_title or "Whiteboard"
        hdr_frame = tk.Frame(self.chat_cards_frame, bg="#f0f9ff", padx=10, pady=8,
                             highlightthickness=1, highlightbackground="#bae6fd")
        hdr_frame.pack(fill="x", padx=6, pady=(6, 8))

        r_top = tk.Frame(hdr_frame, bg="#f0f9ff")
        r_top.pack(fill="x")
        tk.Label(r_top, text=f"💬 {room_name} Chat", font=("Segoe UI", 10, "bold"),
                 bg="#f0f9ff", fg="#0369a1").pack(side="left")
        msg_count = len([m for m in self.chat_messages if not m.get("is_system")])
        tk.Label(r_top, text=f"{msg_count} message{'s' if msg_count != 1 else ''}", font=("Segoe UI", 8),
                 bg="#f0f9ff", fg="#64748b").pack(side="right")

        tk.Label(hdr_frame, text="Live team conversation on LAN", font=("Segoe UI", 7),
                 bg="#f0f9ff", fg="#64748b").pack(anchor="w")

        # If no messages yet, show clean placeholder
        if not self.chat_messages:
            empty_box = tk.Frame(self.chat_cards_frame, bg="#ffffff", padx=16, pady=28)
            empty_box.pack(fill="x")
            tk.Label(empty_box, text="💬", font=("Segoe UI", 26), bg="#ffffff").pack()
            tk.Label(empty_box, text="No messages yet", font=("Segoe UI", 10, "bold"),
                     bg="#ffffff", fg="#334155").pack(pady=(4, 2))
            tk.Label(empty_box, text="Type a message below to start chatting with room participants!",
                     font=("Segoe UI", 8), bg="#ffffff", fg="#94a3b8", wraplength=240, justify="center").pack()
        else:
            for msg in self.chat_messages:
                is_sys = bool(msg.get("is_system", False))

                if is_sys:
                    # System event pill
                    pill = tk.Frame(self.chat_cards_frame, bg="#f1f5f9", padx=8, pady=3,
                                    highlightthickness=1, highlightbackground="#e2e8f0")
                    pill.pack(pady=4, padx=12)
                    sys_txt = msg.get("text") or msg.get("message", "")
                    tk.Label(pill, text=f"ℹ️ {sys_txt}", font=("Segoe UI", 7, "italic"),
                             bg="#f1f5f9", fg="#475569").pack()
                    continue

                is_me = (msg.get("sender_name") == self.user or msg.get("user") == self.user)
                bg_item = "#eff6ff" if is_me else "#f8fafc"
                border_col = "#bfdbfe" if is_me else "#e2e8f0"

                card_m = tk.Frame(self.chat_cards_frame, bg=bg_item, padx=8, pady=6,
                                  highlightthickness=1, highlightbackground=border_col)
                card_m.pack(fill="x", padx=6, pady=3)

                cv_m = tk.Canvas(card_m, width=32, height=32, bg=bg_item, highlightthickness=0)
                cv_m.pack(side="left", padx=(0, 8), anchor="n")

                av_col = msg.get("avatar_color") or self.users.get(msg.get("sender_name", msg.get("user", "")), {}).get("avatar_color", "#0284c7")
                cv_m.create_oval(1, 1, 31, 31, fill=av_col, outline="")
                cv_m.create_oval(21, 21, 29, 29, fill="#22c55e", outline="#ffffff", width=1.5)
                inits = msg.get("initials") or (msg.get("display_name", "US")[:2]).upper()
                cv_m.create_text(16, 16, text=inits, fill="#ffffff", font=("Segoe UI", 8, "bold"))

                tb_m = tk.Frame(card_m, bg=bg_item)
                tb_m.pack(side="left", fill="x", expand=True)

                r1_m = tk.Frame(tb_m, bg=bg_item)
                r1_m.pack(fill="x")
                d_name = msg.get("display_name") or msg.get("sender_name") or msg.get("user") or "User"
                name_fg = "#0284c7" if is_me else "#0f172a"
                lbl_nm = tk.Label(r1_m, text=d_name, font=("Segoe UI", 9, "bold"),
                                  bg=bg_item, fg=name_fg, anchor="w")
                lbl_nm.pack(side="left")

                ts_text = msg.get("time") or msg.get("timestamp") or ""
                lbl_t = tk.Label(r1_m, text=ts_text, font=("Segoe UI", 7), bg=bg_item, fg="#64748b")
                lbl_t.pack(side="right")

                r2_m = tk.Frame(tb_m, bg=bg_item)
                r2_m.pack(fill="x", pady=(2, 0))
                msg_txt = msg.get("text", msg.get("message", ""))
                lbl_txt = tk.Label(r2_m, text=msg_txt, font=("Segoe UI", 9),
                                   bg=bg_item, fg="#1e293b",
                                   anchor="w", justify="left", wraplength=220)
                lbl_txt.pack(side="left", fill="x")

        self._bind_mousewheel_recursive(self.chat_cards_frame)
        self.scroll_chat_to_bottom()

    def send_chat(self, _event=None):
        txt = self.chat_entry.get().strip()
        if not txt or txt == "Type a message...":
            return "break"

        if self.is_offline or not self.net:
            self.chat_entry.delete(0, "end")
            self.chat_entry.insert(0, "Type a message...")
            self.chat_entry.config(fg="#94a3b8")
            self.root.focus_set()
            self.handle_chat_message({
                "message_id": msg_id,
                "sender_name": self.user,
                "text": txt,
                "timestamp": time.strftime("%I:%M %p").lstrip("0")
            })
            return "break"

        if not self.online:
            self.status.config(text="⚠️ Cannot send chat: Disconnected from server.")
            return "break"

        if len(txt) > 1000:
            messagebox.showwarning("Message Too Long", "Message exceeds 1000 characters limit.")
            return "break"

        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        self.pending_acks.add(msg_id)

        self.chat_entry.delete(0, "end")
        self.chat_entry.insert(0, "Type a message...")
        self.chat_entry.config(fg="#94a3b8")
        self.root.focus_set()

        payload = {
            "type": "chat_send",
            "room_id": self.session_code,
            "sender_id": self.token or self.user,
            "sender_name": self.user,
            "message_id": msg_id,
            "message": txt,
            "text": txt,
            "timestamp": time.strftime("%I:%M %p").lstrip("0")
        }
        self.net.send(payload)
        return "break"

    def handle_chat_message(self, m, from_history=False):
        msg_id = m.get("message_id")
        if msg_id and msg_id in self.seen_message_ids:
            return

        if msg_id:
            self.seen_message_ids.add(msg_id)
            self.pending_acks.discard(msg_id)

        sender = m.get("sender_name") or m.get("user") or "User"
        txt = m.get("message") if "message" in m else m.get("text", "")
        ts = m.get("timestamp") or m.get("time") or time.strftime("%I:%M %p").lstrip("0")
        av_col = m.get("sender_avatar_color") or self.users.get(sender, {}).get("avatar_color", "#0284c7")
        inits = (sender[:2] if len(sender) >= 2 else sender[:1]).upper()

        entry = {
            "message_id": msg_id,
            "user": sender,
            "sender_name": sender,
            "display_name": f"{sender} (You)" if sender == self.user else sender,
            "text": txt,
            "message": txt,
            "time": ts,
            "timestamp": ts,
            "avatar_color": av_col,
            "avatar_type": "user",
            "initials": inits,
            "is_system": bool(m.get("is_system", False)),
        }
        self.chat_messages.append(entry)

        if not from_history:
            self.render_chat_cards()

    def handle_chat_ack(self, m):
        msg_id = m.get("message_id")
        if msg_id:
            self.pending_acks.discard(msg_id)

    def handle_chat_history(self, m):
        for msg in m.get("messages", []):
            self.handle_chat_message(msg, from_history=True)
        self.render_chat_cards()

    def handle_chat_error(self, m):
        err = m.get("error", "Unknown chat error")
        self.status.config(text=f"⚠️ Chat Error: {err}")

    def add_system_chat(self, text):
        now_str = time.strftime("%I:%M %p").lstrip("0")
        entry = {
            "message_id": f"sys_{uuid.uuid4().hex[:8]}",
            "user": "System",
            "sender_name": "System",
            "display_name": "System",
            "text": text,
            "message": text,
            "time": now_str,
            "timestamp": now_str,
            "avatar_color": "#f1f5f9",
            "avatar_type": "system",
            "is_system": True,
        }
        self.chat_messages.append(entry)
        self.render_chat_cards()

    def show_emoji_chat_picker(self, event):
        emojis = ["😀", "😂", "😍", "👍", "👏", "🎉", "🔥", "🚀", "💡", "❤️"]
        menu = tk.Menu(self.root, tearoff=0, bg="#ffffff", fg="#0f172a", font=("Segoe UI", 11))
        for em in emojis:
            menu.add_command(label=em, command=lambda e=em: self.insert_chat_emoji(e))
        menu.tk_popup(event.x_root, event.y_root - 100)

    def insert_chat_emoji(self, em):
        cur = self.chat_entry.get()
        if cur == "Type a message...":
            self.chat_entry.delete(0, "end")
            self.chat_entry.config(fg="#0f172a")
            self.chat_entry.insert(0, em)
        else:
            self.chat_entry.insert("insert", em)
        self.chat_entry.focus_set()

    def show_drawer_menu(self, event):
        menu = tk.Menu(self.root, tearoff=0, bg="#ffffff", fg="#0f172a")
        menu.add_command(label="Clear Chat History", command=self.clear_chat_history)
        menu.add_command(label="Export Chat to File...", command=self.export_chat_history)
        menu.add_separator()
        menu.add_command(label="Mute Notifications", command=lambda: messagebox.showinfo("Mute", "Chat notifications muted."))
        menu.tk_popup(event.x_root - 120, event.y_root + 15)

    def clear_chat_history(self):
        if self.is_offline or not self.net:
            self.chat_messages.clear()
            self.seen_message_ids.clear()
            self.render_chat_cards()
            return
        if self.is_host:
            self.net.send({"type": "chat_clear"})
        else:
            self.chat_messages.clear()
            self.seen_message_ids.clear()
            self.render_chat_cards()

    def export_chat_history(self):
        fn = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")],
                                          initialfile=f"chat_room_{self.session_code}.txt")
        if fn:
            with open(fn, "w", encoding="utf-8") as f:
                for m in self.chat_messages:
                    f.write(f"[{m.get('time', '')}] {m.get('display_name', '')}: {m.get('text', '')}\n")
            messagebox.showinfo("Exported", f"Chat history saved to {fn}")

    def update_participants_list(self):
        online_count = sum(1 for u in self.users.values() if u.get("online", True))
        if hasattr(self, "tab_lbl_people"):
            self.tab_lbl_people.config(text=f"👥  Participants ({len(self.users)})")
        if hasattr(self, "p_count_lbl"):
            self.p_count_lbl.config(text=f"Members ({len(self.users)})  ·  {online_count} online")
        if hasattr(self, "tab_indicator"):
            self.update_tab_indicator()
        if not hasattr(self, "p_frame"):
            return
        for w in self.p_frame.winfo_children():
            w.destroy()

        for u in self.users.values():
            row = tk.Frame(self.p_frame, bg="#ffffff", pady=3)
            row.pack(fill="x", expand=True)

            is_me = u["name"] == self.user
            can_draw = u.get("can_draw", True)
            is_online = u.get("online", True)

            # Checkbox for multi-selection (visible to host/co-host for other users)
            if (self.is_host or self.is_cohost) and not u.get("is_host"):
                if u["name"] not in self.selected_users:
                    self.selected_users[u["name"]] = tk.BooleanVar(value=False)
                cb = tk.Checkbutton(row, variable=self.selected_users[u["name"]], bg="#ffffff",
                                    activebackground="#ffffff", highlightthickness=0)
                cb.pack(side="left", padx=(0, 2))

            # Circular avatar
            cv = tk.Canvas(row, width=26, height=26, bg="#ffffff", highlightthickness=0)
            cv.pack(side="left", padx=(2, 4))
            av_col = u.get("avatar_color", u.get("color", "#0284c7"))
            cv.create_oval(1, 1, 25, 25, fill=av_col, outline="")
            dot_color = "#22c55e" if is_online else "#94a3b8"
            cv.create_oval(18, 18, 25, 25, fill=dot_color, outline="#ffffff", width=2)
            initials = (u["name"][:2] if len(u["name"]) >= 2 else u["name"][:1]).upper()
            cv.create_text(12, 12, text=initials, fill="#ffffff", font=("Segoe UI", 7, "bold"))

            # Name label
            role_tag = " (Host)" if u.get("is_host") else (" (Co-host)" if u.get("is_cohost") else "")
            off_tag = "" if is_online else " (offline)"
            ip_tag = f" [{u['ip']}]" if u.get("ip") and (self.is_host or self.is_cohost) else ""
            name_lbl = tk.Label(row, text=u["name"] + role_tag + ip_tag + off_tag, font=("Segoe UI", 9, "bold" if is_me else "normal"),
                                bg="#ffffff", fg="#0f172a" if is_me else ("#334155" if is_online else "#94a3b8"))
            name_lbl.pack(side="left")

            # Hand raised indicator
            if u.get("hand_raised"):
                tk.Label(row, text="✋", font=("Segoe UI", 9), bg="#ffffff").pack(side="left", padx=2)

            # Permission Status Badge
            if can_draw:
                badge = tk.Label(row, text="● Drawing Allowed", font=("Segoe UI", 7, "bold"),
                                 bg="#dcfce7", fg="#16a34a", padx=6, pady=1, relief="flat", bd=0)
            else:
                badge = tk.Label(row, text="● Blocked", font=("Segoe UI", 7, "bold"),
                                 bg="#fee2e2", fg="#dc2626", padx=6, pady=1, relief="flat", bd=0)
            badge.pack(side="left", padx=4)

            # Controls for Host (and Co-host)
            if (self.is_host or self.is_cohost) and not u.get("is_host"):
                btn_box = tk.Frame(row, bg="#ffffff")
                btn_box.pack(side="right", padx=2)

                if can_draw:
                    b_draw = tk.Button(btn_box, text="🚫 Block Draw", font=("Segoe UI", 7),
                                       bg="#fef2f2", fg="#dc2626", relief="solid", bd=1, cursor="hand2",
                                       padx=3, pady=0, command=lambda nm=u["name"]: self.toggle_single_user_draw(nm, False))
                else:
                    b_draw = tk.Button(btn_box, text="✏️ Allow", font=("Segoe UI", 7),
                                       bg="#f0fdf4", fg="#16a34a", relief="solid", bd=1, cursor="hand2",
                                       padx=3, pady=0, command=lambda nm=u["name"]: self.toggle_single_user_draw(nm, True))
                b_draw.pack(side="left", padx=2)

                # Star Co-host button
                b_star = tk.Label(btn_box, text="⭐", font=("Segoe UI", 8), bg="#ffffff", cursor="hand2")
                b_star.pack(side="left", padx=2)
                b_star.bind("<Button-1>", lambda e, nm=u["name"]: self.send_host_control("promote_cohost", nm))
                Tip(b_star, "Promote / Demote Co-host")

                # Kick button
                b_kick = tk.Label(btn_box, text="✕", font=("Segoe UI", 8, "bold"), fg="#ef4444", bg="#ffffff", cursor="hand2")
                b_kick.pack(side="left", padx=2)
                b_kick.bind("<Button-1>", lambda e, nm=u["name"]: self.send_host_control("kick", nm))
                Tip(b_kick, "Kick User")
                style_buttons(btn_box)

    def toggle_single_user_draw(self, username, allow):
        self.net.send({
            "type": "set_permission",
            "targets": [username],
            "can_draw": allow
        })

    def set_selected_permissions(self, allow):
        targets = [u for u, var in self.selected_users.items() if var.get()]
        if not targets:
            messagebox.showinfo("Select Users", "Please check at least one participant using the checkboxes.")
            return
        self.net.send({
            "type": "set_permission",
            "targets": targets,
            "can_draw": allow
        })

    def block_all_users(self):
        targets = [u["name"] for u in self.users.values() if not u.get("is_host")]
        self.net.send({
            "type": "set_permission",
            "targets": targets,
            "can_draw": False
        })
        self.net.send({
            "type": "host_control",
            "action": "all_can_draw",
            "value": False
        })

    def allow_all_users(self):
        targets = [u["name"] for u in self.users.values() if not u.get("is_host")]
        self.net.send({
            "type": "set_permission",
            "targets": targets,
            "can_draw": True
        })
        self.net.send({
            "type": "host_control",
            "action": "all_can_draw",
            "value": True
        })

    def open_add_member_dialog(self):
        if self.is_offline or not self.net:
            messagebox.showinfo("Offline Mode", "Adding members is only available in live collaborative sessions.", parent=self.root)
            return

        dlg = tk.Toplevel(self.root)
        dlg.title("Add Member to Session")
        dlg.geometry("440x360")
        dlg.configure(bg="#ffffff")
        dlg.transient(self.root)
        dlg.grab_set()
        dlg.resizable(False, False)

        card = tk.Frame(dlg, bg="#ffffff", padx=20, pady=16)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="➕ Add Member to Whiteboard Session", font=("Segoe UI", 11, "bold"),
                 bg="#ffffff", fg="#0f172a").pack(anchor="w", pady=(0, 2))
        tk.Label(card, text="Type the user's name or IP address to add them directly to this whiteboard session:",
                 font=("Segoe UI", 8), bg="#ffffff", fg="#64748b", wraplength=400, justify="left").pack(anchor="w", pady=(0, 10))

        tk.Label(card, text="Username or IP Address:", font=("Segoe UI", 9, "bold"),
                 bg="#ffffff", fg="#334155").pack(anchor="w", pady=(0, 4))

        target_var = tk.StringVar()
        entry = tk.Entry(card, textvariable=target_var, font=("Segoe UI", 10), bg="#f8fafc", fg="#0f172a",
                         relief="solid", bd=1, highlightthickness=0)
        entry.pack(fill="x", ipady=4, pady=(0, 8))
        entry.focus_set()

        # Quick-pick list of clients connected to the server
        tk.Label(card, text="Clients Connected to Server (click to select):",
                 font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#64748b").pack(anchor="w", pady=(4, 2))

        lb_frame = tk.Frame(card, bg="#ffffff", highlightthickness=1, highlightbackground="#cbd5e1")
        lb_frame.pack(fill="both", expand=True, pady=(0, 12))

        lb = tk.Listbox(lb_frame, font=("Segoe UI", 8), bg="#f8fafc", selectbackground="#bae6fd",
                        selectforeground="#0f172a", relief="flat", bd=0, height=4)
        lb.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(lb_frame, orient="vertical", command=lb.yview)
        sb.pack(side="right", fill="y")
        lb.config(yscrollcommand=sb.set)

        def on_select(_e):
            sel = lb.curselection()
            if sel:
                item_text = lb.get(sel[0])
                if "(" in item_text and ")" in item_text:
                    parts = item_text.split("(", 1)
                    u_name = parts[0].strip()
                    target_var.set(u_name)
                else:
                    target_var.set(item_text.strip())

        lb.bind("<<ListboxSelect>>", on_select)
        lb.bind("<Double-Button-1>", lambda e: do_add())

        def populate_clients(clients):
            lb.delete(0, "end")
            count = 0
            for c in clients:
                nm = c.get("name") or "User"
                ip = c.get("ip") or ""
                in_r = c.get("in_room")
                stat = f" [In Room {in_r}]" if in_r else " [In Hub]"
                lb.insert("end", f"{nm}  ({ip}){stat}")
                count += 1
            if count == 0:
                lb.insert("end", "No other clients currently idle on server (you can type any IP or name)")

        self._on_clients_list_cb = populate_clients
        self.net.send({"type": "list_connected_clients"})

        btn_row = tk.Frame(card, bg="#ffffff")
        btn_row.pack(fill="x")

        def do_add():
            val = target_var.get().strip()
            if not val:
                messagebox.showwarning("Input Required", "Please enter a username or IP address to add.", parent=dlg)
                return
            self.net.send({"type": "add_member", "target": val})
            self.status.config(text=f"Adding '{val}' to session...")
            dlg.destroy()

        btn_cancel = tk.Button(btn_row, text="Cancel", font=("Segoe UI", 9), bg="#f1f5f9", fg="#475569",
                               relief="flat", bd=0, padx=14, pady=5, cursor="hand2", command=dlg.destroy)
        btn_cancel.pack(side="right", padx=(6, 0))

        btn_submit = tk.Button(btn_row, text="Add to Session", font=("Segoe UI", 9, "bold"), bg="#0284c7", fg="#ffffff",
                               relief="flat", bd=0, padx=16, pady=5, cursor="hand2", command=do_add)
        btn_submit.pack(side="right")

        entry.bind("<Return>", lambda e: do_add())

    # ----------------------------------------------------------------
    # Google Meet-Style Floating Bottom Control Bar
    # ----------------------------------------------------------------
    def build_floating_meet_bar(self):
        self.meet_bar = tk.Frame(self.canvas_container, bg="#eef6ff", highlightthickness=1)
        self.meet_bar.config(highlightbackground="#bcd7f3")
        self.meet_bar.place(relx=0.5, rely=0.92, anchor="center")

        btn_specs = [
            ("undo", self.undo, "Undo"),
            ("redo", self.redo, "Redo"),
            ("hand", self.toggle_raise_hand, "Raise Hand"),
            ("reaction", self.show_reaction_picker, "Send Emoji Reaction"),
            ("grid", self.cycle_grid, "Toggle Grid Mode"),
            ("lock", self.toggle_room_lock, "Lock / Unlock Room (Host)"),
            ("share", self.copy_invite, "Share Room Code"),
        ]

        self.meet_buttons = {}
        for icon_name, cmd, tip in btn_specs:
            b = PaintIconButton(self.meet_bar, icon_name, cmd, tip=tip, size=34)
            b.pack(side="left", padx=4, pady=4)
            self.meet_buttons[icon_name] = b

        # Google Meet-style Red Pill Leave button
        self.btn_leave = MeetLeaveButton(self.meet_bar, self.leave_session)
        self.btn_leave.pack(side="left", padx=(6, 4), pady=4)

    def toggle_raise_hand(self):
        if self.is_offline or not self.net:
            return
        self.hand_raised = not self.hand_raised
        self.net.send({"type": "raise_hand"})
        if "hand" in self.meet_buttons:
            self.meet_buttons["hand"].set_selected(self.hand_raised)
        if self.hand_raised:
            self.status.config(text="You raised your hand ✋")
        else:
            self.status.config(text="Lowered hand")

    def show_reaction_picker(self):
        pop = tk.Toplevel(self.root)
        pop.wm_overrideredirect(True)
        x = self.root.winfo_pointerx() - 100
        y = self.root.winfo_pointery() - 56
        pop.wm_geometry(f"+{x}+{y}")
        pop.configure(bg="#ffffff")

        frame = tk.Frame(pop, bg="#ffffff", highlightthickness=1, highlightbackground="#cbd5e1", padx=8, pady=4)
        frame.pack()

        emojis = ["👍", "👏", "🎉", "❤️", "🔥", "💡"]
        for em in emojis:
            b = tk.Label(frame, text=em, font=("Segoe UI", 16), bg="#ffffff", cursor="hand2", padx=6, pady=2)
            b.pack(side="left")
            b.bind("<Enter>", lambda e, w=b: w.config(bg="#f1f5f9"))
            b.bind("<Leave>", lambda e, w=b: w.config(bg="#ffffff"))
            b.bind("<Button-1>", lambda e, emoji=em: self.send_reaction(emoji, pop))

        pop.bind("<FocusOut>", lambda e: pop.destroy())
        pop.focus_set()

    def send_reaction(self, emoji, pop=None):
        if pop:
            pop.destroy()
        if not self.is_offline and self.net:
            self.net.send({"type": "reaction", "emoji": emoji})
        self.display_floating_reaction(self.user, emoji)

    def display_floating_reaction(self, user, emoji):
        pt = self.cursors.get(user, (DEFAULT_W / 2, DEFAULT_H / 2))
        x, y = pt[0] * self.zoom, pt[1] * self.zoom
        tag = f"rx_{time.time()}_{random.randint(0,999)}"
        self.canvas.create_text(x, y - 20, text=f"{emoji} {user}", font=("Segoe UI", 14, "bold"),
                                fill="#0284c7", tags=tag)

        def float_up(steps=12):
            if steps > 0:
                self.canvas.move(tag, 0, -3)
                self.root.after(40, lambda: float_up(steps - 1))
            else:
                self.canvas.delete(tag)

        float_up()

    def copy_invite(self):
        h = self.config.get('host', '127.0.0.1')
        if not self.config.get("is_localhost", False) and h in ("127.0.0.1", "localhost"):
            h = get_local_ip()
        ip, iface = get_local_ip_info()
        text = f"Join my LAN Whiteboard!\nRoom Code: {self.session_code}\nServer IP: {h}:{PORT}"
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        messagebox.showinfo("Invite Copied", f"Copied invite details to clipboard:\n\nRoom Code: {self.session_code}\nServer IP: {h}:{PORT} ({iface})\n\nShare this IP and code with your partner.")

    def leave_session(self):
        if messagebox.askyesno("Leave Session", "Are you sure you want to leave this whiteboard room?"):
            self.quit()

    # ----------------------------------------------------------------
    # Bottom Status Bar (White #FFFFFF)
    # ----------------------------------------------------------------
    def build_status_bar(self):
        bar = tk.Frame(self.root, bg="#ffffff", height=24, highlightthickness=1)
        bar.config(highlightbackground="#e5e7eb")
        bar.pack(side="bottom", fill="x")

        # Left: Coordinates & Canvas Size & Sync status
        self.coord_lbl = tk.Label(bar, text="X: 0 px   Y: 0 px", bg="#ffffff", fg="#64748b", font=("Segoe UI", 8), width=20, anchor="w")
        self.coord_lbl.pack(side="left", padx=8)

        self.size_lbl = tk.Label(bar, text=f"{DEFAULT_W} x {DEFAULT_H} px", bg="#ffffff", fg="#64748b", font=("Segoe UI", 8), width=16)
        self.size_lbl.pack(side="left", padx=4)

        self.status = tk.Label(bar, text="Connecting...", bg="#ffffff", fg="#0284c7", font=("Segoe UI", 8, "bold"), anchor="w")
        self.status.pack(side="left", padx=12, fill="x", expand=True)

        # Right: Fit-to-screen & Zoom Controls
        right_box = tk.Frame(bar, bg="#ffffff")
        right_box.pack(side="right", padx=8)

        btn_fit = tk.Label(right_box, text="[Fit]", bg="#ffffff", fg="#0284c7", font=("Segoe UI", 8, "bold"), cursor="hand2")
        btn_fit.pack(side="left", padx=4)
        btn_fit.bind("<Button-1>", lambda e: self.set_zoom(1.0))

        btn_zoom_out = tk.Label(right_box, text="−", bg="#ffffff", fg="#334155", font=("Segoe UI", 11, "bold"), cursor="hand2")
        btn_zoom_out.pack(side="left", padx=2)
        btn_zoom_out.bind("<Button-1>", lambda e: self.set_zoom(self.zoom / 1.15))

        self.zoom_slider = ttk.Scale(right_box, from_=0.5, to=3.0, value=1.0, orient="horizontal", length=90,
                                     command=lambda v: self.set_zoom(float(v)))
        self.zoom_slider.pack(side="left", padx=2)

        btn_zoom_in = tk.Label(right_box, text="+", bg="#ffffff", fg="#334155", font=("Segoe UI", 11, "bold"), cursor="hand2")
        btn_zoom_in.pack(side="left", padx=2)
        btn_zoom_in.bind("<Button-1>", lambda e: self.set_zoom(self.zoom * 1.15))

        self.zoom_lbl = tk.Label(right_box, text="100%", bg="#ffffff", fg="#64748b", font=("Segoe UI", 8), width=5)
        self.zoom_lbl.pack(side="left", padx=2)

    # ----------------------------------------------------------------
    # Tool Selection & Grid Cycling
    # ----------------------------------------------------------------
    def set_tool(self, t):
        self.tool = t
        for name, b in self.tool_btns.items():
            b.set_selected(name == t)
        for name, b in self.brush_btns.items():
            b.set_selected(t == "pencil" and name == self.brush)
        for name, b in self.shape_btns.items():
            b.set_selected(t == "shape" and name == self.shape)

        cursors = {
            "pencil": "pencil",
            "eraser": "circle",
            "text": "xterm",
            "fill": "spraycan",
            "picker": "crosshair",
            "zoom": "plus",
            "select": "fleur",
            "shape": "crosshair",
        }
        self.canvas.config(cursor=cursors.get(t, "arrow"))
        if t == "text":
            self.status.config(text=f"Tool: Text   Font Size: {self.font_size}pt (Click canvas to insert or edit)")
            try:
                self.cb_font_size.focus_set()
            except Exception:
                pass
        else:
            self.status.config(text=f"Tool: {t.capitalize()}   Zoom: {int(self.zoom * 100)}%")

    def on_font_size_changed(self, _event=None):
        try:
            sz = int(self.font_size_var.get().strip())
            sz = max(6, min(150, sz))
            self.font_size = sz
            self.font_size_var.set(str(sz))
            if self.selected and self.selected in self.objs:
                o = self.objs[self.selected]
                if o.get("kind") == "text" and o.get("size") != sz:
                    self.send_action({"kind": "text_edit", "target": self.selected, "size": sz})
                    self.render()
            self.status.config(text=f"Font Size: {sz}pt (Applies to new text or selected text)")
        except (ValueError, TypeError):
            self.font_size_var.set(str(self.font_size))

    def pick_brush(self, b_name):
        self.brush = b_name
        self.set_tool("pencil")

    def pick_shape(self, s_name):
        self.shape = s_name
        self.set_tool("shape")

    def cycle_grid(self):
        modes = ["none", "square", "dot"]
        idx = (modes.index(self.grid_mode) + 1) % len(modes)
        self.grid_mode = modes[idx]
        self.render()
        self.status.config(text=f"Canvas Grid: {self.grid_mode.capitalize()}")

    def set_zoom(self, z):
        if getattr(self, "_setting_zoom", False):
            return
        self._setting_zoom = True
        try:
            self.zoom = max(0.4, min(3.5, z))
            if hasattr(self, "zoom_slider"):
                self.zoom_slider.set(self.zoom)
            if hasattr(self, "zoom_lbl"):
                self.zoom_lbl.config(text=f"{int(self.zoom * 100)}%")
            self.render()
        finally:
            self._setting_zoom = False

    def on_canvas_wheel(self, e):
        # Shift key -> horizontal scroll
        if e.state & 0x0001:
            self.canvas.xview_scroll(int(-1 * (e.delta / 120)), "units")
            return
        # Mouse Wheel Zoom
        if e.delta > 0:
            self.set_zoom(self.zoom * 1.15)
        elif e.delta < 0:
            self.set_zoom(self.zoom / 1.15)

    def on_touchpad_zoom(self, e):
        # Precision touchpad pinch-to-zoom (Windows sends Ctrl+MouseWheel)
        factor = 1.05 if e.delta > 0 else (1.0 / 1.05)
        self.set_zoom(self.zoom * factor)
        return "break"

    def on_pan_start(self, e):
        self.canvas.scan_mark(e.x, e.y)

    def on_pan_move(self, e):
        self.canvas.scan_dragto(e.x, e.y, gain=1)

    def on_canvas_configure(self, e):
        if getattr(self, "_last_conf_w", None) == e.width and getattr(self, "_last_conf_h", None) == e.height:
            return
        self._last_conf_w = e.width
        self._last_conf_h = e.height
        self.render()

    def new_id(self):
        self.counter += 1
        return f"{self.user}-{int(time.time() * 1000) % 10**8}-{self.counter}"

    # ----------------------------------------------------------------
    # Canvas Rendering & Grid Drawing
    # ----------------------------------------------------------------
    def stroke_style(self, o):
        z, w = self.zoom, o.get("width", 3)
        b = o.get("brush", "pencil")
        if b == "eraser":
            return {"fill": self.bg, "width": max(1, w * 5 * z)}
        if b == "brush":
            return {"fill": o.get("color", "#000000"), "width": max(1, w * 2.5 * z)}
        if b == "marker":
            return {"fill": o.get("color", "#000000"), "width": max(1, w * 3.5 * z), "stipple": "gray50"}
        if b == "highlighter":
            col = o.get("color", "#fff200")
            return {"fill": col, "width": max(2, w * 4.5 * z), "stipple": "gray25"}
        if b == "dashed":
            return {"fill": o.get("color", "#000000"), "width": max(1, w * z), "dash": (6, 4)}
        return {"fill": o.get("color", "#000000"), "width": max(1, w * z)}

    def render_grid(self):
        if self.grid_mode == "none":
            return
        z = self.zoom
        step = max(10, 30 * z)
        canv_w = max(self.canvas.winfo_width(), int(DEFAULT_W * z), 4000)
        canv_h = max(self.canvas.winfo_height(), int(DEFAULT_H * z), 3000)

        if self.grid_mode == "square":
            x = 0
            while x <= canv_w:
                self.canvas.create_line(x, 0, x, canv_h, fill="#e2e8f0", width=1, tags="grid")
                x += step
            y = 0
            while y <= canv_h:
                self.canvas.create_line(0, y, canv_w, y, fill="#e2e8f0", width=1, tags="grid")
                y += step
        elif self.grid_mode == "dot":
            x = step
            while x < canv_w:
                y = step
                while y < canv_h:
                    self.canvas.create_oval(x - 1, y - 1, x + 1, y + 1, fill="#cbd5e1", outline="", tags="grid")
                    y += step
                x += step

    def draw_obj(self, o, tag=None):
        z = self.zoom
        tags = (tag or "obj:" + o["id"],)
        dx, dy = o.get("dx", 0.0), o.get("dy", 0.0)
        c = self.canvas
        k = o.get("kind")

        if k == "stroke":
            flat = []
            for x, y in o.get("points", []):
                flat += [(x + dx) * z, (y + dy) * z]
            if len(flat) == 2:
                flat += flat
            if flat:
                c.create_line(*flat, capstyle="round", joinstyle="round", tags=tags, **self.stroke_style(o))

        elif k == "shape":
            x0 = (o.get("x0", 0) + dx) * z
            y0 = (o.get("y0", 0) + dy) * z
            x1 = (o.get("x1", 0) + dx) * z
            y1 = (o.get("y1", 0) + dy) * z
            col = o.get("color", "#000000")
            w = max(1, o.get("width", 2) * z)
            fill = o.get("fill") or ""
            s = o.get("shape", "rect")

            if s in ("line", "arrow"):
                c.create_line(x0, y0, x1, y1, fill=col, width=w, capstyle="round", tags=tags,
                              arrow="last" if s == "arrow" else None)
            elif s == "rect":
                c.create_rectangle(x0, y0, x1, y1, outline=col, width=w, fill=fill, tags=tags)
            elif s == "rounded_rect":
                xa, xb = sorted((x0, x1))
                ya, yb = sorted((y0, y1))
                rad = min(20 * z, (xb - xa) / 3, (yb - ya) / 3)
                pts = [
                    xa + rad, ya, xb - rad, ya, xb, ya, xb, ya + rad,
                    xb, yb - rad, xb, yb, xb - rad, yb, xa + rad, yb,
                    xa, yb, xa, yb - rad, xa, ya + rad, xa, ya
                ]
                c.create_polygon(pts, outline=col, width=w, fill=fill, smooth=True, tags=tags)
            elif s == "oval":
                c.create_oval(x0, y0, x1, y1, outline=col, width=w, fill=fill, tags=tags)
            elif s == "triangle":
                c.create_polygon((x0 + x1) / 2, y0, x1, y1, x0, y1, outline=col, width=w, fill=fill, tags=tags)
            elif s == "diamond":
                mid_x = (x0 + x1) / 2
                mid_y = (y0 + y1) / 2
                c.create_polygon(mid_x, y0, x1, mid_y, mid_x, y1, x0, mid_y, outline=col, width=w, fill=fill, tags=tags)
            elif s == "star":
                xa, xb = sorted((x0, x1))
                ya, yb = sorted((y0, y1))
                cx, cy = (xa + xb) / 2, (ya + yb) / 2
                rx, ry = (xb - xa) / 2, (yb - ya) / 2
                pts = []
                for idx in range(10):
                    ang = -math.pi / 2 + idx * math.pi / 5
                    r_factor = 1.0 if idx % 2 == 0 else 0.42
                    pts.extend([cx + rx * r_factor * math.cos(ang), cy + ry * r_factor * math.sin(ang)])
                c.create_polygon(pts, outline=col, width=w, fill=fill, tags=tags)

        elif k == "sticky":
            x0 = (o.get("x0", 0) + dx) * z
            y0 = (o.get("y0", 0) + dy) * z
            x1 = (o.get("x1", 0) + dx) * z
            y1 = (o.get("y1", 0) + dy) * z
            bg_col = o.get("color", "#fef08a")
            c.create_rectangle(x0, y0, x1, y1, fill=bg_col, outline="#eab308", width=1.5, tags=tags)
            txt = o.get("text", "Sticky Note\n(Double-click to edit)")
            c.create_text(x0 + 8 * z, y0 + 8 * z, anchor="nw", text=txt, fill="#713f12",
                          font=("Segoe UI", max(7, int(11 * z))), width=max(40, abs(x1 - x0) - 16 * z), tags=tags)

        elif k == "table":
            x0 = (o.get("x0", 0) + dx) * z
            y0 = (o.get("y0", 0) + dy) * z
            x1 = (o.get("x1", 0) + dx) * z
            y1 = (o.get("y1", 0) + dy) * z
            rows = max(1, o.get("rows", 3))
            cols = max(1, o.get("cols", 3))
            col = o.get("color", "#0f172a")
            w = max(1, o.get("width", 1.5) * z)

            c.create_rectangle(x0, y0, x1, y1, outline=col, width=w, fill="#ffffff", tags=tags)
            dx_cell = (x1 - x0) / cols
            dy_cell = (y1 - y0) / rows

            for r_i in range(1, rows):
                c.create_line(x0, y0 + r_i * dy_cell, x1, y0 + r_i * dy_cell, fill=col, width=w, tags=tags)
            for c_i in range(1, cols):
                c.create_line(x0 + c_i * dx_cell, y0, x0 + c_i * dx_cell, y1, fill=col, width=w, tags=tags)

            cells = o.get("cells", {})
            for r_i in range(rows):
                for c_i in range(cols):
                    cell_txt = cells.get(f"{r_i},{c_i}", "")
                    if cell_txt:
                        cx_txt = x0 + c_i * dx_cell + 4 * z
                        cy_txt = y0 + r_i * dy_cell + 4 * z
                        c.create_text(cx_txt, cy_txt, anchor="nw", text=cell_txt, fill="#1e293b",
                                      font=("Segoe UI", max(6, int(10 * z))), tags=tags)

        elif k == "image":
            ox = (o.get("x", 0) + dx) * z
            oy = (o.get("y", 0) + dy) * z
            img_id = o["id"]
            if img_id not in self.photo_images and "data" in o:
                try:
                    img_data = o["data"]
                    photo = tk.PhotoImage(data=img_data)
                    self.photo_images[img_id] = photo
                except Exception:
                    pass
            if img_id in self.photo_images:
                c.create_image(ox, oy, image=self.photo_images[img_id], anchor="nw", tags=tags)

        elif k == "text":
            ox = (o.get("x", 0) + dx) * z
            oy = (o.get("y", 0) + dy) * z
            f_fam = o.get("font", getattr(self, "font_family", "Segoe UI"))
            c.create_text(ox, oy, anchor="nw", text=o.get("text", ""), fill=o.get("color", "#000000"),
                          font=(f_fam, max(6, int(o.get("size", 14) * z))), tags=tags)

    def render(self):
        c, z = self.canvas, self.zoom
        c.delete("all")
        self.objs, self.bg = replay(self.actions)

        canv_w = max(self.canvas.winfo_width(), int(DEFAULT_W * z), 4000)
        canv_h = max(self.canvas.winfo_height(), int(DEFAULT_H * z), 3000)
        c.config(scrollregion=(0, 0, canv_w, canv_h))

        # Canvas page background covering the entire space seamlessly
        c.create_rectangle(0, 0, canv_w, canv_h, fill=self.bg, outline="", tags="page")

        # Grid lines underlay
        self.render_grid()

        # Render all objects in sequence
        for o in self.objs.values():
            self.draw_obj(o)

        self.draw_selection()

        # Remote user cursors
        for u in self.cursors:
            self.draw_cursor(u)

    def draw_selection(self):
        self.canvas.delete("sel")
        if self.selected and self.selected in self.objs:
            b = self.canvas.bbox("obj:" + self.selected)
            if b:
                self.canvas.create_rectangle(b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3,
                                             outline="#0284c7", dash=(4, 3), width=1.5, tags="sel")
                for hx, hy in [(b[0] - 3, b[1] - 3), (b[2] + 3, b[1] - 3), (b[0] - 3, b[3] + 3), (b[2] + 3, b[3] + 3)]:
                    self.canvas.create_rectangle(hx - 3, hy - 3, hx + 3, hy + 3, fill="#ffffff", outline="#0284c7", tags="sel")
        else:
            self.selected = None

    def draw_cursor(self, user):
        self.canvas.delete("cur:" + user)
        if user not in self.cursors or user not in self.users:
            return
        x, y = self.cursors[user]
        cx, cy = x * self.zoom, y * self.zoom
        u_info = self.users.get(user, {})
        col = u_info.get("avatar_color", u_info.get("color", "#0284c7"))

        self.canvas.create_polygon([cx, cy, cx + 12, cy + 4, cx + 4, cy + 12], fill=col, outline="#ffffff", tags="cur:" + user)
        self.canvas.create_text(cx + 12, cy + 14, text=user, anchor="nw", fill=col,
                                font=("Segoe UI", 8, "bold"), tags="cur:" + user)

    # ----------------------------------------------------------------
    # Mouse & Drawing Event Handlers
    # ----------------------------------------------------------------
    def pos(self, e):
        return self.canvas.canvasx(e.x) / self.zoom, self.canvas.canvasy(e.y) / self.zoom

    def hover_send(self, wx, wy):
        if self.is_offline or not self.net:
            return
        now = time.time()
        if now - self.last_cursor_sent > 0.045:
            self.last_cursor_sent = now
            self.net.send({"type": "cursor", "x": wx, "y": wy})

    def on_hover(self, e):
        wx, wy = self.pos(e)
        self.hover_send(wx, wy)
        self.coord_lbl.config(text=f"X: {int(wx)} px   Y: {int(wy)} px")

    def under(self, wx, wy):
        objs, _ = replay(self.actions)
        return hit_test(objs, wx, wy, 6 / self.zoom)

    def on_press(self, e):
        self.canvas.focus_set()
        if not self.online:
            self.status.config(text="Offline - Reconnecting...")
            return
        if not self.can_draw:
            self.status.config(text="🔒 Host has disabled your drawing permission (View-Only)")
            return

        wx, wy = self.pos(e)
        t = self.tool

        if t in ("pencil", "eraser"):
            b = "eraser" if t == "eraser" else self.brush
            sid = self.new_id()
            self.cur_stroke = {"id": sid, "brush": b}
            self.last_pt = (wx, wy)

            # Optimistically register the stroke locally so undo/redo has access immediately
            stroke_obj = {
                "id": sid, "kind": "stroke", "user": self.user,
                "brush": b, "color": self.color1, "width": self.brush_size,
                "opacity": self.opacity, "points": [[wx, wy]], "undone": False
            }
            self.actions.append(stroke_obj)
            self.by_id[sid] = stroke_obj

            self.send_stroke([[wx, wy]])
            self.local_seg(wx, wy, wx, wy)

        elif t == "shape":
            self.drag0 = (wx, wy)

        elif t == "fill":
            o = self.under(wx, wy)
            tgt = o["id"] if o and o.get("kind") == "shape" and o.get("shape") in CLOSED_SHAPES else "bg"
            self.send_action({"kind": "fill", "target": tgt, "color": self.color1})

        elif t == "text":
            o = self.under(wx, wy)
            if o and o.get("kind") == "text":
                self.selected = o["id"]
                self.draw_selection()
                self.edit_text_dialog(o)
                return

            dlg = TextEntryDialog(self.root, title="Add Text", initial_size=self.font_size)
            if dlg.result:
                txt, sz = dlg.result
                self.font_size = sz
                if hasattr(self, "font_size_var"):
                    self.font_size_var.set(str(sz))
                self.send_action({
                    "kind": "text", "x": wx, "y": wy, "text": txt,
                    "color": self.color1, "size": sz, "font": getattr(self, "font_family", "Segoe UI")
                })

        elif t == "picker":
            o = self.under(wx, wy)
            if o is None:
                self.set_primary_color(self.bg)
            elif o.get("fill"):
                self.set_primary_color(o["fill"])
            else:
                self.set_primary_color(o.get("color", "#000000"))

        elif t == "zoom":
            o = self.under(wx, wy)
            if o:
                self.selected = o["id"]
                self.draw_selection()
            self.set_zoom(self.zoom * 1.25)
            try:
                frac_x = max(0.0, min(1.0, (wx * self.zoom - e.x) / (DEFAULT_W * self.zoom)))
                frac_y = max(0.0, min(1.0, (wy * self.zoom - e.y) / (DEFAULT_H * self.zoom)))
                self.canvas.xview_moveto(frac_x)
                self.canvas.yview_moveto(frac_y)
            except Exception:
                pass

        elif t == "select":
            o = self.under(wx, wy)
            self.selected = o["id"] if o else None
            self.draw_selection()
            self.sel_drag = (e.x, e.y, 0.0, 0.0) if o else None
            if o and o.get("kind") == "text":
                sz = o.get("size", self.font_size)
                self.font_size = sz
                if hasattr(self, "font_size_var"):
                    self.font_size_var.set(str(sz))
                self.status.config(text=f"Selected Text: '{o.get('text', '')}' | Font Size: {sz}pt (Change size in ribbon)")

    def edit_text_dialog(self, o):
        cur_txt = o.get("text", "")
        cur_sz = o.get("size", self.font_size)
        dlg = TextEntryDialog(self.root, title="Edit Text", initial_text=cur_txt, initial_size=cur_sz)
        if dlg.result:
            new_txt, new_sz = dlg.result
            self.font_size = new_sz
            if hasattr(self, "font_size_var"):
                self.font_size_var.set(str(new_sz))
            self.send_action({
                "kind": "text_edit", "target": o["id"],
                "text": new_txt, "size": new_sz, "font": o.get("font", getattr(self, "font_family", "Segoe UI"))
            })

    def on_move(self, e):
        wx, wy = self.pos(e)
        self.hover_send(wx, wy)
        self.coord_lbl.config(text=f"X: {int(wx)} px   Y: {int(wy)} px")

        if self.tool in ("pencil", "eraser") and self.cur_stroke:
            sid = self.cur_stroke["id"]
            if sid in self.by_id:
                self.by_id[sid]["points"].append([wx, wy])
            self.local_seg(self.last_pt[0], self.last_pt[1], wx, wy)
            self.send_stroke([[wx, wy]])
            self.last_pt = (wx, wy)

        elif self.tool == "shape" and self.drag0:
            self.canvas.delete("preview")
            self.draw_obj(self.shape_obj(self.drag0, (wx, wy)), "preview")

        elif self.tool == "select" and self.sel_drag:
            px, py, tx, ty = self.sel_drag
            mx, my = e.x - px, e.y - py
            self.canvas.move("obj:" + self.selected, mx, my)
            self.canvas.move("sel", mx, my)
            self.sel_drag = (e.x, e.y, tx + mx, ty + my)

    def on_release(self, e):
        wx, wy = self.pos(e)
        if self.tool in ("pencil", "eraser"):
            last_sid = self.cur_stroke.get("id") if self.cur_stroke else None
            self.cur_stroke = None
            self.save_board_state()
            if self.tool == "pencil" and last_sid and last_sid in self.by_id:
                stroke_act = self.by_id[last_sid]
                self.register_recent_ink_stroke(stroke_act)

        elif self.tool == "shape" and self.drag0:
            self.canvas.delete("preview")
            p0, self.drag0 = self.drag0, None
            if math.hypot(wx - p0[0], wy - p0[1]) > 3:
                o = self.shape_obj(p0, (wx, wy))
                if self.shape == "sticky":
                    self.send_action({
                        "kind": "sticky", "x0": o["x0"], "y0": o["y0"],
                        "x1": o["x1"], "y1": o["y1"], "color": "#fef08a",
                        "text": "Sticky Note\n(Double-click to edit)"
                    })
                else:
                    self.send_action({
                        "kind": "shape", "shape": o["shape"], "x0": o["x0"],
                        "y0": o["y0"], "x1": o["x1"], "y1": o["y1"],
                        "color": o["color"], "width": o["width"], "fill": o["fill"]
                    })

        elif self.tool == "select" and self.sel_drag:
            tx, ty = self.sel_drag[2], self.sel_drag[3]
            self.sel_drag = None
            if abs(tx) + abs(ty) > 2:
                self.send_action({"kind": "move", "target": self.selected,
                                  "dx": tx / self.zoom, "dy": ty / self.zoom})

    def on_double_click(self, e):
        wx, wy = self.pos(e)
        o = self.under(wx, wy)
        if not o:
            return
        k = o.get("kind")
        if k == "text":
            self.selected = o["id"]
            self.draw_selection()
            self.edit_text_dialog(o)
        elif k == "sticky":
            txt = simpledialog.askstring("Edit Sticky Note", "Text:", initialvalue=o.get("text", ""), parent=self.root)
            if txt is not None:
                self.send_action({"kind": "sticky_edit", "target": o["id"], "text": txt})
        elif k == "table":
            rows = max(1, o.get("rows", 3))
            cols = max(1, o.get("cols", 3))
            dx_cell = (o["x1"] - o["x0"]) / cols
            dy_cell = (o["y1"] - o["y0"]) / rows
            c_idx = int((wx - o["x0"] - o.get("dx", 0)) // dx_cell)
            r_idx = int((wy - o["y0"] - o.get("dy", 0)) // dy_cell)
            if 0 <= r_idx < rows and 0 <= c_idx < cols:
                cur_val = o.get("cells", {}).get(f"{r_idx},{c_idx}", "")
                new_val = simpledialog.askstring(f"Edit Cell ({r_idx+1},{c_idx+1})", "Value:", initialvalue=cur_val, parent=self.root)
                if new_val is not None:
                    self.send_action({"kind": "table_edit", "target": o["id"], "r": r_idx, "c": c_idx, "text": new_val})

    def shape_obj(self, p0, p1):
        fill = self.color1 if (self.v_fill.get() and self.shape in CLOSED_SHAPES) else None
        return {
            "kind": "shape", "id": "preview", "shape": self.shape,
            "x0": p0[0], "y0": p0[1], "x1": p1[0], "y1": p1[1],
            "color": self.color1, "width": self.brush_size, "fill": fill
        }

    # ----------------------------------------------------------------
    # Sending Actions & Protocol Messages
    # ----------------------------------------------------------------
    def send_stroke(self, pts):
        if self.is_offline or not self.net:
            self.auto_save_offline()
            return
        self.net.send({
            "type": "stroke_pts",
            "id": self.cur_stroke["id"],
            "brush": self.cur_stroke["brush"],
            "color": self.color1,
            "width": self.brush_size,
            "opacity": self.opacity,
            "points": pts
        })

    def local_seg(self, x0, y0, x1, y1):
        o = {"brush": self.cur_stroke["brush"], "color": self.color1, "width": self.brush_size}
        z = self.zoom
        self.canvas.create_line(x0 * z, y0 * z, x1 * z, y1 * z, capstyle="round",
                                tags=("obj:" + self.cur_stroke["id"],), **self.stroke_style(o))

    def send_action(self, body):
        if not self.online:
            return
        if not self.can_draw:
            self.status.config(text="🔒 Host has disabled your drawing permission (View-Only)")
            return
        body["id"] = self.new_id()
        body["user"] = self.user
        body["undone"] = False

        # Optimistically record and render locally
        if body["id"] not in self.by_id:
            self.actions.append(body)
            self.by_id[body["id"]] = body
            self.render()
            self.save_board_state()

        if self.is_offline or not self.net:
            self.auto_save_offline()
            return

        self.net.send({"type": "action", "action": body})

    def undo(self):
        if self.is_offline or not self.net:
            for a in reversed(self.actions):
                if not a.get("undone", False):
                    a["undone"] = True
                    self.redo_stack.append(a)
                    self.render()
                    self.auto_save_offline()
                    break
            return
        if not self.can_draw:
            self.status.config(text="🔒 Host has disabled your drawing permission (View-Only)")
            return
        self.net.send({"type": "undo"})

    def redo(self):
        if self.is_offline or not self.net:
            if self.redo_stack:
                a = self.redo_stack.pop()
                a["undone"] = False
                self.render()
                self.auto_save_offline()
            return
        if not self.can_draw:
            self.status.config(text="🔒 Host has disabled your drawing permission (View-Only)")
            return
        self.net.send({"type": "redo"})

    def delete_selected(self):
        if self.selected:
            if self.is_offline or not self.net:
                self.actions = [a for a in self.actions if a.get("id") != self.selected]
                self.by_id.pop(self.selected, None)
                self.selected = None
                self.render()
                self.auto_save_offline()
            else:
                self.send_action({"kind": "delete", "target": self.selected})
                self.selected = None

    def clear_canvas(self):
        if self.is_offline or not self.net:
            if messagebox.askyesno("Clear Board", "Clear all content from this offline whiteboard?"):
                self.actions = []
                self.by_id = {}
                self.redo_stack = []
                self.render()
                self.auto_save_offline()
                self.status.config(text="Canvas cleared.")
            return
        if not self.is_host and not self.is_cohost:
            messagebox.showinfo("Clear Board", "Only the host or co-host can clear the canvas.")
            return
        if messagebox.askyesno("Clear Board", "Clear the whiteboard for all participants?"):
            self.send_action({"kind": "clear"})

    def insert_table(self):
        if not self.can_draw:
            return
        res = simpledialog.askstring("Insert Table", "Enter Rows x Columns (e.g. 3x3):", initialvalue="3x3", parent=self.root)
        if res and "x" in res.lower():
            try:
                parts = res.lower().split("x")
                r, c = int(parts[0]), int(parts[1])
                self.send_action({
                    "kind": "table", "x0": 100, "y0": 100, "x1": 100 + c * 80,
                    "y1": 100 + r * 35, "rows": r, "cols": c, "color": "#0f172a",
                    "width": 1.5, "cells": {}
                })
            except Exception:
                pass

    def insert_image(self):
        if not self.can_draw:
            return
        path = filedialog.askopenfilename(title="Insert Image", filetypes=[("Images", "*.png *.gif *.ppm")])
        if not path:
            return
        try:
            with open(path, "rb") as f:
                raw_bytes = f.read()
            if len(raw_bytes) > 600 * 1024:
                messagebox.showwarning("Image Warning", "Image file is large (>600KB). It may take a moment to sync.")
            b64_str = base64.b64encode(raw_bytes).decode("ascii")
            test_photo = tk.PhotoImage(data=b64_str)
            w, h = test_photo.width(), test_photo.height()
            self.send_action({
                "kind": "image", "x": 100, "y": 100, "w": w, "h": h,
                "data": b64_str
            })
        except Exception as e:
            messagebox.showerror("Image Error", f"Could not load image: {e}")

    def export_ps(self):
        path = filedialog.asksaveasfilename(defaultextension=".ps", filetypes=[("PostScript", "*.ps")])
        if path:
            try:
                self.canvas.postscript(file=path, colormode="color")
                messagebox.showinfo("Export Successful", f"Saved canvas as:\n{path}")
            except Exception as e:
                messagebox.showerror("Export Failed", str(e))

    def export_json(self):
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")])
        if path:
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump({"actions": self.actions, "seq": self.last_seq}, f, indent=2)
                messagebox.showinfo("Export Successful", f"Saved board action log as:\n{path}")
            except Exception as e:
                messagebox.showerror("Export Failed", str(e))

    def save_board(self):
        if self.is_offline:
            new_title = simpledialog.askstring("Rename / Save Board", "Whiteboard Title:",
                                               initialvalue=self.board_title, parent=self.root)
            if new_title:
                self.board_title = new_title.strip()
                if hasattr(self, "room_badge"):
                    self.room_badge.config(text=f"📝 {self.board_title}")
                self.auto_save_offline()
                messagebox.showinfo("Saved", f"Whiteboard '{self.board_title}' saved locally!")
            return
        name = simpledialog.askstring("Save Board on Server", "Board Name:", parent=self.root)
        if name:
            self.net.send({"type": "save", "name": name})

    def open_board(self):
        if self.is_offline:
            self.back_to_hub()
            return
        if not self.is_host:
            messagebox.showinfo("Open Board", "Only the host can load a saved board.")
            return
        self.net.send({"type": "list_saves"})

    def send_host_control(self, action, target):
        if self.is_offline or not self.net:
            return
        self.net.send({"type": "host_control", "action": action, "target": target})

    def toggle_room_lock(self):
        if not self.is_host:
            return
        self.send_host_control("lock_room", "")

    def toggle_presentation_mode(self):
        if not self.is_host:
            return
        self.send_host_control("presentation_mode", "")

    # ----------------------------------------------------------------
    # Handwriting to Font & Typography Conversion
    # ----------------------------------------------------------------
    def toggle_auto_ink_to_font(self):
        self.auto_beautify = not getattr(self, "auto_beautify", False)
        if hasattr(self, "btn_auto_ink"):
            if self.auto_beautify:
                self.btn_auto_ink.config(text="✨ Auto Font: ON", bg="#10b981", fg="#ffffff")
                self.status.config(text=f"Auto Ink-to-Font enabled with font '{self.font_family}'")
            else:
                self.btn_auto_ink.config(text="✨ Auto Font: OFF", bg="#f1f5f9", fg="#475569")
                self.status.config(text="Auto Ink-to-Font disabled")

    def on_font_family_changed(self, event=None):
        fam = self.font_family_var.get()
        if fam:
            self.font_family = fam
            self.status.config(text=f"Selected Font: {fam}")
            if self.selected and self.selected in self.objs:
                o = self.objs[self.selected]
                if o.get("kind") == "text":
                    self.send_action({
                        "kind": "text_edit",
                        "target": self.selected,
                        "text": o.get("text", ""),
                        "size": o.get("size", self.font_size),
                        "font": self.font_family
                    })

    def register_recent_ink_stroke(self, stroke_act):
        if not hasattr(self, "_recent_ink"):
            self._recent_ink = []
        self._recent_ink.append(stroke_act)

        # If auto-beautify is turned on, set a debounce timer of 850ms
        if getattr(self, "auto_beautify", False):
            if hasattr(self, "_ink_timer") and self._ink_timer:
                try:
                    self.root.after_cancel(self._ink_timer)
                except Exception:
                    pass
            self._ink_timer = self.root.after(850, self.convert_recent_handwriting)

    def convert_recent_handwriting(self):
        """
        Recognizes recent hand-drawn strokes (words, digits, symbols)
        and converts them into clean typography in the user's selected font family.
        """
        if hasattr(self, "_ink_timer") and self._ink_timer:
            try:
                self.root.after_cancel(self._ink_timer)
            except Exception:
                pass
            self._ink_timer = None

        strokes = getattr(self, "_recent_ink", [])
        self._recent_ink = []

        if not strokes:
            # Fallback: grab the last few active strokes by current user
            my_strokes = [a for a in self.actions if a.get("kind") == "stroke" and a.get("user") == self.user and not a.get("undone")]
            if my_strokes:
                strokes = my_strokes[-8:]

        if not strokes or not HandwritingToFontEngine:
            return

        valid_strokes = [s for s in strokes if not s.get("undone") and len(s.get("points", [])) >= 1]
        if not valid_strokes:
            return

        text = HandwritingToFontEngine.recognize_strokes_sequence(valid_strokes)
        if not text or not text.strip():
            return

        # Calculate bounding box of these strokes
        all_xs = [p[0] for s in valid_strokes for p in s.get("points", [])]
        all_ys = [p[1] for s in valid_strokes for p in s.get("points", [])]
        min_x, max_x = min(all_xs), max(all_xs)
        min_y, max_y = min(all_ys), max(all_ys)
        calc_size = max(14, min(72, int((max_y - min_y) * 0.85)))
        color = valid_strokes[-1].get("color", self.color1)

        # Delete / Undo the messy hand-drawn strokes
        for s in valid_strokes:
            self.send_action({"kind": "delete", "target": s["id"]})

        # Insert clean text action in selected font
        self.send_action({
            "kind": "text",
            "x": min_x,
            "y": min_y,
            "text": text,
            "color": color,
            "size": calc_size,
            "font": getattr(self, "font_family", "Segoe UI")
        })
        self.status.config(text=f"✨ Converted handwriting to font '{self.font_family}': \"{text}\"")

    # ----------------------------------------------------------------
    # Event Instance Saving & Shared Session Works
    # ----------------------------------------------------------------
    def update_session_works_btn(self):
        if hasattr(self, "btn_session_works"):
            self.btn_session_works.config(text=f"📁 Session Works ({len(self.session_works)})")

    def save_instance_dialog(self):
        """
        Captures a canvas instance snapshot.
        Presents two options:
        1. Save to My Computer (PNG screenshot or JSON on local disk)
        2. Save to Session Works (broadcast to all session participants, subject to host permission)
        """
        pop = tk.Toplevel(self.root)
        pop.title("Save Whiteboard Instance")
        pop.geometry("460x430")
        pop.resizable(False, False)
        pop.configure(bg="#ffffff")
        pop.transient(self.root)
        pop.grab_set()

        rx, ry = self.root.winfo_rootx(), self.root.winfo_rooty()
        rw, rh = self.root.winfo_width(), self.root.winfo_height()
        pop.geometry(f"+{max(0, rx + (rw - 460) // 2)}+{max(0, ry + (rh - 430) // 2)}")

        box = tk.Frame(pop, bg="#ffffff", padx=20, pady=16)
        box.pack(fill="both", expand=True)

        tk.Label(box, text="📸 Capture & Save Instance", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#0f172a").pack(anchor="w")
        tk.Label(box, text="Save this milestone so participants can access historical progress.", font=("Segoe UI", 8), bg="#ffffff", fg="#64748b").pack(anchor="w", pady=(1, 10))

        # Title entry
        tk.Label(box, text="Instance Title:", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#334155").pack(anchor="w")
        title_var = tk.StringVar(value=f"Instance #{len(self.session_works) + 1} ({time.strftime('%I:%M %p')})")
        e_title = tk.Entry(box, textvariable=title_var, font=("Segoe UI", 9), relief="solid", bd=1)
        e_title.pack(fill="x", pady=(2, 8))

        # Note/description
        tk.Label(box, text="Notes / Milestone Description (Optional):", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#334155").pack(anchor="w")
        note_var = tk.StringVar(value="")
        e_note = tk.Entry(box, textvariable=note_var, font=("Segoe UI", 9), relief="solid", bd=1)
        e_note.pack(fill="x", pady=(2, 12))

        # Option 1: Save to PC
        btn_pc = tk.Button(
            box, text="💾 1. Save to My Computer (Local PNG / JSON)",
            font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#0f172a",
            relief="solid", bd=1, pady=7, cursor="hand2",
            command=lambda: [pop.destroy(), self._save_instance_locally(title_var.get(), note_var.get())]
        )
        btn_pc.pack(fill="x", pady=4)

        # Option 2: Save to Session Works
        allowed = (self.is_offline or self.is_host or getattr(self, "can_save_instance", True))
        perm_text = "📁 2. Save to Shared Session Works (Public to Room)" if allowed else "🔒 2. Save to Session Works (Host Locked)"
        perm_bg = "#10b981" if allowed else "#94a3b8"
        perm_cursor = "hand2" if allowed else "arrow"

        def do_save_session():
            if not allowed:
                messagebox.showwarning(
                    "Permission Denied",
                    f"The host has restricted saving to Session Works ({self.instance_save_perm}).\nYou can still use Option 1: 'Save to My Computer'!",
                    parent=pop
                )
                return
            pop.destroy()
            self._save_instance_to_session_works(title_var.get(), note_var.get())

        btn_session = tk.Button(
            box, text=perm_text,
            font=("Segoe UI", 9, "bold"), bg=perm_bg, fg="#ffffff",
            relief="flat", bd=0, pady=8, cursor=perm_cursor,
            command=do_save_session
        )
        btn_session.pack(fill="x", pady=4)

        # Host controls for session works permission
        if self.is_host and not self.is_offline:
            h_frame = tk.LabelFrame(box, text="⚙️ Host Settings: Session Works Permissions", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#475569", padx=8, pady=6)
            h_frame.pack(fill="x", pady=(8, 0))

            tk.Label(h_frame, text="Allow members to save instances:", font=("Segoe UI", 7), bg="#ffffff", fg="#64748b").pack(anchor="w")
            p_var = tk.StringVar(value=getattr(self, "instance_save_perm", "everyone"))

            def on_perm_radio():
                chosen = p_var.get()
                self.instance_save_perm = chosen
                if chosen == "selected":
                    self.open_host_instance_perm_dialog(pop)
                else:
                    self.net.send({
                        "type": "host_instance_perm",
                        "perm": chosen,
                        "allowed_users": [self.user]
                    })

            r_box = tk.Frame(h_frame, bg="#ffffff")
            r_box.pack(fill="x", pady=2)
            tk.Radiobutton(r_box, text="Everyone (Public)", variable=p_var, value="everyone", bg="#ffffff", font=("Segoe UI", 7), command=on_perm_radio).pack(side="left", padx=2)
            tk.Radiobutton(r_box, text="Host Only", variable=p_var, value="host_only", bg="#ffffff", font=("Segoe UI", 7), command=on_perm_radio).pack(side="left", padx=2)
            tk.Radiobutton(r_box, text="Selected", variable=p_var, value="selected", bg="#ffffff", font=("Segoe UI", 7), command=on_perm_radio).pack(side="left", padx=2)

        tk.Button(box, text="Cancel", font=("Segoe UI", 8), bg="#f1f5f9", fg="#475569", relief="flat", bd=0, pady=4, cursor="hand2", command=pop.destroy).pack(fill="x", pady=(8, 0))

    def _save_instance_locally(self, title, notes=""):
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', title)
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG Image", "*.png"), ("JSON Bundle", "*.json")],
            initialfile=f"{safe_name}.png"
        )
        if not path:
            return
        try:
            if path.lower().endswith(".json"):
                with open(path, "w", encoding="utf-8") as f:
                    json.dump({
                        "title": title,
                        "notes": notes,
                        "timestamp": time.time(),
                        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "author": self.user,
                        "actions": self.actions,
                        "bg": self.bg
                    }, f, indent=2)
            else:
                if render_actions_to_image:
                    img = render_actions_to_image(self.actions, self.bg, 1920, 1080)
                    img.save(path)
                else:
                    self.canvas.postscript(file=path + ".ps")
            messagebox.showinfo("Instance Saved", f"Instance snapshot saved to your computer:\n{path}")
        except Exception as e:
            messagebox.showerror("Save Error", f"Failed to save instance: {e}")

    def _save_instance_to_session_works(self, title, notes=""):
        b64_thumb = ""
        try:
            if render_actions_to_image and image_to_base64_thumbnail:
                img = render_actions_to_image(self.actions, self.bg, 1280, 720)
                b64_thumb = image_to_base64_thumbnail(img, thumb_size=(240, 135))
        except Exception:
            b64_thumb = ""

        inst = {
            "id": f"inst-{self.user}-{int(time.time() * 1000)}",
            "title": title or f"Instance #{len(self.session_works) + 1}",
            "notes": notes,
            "author": self.user,
            "timestamp": time.time(),
            "time_str": time.strftime("%I:%M %p"),
            "date_str": time.strftime("%d %b"),
            "thumbnail": b64_thumb,
            "actions_snapshot": copy.deepcopy(self.actions),
            "bg": self.bg
        }

        if self.is_offline or not self.net:
            self.session_works.append(inst)
            self.update_session_works_btn()
            self.save_board_state()
            messagebox.showinfo("Session Works", f"Instance '{inst['title']}' saved to Session Works!")
        else:
            self.net.send({
                "type": "save_instance",
                "instance": inst
            })
            if not any(x.get("id") == inst["id"] for x in self.session_works):
                self.session_works.append(inst)
                self.update_session_works_btn()
                self.save_board_state()
            self.status.config(text=f"Instance '{inst['title']}' shared to Session Works!")

    def open_session_works_gallery(self):
        """Displays all milestone instances in chronological order with thumbnails and actions."""
        win = tk.Toplevel(self.root)
        win.title(f"📁 Session Works - {self.board_title} ({len(self.session_works)} Instances)")
        win.geometry("780x560")
        win.configure(bg="#f8fafc")
        win.transient(self.root)

        rx, ry = self.root.winfo_rootx(), self.root.winfo_rooty()
        rw, rh = self.root.winfo_width(), self.root.winfo_height()
        win.geometry(f"+{max(0, rx + (rw - 780) // 2)}+{max(0, ry + (rh - 560) // 2)}")

        # Top header
        top = tk.Frame(win, bg="#ffffff", padx=16, pady=12, highlightthickness=1, highlightbackground="#e2e8f0")
        top.pack(fill="x")

        tk.Label(top, text=f"📁 Session Works Gallery · {self.board_title}", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#0f172a").pack(side="left")

        btn_export = tk.Button(top, text="📤 Share / Export All (.lwb)", font=("Segoe UI", 8, "bold"), bg="#6366f1", fg="#ffffff",
                               relief="flat", bd=0, padx=10, pady=4, cursor="hand2", command=self.export_full_session_bundle)
        btn_export.pack(side="right", padx=4)

        btn_new_inst = tk.Button(top, text="📸 + Capture Current Instance", font=("Segoe UI", 8, "bold"), bg="#10b981", fg="#ffffff",
                                 relief="flat", bd=0, padx=10, pady=4, cursor="hand2", command=lambda: [win.destroy(), self.save_instance_dialog()])
        btn_new_inst.pack(side="right", padx=4)

        if not self.session_works:
            empty = tk.Frame(win, bg="#f8fafc", pady=80)
            empty.pack(fill="both", expand=True)
            tk.Label(empty, text="📷 No Saved Instances Yet", font=("Segoe UI", 13, "bold"), bg="#f8fafc", fg="#64748b").pack()
            tk.Label(empty, text="Click '📸 Save Instance' on the top bar to record milestone snapshots\naccessible to everyone in this whiteboard session.",
                     font=("Segoe UI", 9), bg="#f8fafc", fg="#94a3b8", justify="center").pack(pady=6)
            return

        # Scrollable gallery container
        cv = tk.Canvas(win, bg="#f8fafc", highlightthickness=0)
        sb = ttk.Scrollbar(win, orient="vertical", command=cv.yview)
        scroll_frame = tk.Frame(cv, bg="#f8fafc")

        scroll_frame.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        win_id = cv.create_window((0, 0), window=scroll_frame, anchor="nw")
        cv.configure(xscrollcommand=None, yscrollcommand=sb.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(win_id, width=e.width))

        sb.pack(side="right", fill="y")
        cv.pack(side="left", fill="both", expand=True, padx=12, pady=12)

        win._img_refs = []

        for idx, inst in enumerate(self.session_works):
            card = tk.Frame(scroll_frame, bg="#ffffff", relief="solid", bd=1, padx=12, pady=10)
            card.pack(fill="x", pady=6)

            # Left thumbnail
            b64_t = inst.get("thumbnail")
            if b64_t:
                try:
                    img_data = base64.b64decode(b64_t)
                    tk_img = tk.PhotoImage(data=img_data)
                    win._img_refs.append(tk_img)
                    lbl_thumb = tk.Label(card, image=tk_img, bg="#f1f5f9", relief="solid", bd=1)
                    lbl_thumb.pack(side="left", padx=(0, 12))
                except Exception:
                    pass

            # Center details
            c_box = tk.Frame(card, bg="#ffffff")
            c_box.pack(side="left", fill="both", expand=True)

            t_row = tk.Frame(c_box, bg="#ffffff")
            t_row.pack(fill="x")
            tk.Label(t_row, text=f"#{idx+1} {inst.get('title', 'Untitled')}", font=("Segoe UI", 10, "bold"), bg="#ffffff", fg="#0f172a").pack(side="left")
            time_badge = f"{inst.get('date_str', '')} {inst.get('time_str', '')}".strip()
            tk.Label(t_row, text=time_badge, font=("Segoe UI", 8), bg="#ffffff", fg="#94a3b8").pack(side="right")

            author_str = f"Saved by: {inst.get('author', 'Unknown')}"
            tk.Label(c_box, text=author_str, font=("Segoe UI", 8, "italic"), bg="#ffffff", fg="#0284c7").pack(anchor="w", pady=(2, 2))

            if inst.get("notes"):
                tk.Label(c_box, text=inst.get("notes"), font=("Segoe UI", 8), bg="#ffffff", fg="#64748b", wraplength=350, justify="left").pack(anchor="w")

            act_count = len(inst.get("actions_snapshot", []))
            tk.Label(c_box, text=f"📊 Canvas state: {act_count} elements", font=("Segoe UI", 7), bg="#ffffff", fg="#94a3b8").pack(anchor="w", pady=(2, 0))

            # Right action buttons
            r_box = tk.Frame(card, bg="#ffffff")
            r_box.pack(side="right", padx=(8, 0))

            btn_dl = tk.Button(r_box, text="💾 Save PNG", font=("Segoe UI", 8), bg="#f8fafc", fg="#334155",
                               relief="solid", bd=1, padx=6, pady=2, cursor="hand2",
                               command=lambda item=inst: self._download_instance_png(item))
            btn_dl.pack(fill="x", pady=2)

            btn_res = tk.Button(r_box, text="🔄 Restore Canvas", font=("Segoe UI", 8, "bold"), bg="#e0f2fe", fg="#0369a1",
                                relief="flat", bd=0, padx=6, pady=2, cursor="hand2",
                                command=lambda item=inst: self._restore_instance_state(item, win))
            btn_res.pack(fill="x", pady=2)

            if self.is_host or inst.get("author") == self.user:
                btn_del = tk.Button(r_box, text="🗑️ Delete", font=("Segoe UI", 7), bg="#fee2e2", fg="#b91c1c",
                                    relief="flat", bd=0, padx=6, pady=1, cursor="hand2",
                                    command=lambda item=inst: self._delete_instance(item, win))
                btn_del.pack(fill="x", pady=2)

    def _download_instance_png(self, inst):
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', inst.get('title', 'instance'))
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG Image", "*.png")],
            initialfile=f"{safe_name}.png"
        )
        if not path:
            return
        try:
            acts = inst.get("actions_snapshot", [])
            bg = inst.get("bg", "#ffffff")
            if render_actions_to_image:
                img = render_actions_to_image(acts, bg, 1920, 1080)
                img.save(path)
                messagebox.showinfo("Saved", f"Instance saved as PNG:\n{path}")
            else:
                messagebox.showerror("Error", "Image rendering library not loaded.")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save PNG: {e}")

    def _restore_instance_state(self, inst, parent_win=None):
        if not self.is_offline and not self.is_host and not getattr(self, "is_cohost", False):
            messagebox.showwarning(
                "Restricted",
                "Only the host (or an assigned co-host) has control to restore canvas instances in a collaborative room.",
                parent=parent_win
            )
            return

        if not messagebox.askyesno(
            "Restore Instance",
            f"Restore canvas to instance '{inst.get('title')}'?\nThis will revert the canvas to the state captured in this milestone.",
            parent=parent_win
        ):
            return

        snapshot_acts = inst.get("actions_snapshot", [])
        if self.is_offline or not self.net:
            self.actions = copy.deepcopy(snapshot_acts)
            self.by_id = {a["id"]: a for a in self.actions}
            self.render()
            self.save_board_state()
            self.status.config(text=f"Restored canvas to instance '{inst.get('title')}'")
        else:
            self.net.send({
                "type": "restore_instance",
                "id": inst.get("id"),
                "title": inst.get("title", "milestone"),
                "actions": snapshot_acts
            })
            self.status.config(text=f"Restoring collaborative canvas to '{inst.get('title')}'...")

        if parent_win:
            parent_win.destroy()

    def _delete_instance(self, inst, parent_win=None):
        iid = inst.get("id")
        if not messagebox.askyesno("Delete Instance", f"Are you sure you want to delete '{inst.get('title')}'?", parent=parent_win):
            return
        if self.is_offline or not self.net:
            self.session_works = [x for x in self.session_works if x.get("id") != iid]
            self.update_session_works_btn()
            self.save_board_state()
            if parent_win:
                parent_win.destroy()
                self.open_session_works_gallery()
        else:
            self.net.send({"type": "delete_instance", "id": iid})
            if parent_win:
                parent_win.destroy()

    def open_host_instance_perm_dialog(self, parent_win=None):
        if not self.is_host:
            return
        d = tk.Toplevel(parent_win or self.root)
        d.title("Select Members Permitted to Save Instances")
        d.geometry("340x380")
        d.configure(bg="#ffffff")
        d.transient(parent_win or self.root)
        d.grab_set()

        tk.Label(d, text="Select Members Allowed to Save Instances:", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#0f172a").pack(anchor="w", padx=14, pady=(12, 6))

        box = tk.Frame(d, bg="#f8fafc", relief="solid", bd=1)
        box.pack(fill="both", expand=True, padx=14, pady=6)

        user_vars = {}
        for u_name in self.users:
            if u_name == self.user:
                continue
            v = tk.BooleanVar(value=True)
            user_vars[u_name] = v
            tk.Checkbutton(box, text=u_name, variable=v, bg="#f8fafc", font=("Segoe UI", 8)).pack(anchor="w", padx=8, pady=2)

        def save_perms():
            allowed = [u for u, v in user_vars.items() if v.get()]
            allowed.append(self.user)
            self.net.send({
                "type": "host_instance_perm",
                "perm": "selected",
                "allowed_users": allowed
            })
            d.destroy()

        tk.Button(d, text="Save Permissions", font=("Segoe UI", 8, "bold"), bg="#2563eb", fg="#ffffff",
                  relief="flat", bd=0, pady=6, cursor="hand2", command=save_perms).pack(fill="x", padx=14, pady=(6, 12))

    def export_full_session_bundle(self):
        """
        Exports the entire whiteboard session including:
        - All drawing actions from start to finish
        - All saved milestone instances (Session Works) with thumbnails
        - Chat conversation history
        into a shareable '.lwb' bundle file.
        """
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', self.board_title)
        path = filedialog.asksaveasfilename(
            title="Export Whiteboard Session Bundle",
            defaultextension=".lwb",
            filetypes=[("LAN Whiteboard Bundle", "*.lwb"), ("JSON File", "*.json")],
            initialfile=f"{safe_name}_full_session.lwb"
        )
        if not path:
            return
        try:
            bundle = {
                "format": "lan_whiteboard_bundle_v1",
                "title": self.board_title,
                "code": self.session_code,
                "host": self.config.get("host", "127.0.0.1"),
                "exported_by": self.user,
                "exported_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "actions": self.actions,
                "instances": self.session_works,
                "chat_log": getattr(self, "chat_messages", []),
                "bg": self.bg
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(bundle, f, indent=2)
            messagebox.showinfo(
                "Export Successful",
                f"Full whiteboard session bundle exported!\nFile: {path}\n\nYou can share this file with anyone. They can import it via '📥 Import Shared Session' to inspect all milestone instances and drawing history."
            )
        except Exception as e:
            messagebox.showerror("Export Failed", f"Could not export session bundle: {e}")

    # ----------------------------------------------------------------
    # Reliability: Sequencing, Gap Resend, Heartbeat & Reconnection
    # ----------------------------------------------------------------
    SEQ_TYPES = ("stroke_pts", "action", "undo", "redo", "chat", "chat_message", "CHAT_MESSAGE", "chat_broadcast", "CHAT_BROADCAST")

    def heartbeat(self):
        if self.is_offline or not self.net:
            return
        if self.online:
            self.net.send({"type": "ping"})
            if time.time() - self.last_rx > 30:
                self.net.drop()
        self.root.after(5000, self.heartbeat)

    def sequenced(self, m):
        s = m.get("seq", 0)
        if s <= self.last_seq:
            return
        if s > self.last_seq + 1:
            self.pending[s] = m
            if time.time() - self.last_resend > 1.0:
                self.last_resend = time.time()
                self.net.send({"type": "resend", "from": self.last_seq})
            return
        self.apply(m)
        self.last_seq = s
        while (self.last_seq + 1) in self.pending:
            nxt = self.pending.pop(self.last_seq + 1)
            self.apply(nxt)
            self.last_seq += 1

    def start_reconnect(self):
        if self.reconnecting:
            return
        self.reconnecting = True

        def loop():
            while self.reconnecting:
                try:
                    self.net.connect(timeout=3)
                    self.net.inbox.put({"type": "reconnected"})
                    return
                except Exception:
                    time.sleep(2)

        threading.Thread(target=loop, daemon=True).start()

    def quit(self):
        self.reconnecting = False
        self.save_board_state()
        if not self.is_offline and self.online and self.net:
            try:
                self.net.send({"type": "leave"})
            except Exception:
                pass
        self.root.destroy()
        if hasattr(self, "on_back_cb") and self.on_back_cb:
            try:
                self.on_back_cb()
            except Exception as e:
                print(f"[!] Error returning to hub: {e}")
        else:
            cleanup_embedded_server()

    # ----------------------------------------------------------------
    # Message Dispatch & Handlers
    # ----------------------------------------------------------------
    def poll(self):
        if self.is_offline or not self.net:
            return
        try:
            while True:
                msg = self.net.inbox.get_nowait()
                try:
                    self.handle(msg)
                except Exception as ex:
                    print(f"[!] Error processing message {msg.get('type')}: {ex}")
        except queue.Empty:
            pass
        except Exception as ex:
            print(f"[!] Poll loop error: {ex}")
        finally:
            self.root.after(20, self.poll)

    def handle(self, m):
        self.last_rx = time.time()
        t = m.get("type")
        if t in self.SEQ_TYPES and "seq" in m:
            self.sequenced(m)
        else:
            self.apply(m)

    def load_snapshot(self, m):
        self.actions = [dict(a) for a in m.get("actions", [])]
        self.by_id = {a["id"]: a for a in self.actions}
        if "session_works" in m:
            self.session_works = m.get("session_works", [])
            self.update_session_works_btn()
        self.set_users(m.get("users", []))
        self.chat_messages = []
        self.seen_message_ids.clear()
        for e in m.get("chat", []):
            self.handle_chat_message(e, from_history=True)
        self.selected = None
        self.last_seq = m.get("seq", 0)
        self.pending.clear()
        self.render()
        self.render_chat_cards()
        self.save_board_state()

    def set_users(self, users):
        self.users = {u["name"]: u for u in users}
        me = self.users.get(self.user, {})
        self.is_host = me.get("is_host", False)
        self.is_cohost = me.get("is_cohost", False)

        if "can_save_instance" in me:
            self.can_save_instance = me["can_save_instance"]

        prev_can_draw = self.can_draw
        self.can_draw = me.get("can_draw", True)

        if not self.can_draw:
            self.status.config(text="🔒 Host has disabled your drawing permission (View-Only)")
            self.canvas.config(cursor="X_cursor")
        elif not prev_can_draw and self.can_draw:
            self.status.config(text=f"Drawing permission restored! Tool: {self.tool.capitalize()}")
            self.set_tool(self.tool)

        # Update host control frame visibility
        if hasattr(self, "host_ctrl_frame"):
            if self.is_host or self.is_cohost:
                self.host_ctrl_frame.pack(fill="x")
            else:
                self.host_ctrl_frame.pack_forget()

        if hasattr(self, "btn_add_member"):
            if self.is_host or self.is_cohost:
                self.btn_add_member.pack(side="right")
            else:
                self.btn_add_member.pack_forget()

        self.update_participants_list()

    def apply(self, m):
        t = m.get("type")

        if t == "join_ack":
            self.token = m["token"]
            self.session_code = m["session"]
            self.is_host = m["is_host"]
            if m.get("title") and not m.get("title").startswith("Room "):
                self.board_title = m["title"]
            elif not self.board_title:
                self.board_title = m.get("title", f"Room {m['session']}")
            if "session_works" in m:
                self.session_works = m.get("session_works", [])
                self.update_session_works_btn()
            if "instance_save_perm" in m:
                self.instance_save_perm = m.get("instance_save_perm", "everyone")
            if "can_save_instance" in m:
                self.can_save_instance = m.get("can_save_instance", True)
            self.room_badge.config(text=f"Room: {self.board_title}")
            self.room_code = m["session"]
            self.root.title(f"Collaborative Whiteboard - {self.board_title} - {self.user}")
            self.load_snapshot(m)
            self.save_board_state()
            self.status.config(text=f"Connected to {self.board_title}")
            self.add_system_chat(f"Room created: {self.board_title}." if self.is_host else f"Connected to room: {self.board_title}.")
            if m.get("added_by_host"):
                host_nm = m.get("added_by", "Host")
                self.status.config(text=f"✨ Added to session '{self.board_title}' by {host_nm}!")
                messagebox.showinfo("Session Invitation", f"You have been added to '{self.board_title}' by {host_nm}!", parent=self.root)

        elif t == "snapshot":
            self.load_snapshot(m)

        elif t == "action":
            act = dict(m["action"])
            if act["id"] not in self.by_id:
                self.actions.append(act)
                self.by_id[act["id"]] = act
                self.render()
                self.save_board_state()

        elif t == "stroke_pts":
            sid = m["id"]
            a = self.by_id.get(sid)
            if a is None:
                a = {
                    "id": sid, "kind": "stroke", "user": m["user"],
                    "brush": m.get("brush", "pencil"), "color": m.get("color", "#000000"),
                    "width": m.get("width", 3), "opacity": m.get("opacity", 1.0),
                    "points": [], "undone": False
                }
                self.actions.append(a)
                self.by_id[sid] = a
            prev = a["points"][-1] if a["points"] else None
            # Only append if remote user (local user appends points in real time)
            if m["user"] != self.user:
                a["points"].extend(m["points"])
                if not a.get("undone") and not self.resyncing:
                    z = self.zoom
                    for p in m["points"]:
                        q = prev or p
                        self.canvas.create_line(q[0] * z, q[1] * z, p[0] * z, p[1] * z,
                                                capstyle="round", tags=("obj:" + sid,),
                                                **self.stroke_style(a))
                        prev = p

        elif t in ("undo", "redo"):
            target_id = m.get("target")
            a = self.by_id.get(target_id)
            if a is None:
                for act in self.actions:
                    if act.get("id") == target_id:
                        a = act
                        self.by_id[target_id] = a
                        break
            if a:
                a["undone"] = (t == "undo")
                if not self.resyncing:
                    self.render()
                self.save_board_state()
            action_name = "Undo" if t == "undo" else "Redo"
            user_str = "You" if m.get("user") == self.user else m.get("user", "User")
            self.status.config(text=f"{action_name} performed by {user_str}")

        elif t == "cursor":
            self.cursors[m["user"]] = (m["x"], m["y"])
            self.draw_cursor(m["user"])

        elif t in ("chat", "chat_message", "CHAT_MESSAGE", "chat_broadcast", "CHAT_BROADCAST"):
            self.handle_chat_message(m)

        elif t in ("chat_ack", "CHAT_ACK"):
            self.handle_chat_ack(m)

        elif t in ("chat_history", "CHAT_HISTORY"):
            self.handle_chat_history(m)

        elif t in ("chat_cleared", "CHAT_CLEARED"):
            self.chat_messages.clear()
            self.seen_message_ids.clear()
            self.render_chat_cards()

        elif t in ("chat_error", "CHAT_ERROR"):
            self.handle_chat_error(m)

        elif t in ("user_joined", "user_left"):
            self.set_users(m.get("users", []))
            if t == "user_left":
                self.cursors.pop(m.get("user"), None)
                self.canvas.delete("cur:" + m.get("user", ""))
            self.status.config(text=f"{m.get('user')} {t.split('_')[1]}")
            who = "You" if m.get("user") == self.user else m.get("user")
            self.add_system_chat(f"{who} {'joined' if t == 'user_joined' else 'left'} the room.")

        elif t == "new_instance":
            inst = m.get("instance")
            if inst:
                if not any(x.get("id") == inst.get("id") for x in self.session_works):
                    self.session_works.append(inst)
                self.update_session_works_btn()
                self.save_board_state()
                author = m.get("author", "Someone")
                self.status.config(text=f"📸 {author} saved instance: '{inst.get('title')}'")
                self.add_system_chat(f"📸 {author} saved instance: '{inst.get('title')}'.")

        elif t == "instance_perm_update":
            self.instance_save_perm = m.get("perm", "everyone")
            allowed = m.get("allowed_users", [])
            self.can_save_instance = (self.is_host or self.instance_save_perm == "everyone" or self.user in allowed)
            self.status.config(text=f"Session Works save permission set to: {self.instance_save_perm}")

        elif t == "instance_deleted":
            iid = m.get("id")
            self.session_works = [x for x in self.session_works if x.get("id") != iid]
            self.update_session_works_btn()
            self.save_board_state()

        elif t == "host_control":
            self.set_users(m.get("users", []))
            self.room_locked = m.get("locked", False)
            self.presentation_mode = m.get("presentation_mode", False)
            self.lock_badge.config(
                text="🔒 Locked" if self.room_locked else ("📢 Presentation" if self.presentation_mode else "🔓 Open"),
                bg="#fef2f2" if self.room_locked else "#f0fdf4",
                fg="#ef4444" if self.room_locked else "#16a34a"
            )

        elif t == "raise_hand":
            self.set_users(m.get("users", []))
            usr = m.get("user")
            if m.get("raised"):
                self.status.config(text=f"✋ {usr} raised their hand")

        elif t == "reaction":
            self.display_floating_reaction(m.get("user", ""), m.get("emoji", "👍"))

        elif t == "kicked":
            messagebox.showerror("Kicked", m.get("text", "You have been kicked from the room."))
            self.root.destroy()

        elif t == "saves":
            names = m.get("names", [])
            if not names:
                messagebox.showinfo("Saved Boards", "No saved boards found on server.")
                return
            n = simpledialog.askstring("Open Board", "Saved boards:\n" + ", ".join(names) + "\n\nEnter name to load:", parent=self.root)
            if n:
                self.net.send({"type": "load", "name": n})

        elif t == "notice":
            txt = m.get("text", "")
            self.status.config(text=txt)
            if "Successfully added" in txt or "Enrolled" in txt:
                messagebox.showinfo("Session Members", txt, parent=self.root)

        elif t == "connected_clients_list":
            if hasattr(self, "_on_clients_list_cb") and self._on_clients_list_cb:
                try:
                    self._on_clients_list_cb(m.get("clients", []))
                except Exception as ex:
                    print(f"[!] Error in clients list callback: {ex}")

        elif t == "users_update":
            self.set_users(m.get("users", []))

        elif t == "error":
            messagebox.showerror("Error", m.get("text", ""))
            if not self.token:
                self.root.destroy()

        # Connection lifecycle
        elif t == "disconnected":
            if m.get("_sock") is not self.net.sock:
                return
            self.online = False
            self.cur_stroke = None
            self.drag0 = None
            self.status.config(text="Connection lost - Reconnecting...")
            self.start_reconnect()

        elif t == "reconnected":
            self.reconnecting = False
            self.last_rx = time.time()
            self.net.send({
                "type": "resume",
                "session": self.session_code,
                "user": self.user,
                "token": self.token,
                "last_seq": self.last_seq
            })

        elif t == "resume_ack":
            self.online = True
            self.resyncing = True
            self.set_users(m.get("users", []))
            if "session_works" in m:
                self.session_works = m.get("session_works", [])
                self.update_session_works_btn()
            if "can_save_instance" in m:
                self.can_save_instance = m.get("can_save_instance", True)
            self.status.config(text="Reconnected - Synchronizing board...")

        elif t == "resume_done":
            self.resyncing = False
            self.render()
            self.status.config(text="Reconnected and synchronized.")

        elif t == "resume_failed":
            messagebox.showerror("Resume Failed", m.get("text", "Session could not be resumed."))
            self.root.destroy()


# ====================================================================
# Workspace Logs & Whiteboards Hub (Desktop Responsive View)
# ====================================================================
class WhiteboardHub:
    """
    Full-Screen Whiteboard Logs & Workspace Hub.
    - Direct start in full-screen/maximized mode (no login dialog popup needed)
    - First Group, then Personal switcher (Group default)
    - Group creation with 2 options:
        1. With Internet (Wi-Fi / LAN)
        2. Without Internet (Option 2: Ad-Hoc / Mobile Hotspot)
    - Dynamic Notification Icon (badge ONLY shown when notifications arrive, not hardcoded)
    - Personal tab: User-created whiteboards only (no default seeds)
    - Profile Details: Edit Name, Mail ID, and Profile Pic only
    - Bottom Dock: Boards, (+) Add, and Profile only
    """
    def __init__(self, config=None):
        saved = load_settings()
        self.config = config or {}
        self.user = self.config.get("user") or saved.get("user") or "User"
        self.email = self.config.get("email") or saved.get("email") or "user@example.com"
        self.avatar_color = self.config.get("avatar_color") or saved.get("avatar_color") or "#0284c7"
        self.profile_pic = self.config.get("profile_pic") or saved.get("profile_pic") or ""
        self.local_ip, self.local_iface = get_local_ip_info()

        # Requirement 1: First Group, then Personal! Default tab is Group.
        self.current_tab = "group"
        self.search_query = ""
        self.discovered_rooms = []
        self.is_scanning = False
        self.notifications = []  # Dynamic notification list (never hardcoded)
        self.photo_cache = {}

        self.root = tk.Tk()
        self.root.title(f"LAN Whiteboard - Workspace Hub - {self.user}")
        self.root.configure(bg="#f8fafc")
        self.root.protocol("WM_DELETE_WINDOW", self.on_hub_close)

        # Full Screen / Maximized window on startup (not small resize mode)
        try:
            self.root.state("zoomed")
        except Exception:
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            self.root.geometry(f"{sw}x{sh}+0+0")

        self.build_top_bar()
        self.build_capsule_switcher()
        self.build_content_area()
        self.build_bottom_dock()

        self.refresh_cards()

        self.presence_sock = None
        self.presence_host = None
        self.start_presence_listener()

    def start_presence_listener(self):
        """Connects presence to active server so host can add this user by username or IP."""
        def _presence_worker():
            candidate_ips = ["127.0.0.1", self.local_ip]
            for b in BoardManager.list_boards(board_type="group"):
                h = b.get("host")
                if h and h not in candidate_ips:
                    candidate_ips.append(h)

            for target in candidate_ips:
                try:
                    s = socket.create_connection((target, PORT), timeout=1.0)
                    s.settimeout(None)
                    s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                    reg_msg = json.dumps({
                        "type": "register_presence",
                        "user": self.user,
                        "avatar_color": self.avatar_color,
                        "email": self.email
                    }) + "\n"
                    s.sendall(reg_msg.encode("utf-8"))
                    self.presence_sock = s
                    self.presence_host = target

                    f = s.makefile("r", encoding="utf-8")
                    while True:
                        line = f.readline()
                        if not line:
                            break
                        try:
                            msg = json.loads(line)
                            if msg.get("type") == "join_ack" and msg.get("added_by_host"):
                                self.root.after(0, lambda m=msg, th=target: self._on_hub_invite_received(m, th))
                        except Exception:
                            continue
                    break
                except Exception:
                    continue

        threading.Thread(target=_presence_worker, daemon=True).start()

    def _on_hub_invite_received(self, msg, server_host):
        code = msg.get("session") or msg.get("code")
        title = msg.get("title") or f"Room {code}"
        host_name = msg.get("added_by") or "Host"
        b_data = BoardManager.create_board(
            title=title,
            board_type="group",
            code=code,
            host=server_host,
            is_host=False,
            actions=msg.get("actions", []),
            instances=msg.get("session_works", [])
        )
        self.refresh_cards()
        self.add_notification("Session Invitation", f"You were added to '{title}' by {host_name}!")
        ans = messagebox.askyesno(
            "Whiteboard Invitation",
            f"Host {host_name} has added you to the collaborative whiteboard session:\n\n"
            f"📌 {title} (Code: {code})\n\n"
            f"Would you like to open this whiteboard now?",
            parent=self.root
        )
        if ans:
            self.join_room_direct(code, server_host)

    def on_hub_close(self):
        try:
            if hasattr(self, "presence_sock") and self.presence_sock:
                self.presence_sock.close()
        except Exception:
            pass
        cleanup_embedded_server()
        self.root.destroy()

    # ----------------------------------------------------------------
    # Top Header Bar
    # ----------------------------------------------------------------
    def build_top_bar(self):
        top = tk.Frame(self.root, bg="#ffffff", highlightthickness=1, highlightbackground="#e2e8f0", padx=24, pady=12)
        top.pack(side="top", fill="x")

        # Left: App Brand & Title
        left = tk.Frame(top, bg="#ffffff")
        left.pack(side="left")

        logo_cv = tk.Canvas(left, width=32, height=32, bg="#ffffff", highlightthickness=0)
        logo_cv.pack(side="left", padx=(0, 10))
        logo_cv.create_arc(2, 6, 30, 32, start=0, extent=180, fill="#2563eb", outline="")

        t_box = tk.Frame(left, bg="#ffffff")
        t_box.pack(side="left")
        tk.Label(t_box, text="Whiteboard Logs", font=("Segoe UI", 16, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(t_box, text="Group & Personal Workspaces", font=("Segoe UI", 8), bg="#ffffff", fg="#71717a").pack(anchor="w")

        # Right: Search Box + Dynamic Bell Badge + Refresh
        right = tk.Frame(top, bg="#ffffff")
        right.pack(side="right")

        # Search Bar
        search_wrap = tk.Frame(right, bg="#f4f4f5", highlightthickness=1, highlightbackground="#e4e4e7", padx=8, pady=4)
        search_wrap.pack(side="left", padx=(0, 14))

        tk.Label(search_wrap, text="🔍", font=("Segoe UI", 9), bg="#f4f4f5", fg="#71717a").pack(side="left", padx=(2, 6))
        self.e_search = tk.Entry(search_wrap, font=("Segoe UI", 9), bg="#f4f4f5", fg="#09090b",
                                 relief="flat", bd=0, insertbackground="#09090b", width=22)
        self.e_search.pack(side="left")
        self.e_search.insert(0, "Search whiteboards...")
        self.e_search.bind("<FocusIn>", lambda e: self.e_search.delete(0, "end") if self.e_search.get() == "Search whiteboards..." else None)
        self.e_search.bind("<FocusOut>", lambda e: self.e_search.insert(0, "Search whiteboards...") if not self.e_search.get().strip() else None)
        self.e_search.bind("<KeyRelease>", self._on_search_changed)

        # Import Shared Session (.lwb bundle)
        btn_import = tk.Button(right, text="📥 Import Shared Session", font=("Segoe UI", 8, "bold"), bg="#f0fdf4", fg="#16a34a",
                               highlightthickness=1, highlightbackground="#86efac", relief="flat", bd=0, padx=8, pady=4, cursor="hand2",
                               command=self.import_session_bundle)
        btn_import.pack(side="left", padx=(0, 10))
        Tip(btn_import, "Import a shared whiteboard bundle (.lwb) to view all saved instances and drawing history")

        # Dynamic Notification Bell (Numbers ONLY shown when actual notifications arrive!)
        self.bell_cv = tk.Canvas(right, width=36, height=36, bg="#ffffff", highlightthickness=0, cursor="hand2")
        self.bell_cv.pack(side="left", padx=(0, 8))
        self.bell_cv.bind("<Button-1>", lambda e: self.show_notifications())
        self.redraw_bell()

        # Refresh button
        btn_ref = tk.Button(right, text="🔄", font=("Segoe UI", 10), bg="#f4f4f5", fg="#27272a",
                            relief="flat", bd=0, padx=8, pady=4, cursor="hand2", command=self.refresh_cards)
        btn_ref.pack(side="left")

    def import_session_bundle(self):
        """Allows importing an exported .lwb bundle file from another user."""
        path = filedialog.askopenfilename(
            title="Import Shared Whiteboard Session",
            filetypes=[("LAN Whiteboard Bundle", "*.lwb"), ("JSON File", "*.json"), ("All Files", "*.*")]
        )
        if not path:
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                bundle = json.load(f)
            if not isinstance(bundle, dict) or "actions" not in bundle:
                messagebox.showerror("Import Error", "Selected file is not a valid whiteboard session bundle.")
                return

            title = bundle.get("title", "Imported Session")
            b_data = BoardManager.create_board(
                title=f"{title} (Imported)",
                board_type="personal",
                actions=bundle.get("actions", []),
                instances=bundle.get("instances", [])
            )
            self.switch_tab("personal")
            self.refresh_cards()
            inst_len = len(bundle.get("instances", []))
            act_len = len(bundle.get("actions", []))
            messagebox.showinfo(
                "Session Imported",
                f"Successfully imported '{title}' into Personal Space!\n- {inst_len} Saved Instances\n- {act_len} Drawing History Elements\n\nOpening imported whiteboard..."
            )
            self.open_offline_board(b_data["id"], b_data["title"])
        except Exception as e:
            messagebox.showerror("Import Error", f"Failed to import whiteboard bundle: {e}")

    def redraw_bell(self):
        """Redraws the bell icon. Badge number is ONLY displayed if count > 0!"""
        self.bell_cv.delete("all")
        self.bell_cv.create_text(18, 18, text="🔔", font=("Segoe UI", 13))
        count = len(self.notifications)
        if count > 0:
            self.bell_cv.create_oval(19, 3, 33, 17, fill="#ef4444", outline="#ffffff", width=2)
            self.bell_cv.create_text(26, 10, text=str(count if count <= 9 else "9+"), font=("Segoe UI", 7, "bold"), fill="#ffffff")

    def add_notification(self, title, message):
        self.notifications.append({
            "title": title,
            "message": message,
            "time": time.strftime("%I:%M %p")
        })
        self.redraw_bell()

    def show_notifications(self):
        if not self.notifications:
            messagebox.showinfo("Notifications", "You have no new notifications.", parent=self.root)
            return

        win = tk.Toplevel(self.root)
        win.title("Notifications")
        win.geometry("400x320")
        win.resizable(False, False)
        win.configure(bg="#ffffff")
        win.transient(self.root)

        tk.Label(win, text="🔔 Notifications", font=("Segoe UI", 14, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w", padx=20, pady=(16, 8))
        box = tk.Frame(win, bg="#ffffff", padx=20)
        box.pack(fill="both", expand=True)

        for n in reversed(self.notifications):
            item = tk.Frame(box, bg="#f8fafc", highlightthickness=1, highlightbackground="#e2e8f0", padx=10, pady=8)
            item.pack(fill="x", pady=4)
            tk.Label(item, text=f"{n['title']} ({n['time']})", font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#0f172a").pack(anchor="w")
            tk.Label(item, text=n["message"], font=("Segoe UI", 8), bg="#f8fafc", fg="#64748b").pack(anchor="w")

        def clear_notifs():
            self.notifications.clear()
            self.redraw_bell()
            win.destroy()

        btn_box = tk.Frame(win, bg="#ffffff", padx=20, pady=12)
        btn_box.pack(fill="x")
        tk.Button(btn_box, text="Mark All as Read", font=("Segoe UI", 9, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=12, pady=6, cursor="hand2", command=clear_notifs).pack(side="right")

    def _on_search_changed(self, _e):
        val = self.e_search.get().strip()
        self.search_query = "" if val == "Search whiteboards..." else val.lower()
        self.refresh_cards()

    # ----------------------------------------------------------------
    # Requirement 1: Capsule Switcher: FIRST GROUP, THEN PERSONAL
    # ----------------------------------------------------------------
    def build_capsule_switcher(self):
        box = tk.Frame(self.root, bg="#f8fafc", pady=12)
        box.pack(fill="x")

        self.capsule = tk.Frame(box, bg="#e4e4e7", highlightthickness=1, highlightbackground="#d4d4d8", padx=3, pady=3)
        self.capsule.pack(anchor="center")

        # GROUP FIRST (Left)
        self.btn_grp = tk.Button(self.capsule, text="Group", font=("Segoe UI", 10, "bold"),
                                 relief="flat", bd=0, padx=30, pady=6, cursor="hand2",
                                 command=lambda: self.switch_tab("group"))
        self.btn_grp.pack(side="left")

        # PERSONAL SECOND (Right)
        self.btn_pers = tk.Button(self.capsule, text="Personal", font=("Segoe UI", 10),
                                  relief="flat", bd=0, padx=30, pady=6, cursor="hand2",
                                  command=lambda: self.switch_tab("personal"))
        self.btn_pers.pack(side="left")

        self._update_capsule_style()

    def switch_tab(self, tab):
        self.current_tab = tab
        self._update_capsule_style()
        self.refresh_cards()

    def _update_capsule_style(self):
        if self.current_tab == "group":
            self.btn_grp.config(bg="#14b8a6", fg="#ffffff", font=("Segoe UI", 10, "bold"))
            self.btn_pers.config(bg="#e4e4e7", fg="#71717a", font=("Segoe UI", 10))
        else:
            self.btn_grp.config(bg="#e4e4e7", fg="#71717a", font=("Segoe UI", 10))
            self.btn_pers.config(bg="#14b8a6", fg="#ffffff", font=("Segoe UI", 10, "bold"))

    # ----------------------------------------------------------------
    # Scrollable Content Area
    # ----------------------------------------------------------------
    def build_content_area(self):
        container = tk.Frame(self.root, bg="#f8fafc")
        container.pack(fill="both", expand=True, padx=28, pady=(0, 6))

        self.canvas = tk.Canvas(container, bg="#f8fafc", highlightthickness=0)
        self.scrollbar = ttk.Scrollbar(container, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.cards_frame = tk.Frame(self.canvas, bg="#f8fafc")
        self.win_id = self.canvas.create_window((0, 0), window=self.cards_frame, anchor="nw")

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfig(self.win_id, width=e.width))
        self.cards_frame.bind("<Configure>", lambda e: self.canvas.config(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind_all("<MouseWheel>", lambda e: self.canvas.yview_scroll(int(-1 * (e.delta / 120)), "units") if self.canvas.winfo_exists() else None)

    def refresh_cards(self):
        for w in self.cards_frame.winfo_children():
            w.destroy()

        if self.current_tab == "group":
            self.render_group_tab()
        else:
            self.render_personal_tab()

    # ----------------------------------------------------------------
    # Group Tab: 2 Creation Options + Join Options
    # 1. With Internet
    # 2. Without Internet (Option 2)
    # ----------------------------------------------------------------
    def render_group_tab(self):
        # Section 1: Create Group Whiteboard with 2 options
        create_card = tk.Frame(self.cards_frame, bg="#ffffff", highlightthickness=2, highlightbackground="#27272a", padx=24, pady=20)
        create_card.pack(fill="x", padx=16, pady=8)

        tk.Label(create_card, text="Create Group Whiteboard", font=("Segoe UI", 13, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(create_card, text="Choose your connection mode to host a collaborative whiteboard for your peers:",
                 font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(2, 16))

        # 2 Option Cards Container
        grid_frame = tk.Frame(create_card, bg="#ffffff")
        grid_frame.pack(fill="x")
        grid_frame.columnconfigure(0, weight=1, uniform="opts")
        grid_frame.columnconfigure(1, weight=1, uniform="opts")

        # Option 1: With Internet
        opt1 = tk.Frame(grid_frame, bg="#f8fafc", highlightthickness=1, highlightbackground="#cbd5e1", padx=14, pady=14)
        opt1.grid(row=0, column=0, padx=6, sticky="nsew")
        tk.Label(opt1, text="🌐 With Internet", font=("Segoe UI", 11, "bold"), bg="#f8fafc", fg="#1e40af").pack(anchor="w")
        tk.Label(opt1, text="Wi-Fi / Local Router", font=("Segoe UI", 8, "bold"), bg="#dbeafe", fg="#1e40af", padx=6, pady=1).pack(anchor="w", pady=(3, 6))
        tk.Label(opt1, text="Host over your home, school, or office Wi-Fi router. Accessible to all devices on the network.",
                 font=("Segoe UI", 8), bg="#f8fafc", fg="#64748b", wraplength=220, justify="left").pack(anchor="w", pady=(0, 8))
        tk.Label(opt1, text=f"📍 Active: {self.local_ip} ({self.local_iface})",
                 font=("Segoe UI", 8, "bold"), bg="#f8fafc", fg="#2563eb").pack(anchor="w", pady=(0, 10))
        tk.Button(opt1, text="Host on Wi-Fi", font=("Segoe UI", 9, "bold"), bg="#2563eb", fg="#ffffff",
                  relief="flat", bd=0, padx=14, pady=6, cursor="hand2", command=self.host_with_internet).pack(anchor="w")

        # Option 2: Without Internet (Option 2: Ad-Hoc / Mobile Hotspot)
        opt2 = tk.Frame(grid_frame, bg="#f0fdf4", highlightthickness=1, highlightbackground="#86efac", padx=14, pady=14)
        opt2.grid(row=0, column=1, padx=6, sticky="nsew")
        tk.Label(opt2, text="⚡ Without Internet", font=("Segoe UI", 11, "bold"), bg="#f0fdf4", fg="#166534").pack(anchor="w")
        tk.Label(opt2, text="Option 2: Ad-Hoc Hotspot", font=("Segoe UI", 8, "bold"), bg="#bbf7d0", fg="#166534", padx=6, pady=1).pack(anchor="w", pady=(3, 6))
        tk.Label(opt2, text="Zero-infrastructure peer-to-peer. Connect laptops via Windows Hotspot or Ethernet with NO internet.",
                 font=("Segoe UI", 8), bg="#f0fdf4", fg="#15803d", wraplength=220, justify="left").pack(anchor="w", pady=(0, 8))
        tk.Label(opt2, text=f"📍 Active: {self.local_ip} ({self.local_iface})",
                 font=("Segoe UI", 8, "bold"), bg="#f0fdf4", fg="#16a34a").pack(anchor="w", pady=(0, 10))
        tk.Button(opt2, text="1-Click Host", font=("Segoe UI", 9, "bold"), bg="#16a34a", fg="#ffffff",
                  relief="flat", bd=0, padx=14, pady=6, cursor="hand2", command=self.host_without_internet).pack(anchor="w")

        # Section 2: Join Existing Room
        join_card = tk.Frame(self.cards_frame, bg="#ffffff", highlightthickness=2, highlightbackground="#27272a", padx=24, pady=18)
        join_card.pack(fill="x", padx=16, pady=12)

        tk.Label(join_card, text="Join Active Room", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(join_card, text="Connect to a whiteboard room hosted on your network:", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(2, 10))

        btn_row = tk.Frame(join_card, bg="#ffffff")
        btn_row.pack(anchor="w", pady=(0, 8))

        tk.Button(btn_row, text="🔗 Join with Code & IP", font=("Segoe UI", 9, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=16, pady=7, cursor="hand2", command=self.join_room_dialog).pack(side="left", padx=(0, 8))

        scan_txt = "⏳ Scanning..." if self.is_scanning else "📡 Scan LAN Network"
        tk.Button(btn_row, text=scan_txt, font=("Segoe UI", 9, "bold"), bg="#0284c7", fg="#ffffff",
                  relief="flat", bd=0, padx=16, pady=7, cursor="hand2", command=self.scan_lan_rooms).pack(side="left")

        # Discovered rooms list
        if self.discovered_rooms:
            tk.Label(join_card, text="Discovered LAN Rooms on Network:", font=("Segoe UI", 10, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w", pady=(10, 4))
            for r in self.discovered_rooms:
                self.draw_room_row(join_card, r)

        # Section 3: Saved Group Whiteboards (Group Logs)
        group_logs_card = tk.Frame(self.cards_frame, bg="#ffffff", highlightthickness=2, highlightbackground="#27272a", padx=24, pady=18)
        group_logs_card.pack(fill="x", padx=16, pady=(4, 16))

        tk.Label(group_logs_card, text="👥 Saved Group Whiteboards", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(group_logs_card, text="Whiteboards you created or joined. Rejoin, share code, or continue collaborating:",
                 font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(2, 12))

        group_boards = BoardManager.list_boards(board_type="group")
        if self.search_query:
            group_boards = [b for b in group_boards if self.search_query in b.get("title", "").lower() or self.search_query in b.get("code", "").lower()]

        if not group_boards:
            no_grp = tk.Frame(group_logs_card, bg="#f8fafc", highlightthickness=1, highlightbackground="#e2e8f0", padx=20, pady=24)
            no_grp.pack(fill="x", pady=6)
            tk.Label(no_grp, text="👥 No Saved Group Whiteboards Yet", font=("Segoe UI", 11, "bold"), bg="#f8fafc", fg="#334155").pack(pady=(0, 4))
            tk.Label(no_grp, text="When you create or join a whiteboard session, it will be automatically saved here for instant rejoining.",
                     font=("Segoe UI", 9), bg="#f8fafc", fg="#64748b").pack()
        else:
            for b in group_boards:
                self.draw_group_board_card(group_logs_card, b)

    def draw_room_row(self, parent, r):
        code = r.get("code", "VOXB")
        host = r.get("host", "Host")
        ip = r.get("ip", "127.0.0.1")
        users = r.get("users", 1)

        row = tk.Frame(parent, bg="#f8fafc", highlightthickness=1, highlightbackground="#e2e8f0", padx=12, pady=8)
        row.pack(fill="x", pady=3)

        tk.Label(row, text=f"Room {code}   ·   Host: {host}   ·   IP: {ip}   ·   ({users} users)",
                 font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#0f172a").pack(side="left")

        tk.Button(row, text="Connect", font=("Segoe UI", 9, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=12, pady=3, cursor="hand2",
                  command=lambda c=code, h=ip: self.join_room_direct(code=c, host=h)).pack(side="right")

    def draw_group_board_card(self, parent, b):
        bid = b.get("id")
        title = b.get("title", "Group Whiteboard")
        code = b.get("code", "")
        host = b.get("host", "127.0.0.1")
        is_host = b.get("is_host", False)
        color = b.get("color", "#0284c7")
        count = b.get("count", len(b.get("actions", [])))
        time_str = b.get("updated_at") or b.get("time") or time.strftime("%I:%M %p")

        card = tk.Frame(parent, bg="#ffffff", highlightthickness=1, highlightbackground="#e2e8f0", padx=16, pady=12)
        card.pack(fill="x", pady=6)

        av_cv = tk.Canvas(card, width=50, height=50, bg="#ffffff", highlightthickness=0, cursor="hand2")
        av_cv.pack(side="left", padx=(0, 14))
        av_cv.create_oval(4, 4, 46, 46, fill=color, outline="")
        words = title.split()
        inits = (words[0][:1] + (words[1][:1] if len(words) > 1 else words[0][1:2])).upper() if words else (code[:2] if code else "GW")
        av_cv.create_text(25, 25, text=inits, font=("Segoe UI", 11, "bold"), fill="#ffffff")

        mid = tk.Frame(card, bg="#ffffff")
        mid.pack(side="left", fill="both", expand=True)

        t_lbl = tk.Label(mid, text=title, font=("Segoe UI", 11, "bold"), bg="#ffffff", fg="#09090b", anchor="w")
        t_lbl.pack(fill="x")

        meta_row = tk.Frame(mid, bg="#ffffff")
        meta_row.pack(fill="x", pady=(3, 0))

        # Role badge
        role_txt = "👑 Host" if is_host else "👥 Joined"
        role_bg = "#dbeafe" if is_host else "#f1f5f9"
        role_fg = "#1e40af" if is_host else "#475569"
        tk.Label(meta_row, text=role_txt, font=("Segoe UI", 8, "bold"), bg=role_bg, fg=role_fg, padx=6, pady=1).pack(side="left", padx=(0, 8))

        # Code badge
        if code:
            code_f = tk.Frame(meta_row, bg="#f3f4f6", padx=5, pady=1)
            code_f.pack(side="left", padx=(0, 8))
            tk.Label(code_f, text=f"Code: {code}", font=("Consolas", 8, "bold"), bg="#f3f4f6", fg="#0f172a").pack(side="left")

        # IP and element count
        tk.Label(meta_row, text=f"IP: {host}  ·  {count} elements", font=("Segoe UI", 8), bg="#ffffff", fg="#64748b").pack(side="left")

        right = tk.Frame(card, bg="#ffffff")
        right.pack(side="right", padx=(10, 0))

        ts_row = tk.Frame(right, bg="#ffffff")
        ts_row.pack(anchor="e")
        tk.Label(ts_row, text=f"✓ {time_str}", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#16a34a").pack(side="left")

        btn_row = tk.Frame(right, bg="#ffffff")
        btn_row.pack(anchor="e", pady=(4, 0))

        tk.Button(btn_row, text="Rejoin / Open", font=("Segoe UI", 9, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=12, pady=3, cursor="hand2",
                  command=lambda b=b: self.open_saved_group_board(b)).pack(side="left", padx=2)

        if code:
            tk.Button(btn_row, text="📋 Code", font=("Segoe UI", 8), bg="#f4f4f5", fg="#27272a",
                      relief="flat", bd=0, padx=6, pady=3, cursor="hand2",
                      command=lambda c=code: self.copy_code_to_clipboard(c)).pack(side="left", padx=2)

        tk.Button(btn_row, text="✎", font=("Segoe UI", 9), bg="#f4f4f5", fg="#27272a",
                  relief="flat", bd=0, padx=6, pady=3, cursor="hand2",
                  command=lambda bid=bid, t=title: self.rename_board_dialog(bid, t)).pack(side="left", padx=2)

        tk.Button(btn_row, text="🗑", font=("Segoe UI", 9), bg="#fee2e2", fg="#dc2626",
                  relief="flat", bd=0, padx=6, pady=3, cursor="hand2",
                  command=lambda bid=bid, t=title: self.delete_board_dialog(bid, t)).pack(side="left", padx=2)

    # ----------------------------------------------------------------
    # Personal Tab (User-created boards only, no default seeds)
    # ----------------------------------------------------------------
    def render_personal_tab(self):
        banner = tk.Frame(self.cards_frame, bg="#f0fdf4", highlightthickness=1, highlightbackground="#bbf7d0", padx=16, pady=10)
        banner.pack(fill="x", padx=16, pady=(4, 12))

        b_left = tk.Frame(banner, bg="#f0fdf4")
        b_left.pack(side="left", fill="x", expand=True)
        tk.Label(b_left, text="📝 Personal Offline Whiteboards", font=("Segoe UI", 10, "bold"), bg="#f0fdf4", fg="#166534").pack(anchor="w")
        tk.Label(b_left, text="Create and manage your private whiteboards. Zero network or server dependency.",
                 font=("Segoe UI", 8), bg="#f0fdf4", fg="#15803d").pack(anchor="w")

        btn_add = tk.Button(banner, text="+ New Whiteboard", font=("Segoe UI", 9, "bold"), bg="#16a34a", fg="#ffffff",
                            relief="flat", bd=0, padx=14, pady=6, cursor="hand2", command=self.create_new_whiteboard)
        btn_add.pack(side="right")

        boards = BoardManager.list_boards(board_type="personal")
        if self.search_query:
            boards = [b for b in boards if self.search_query in b.get("title", "").lower()]

        # Clean empty state when user has not created any board yet
        if not boards:
            empty_box = tk.Frame(self.cards_frame, bg="#ffffff", highlightthickness=2, highlightbackground="#27272a", padx=30, pady=36)
            empty_box.pack(fill="x", padx=16, pady=20)
            tk.Label(empty_box, text="📝 No Personal Whiteboards Yet", font=("Segoe UI", 13, "bold"), bg="#ffffff", fg="#09090b").pack(pady=(0, 6))
            tk.Label(empty_box, text="Your offline whiteboards will appear here. Create multiple boards just like Apple Notes.",
                     font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(pady=(0, 14))
            tk.Button(empty_box, text="+ Create Whiteboard", font=("Segoe UI", 10, "bold"), bg="#18181b", fg="#ffffff",
                      relief="flat", bd=0, padx=18, pady=8, cursor="hand2", command=self.create_new_whiteboard).pack()
            return

        for b in boards:
            self.draw_board_card(b)

    def draw_board_card(self, b):
        bid = b.get("id")
        title = b.get("title", "Untitled Whiteboard")
        color = b.get("color", "#0d9488")
        count = b.get("count", len(b.get("actions", [])))
        time_str = b.get("updated_at") or b.get("time") or time.strftime("%I:%M %p")

        card = tk.Frame(self.cards_frame, bg="#ffffff", highlightthickness=2, highlightbackground="#27272a", padx=16, pady=12)
        card.pack(fill="x", padx=16, pady=6)

        av_cv = tk.Canvas(card, width=54, height=54, bg="#ffffff", highlightthickness=0, cursor="hand2")
        av_cv.pack(side="left", padx=(0, 14))
        av_cv.create_oval(6, 6, 48, 48, fill=color, outline="")
        words = title.split()
        inits = (words[0][:1] + (words[1][:1] if len(words) > 1 else words[0][1:2])).upper() if words else "WB"
        av_cv.create_text(27, 27, text=inits, font=("Segoe UI", 11, "bold"), fill="#ffffff")
        av_cv.create_oval(36, 6, 48, 18, fill="#22c55e", outline="#ffffff", width=2)

        mid = tk.Frame(card, bg="#ffffff", cursor="hand2")
        mid.pack(side="left", fill="both", expand=True)

        t_lbl = tk.Label(mid, text=title, font=("Segoe UI", 11, "bold"), bg="#ffffff", fg="#09090b", anchor="w")
        t_lbl.pack(fill="x")

        s_lbl = tk.Label(mid, text=f"{count} drawing elements · Offline Notes mode", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a", anchor="w")
        s_lbl.pack(fill="x", pady=(2, 0))

        right = tk.Frame(card, bg="#ffffff")
        right.pack(side="right", padx=(10, 0))

        ts_row = tk.Frame(right, bg="#ffffff")
        ts_row.pack(anchor="e")
        tk.Label(ts_row, text=f"✓ {time_str}", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#16a34a").pack(side="left")

        badge_row = tk.Frame(right, bg="#ffffff")
        badge_row.pack(anchor="e", pady=(3, 3))
        bg_color = "#22c55e" if count > 0 else "#94a3b8"
        tk.Label(badge_row, text=f" {count} ", font=("Segoe UI", 8, "bold"), bg=bg_color, fg="#ffffff", padx=6, pady=1).pack(side="right")

        btn_row = tk.Frame(right, bg="#ffffff")
        btn_row.pack(anchor="e")

        tk.Button(btn_row, text="Open", font=("Segoe UI", 9, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=12, pady=3, cursor="hand2",
                  command=lambda bid=bid, t=title: self.open_offline_board(bid, t)).pack(side="left", padx=2)

        tk.Button(btn_row, text="✎", font=("Segoe UI", 9), bg="#f4f4f5", fg="#27272a",
                  relief="flat", bd=0, padx=6, pady=3, cursor="hand2",
                  command=lambda bid=bid, t=title: self.rename_board_dialog(bid, t)).pack(side="left", padx=2)

        tk.Button(btn_row, text="🗑", font=("Segoe UI", 9), bg="#fef2f2", fg="#dc2626",
                  relief="flat", bd=0, padx=6, pady=3, cursor="hand2",
                  command=lambda bid=bid, t=title: self.delete_board_dialog(bid, t)).pack(side="left", padx=2)

        for widget in (card, mid, t_lbl, s_lbl, av_cv):
            widget.bind("<Double-Button-1>", lambda e, bid=bid, t=title: self.open_offline_board(bid, t))

    # ----------------------------------------------------------------
    # Bottom Dock: Only Boards, Add (+), and Profile!
    # ----------------------------------------------------------------
    def build_bottom_dock(self):
        dock_wrap = tk.Frame(self.root, bg="#ffffff", highlightthickness=1, highlightbackground="#e2e8f0", height=66)
        dock_wrap.pack(side="bottom", fill="x")

        dock = tk.Frame(dock_wrap, bg="#ffffff")
        dock.pack(anchor="center", pady=6)

        # 1. Boards Tab (Left)
        b1 = tk.Frame(dock, bg="#ffffff", cursor="hand2", padx=36)
        b1.pack(side="left")
        tk.Label(b1, text="💬", font=("Segoe UI", 15), bg="#ffffff", fg="#14b8a6").pack()
        tk.Label(b1, text="Boards", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#14b8a6").pack()
        b1.bind("<Button-1>", lambda e: self.toggle_boards_tab())

        # 2. Center Floating Red Plus Button (Add Whiteboard)
        add_box = tk.Frame(dock, bg="#ffffff", cursor="hand2", padx=24)
        add_box.pack(side="left")

        add_cv = tk.Canvas(add_box, width=46, height=46, bg="#ffffff", highlightthickness=0, cursor="hand2")
        add_cv.pack()
        add_cv.create_oval(3, 3, 43, 43, fill="#ef4444", outline="")
        add_cv.create_text(23, 21, text="+", font=("Segoe UI", 20, "bold"), fill="#ffffff")
        add_cv.bind("<Button-1>", lambda e: self.on_add_button_clicked())
        add_box.bind("<Button-1>", lambda e: self.on_add_button_clicked())

        tk.Label(add_box, text="Add", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#ef4444").pack()

        # 3. Profile Tab (Right)
        b_prof = tk.Frame(dock, bg="#ffffff", cursor="hand2", padx=36)
        b_prof.pack(side="left")

        self.prof_dock_cv = tk.Canvas(b_prof, width=28, height=28, bg="#ffffff", highlightthickness=0, cursor="hand2")
        self.prof_dock_cv.pack()
        self.redraw_dock_profile_icon()

        self.lbl_dock_user = tk.Label(b_prof, text=self.user, font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#27272a")
        self.lbl_dock_user.pack()

        b_prof.bind("<Button-1>", lambda e: self.show_profile_dialog())
        self.prof_dock_cv.bind("<Button-1>", lambda e: self.show_profile_dialog())
        self.lbl_dock_user.bind("<Button-1>", lambda e: self.show_profile_dialog())

    def redraw_dock_profile_icon(self):
        self.prof_dock_cv.delete("all")
        if self.profile_pic and os.path.exists(self.profile_pic):
            try:
                img = tk.PhotoImage(file=self.profile_pic)
                self.photo_cache["dock"] = img
                self.prof_dock_cv.create_image(14, 14, image=img)
                return
            except Exception:
                pass
        self.prof_dock_cv.create_oval(2, 2, 26, 26, fill=self.avatar_color, outline="")
        inits = (self.user[:2] if len(self.user) >= 2 else self.user[:1]).upper()
        self.prof_dock_cv.create_text(14, 14, text=inits, font=("Segoe UI", 8, "bold"), fill="#ffffff")

    def toggle_boards_tab(self):
        new_tab = "personal" if self.current_tab == "group" else "group"
        self.switch_tab(new_tab)

    # ----------------------------------------------------------------
    # Profile Details Modal: ONLY Name, Mail ID, and Profile Pic
    # ----------------------------------------------------------------
    def show_profile_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Profile Details")
        win.geometry("420x510")
        win.resizable(False, False)
        win.configure(bg="#ffffff")
        win.transient(self.root)
        win.grab_set()

        self.root.update_idletasks()
        rx, ry = self.root.winfo_rootx(), self.root.winfo_rooty()
        rw, rh = self.root.winfo_width(), self.root.winfo_height()
        win.geometry(f"+{max(0, rx + (rw - 420) // 2)}+{max(0, ry + (rh - 510) // 2)}")

        card = tk.Frame(win, bg="#ffffff", padx=28, pady=20)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="Profile Details", font=("Segoe UI", 16, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(card, text="Manage your profile name, email, and photo", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(2, 16))

        # 1. Profile Picture
        pic_box = tk.Frame(card, bg="#ffffff")
        pic_box.pack(fill="x", pady=(0, 14))

        pic_inner = tk.Frame(pic_box, bg="#ffffff")
        pic_inner.pack(anchor="center")

        preview_cv = tk.Canvas(pic_inner, width=74, height=74, bg="#ffffff", highlightthickness=0)
        preview_cv.pack(side="left", padx=(0, 14))

        chosen_pic = [self.profile_pic]
        chosen_color = [self.avatar_color]

        def draw_preview():
            preview_cv.delete("all")
            p = chosen_pic[0]
            if p and os.path.exists(p):
                try:
                    img = tk.PhotoImage(file=p)
                    self.photo_cache["modal_preview"] = img
                    preview_cv.create_image(37, 37, image=img)
                    return
                except Exception:
                    pass
            preview_cv.create_oval(3, 3, 71, 71, fill=chosen_color[0], outline="#e4e4e7", width=2)
            u = v_name.get().strip() or self.user
            inits = (u[:2] if len(u) >= 2 else u[:1]).upper()
            preview_cv.create_text(37, 37, text=inits, font=("Segoe UI", 16, "bold"), fill="#ffffff")

        def pick_file():
            fn = filedialog.askopenfilename(
                title="Select Profile Picture",
                filetypes=[("Image Files", "*.png;*.gif;*.ppm;*.jpg;*.jpeg"), ("PNG Files", "*.png"), ("GIF Files", "*.gif")],
                parent=win
            )
            if fn:
                chosen_pic[0] = fn
                draw_preview()

        def pick_col(c):
            chosen_color[0] = c
            chosen_pic[0] = ""
            draw_preview()

        btn_pick_pic = tk.Button(pic_inner, text="📷 Choose Picture...", font=("Segoe UI", 9, "bold"),
                                 bg="#f4f4f5", fg="#27272a", relief="flat", bd=0, padx=12, pady=6, cursor="hand2", command=pick_file)
        btn_pick_pic.pack(side="left", pady=10)

        # Avatar Swatches row
        swatch_frame = tk.Frame(card, bg="#ffffff")
        swatch_frame.pack(fill="x", pady=(0, 14))
        tk.Label(swatch_frame, text="Or choose an avatar color:", font=("Segoe UI", 8), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(0, 4))
        sw_row = tk.Frame(swatch_frame, bg="#ffffff")
        sw_row.pack(anchor="w")
        swatch_colors = ["#0284c7", "#16a34a", "#e11d48", "#d97706", "#7c3aed", "#059669", "#0891b2", "#18181b"]
        for c in swatch_colors:
            cv = tk.Canvas(sw_row, width=22, height=22, bg="#ffffff", highlightthickness=0, cursor="hand2")
            cv.pack(side="left", padx=3)
            cv.create_oval(2, 2, 20, 20, fill=c, outline="")
            cv.bind("<Button-1>", lambda e, col=c: pick_col(col))

        # 2. Name Field
        tk.Label(card, text="Name", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#27272a").pack(anchor="w", pady=(0, 4))
        v_name = tk.StringVar(value=self.user)
        wrap_name = tk.Frame(card, bg="#ffffff", highlightthickness=1, highlightbackground="#e4e4e7", padx=8, pady=4)
        wrap_name.pack(fill="x", pady=(0, 12))
        e_name = tk.Entry(wrap_name, textvariable=v_name, font=("Segoe UI", 10), relief="flat", bg="#ffffff", fg="#09090b", insertbackground="#09090b")
        e_name.pack(fill="x")
        v_name.trace_add("write", lambda *args: draw_preview())

        # 3. Mail ID Field
        tk.Label(card, text="Mail ID", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#27272a").pack(anchor="w", pady=(0, 4))
        v_email = tk.StringVar(value=self.email)
        wrap_email = tk.Frame(card, bg="#ffffff", highlightthickness=1, highlightbackground="#e4e4e7", padx=8, pady=4)
        wrap_email.pack(fill="x", pady=(0, 20))
        e_email = tk.Entry(wrap_email, textvariable=v_email, font=("Segoe UI", 10), relief="flat", bg="#ffffff", fg="#09090b", insertbackground="#09090b")
        e_email.pack(fill="x")

        draw_preview()

        def on_save():
            name_val = v_name.get().strip()
            email_val = v_email.get().strip()
            if not name_val:
                messagebox.showerror("Error", "Please enter your name.", parent=win)
                return

            self.user = name_val
            self.email = email_val
            self.profile_pic = chosen_pic[0]
            self.avatar_color = chosen_color[0]

            self.config["user"] = self.user
            self.config["email"] = self.email
            self.config["profile_pic"] = self.profile_pic
            self.config["avatar_color"] = self.avatar_color

            save_settings({
                "user": self.user,
                "email": self.email,
                "profile_pic": self.profile_pic,
                "avatar_color": self.avatar_color,
                "host": self.config.get("host", "127.0.0.1")
            })

            self.lbl_dock_user.config(text=self.user)
            self.redraw_dock_profile_icon()
            self.root.title(f"LAN Whiteboard - Workspace Hub - {self.user}")
            win.destroy()
            self.add_notification("Profile Updated", "Your profile details have been saved.")

        btn_box = tk.Frame(card, bg="#ffffff")
        btn_box.pack(fill="x", pady=(8, 0))

        tk.Button(btn_box, text="Save Changes", font=("Segoe UI", 10, "bold"), bg="#18181b", fg="#ffffff",
                  relief="flat", bd=0, padx=16, pady=8, cursor="hand2", command=on_save).pack(side="left", fill="x", expand=True, padx=(0, 6))

        tk.Button(btn_box, text="Cancel", font=("Segoe UI", 10), bg="#f4f4f5", fg="#27272a",
                  relief="flat", bd=0, padx=16, pady=8, cursor="hand2", command=win.destroy).pack(side="left", padx=(6, 0))

    # ----------------------------------------------------------------
    # Host & Join Actions (3 Options: With Internet, Without Internet, Localhost)
    # ----------------------------------------------------------------
    def on_add_button_clicked(self):
        if self.current_tab == "personal":
            self.create_new_whiteboard()
        else:
            self.show_group_create_popup()

    def show_group_create_popup(self):
        pop = tk.Toplevel(self.root)
        pop.title("Create Group Whiteboard")
        pop.geometry("380x300")
        pop.resizable(False, False)
        pop.configure(bg="#ffffff")
        pop.transient(self.root)
        pop.grab_set()

        self.root.update_idletasks()
        rx, ry = self.root.winfo_rootx(), self.root.winfo_rooty()
        rw, rh = self.root.winfo_width(), self.root.winfo_height()
        pop.geometry(f"+{max(0, rx + (rw - 380) // 2)}+{max(0, ry + (rh - 300) // 2)}")

        box = tk.Frame(pop, bg="#ffffff", padx=20, pady=16)
        box.pack(fill="both", expand=True)

        tk.Label(box, text="Create Group Whiteboard", font=("Segoe UI", 13, "bold"), bg="#ffffff", fg="#09090b").pack(anchor="w")
        tk.Label(box, text="Select connection mode:", font=("Segoe UI", 9), bg="#ffffff", fg="#71717a").pack(anchor="w", pady=(2, 14))

        tk.Button(box, text="🌐 1. With Internet (Wi-Fi / LAN)", font=("Segoe UI", 10, "bold"), bg="#2563eb", fg="#ffffff",
                  relief="flat", bd=0, pady=8, cursor="hand2", command=lambda: [pop.destroy(), self.host_with_internet()]).pack(fill="x", pady=4)

        tk.Button(box, text="⚡ 2. Without Internet (Hotspot Option 2)", font=("Segoe UI", 10, "bold"), bg="#16a34a", fg="#ffffff",
                  relief="flat", bd=0, pady=8, cursor="hand2", command=lambda: [pop.destroy(), self.host_without_internet()]).pack(fill="x", pady=4)

        tk.Button(box, text="Cancel", font=("Segoe UI", 9), bg="#f4f4f5", fg="#27272a",
                  relief="flat", bd=0, pady=6, cursor="hand2", command=pop.destroy).pack(fill="x", pady=(10, 0))

    # 1. Option 1: With Internet / Network
    def prompt_create_group_session(self, default_title="Team Whiteboard"):
        name = simpledialog.askstring("Whiteboard Session Name", "Enter the name of the whiteboard session:",
                                      initialvalue=default_title, parent=self.root)
        if not name or not name.strip():
            return None, None
        name = name.strip()
        code = "".join(random.choices(string.ascii_uppercase, k=4))
        return name, code

    def host_with_internet(self):
        name, code = self.prompt_create_group_session("Wi-Fi Whiteboard")
        if not name:
            return

        ensure_local_server()
        time.sleep(0.3)
        self.local_ip, self.local_iface = get_local_ip_info()
        target_host = self.local_ip
        b_data = BoardManager.create_board(
            title=name,
            board_type="group",
            code=code,
            host=target_host,
            is_host=True
        )

        try:
            net = Net("127.0.0.1")
        except Exception as e:
            messagebox.showerror("Connection Error", f"Cannot connect to local server:\n{e}", parent=self.root)
            return

        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["mode"] = "create"
        cfg["code"] = code
        cfg["title"] = name
        cfg["board_title"] = name
        cfg["board_id"] = b_data["id"]
        cfg["host"] = target_host
        cfg["is_localhost"] = False
        cfg["is_offline"] = False
        WhiteboardApp(net=net, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    # 2. Option 2: Without Internet (Option 2: Ad-Hoc / Mobile Hotspot)
    def host_without_internet(self):
        name, code = self.prompt_create_group_session("Direct LAN Whiteboard")
        if not name:
            return

        ensure_local_server()
        time.sleep(0.3)
        self.local_ip, self.local_iface = get_local_ip_info()
        target_host = self.local_ip
        b_data = BoardManager.create_board(
            title=name,
            board_type="group",
            code=code,
            host=target_host,
            is_host=True
        )

        try:
            net = Net("127.0.0.1")
        except Exception as e:
            messagebox.showerror("Server Error", f"Could not connect to local server on port {PORT}.\n\n{e}", parent=self.root)
            return

        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["mode"] = "create"
        cfg["code"] = code
        cfg["title"] = name
        cfg["board_title"] = name
        cfg["board_id"] = b_data["id"]
        cfg["host"] = target_host
        cfg["is_localhost"] = False
        cfg["is_offline"] = False
        WhiteboardApp(net=net, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    # 3. Option 3: Run on Localhost
    def host_localhost(self):
        name, code = self.prompt_create_group_session("Localhost Session")
        if not name:
            return

        ensure_local_server()
        time.sleep(0.3)
        target_host = "127.0.0.1"
        b_data = BoardManager.create_board(
            title=name,
            board_type="group",
            code=code,
            host=target_host,
            is_host=True
        )

        try:
            net = Net("127.0.0.1")
        except Exception as e:
            messagebox.showerror("Server Error", f"Could not connect to localhost on port {PORT}.\n\n{e}", parent=self.root)
            return

        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["mode"] = "create"
        cfg["code"] = code
        cfg["title"] = name
        cfg["board_title"] = name
        cfg["board_id"] = b_data["id"]
        cfg["host"] = target_host
        cfg["is_localhost"] = True
        cfg["is_offline"] = False
        WhiteboardApp(net=net, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    # Join Handlers
    def join_room_dialog(self):
        target_host = simpledialog.askstring(
            "Connect over Internet / LAN",
            "Enter Host IP Address or Public URL:\n(e.g., LAN IP, Tailscale IP, or tunnel like 4.tcp.ngrok.io:12345)",
            initialvalue=self.local_ip, parent=self.root
        )
        if not target_host:
            return
        target_host = target_host.strip()

        code = simpledialog.askstring("Room Code", "Enter 4-letter Room Code:", parent=self.root)
        if not code:
            return
        code = code.strip().upper()

        self.join_room_direct(code, target_host)

    def join_room_direct(self, code, host):
        code = code.strip().upper()
        host = host.strip()
        existing = BoardManager.find_by_code(code)
        if existing:
            b_id = existing["id"]
            b_title = existing.get("title", f"Room {code}")
        else:
            b_data = BoardManager.create_board(
                title=f"Room {code}",
                board_type="group",
                code=code,
                host=host,
                is_host=False
            )
            b_id = b_data["id"]
            b_title = b_data["title"]

        try:
            net = Net(host)
        except Exception as e:
            messagebox.showerror("Connection Error", f"Cannot connect to server at {host}:{PORT}\n\n{e}", parent=self.root)
            return

        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["mode"] = "join"
        cfg["code"] = code
        cfg["title"] = b_title
        cfg["board_title"] = b_title
        cfg["board_id"] = b_id
        cfg["host"] = host
        cfg["is_offline"] = False
        WhiteboardApp(net=net, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    def open_saved_group_board(self, b):
        bid = b.get("id")
        title = b.get("title", "Group Whiteboard")
        code = b.get("code", "")
        host = b.get("host", "127.0.0.1")
        is_host = b.get("is_host", False)

        if is_host:
            ensure_local_server()
            time.sleep(0.3)
            try:
                net = Net("127.0.0.1")
            except Exception as e:
                messagebox.showerror("Error", f"Could not connect to local server:\n{e}", parent=self.root)
                return
            mode = "create"
            if not b.get("is_localhost", False) and host in ("127.0.0.1", "localhost"):
                host = get_local_ip()
        else:
            try:
                net = Net(host)
            except Exception as e:
                messagebox.showerror("Error", f"Could not connect to host at {host}:{PORT}\n\n{e}", parent=self.root)
                return
            mode = "join"

        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["mode"] = mode
        cfg["code"] = code
        cfg["title"] = title
        cfg["board_title"] = title
        cfg["board_id"] = bid
        cfg["host"] = host
        cfg["is_localhost"] = b.get("is_localhost", False)
        cfg["is_offline"] = False
        cfg["actions"] = b.get("actions", [])
        WhiteboardApp(net=net, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    def copy_code_to_clipboard(self, code):
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(code)
            self.add_notification("Code Copied", f"Room code '{code}' copied to clipboard!")
            messagebox.showinfo("Copied", f"Room code '{code}' copied to clipboard!\nShare this with your peers so they can join.", parent=self.root)
        except Exception:
            pass

    def scan_lan_rooms(self):
        self.is_scanning = True
        self.refresh_cards()

        def _do_scan():
            discovered = discover_lan_rooms(timeout=1.5)
            fb_host = self.config.get("host", "127.0.0.1")
            try:
                s = socket.create_connection((fb_host, PORT), timeout=1)
                s.sendall(json.dumps({"type": "list_rooms"}).encode("utf-8") + b"\n")
                line = s.makefile("r", encoding="utf-8").readline()
                s.close()
                msg = json.loads(line)
                rooms = msg.get("rooms", [])
                if rooms:
                    discovered.append({"ip": fb_host, "port": PORT, "rooms": rooms})
            except Exception:
                pass

            all_r = []
            for d in discovered:
                ip = d.get("ip")
                for r in d.get("rooms", []):
                    all_r.append({
                        "ip": ip,
                        "code": r["code"],
                        "host": r["host"],
                        "users": r.get("users", 1),
                        "has_password": r.get("has_password", False)
                    })

            def _update():
                old_count = len(self.discovered_rooms)
                self.discovered_rooms = all_r
                self.is_scanning = False
                if len(all_r) > old_count:
                    self.add_notification("LAN Room Discovered", f"Found {len(all_r)} active room(s) on network.")
                self.refresh_cards()

            self.root.after(0, _update)

        threading.Thread(target=_do_scan, daemon=True).start()

    # Personal Actions
    def create_new_whiteboard(self):
        title = simpledialog.askstring("New Whiteboard", "Enter whiteboard title:",
                                       initialvalue=f"Personal Notes #{len(BoardManager.list_boards(board_type='personal')) + 1}",
                                       parent=self.root)
        if title:
            b = BoardManager.create_board(title, board_type="personal")
            self.current_tab = "personal"
            self._update_capsule_style()
            self.refresh_cards()
            self.open_offline_board(b["id"], b["title"])

    def rename_board_dialog(self, board_id, current_title):
        new_title = simpledialog.askstring("Rename Whiteboard", "Enter new title:",
                                           initialvalue=current_title, parent=self.root)
        if new_title and new_title.strip() != current_title:
            BoardManager.rename_board(board_id, new_title.strip())
            self.refresh_cards()

    def delete_board_dialog(self, board_id, title):
        if messagebox.askyesno("Delete Whiteboard", f"Are you sure you want to delete '{title}'?\nThis cannot be undone.", parent=self.root):
            BoardManager.delete_board(board_id)
            self.refresh_cards()

    def open_offline_board(self, board_id, title):
        self.root.withdraw()
        app_win = tk.Toplevel(self.root)
        cfg = dict(self.config)
        cfg["is_offline"] = True
        cfg["board_id"] = board_id
        cfg["board_title"] = title
        WhiteboardApp(net=None, config=cfg, root=app_win, on_back_cb=self.on_board_closed)

    def on_board_closed(self):
        self.refresh_cards()
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()
        self.start_presence_listener()

    def run(self):
        self.root.mainloop()


# ====================================================================
# Main Entry Point (Direct Full-Screen Startup, No Login Dialog Popup)
# ====================================================================
def main():
    cfg = load_settings()
    if not cfg.get("user"):
        cfg["user"] = "User"
    hub = WhiteboardHub(cfg)
    hub.run()


if __name__ == "__main__":
    main()
