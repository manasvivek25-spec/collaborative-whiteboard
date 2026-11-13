using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Threading;
using System.Runtime.InteropServices;

namespace CollaborativeWhiteboard
{
    class ServerProgram
    {
        private static Process serverProcess = null;
        private static string appDir = AppDomain.CurrentDomain.BaseDirectory;

        // Windows Console Control Handler to trap window close
        [DllImport("Kernel32")]
        private static extern bool SetConsoleCtrlHandler(ConsoleCtrlDelegate handler, bool add);
        private delegate bool ConsoleCtrlDelegate(int sig);
        private static ConsoleCtrlDelegate ctrlHandler;

        static void Main(string[] args)
        {
            Console.Title = "Collaborative Whiteboard - Dedicated LAN Server";
            ctrlHandler = new ConsoleCtrlDelegate(ConsoleCtrlCheck);
            SetConsoleCtrlHandler(ctrlHandler, true);
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();

            string bundledNode = Path.Combine(appDir, @"runtime\node.exe");
            bool hasBundledNode = File.Exists(bundledNode);
            string serverScript = Path.Combine(appDir, @"web_whiteboard\server\server.js");
            string serverDir = Path.Combine(appDir, @"web_whiteboard\server");

            if (!File.Exists(serverScript))
            {
                string altScript = Path.Combine(appDir, @"server\server.js");
                if (File.Exists(altScript))
                {
                    serverScript = altScript;
                    serverDir = Path.Combine(appDir, @"server");
                }
            }

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("======================================================================");
            Console.WriteLine("   COLLABORATIVE WHITEBOARD - DEDICATED LAN SERVER HOST");
            Console.WriteLine("   Computer Networks Laboratory Project • Standalone Executable");
            Console.WriteLine("======================================================================");
            Console.ResetColor();

            if (!File.Exists(serverScript))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[ERROR] Backend script not found: " + serverScript);
                Console.WriteLine("Please ensure the 'web_whiteboard' folder is present.");
                Console.ResetColor();
                Console.WriteLine("\nPress any key to exit...");
                Console.ReadKey();
                return;
            }

            // Check if server is already responding
            if (IsServerResponding("http://127.0.0.1:5000/api/network-info"))
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[INFO] A Collaborative Whiteboard server is already running on port 5000.");
                Console.ResetColor();
            }
            else
            {
                Console.WriteLine("\n[*] Starting Node.js WebSocket & REST backend service...");
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = hasBundledNode ? bundledNode : "node.exe",
                        Arguments = string.Format("\"{0}\"", serverScript),
                        WorkingDirectory = serverDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    serverProcess = Process.Start(psi);
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Failed to start server: " + ex.Message);
                    Console.ResetColor();
                    Console.WriteLine("\nPress any key to exit...");
                    Console.ReadKey();
                    return;
                }

                // Wait for server to respond
                int attempts = 0;
                while (attempts < 20 && !IsServerResponding("http://127.0.0.1:5000/api/network-info"))
                {
                    Thread.Sleep(500);
                    attempts++;
                }

                if (!IsServerResponding("http://127.0.0.1:5000/api/network-info"))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Server process started but port 5000 is not responding.");
                    Console.ResetColor();
                    CleanUp();
                    Console.WriteLine("\nPress any key to exit...");
                    Console.ReadKey();
                    return;
                }
            }

            string localIp = GetPrimaryLanIp();

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine(" [✓] SERVER STATUS:       ONLINE & LISTENING (Port 5000)");
            Console.WriteLine(" [✓] LOCAL HOST URL:      http://localhost:5000");
            if (!string.IsNullOrEmpty(localIp))
            {
                Console.WriteLine(" [✓] PHYSICAL LAN IP:     http://" + localIp + ":5000");
            }
            Console.WriteLine(" [✓] UDP LAN DISCOVERY:   Active on UDP Port 41234 (Zero-Internet Broadcast)");
            Console.WriteLine(" [✓] DATABASE ENGINE:     SQLite (web_whiteboard\\server\\database.sqlite)");
            Console.ResetColor();

            Console.WriteLine("\n======================================================================");
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine(" PEER CONNECTION INSTRUCTIONS:");
            Console.WriteLine(" • To collaborate on the same computer: Open http://localhost:5000");
            if (!string.IsNullOrEmpty(localIp))
            {
                Console.WriteLine(" • To collaborate over LAN / Wi-Fi: Tell peers to connect to:");
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("   --> http://" + localIp + ":5000");
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine("   or run 'Client_Application.exe' and enter: " + localIp);
            }
            Console.WriteLine(" • All created rooms, vector actions, and chat logs persist dynamically.");
            Console.WriteLine("======================================================================");
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(" Commands: [O] Open Whiteboard in Browser | [Q] Stop Server and Exit");
            Console.ResetColor();
            Console.WriteLine("======================================================================\n");

            while (true)
            {
                if (Console.KeyAvailable)
                {
                    ConsoleKeyInfo key = Console.ReadKey(true);
                    if (key.Key == ConsoleKey.Q)
                    {
                        Console.WriteLine("\n[*] Shutting down server gracefully...");
                        break;
                    }
                    else if (key.Key == ConsoleKey.O)
                    {
                        Console.WriteLine("[*] Launching whiteboard interface...");
                        try { Process.Start("http://localhost:5000"); } catch { }
                    }
                }
                Thread.Sleep(200);
            }

            CleanUp();
        }

        private static bool ConsoleCtrlCheck(int sig)
        {
            CleanUp();
            return false;
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

        private static bool IsServerResponding(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 1000;
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

        private static string GetPrimaryLanIp()
        {
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    string desc = (ni.Description + " " + ni.Name).ToLower();
                    if (desc.Contains("virtual") || desc.Contains("vEthernet") || desc.Contains("wsl") || desc.Contains("hyper-v"))
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
