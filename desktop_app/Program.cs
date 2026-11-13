using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Threading;
using System.Drawing;
using System.Windows.Forms;

namespace CollaborativeWhiteboard
{
    static class Program
    {
        private static Process serverProcess = null;
        private static string appDir = AppDomain.CurrentDomain.BaseDirectory;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // If a custom remote host is passed via command-line (e.g., Collaborative_Whiteboard.exe 192.168.1.5:5000)
            if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
            {
                string targetHost = args[0].Trim();
                if (!targetHost.StartsWith("http://") && !targetHost.StartsWith("https://"))
                {
                    targetHost = "http://" + targetHost;
                }
                LaunchAppWindow(targetHost);
                return;
            }

            string bundledNode = Path.Combine(appDir, @"runtime\node.exe");
            bool hasBundledNode = File.Exists(bundledNode);

            string serverScript = Path.Combine(appDir, @"web_whiteboard\server\server.js");
            string serverModules = Path.Combine(appDir, @"web_whiteboard\server\node_modules");
            string distIndex = Path.Combine(appDir, @"web_whiteboard\client\dist\index.html");

            if (!File.Exists(serverScript))
            {
                string altScript = Path.Combine(appDir, @"server\server.js");
                if (File.Exists(altScript))
                {
                    serverScript = altScript;
                    serverModules = Path.Combine(appDir, @"server\node_modules");
                    distIndex = Path.Combine(appDir, @"client\dist\index.html");
                }
            }

            if (!File.Exists(serverScript))
            {
                MessageBox.Show(
                    "Could not find backend server script at:\n" + serverScript + 
                    "\n\nPlease ensure the 'web_whiteboard' folder is present in the application directory.",
                    "Collaborative Whiteboard",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // Check if server is already running on port 5000
            bool alreadyRunning = IsServerResponding("http://127.0.0.1:5000/api/network-info");

            if (!alreadyRunning)
            {
                // Verify Node runtime
                if (!hasBundledNode && !IsNodeInstalled())
                {
                    DialogResult dr = MessageBox.Show(
                        "Node.js runtime was not found on this computer.\n\n" +
                        "• To HOST sessions: Please install Node.js from https://nodejs.org or place node.exe in the 'runtime' folder.\n" +
                        "• To JOIN a partner's session: Connect to their LAN IP instead of localhost.\n\n" +
                        "Would you like to enter a friend's Host IP address to join their whiteboard now?",
                        "Collaborative Whiteboard",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question
                    );

                    if (dr == DialogResult.Yes)
                    {
                        PromptAndJoinRemote();
                    }
                    return;
                }

                // Start Node.js server in the background
                try
                {
                    string serverDir = Path.GetDirectoryName(serverScript);
                    ProcessStartInfo serverPsi = new ProcessStartInfo
                    {
                        FileName = hasBundledNode ? bundledNode : "node.exe",
                        Arguments = string.Format("\"{0}\"", serverScript),
                        WorkingDirectory = serverDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    serverProcess = Process.Start(serverPsi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Failed to start background server: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // Wait up to 10 seconds for server to be ready
                int attempts = 0;
                while (attempts < 20 && !IsServerResponding("http://127.0.0.1:5000/api/network-info"))
                {
                    Thread.Sleep(500);
                    attempts++;
                }

                if (!IsServerResponding("http://127.0.0.1:5000/api/network-info"))
                {
                    DialogResult dr = MessageBox.Show(
                        "The local server on port 5000 did not respond.\n\n" +
                        "• If you are HOSTING: Please verify port 5000 is free.\n" +
                        "• If you are JOINING a friend's whiteboard: Connect to their LAN IP address.\n\n" +
                        "Would you like to enter a friend's Host IP address to join?",
                        "Collaborative Whiteboard - Connection Notice",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Warning
                    );

                    if (dr == DialogResult.Yes)
                    {
                        PromptAndJoinRemote();
                    }
                    CleanUp();
                    return;
                }
            }

            // Cleanup on process exit
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();

            // Detect LAN IP
            string localIp = GetPrimaryLanIp();
            string lanUrl = !string.IsNullOrEmpty(localIp) ? "http://" + localIp + ":5000" : "http://localhost:5000";

            // Automatically launch app window
            LaunchAppWindow("http://localhost:5000");

            // Show persistent host management window so server stays alive and user can copy LAN link
            Form hostForm = new Form()
            {
                Text = "Collaborative Whiteboard - Active Session Host",
                Width = 540,
                Height = 310,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false,
                BackColor = Color.FromArgb(248, 250, 252)
            };

            // Custom icon if available
            string iconPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(iconPath))
            {
                try { hostForm.Icon = new Icon(iconPath); } catch { }
            }

            Label lblStatus = new Label()
            {
                Text = "● Whiteboard Server is Online & Running",
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.FromArgb(22, 101, 52),
                Left = 25,
                Top = 20,
                Width = 470,
                Height = 25
            };

            Label lblDesc = new Label()
            {
                Text = "Your whiteboard session is active. Friends on the same Wi-Fi / LAN can join using your LAN IP below.",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(71, 85, 105),
                Left = 25,
                Top = 48,
                Width = 470,
                Height = 35
            };

            GroupBox grpIp = new GroupBox()
            {
                Text = "Network Join Information",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(30, 41, 59),
                Left = 25,
                Top = 90,
                Width = 475,
                Height = 85
            };

            TextBox txtLan = new TextBox()
            {
                Text = lanUrl,
                ReadOnly = true,
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                Left = 15,
                Top = 30,
                Width = 320,
                Height = 28
            };

            Button btnCopy = new Button()
            {
                Text = "Copy LAN Link",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Left = 345,
                Top = 28,
                Width = 115,
                Height = 32,
                BackColor = Color.FromArgb(241, 245, 249),
                ForeColor = Color.FromArgb(30, 41, 59),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnCopy.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
            btnCopy.Click += (s, e) =>
            {
                try
                {
                    Clipboard.SetText(txtLan.Text);
                    MessageBox.Show("LAN join link copied to clipboard:\n" + txtLan.Text, "Copied!", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch { }
            };

            grpIp.Controls.Add(txtLan);
            grpIp.Controls.Add(btnCopy);

            Button btnOpen = new Button()
            {
                Text = "Re-Open Whiteboard Window",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Left = 25,
                Top = 195,
                Width = 240,
                Height = 42,
                BackColor = Color.FromArgb(37, 99, 235),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnOpen.FlatAppearance.BorderSize = 0;
            btnOpen.Click += (s, e) => LaunchAppWindow("http://localhost:5000");

            Button btnStop = new Button()
            {
                Text = "Stop Server & Exit",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Left = 280,
                Top = 195,
                Width = 220,
                Height = 42,
                BackColor = Color.FromArgb(239, 68, 68),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnStop.FlatAppearance.BorderSize = 0;
            btnStop.Click += (s, e) => hostForm.Close();

            hostForm.Controls.Add(lblStatus);
            hostForm.Controls.Add(lblDesc);
            hostForm.Controls.Add(grpIp);
            hostForm.Controls.Add(btnOpen);
            hostForm.Controls.Add(btnStop);

            hostForm.FormClosing += (s, e) => CleanUp();

            Application.Run(hostForm);
        }

        private static void PromptAndJoinRemote()
        {
            Form prompt = new Form()
            {
                Width = 460,
                Height = 180,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                Text = "Connect to Partner's Host IP",
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false,
                MinimizeBox = false
            };

            Label textLabel = new Label() { Left = 20, Top = 18, Text = "Enter your friend's Host IP or Room Link:", Width = 400 };
            TextBox textBox = new TextBox() { Left = 20, Top = 45, Width = 400, Text = "" };
            Button confirmation = new Button() { Text = "Connect to Whiteboard", Left = 240, Width = 180, Top = 85, DialogResult = DialogResult.OK };
            prompt.Controls.Add(textBox);
            prompt.Controls.Add(confirmation);
            prompt.Controls.Add(textLabel);
            prompt.AcceptButton = confirmation;

            if (prompt.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(textBox.Text))
            {
                string target = textBox.Text.Trim();
                if (!target.StartsWith("http://") && !target.StartsWith("https://"))
                {
                    target = "http://" + target;
                }
                if (!target.StartsWith("https://") && !target.Contains(".loca.lt") && !target.Contains(":5000") && target.IndexOf(':', 7) == -1)
                {
                    target = target + ":5000";
                }
                LaunchAppWindow(target);
            }
        }

        private static bool IsNodeInstalled()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c node -v",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true
                };
                using (Process p = Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    return p.ExitCode == 0 && output.Contains("v");
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool IsServerResponding(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 800;
                req.Method = "GET";
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void LaunchAppWindow(string url)
        {
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            string browserPath = null;
            if (File.Exists(edgePath)) browserPath = edgePath;
            else if (File.Exists(chromePath)) browserPath = chromePath;

            string userDataDir = Path.Combine(Path.GetTempPath(), "CollaborativeWhiteboardAppProfile");

            if (browserPath != null)
            {
                string args = string.Format("--app=\"{0}\" --window-size=1360,860 --user-data-dir=\"{1}\"", url, userDataDir);
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = browserPath,
                    Arguments = args,
                    UseShellExecute = false
                };
                try
                {
                    Process.Start(psi);
                }
                catch
                {
                    Process.Start(url);
                }
            }
            else
            {
                Process.Start(url);
            }
        }

        private static void CleanUp()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "taskkill.exe",
                        Arguments = string.Format("/PID {0} /T /F", serverProcess.Id),
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process p = Process.Start(psi);
                    if (p != null) p.WaitForExit(2000);
                }
                catch { }
            }
        }

        private static string GetPrimaryLanIp()
        {
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    string desc = (ni.Description + " " + ni.Name).ToLower();
                    if (desc.Contains("virtual") || desc.Contains("vethernet") || desc.Contains("wsl") || desc.Contains("hyper-v"))
                        continue;

                    foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip.Address))
                        {
                            return ip.Address.ToString();
                        }
                    }
                }
            }
            catch { }
            return null;
        }
    }
}
