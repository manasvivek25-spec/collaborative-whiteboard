using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace CollaborativeWhiteboard
{
    static class Program
    {
        private static Process serverProcess = null;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(appDir, @"web_whiteboard\server\server.js");
            string serverModules = Path.Combine(appDir, @"web_whiteboard\server\node_modules");
            string distIndex = Path.Combine(appDir, @"web_whiteboard\client\dist\index.html");

            // If a custom remote host is passed via command-line (e.g., Collaborative_Whiteboard.exe 10.36.112.55:5000)
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

            // Check if server.js exists
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

            // Check if Node.js is installed
            if (!IsNodeInstalled())
            {
                DialogResult dr = MessageBox.Show(
                    "Node.js is required to host the Collaborative Whiteboard server on this machine.\n\n" +
                    "• If you want to HOST sessions: Please install Node.js from https://nodejs.org\n" +
                    "• If you are JOINING a friend's session: Connect to their LAN IP instead of localhost.\n\n" +
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

            // Check if server dependencies exist
            if (!Directory.Exists(serverModules))
            {
                DialogResult dr = MessageBox.Show(
                    "Project dependencies are not installed yet.\n\n" +
                    "Would you like to run 'install_dependencies.bat' now to install required packages?",
                    "Collaborative Whiteboard - Setup Required",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information
                );

                if (dr == DialogResult.Yes)
                {
                    string setupScript = Path.Combine(appDir, "install_dependencies.bat");
                    if (File.Exists(setupScript))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = setupScript,
                            WorkingDirectory = appDir
                        });
                    }
                }
                return;
            }

            // Check if client dist exists; if not, build it silently
            if (!File.Exists(distIndex))
            {
                try
                {
                    ProcessStartInfo buildPsi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm run build",
                        WorkingDirectory = Path.Combine(appDir, @"web_whiteboard\client"),
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process buildProc = Process.Start(buildPsi);
                    if (buildProc != null) buildProc.WaitForExit(30000);
                }
                catch { }
            }

            // Check if server is already running on port 5000
            bool alreadyRunning = IsServerResponding("http://127.0.0.1:5000/api/network-info");

            if (!alreadyRunning)
            {
                // Start Node.js server silently
                try
                {
                    ProcessStartInfo serverPsi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c node server.js",
                        WorkingDirectory = Path.Combine(appDir, @"web_whiteboard\server"),
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

                // If server still failed to respond
                if (!IsServerResponding("http://127.0.0.1:5000/api/network-info"))
                {
                    DialogResult dr = MessageBox.Show(
                        "The local server on port 5000 did not respond.\n\n" +
                        "• If you are HOSTING: Please verify port 5000 is free and run 'install_dependencies.bat'.\n" +
                        "• If you are JOINING a friend's whiteboard: Do not connect to localhost! You must connect to your friend's LAN IP address.\n\n" +
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

            // Set up exit cleanup hook
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();

            // Launch desktop application window
            LaunchAppWindow("http://localhost:5000");

            // Clean up when app window exits
            CleanUp();
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

            Label textLabel = new Label() { Left = 20, Top = 18, Text = "Enter your friend's Host IP (e.g. 10.36.112.55 or 192.168.1.15):", Width = 400 };
            TextBox textBox = new TextBox() { Left = 20, Top = 45, Width = 400, Text = "10.36.112.55:5000" };
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
                if (!target.Contains(":5000") && target.IndexOf(':', 7) == -1)
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
                    using (Process appWindow = Process.Start(psi))
                    {
                        if (appWindow != null)
                        {
                            appWindow.WaitForExit();
                        }
                    }
                }
                catch
                {
                    Process.Start(url);
                }
            }
            else
            {
                // Fallback to default browser
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
    }
}
