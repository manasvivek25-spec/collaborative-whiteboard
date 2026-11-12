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
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(appDir, @"web_whiteboard\server\server.js");
            string distIndex = Path.Combine(appDir, @"web_whiteboard\client\dist\index.html");

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
                MessageBox.Show(
                    "Node.js is required to run the Collaborative Whiteboard desktop application.\n\n" +
                    "Please install Node.js (LTS version) from https://nodejs.org and relaunch the app.",
                    "Collaborative Whiteboard - Dependency Required",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
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
                    buildProc.WaitForExit(30000);
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
            }

            // Set up exit cleanup hook
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();

            // Launch desktop application window
            LaunchAppWindow("http://localhost:5000");

            // Clean up when app window exits
            CleanUp();
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
