"""
Handwriting Recognition, Typography Beautification & Canvas Rendering Engine.
Supports recognizing:
- Small alphabets (a-z)
- Capital alphabets (A-Z)
- Cursive handwriting (letters and connected cursive words)
- Digits (0-9)
- Symbols (+, -, *, /, =, <, >, ?, !, @, #, $, %, &, (, ), [, ], {, }, :, ;, ., ,, ^, _, ~)
Converts messy freehand strokes into crisp typography using the selected font.
"""

import math
import io
import os
import base64
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def levenshtein(s1, s2):
    """Calculates Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            ins = prev[j + 1] + 1
            dele = curr[j] + 1
            sub = prev[j] + (0 if c1 == c2 else 1)
            curr.append(min(ins, dele, sub))
        prev = curr
    return prev[-1]


class HandwritingToFontEngine:
    """
    Advanced Handwriting Recognition Engine supporting:
    - Printed & Cursive uppercase (A-Z) and lowercase (a-z)
    - Full digits (0-9)
    - Mathematical, programming and punctuation symbols
    - Continuous cursive words & multi-symbol expressions
    """
    _templates = {}
    _word_profiles = {}
    _initialized = False

    CHARS = (
        "0123456789"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "abcdefghijklmnopqrstuvwxyz"
        "+-*/=<>(){}[]?!@#$%&^_~:;.,"
    )

    DICTIONARY = [
        # Common English vocabulary
        "apple", "banana", "orange", "grape", "mango", "fruit", "food", "water",
        "cat", "dog", "bird", "fish", "animal", "tree", "plant", "flower", "leaf",
        "hello", "world", "friend", "team", "group", "room", "home", "office", "school",
        "student", "teacher", "class", "lesson", "notes", "book", "pen", "pencil", "paper",
        "computer", "laptop", "phone", "screen", "keyboard", "mouse", "canvas", "board",
        "whiteboard", "drawing", "paint", "color", "brush", "shape", "text", "font", "size",
        "zoom", "clear", "undo", "redo", "save", "share", "export", "import", "open", "close",
        "start", "stop", "pause", "play", "run", "walk", "fast", "slow", "good", "great",
        "yes", "no", "ok", "true", "false", "right", "wrong", "check", "test", "demo",
        "user", "admin", "host", "client", "server", "peer", "member", "name", "mail",
        "password", "lock", "unlock", "chat", "message", "status", "online", "offline",
        # Computer Science & Data Structures & Algorithms
        "dsa", "algo", "algorithm", "data", "database", "array", "list", "stack", "queue",
        "deque", "vector", "matrix", "set", "map", "table", "hash", "hashtable", "heap",
        "tree", "binary", "bst", "avl", "trie", "graph", "node", "vertex", "edge", "root",
        "leaf", "branch", "path", "cycle", "dag", "search", "sort", "merge", "quick", "bubble",
        "insertion", "selection", "radix", "linear", "binary", "bfs", "dfs", "dijkstra",
        "kruskal", "prim", "dynamic", "programming", "greedy", "divide", "conquer", "backtracking",
        "recursion", "iteration", "loop", "while", "for", "if", "else", "switch", "case",
        "break", "continue", "return", "function", "method", "class", "object", "interface",
        "inheritance", "polymorphism", "encapsulation", "pointer", "reference", "memory", "space",
        "time", "complexity", "big", "omega", "theta", "constant", "logarithmic", "quadratic",
        # Networking & Systems
        "lan", "wan", "wifi", "network", "socket", "packet", "port", "ip", "address", "tcp",
        "udp", "http", "https", "url", "protocol", "router", "switch", "gateway", "dns",
        "dhcp", "bandwidth", "latency", "ping", "ack", "syn", "handshake", "broadcast",
        # Math & Code Keywords
        "sum", "avg", "average", "min", "minimum", "max", "maximum", "total", "count", "score",
        "math", "calc", "solve", "equation", "formula", "value", "variable", "const", "let",
        "var", "int", "float", "double", "char", "str", "string", "bool", "boolean", "void",
        "null", "none", "def", "lambda", "print", "input", "output", "error", "warn", "info"
    ]

    @classmethod
    def init_templates(cls, size=40, pad=4):
        if cls._initialized:
            return

        font_candidates = {
            "print": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/calibri.ttf"],
            "script": ["C:/Windows/Fonts/segoesc.ttf", "C:/Windows/Fonts/inkfree.ttf"],
            "hand": ["C:/Windows/Fonts/segoepr.ttf", "C:/Windows/Fonts/comic.ttf"]
        }

        fonts = {}
        for category, paths in font_candidates.items():
            for p in paths:
                if os.path.exists(p):
                    try:
                        fonts[category] = ImageFont.truetype(p, 28)
                        break
                    except Exception:
                        pass

        if not fonts:
            fonts["print"] = ImageFont.load_default()

        tan14 = np.tan(np.radians(14))
        cls._templates = {ch: [] for ch in cls.CHARS}

        try:
            for ch in cls.CHARS:
                # Specialized accurate rendering for punctuation (prevents dot from blowing up into solid 32px block)
                if ch in ".,:;-_\"\'":
                    fimg = Image.new("L", (size, size), 255)
                    d = ImageDraw.Draw(fimg)
                    if ch == ".":
                        d.ellipse((17, 30, 23, 36), fill=0)
                    elif ch == ",":
                        d.line([(20, 28), (20, 34), (17, 37)], fill=0, width=3)
                    elif ch == ":":
                        d.ellipse((18, 12, 22, 16), fill=0)
                        d.ellipse((18, 26, 22, 30), fill=0)
                    elif ch == ";":
                        d.ellipse((18, 12, 22, 16), fill=0)
                        d.line([(20, 26), (20, 32), (17, 35)], fill=0, width=3)
                    elif ch == "-":
                        d.line([(8, 20), (32, 20)], fill=0, width=3)
                    elif ch == "_":
                        d.line([(6, 35), (34, 35)], fill=0, width=3)
                    elif ch == "'":
                        d.line([(20, 6), (20, 14)], fill=0, width=3)
                    elif ch == '"':
                        d.line([(15, 6), (15, 14)], fill=0, width=3)
                        d.line([(25, 6), (25, 14)], fill=0, width=3)
                    arr = np.array(fimg) < 128
                    cls._templates[ch].append(arr)
                    slanted = fimg.transform((size, size), Image.Transform.AFFINE,
                                             (1, -tan14, 0, 0, 1, 0), fillcolor=255)
                    cls._templates[ch].append(np.array(slanted) < 128)
                    continue

                for f_name, f_obj in fonts.items():
                    big_img = Image.new("L", (120, 120), 255)
                    draw = ImageDraw.Draw(big_img)
                    draw.text((30, 30), ch, font=f_obj, fill=0)

                    arr = np.array(big_img) < 128
                    ys, xs = np.where(arr)
                    if len(xs) == 0:
                        continue

                    min_x, max_x = xs.min(), xs.max()
                    min_y, max_y = ys.min(), ys.max()
                    cropped = big_img.crop((min_x, min_y, max_x + 1, max_y + 1))
                    cw, ch_h = cropped.size

                    scale = min((size - 2 * pad) / float(cw), (size - 2 * pad) / float(ch_h))
                    new_w = max(1, int(cw * scale))
                    new_h = max(1, int(ch_h * scale))
                    resized = cropped.resize((new_w, new_h), Image.Resampling.BILINEAR)

                    fimg = Image.new("L", (size, size), 255)
                    ox = (size - new_w) // 2
                    oy = (size - new_h) // 2
                    fimg.paste(resized, (ox, oy))

                    base_arr = np.array(fimg) < 128
                    cls._templates[ch].append(base_arr)

                    # Add forward-slanted template for cursive handwriting
                    slanted = fimg.transform((size, size), Image.Transform.AFFINE,
                                             (1, -tan14, 0, 0, 1, 0), fillcolor=255)
                    cls._templates[ch].append(np.array(slanted) < 128)

            # Pre-compute cursive word profiles for dictionary
            script_f = fonts.get("script") or fonts.get("hand") or fonts.get("print")
            cls._word_profiles = {}
            for w in cls.DICTIONARY:
                cls._word_profiles[w] = cls._generate_word_profile(w, script_f)

            cls._initialized = True
        except Exception as e:
            print(f"[!] Handwriting template init error: {e}")

    @classmethod
    def _generate_word_profile(cls, word, font_obj, target_h=40):
        try:
            img = Image.new("L", (500, 100), 255)
            draw = ImageDraw.Draw(img)
            draw.text((15, 15), word, font=font_obj, fill=0)
            arr = np.array(img) < 128
            ys, xs = np.where(arr)
            if len(xs) == 0:
                return None
            crop = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            w, h = crop.size
            new_w = max(1, int(w * (float(target_h) / h)))
            resized = crop.resize((new_w, target_h), Image.Resampling.BILINEAR)
            return np.array(resized) < 128
        except Exception:
            return None

    @classmethod
    def recognize_char_from_strokes(cls, stroke_list, size=40, pad=4, is_lowercase_hint=False):
        """
        Recognizes single character (small, capital, cursive, digit, symbol)
        from a list of stroke point arrays.
        """
        cls.init_templates(size, pad)
        if not stroke_list:
            return ""

        all_pts = [p for s in stroke_list for p in s if isinstance(p, (list, tuple)) and len(p) >= 2]
        if not all_pts:
            return ""

        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        bw = max(1, max_x - min_x)
        bh = max(1, max_y - min_y)

        # -------------------------------------------------------------
        # 1. Structural & Topological Shortcuts
        # -------------------------------------------------------------
        # Single dot: '.'
        if bw < 10 and bh < 10 and len(all_pts) <= 5:
            return "."

        # Single vertical stroke: '1' or 'l'
        if len(stroke_list) == 1 and bh > 18 and bh > 2.8 * bw:
            return "l" if is_lowercase_hint else "1"

        # Single horizontal stroke: '-'
        if len(stroke_list) == 1 and bw > 18 and bw > 2.8 * bh:
            return "-"

        # 2 Strokes Analysis
        if len(stroke_list) == 2:
            s1, s2 = stroke_list[0], stroke_list[1]
            if len(s1) >= 2 and len(s2) >= 2:
                s1_w = max(p[0] for p in s1) - min(p[0] for p in s1)
                s1_h = max(p[1] for p in s1) - min(p[1] for p in s1)
                s2_w = max(p[0] for p in s2) - min(p[0] for p in s2)
                s2_h = max(p[1] for p in s2) - min(p[1] for p in s2)

                # Check '=': two horizontal parallel strokes
                if s1_w > 1.8 * max(1, s1_h) and s2_w > 1.8 * max(1, s2_h):
                    return "="

                # Check '+': one vertical, one horizontal crossing near middle
                is_s1_v = s1_h > 1.6 * max(1, s1_w)
                is_s2_h = s2_w > 1.6 * max(1, s2_h)
                is_s1_h = s1_w > 1.6 * max(1, s1_h)
                is_s2_v = s2_h > 1.6 * max(1, s2_w)
                if (is_s1_v and is_s2_h) or (is_s1_h and is_s2_v):
                    v_stroke = s1 if is_s1_v else s2
                    h_stroke = s2 if is_s1_v else s1
                    v_mid_y = (min(p[1] for p in v_stroke) + max(p[1] for p in v_stroke)) / 2.0
                    h_y = sum(p[1] for p in h_stroke) / len(h_stroke)
                    if abs(v_mid_y - h_y) < max(s1_h, s2_h) * 0.35:
                        return "+"
                    elif h_y < v_mid_y:
                        return "t" if is_lowercase_hint else "T"

                # Check 'x' or 'X': two crossing diagonals
                if s1_w > 10 and s1_h > 10 and s2_w > 10 and s2_h > 10:
                    dx1 = s1[-1][0] - s1[0][0]
                    dy1 = s1[-1][1] - s1[0][1]
                    dx2 = s2[-1][0] - s2[0][0]
                    dy2 = s2[-1][1] - s2[0][1]
                    if (dx1 * dy1 > 0 and dx2 * dy2 < 0) or (dx1 * dy1 < 0 and dx2 * dy2 > 0):
                        return "x" if is_lowercase_hint else "X"

            # Check 'i' or '!': stem + dot
            dot_stroke = s2 if len(s2) <= 3 else (s1 if len(s1) <= 3 else None)
            stem_stroke = s1 if dot_stroke is s2 else (s2 if dot_stroke is s1 else None)
            if dot_stroke and stem_stroke and len(stem_stroke) >= 4:
                dot_y = sum(p[1] for p in dot_stroke) / len(dot_stroke)
                stem_min_y = min(p[1] for p in stem_stroke)
                stem_max_y = max(p[1] for p in stem_stroke)
                if dot_y < stem_min_y:
                    return "i"
                elif dot_y > stem_max_y:
                    return "!"

        # -------------------------------------------------------------
        # 2. Multi-Template IoU Matching (Print, Cursive Script, Hand, Slant)
        # -------------------------------------------------------------
        scale = min((size - 2 * pad) / float(bw), (size - 2 * pad) / float(bh))
        new_w = max(1, int(bw * scale))
        new_h = max(1, int(bh * scale))
        offset_x = (size - new_w) // 2
        offset_y = (size - new_h) // 2

        img = Image.new("L", (size, size), 255)
        d = ImageDraw.Draw(img)

        for s in stroke_list:
            if not s:
                continue
            mapped = [(offset_x + (p[0] - min_x) * scale, offset_y + (p[1] - min_y) * scale) for p in s]
            if len(mapped) >= 2:
                d.line(mapped, fill=0, width=3)
            elif len(mapped) == 1:
                p = mapped[0]
                d.ellipse((p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2), fill=0)

        user_arr = np.array(img) < 128
        if not np.any(user_arr):
            return ""

        best_char = "?"
        best_score = -1.0

        for ch, tmpl_list in cls._templates.items():
            for tmpl in tmpl_list:
                inter = np.sum(user_arr & tmpl)
                union = np.sum(user_arr | tmpl)
                if union == 0:
                    continue
                iou = inter / float(union)
                # Boost lowercase if lowercase hint active
                if is_lowercase_hint and ch.islower():
                    iou *= 1.12
                elif not is_lowercase_hint and ch.isupper():
                    iou *= 1.05
                if iou > best_score:
                    best_score = iou
                    best_char = ch

        # Small vs Capital refinement for ambiguous letters (c, o, s, v, w, x, z, p, u, k)
        ambiguous_pairs = {
            "C": "c", "O": "o", "S": "s", "V": "v", "W": "w",
            "X": "x", "Z": "z", "P": "p", "U": "u", "K": "k"
        }
        if is_lowercase_hint and best_char in ambiguous_pairs:
            best_char = ambiguous_pairs[best_char]
        elif not is_lowercase_hint and best_char in ambiguous_pairs.values():
            for cap, low in ambiguous_pairs.items():
                if low == best_char:
                    best_char = cap
                    break

        return best_char

    @classmethod
    def match_cursive_word(cls, strokes_list, target_h=40):
        """
        Matches a continuous cursive stroke or connected word against the dictionary
        using 2D word-level profile correlation.
        """
        all_pts = [p for s in strokes_list for p in s.get("points", []) if isinstance(p, (list, tuple)) and len(p) >= 2]
        if not all_pts:
            return None, 0.0

        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        bw = max(1, max_x - min_x)
        bh = max(1, max_y - min_y)

        # Cursive words typically have aspect ratio W/H >= 1.45
        if bw < 1.45 * bh:
            return None, 0.0

        scale = target_h / float(bh)
        target_w = max(1, int(bw * scale))

        img = Image.new("L", (target_w + 20, target_h + 20), 255)
        d = ImageDraw.Draw(img)

        for s in strokes_list:
            pts = s.get("points", [])
            if len(pts) >= 2:
                mapped = [((p[0] - min_x) * scale + 10, (p[1] - min_y) * scale + 10) for p in pts]
                d.line(mapped, fill=0, width=3)

        arr = np.array(img) < 128
        ys_arr, xs_arr = np.where(arr)
        if len(xs_arr) == 0:
            return None, 0.0

        user_crop = arr[ys_arr.min():ys_arr.max() + 1, xs_arr.min():xs_arr.max() + 1]
        user_w = user_crop.shape[1]

        best_word = None
        best_score = -1.0

        for w, tmpl in cls._word_profiles.items():
            if tmpl is None:
                continue
            tmpl_w = tmpl.shape[1]
            w_ratio = min(user_w, tmpl_w) / float(max(user_w, tmpl_w))
            if w_ratio < 0.60:
                continue

            w_min = min(user_w, tmpl_w)
            w_max = max(user_w, tmpl_w)
            h_min = min(user_crop.shape[0], tmpl.shape[0])
            u_cut = user_crop[:h_min, :w_min]
            t_cut = tmpl[:h_min, :w_min]
            inter = np.sum(u_cut & t_cut)
            union = np.sum(u_cut | t_cut) + int(0.40 * (w_max - w_min) * target_h)
            score = (inter / float(union)) * w_ratio if union > 0 else 0
            if score > best_score:
                best_score = score
                best_word = w

        return best_word, best_score

    @classmethod
    def slice_cursive_stroke(cls, strokes_list):
        """
        Slices a continuous cursive stroke or wide multi-character stroke along
        vertical projection valleys into individual letter glyphs.
        """
        all_pts = [p for s in strokes_list for p in s.get("points", []) if isinstance(p, (list, tuple)) and len(p) >= 2]
        if not all_pts:
            return []

        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        bw = max(1, max_x - min_x)
        bh = max(1, max_y - min_y)

        # If not wide enough to be connected letters, return as single cluster
        if bw < 1.45 * bh:
            return [[s.get("points", []) for s in strokes_list]]

        # Render stroke to binary grid
        scale = 50.0 / float(bh)
        grid_w = max(1, int(bw * scale)) + 10
        img = Image.new("L", (grid_w, 60), 255)
        d = ImageDraw.Draw(img)

        for s in strokes_list:
            pts = s.get("points", [])
            if len(pts) >= 2:
                mapped = [((p[0] - min_x) * scale + 5, (p[1] - min_y) * scale + 5) for p in pts]
                d.line(mapped, fill=0, width=3)

        arr = np.array(img) < 128
        proj = np.sum(arr, axis=0)
        smoothed = np.convolve(proj, [0.25, 0.5, 0.25], mode="same")

        min_spacing = int(0.42 * 50)
        valleys = []
        mean_val = np.mean(smoothed)

        for x in range(min_spacing, len(smoothed) - min_spacing):
            window = smoothed[max(0, x - min_spacing // 2): min(len(smoothed), x + min_spacing // 2 + 1)]
            if smoothed[x] == np.min(window) and smoothed[x] < mean_val * 1.15:
                if not valleys or (x - valleys[-1]) >= min_spacing:
                    valleys.append(x)

        if not valleys:
            return [[s.get("points", []) for s in strokes_list]]

        canvas_cuts = [min_x + (v - 5) / scale for v in valleys]
        cut_bounds = [min_x] + canvas_cuts + [max_x + 1]

        char_slices = []
        for i in range(len(cut_bounds) - 1):
            c_left = cut_bounds[i]
            c_right = cut_bounds[i + 1]
            slice_pts = []
            for s in strokes_list:
                pts_in_slice = [p for p in s.get("points", []) if c_left <= p[0] <= c_right]
                if pts_in_slice:
                    slice_pts.append(pts_in_slice)
            if slice_pts:
                char_slices.append(slice_pts)

        return char_slices

    @classmethod
    def recognize_strokes_sequence(cls, strokes_list):
        """
        Full handwriting pipeline:
        1. Checks for connected cursive words & dictionary profile match.
        2. Slices wide strokes along projection valleys for cursive letters.
        3. Clusters discrete print strokes along the X-axis.
        4. Distinguishes small, capital, cursive letters, digits, and symbols.
        5. Refines spelling using vocabulary & Levenshtein distance.
        """
        if not strokes_list:
            return ""

        cls.init_templates()

        # Step 1: Check for connected cursive word match
        matched_word, score = cls.match_cursive_word(strokes_list)
        if matched_word and score >= 0.52:
            first_stroke = strokes_list[0].get("points", [])
            if first_stroke:
                s_h = max(p[1] for p in first_stroke) - min(p[1] for p in first_stroke)
                all_h = max(p[1] for s in strokes_list for p in s.get("points", [])) - min(p[1] for s in strokes_list for p in s.get("points", []))
                if s_h >= 0.85 * all_h and strokes_list[0].get("points", [])[0][1] < min(p[1] for p in first_stroke) + 5:
                    return matched_word.capitalize()
            return matched_word

        # Step 2: Extract and sort all strokes along X-axis
        all_strokes = []
        for s in strokes_list:
            pts = s.get("points", [])
            if len(pts) >= 1:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                all_strokes.append({
                    "stroke": s,
                    "pts": pts,
                    "min_x": min(xs),
                    "max_x": max(xs),
                    "min_y": min(ys),
                    "max_y": max(ys),
                    "width": max(xs) - min(xs),
                    "height": max(ys) - min(ys)
                })

        if not all_strokes:
            return ""

        # Check if single stroke contains a wide cursive/multi-letter sequence
        if len(all_strokes) <= 3:
            total_w = max(s["max_x"] for s in all_strokes) - min(s["min_x"] for s in all_strokes)
            total_h = max(s["max_y"] for s in all_strokes) - min(s["min_y"] for s in all_strokes)
            if total_w > 1.45 * total_h:
                char_slices = cls.slice_cursive_stroke(strokes_list)
                if len(char_slices) > 1:
                    chars = []
                    for idx, sl in enumerate(char_slices):
                        is_low = (idx > 0)
                        ch = cls.recognize_char_from_strokes(sl, is_lowercase_hint=is_low)
                        if ch:
                            chars.append(ch)
                    res = "".join(chars).strip()
                    if res:
                        low = res.lower()
                        for w in cls.DICTIONARY:
                            if w == low or (len(low) >= 3 and levenshtein(low, w) <= 1):
                                return w.capitalize() if res[0].isupper() else w
                        return res

        # Step 3: Cluster separate strokes along X-axis
        all_strokes.sort(key=lambda s: s["min_x"])
        clusters = []
        curr_cluster = []
        curr_max_x = -1

        for s in all_strokes:
            if not curr_cluster:
                curr_cluster.append(s)
                curr_max_x = s["max_x"]
            else:
                char_gap = s["min_x"] - curr_max_x
                avg_h = sum(x["height"] for x in curr_cluster) / max(1, len(curr_cluster))
                gap_threshold = max(10, avg_h * 0.28)

                if char_gap <= gap_threshold or s["min_x"] < curr_max_x:
                    curr_cluster.append(s)
                    curr_max_x = max(curr_max_x, s["max_x"])
                else:
                    clusters.append(curr_cluster)
                    curr_cluster = [s]
                    curr_max_x = s["max_x"]

        if curr_cluster:
            clusters.append(curr_cluster)

        # Recognize each character cluster
        chars = []
        for idx, cl in enumerate(clusters):
            stroke_pts_list = [item["pts"] for item in cl]
            is_low = (idx > 0)  # Lowercase hint for interior characters
            ch = cls.recognize_char_from_strokes(stroke_pts_list, is_lowercase_hint=is_low)
            if ch:
                chars.append(ch)

        raw_word = "".join(chars).strip()
        if not raw_word:
            return ""

        # Single character or pure digits/symbols: return exact recognized output!
        if len(raw_word) <= 1 or raw_word.isdigit() or all(not c.isalpha() for c in raw_word):
            return raw_word

        # Formulas and code expressions (e.g., "x=5", "a+b", "i++"): preserve as-is!
        if any(c in "+-*/=<>?!@#$%&()[]{}" for c in raw_word):
            return raw_word

        # Alphabetic word matching with dictionary & Levenshtein distance
        low = raw_word.lower()
        best_dict_word = None
        min_dist = 999

        for w in cls.DICTIONARY:
            if w == low:
                return w.upper() if raw_word.isupper() else (w.capitalize() if raw_word[0].isupper() else w)
            if abs(len(w) - len(low)) <= 1 and len(low) >= 3:
                d = levenshtein(low, w)
                if d < min_dist and d <= (1 if len(low) <= 4 else 2):
                    min_dist = d
                    best_dict_word = w

        if best_dict_word:
            if raw_word.isupper():
                return best_dict_word.upper()
            if raw_word[0].isupper():
                return best_dict_word.capitalize()
            return best_dict_word

        return raw_word


def render_actions_to_image(actions, bg="#ffffff", width=1920, height=1080):
    """Renders whiteboard actions onto a high-quality PIL Image."""
    img = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img)

    for a in actions:
        if not isinstance(a, dict) or a.get("undone"):
            continue
        k = a.get("kind")
        col = a.get("color", "#000000")
        w = max(1, int(a.get("width", 3)))
        dx = a.get("dx", 0)
        dy = a.get("dy", 0)

        if k == "stroke":
            pts = a.get("points", [])
            if len(pts) >= 2:
                mapped = [(p[0] + dx, p[1] + dy) for p in pts]
                brush = a.get("brush", "pencil")
                stroke_col = bg if brush == "eraser" else col
                draw.line(mapped, fill=stroke_col, width=w * (4 if brush == "eraser" else 1))
            elif len(pts) == 1:
                p = pts[0]
                draw.ellipse((p[0] + dx - 2, p[1] + dy - 2, p[0] + dx + 2, p[1] + dy + 2), fill=col)

        elif k == "shape":
            shape = a.get("shape", "rect")
            x0, y0 = a.get("x0", 0) + dx, a.get("y0", 0) + dy
            x1, y1 = a.get("x1", 0) + dx, a.get("y1", 0) + dy
            fill = a.get("fill")
            if shape == "line":
                draw.line([(x0, y0), (x1, y1)], fill=col, width=w)
            elif shape == "rect":
                draw.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], outline=col, width=w, fill=fill)
            elif shape == "oval":
                draw.ellipse([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], outline=col, width=w, fill=fill)
            elif shape == "triangle":
                mid_x = (x0 + x1) / 2
                draw.polygon([(mid_x, min(y0, y1)), (min(x0, x1), max(y0, y1)), (max(x0, x1), max(y0, y1))], outline=col, width=w, fill=fill)

        elif k == "text":
            x, y = a.get("x", 0) + dx, a.get("y", 0) + dy
            text_str = a.get("text", "")
            try:
                f_obj = ImageFont.load_default()
            except Exception:
                f_obj = None
            draw.text((x, y), text_str, fill=col, font=f_obj)

        elif k == "sticky":
            x0, y0 = a.get("x0", 0) + dx, a.get("y0", 0) + dy
            x1, y1 = a.get("x1", 0) + dx, a.get("y1", 0) + dy
            txt = a.get("text", "")
            draw.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill="#fef08a", outline="#ca8a04", width=1)
            draw.text((min(x0, x1) + 8, min(y0, y1) + 8), txt, fill="#1e293b")

    return img


def image_to_base64_thumbnail(img, thumb_size=(240, 150)):
    """Converts a PIL image to a base64-encoded PNG thumbnail string."""
    thumb = img.copy()
    thumb.thumbnail(thumb_size)
    buf = io.BytesIO()
    thumb.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")
