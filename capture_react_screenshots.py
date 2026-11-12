import subprocess
import time
import os

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUTPUT_DIR = r"C:\Users\len\Downloads\lan_whiteboard\web_screenshots"

os.makedirs(OUTPUT_DIR, exist_ok=True)

targets = [
    ("react_hub.png", "http://localhost:5000"),
    ("react_canvas_drawing.png", "http://localhost:5000/?room=TEST&demo=true"),
    ("react_chat_drawer.png", "http://localhost:5000/?room=TEST&demo=true&chat=true"),
    ("react_participants_rbac.png", "http://localhost:5000/?room=TEST&demo=true&participants=true"),
    ("react_sandbox_mode.png", "http://localhost:5000/?room=TEST&demo=true&sandbox=true"),
    ("react_shapes_modal.png", "http://localhost:5000/?room=TEST&demo=true&shapes=true")
]

for filename, url in targets:
    out_file = os.path.join(OUTPUT_DIR, filename)
    print(f"Capturing {filename} from {url}...")
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--virtual-time-budget=4000",
        "--window-size=1920,1080",
        f"--screenshot={out_file}",
        url
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(out_file):
        print(f"  [OK] Saved {out_file} ({os.path.getsize(out_file):,} bytes)")
    else:
        print(f"  [FAILED] {out_file} not found. Stderr: {res.stderr}")

print("All React screenshots captured successfully!")
