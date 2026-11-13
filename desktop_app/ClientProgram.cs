using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Drawing;
using System.Windows.Forms;

namespace CollaborativeWhiteboard
{
    static class ClientProgram
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // If an IP/URL was supplied as command line parameter
            if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
            {
                string targetHost = args[0].Trim();
                LaunchAppWindow(FormatUrl(targetHost));
                return;
            }

            // Show Connection Window
            Form form = new Form()
            {
                Text = "Collaborative Whiteboard - Client Application",
                Width = 520,
                Height = 340,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false,
                MinimizeBox = false,
                BackColor = Color.FromArgb(248, 250, 252)
            };

            Label titleLabel = new Label()
            {
                Text = "Join Collaborative Whiteboard Session",
                Font = new Font("Segoe UI", 13, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Left = 25,
                Top = 20,
                Width = 460,
                Height = 30
            };

            Label descLabel = new Label()
            {
                Text = "Connect to a whiteboard hosted on your local computer, across your Wi-Fi/LAN, or over the Internet.",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(100, 116, 139),
                Left = 25,
                Top = 52,
                Width = 460,
                Height = 36
            };

            GroupBox grpLan = new GroupBox()
            {
                Text = "Host Connection Details",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(30, 41, 59),
                Left = 25,
                Top = 95,
                Width = 455,
                Height = 115
            };

            Label lblHost = new Label()
            {
                Text = "Enter Host LAN IP or Room Link (e.g., 192.168.1.5 or localhost):",
                Left = 15,
                Top = 25,
                Width = 425,
                Height = 20,
                ForeColor = Color.FromArgb(71, 85, 105)
            };

            TextBox txtHost = new TextBox()
            {
                Left = 15,
                Top = 50,
                Width = 425,
                Height = 26,
                Font = new Font("Segoe UI", 10),
                Text = "localhost:5000"
            };

            Label lblHint = new Label()
            {
                Text = "Tip: For LAN sessions, ask the host for their IP (e.g. 192.168.1.15:5000)",
                Left = 15,
                Top = 82,
                Width = 425,
                Height = 20,
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Segoe UI", 8)
            };

            grpLan.Controls.Add(lblHost);
            grpLan.Controls.Add(txtHost);
            grpLan.Controls.Add(lblHint);

            Button btnJoinLocal = new Button()
            {
                Text = "Join Local (localhost:5000)",
                Left = 25,
                Top = 230,
                Width = 210,
                Height = 40,
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                BackColor = Color.FromArgb(241, 245, 249),
                ForeColor = Color.FromArgb(30, 41, 59),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnJoinLocal.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
            btnJoinLocal.Click += (s, e) =>
            {
                form.Hide();
                LaunchAppWindow("http://localhost:5000");
                form.Close();
            };

            Button btnConnect = new Button()
            {
                Text = "Connect to Whiteboard →",
                Left = 250,
                Top = 230,
                Width = 230,
                Height = 40,
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                BackColor = Color.FromArgb(37, 99, 235),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnConnect.FlatAppearance.BorderSize = 0;
            btnConnect.Click += (s, e) =>
            {
                string host = txtHost.Text.Trim();
                if (string.IsNullOrEmpty(host))
                {
                    MessageBox.Show("Please enter a Host IP or link.", "Notice", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                form.Hide();
                LaunchAppWindow(FormatUrl(host));
                form.Close();
            };

            form.Controls.Add(titleLabel);
            form.Controls.Add(descLabel);
            form.Controls.Add(grpLan);
            form.Controls.Add(btnJoinLocal);
            form.Controls.Add(btnConnect);
            form.AcceptButton = btnConnect;

            Application.Run(form);
        }

        private static string FormatUrl(string target)
        {
            if (string.IsNullOrWhiteSpace(target)) return "http://localhost:5000";
            target = target.Trim();
            if (!target.StartsWith("http://") && !target.StartsWith("https://"))
            {
                target = "http://" + target;
            }
            if (!target.StartsWith("https://") && !target.Contains(".loca.lt") && !target.Contains(":5000") && target.IndexOf(':', 7) == -1)
            {
                target = target + ":5000";
            }
            return target;
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

            string userDataDir = Path.Combine(Path.GetTempPath(), "CollaborativeWhiteboardClientProfile");

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
                        if (appWindow != null) appWindow.WaitForExit();
                    }
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
    }
}
