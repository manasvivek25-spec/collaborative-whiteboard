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
        private static string appDir = AppDomain.CurrentDomain.BaseDirectory;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // If a custom remote host IP is passed via command-line (e.g. from shortcut: Collaborative_Whiteboard.exe 192.168.1.5:5000)
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
            if (!File.Exists(serverScript))
            {
                string altScript = Path.Combine(appDir, @"server\server.js");
                if (File.Exists(altScript))
                {
                    serverScript = altScript;
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

            // Check if server is already responding
            bool alreadyRunning = IsServerResponding("http://127.0.0.1:5000/api/network-info");

            if (!alreadyRunning)
            {
                // Start Node.js server silently in background
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
                    MessageBox.Show(
                        "The background whiteboard server could not be started on port 5000.\n" +
                        "Please verify port 5000 is not in use by another application.",
                        "Collaborative Whiteboard",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    CleanUp();
                    return;
                }
            }

            // Clean up server on process exit
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();

            // Directly launch the full desktop application window (1-click experience)
            LaunchAppWindow("http://localhost:5000");

            // Clean up background server when window closes
            CleanUp();
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
                string args = string.Format("--app=\"{0}\" --window-size=1360,860 --user-data-dir=\"{1}\" --no-first-run", url, userDataDir);
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
