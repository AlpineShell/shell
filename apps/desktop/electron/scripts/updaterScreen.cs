using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class AlpineUpdater {
    [DllImport("user32.dll")] static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    const int SW_HIDE = 0;

    const string ShellKeyPath = @"Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

    static string installerPath = "";
    static string alpineExe = "";
    static Form cover;

    [STAThread]
    static void Main(string[] args) {
        if (args.Length > 0) installerPath = args[0];
        if (args.Length > 1) alpineExe = args[1];

        Application.EnableVisualStyles();

        cover = new Form();
        cover.FormBorderStyle = FormBorderStyle.None;
        cover.StartPosition = FormStartPosition.Manual;
        cover.Bounds = SystemInformation.VirtualScreen;
        cover.BackColor = ColorTranslator.FromHtml("#1a1a2e");
        cover.TopMost = true;
        cover.ShowInTaskbar = false;

        Label label = new Label();
        label.Text = "Updating Alpine Shell...";
        label.ForeColor = Color.White;
        label.Font = new Font("Segoe UI", 22f, FontStyle.Regular);
        label.AutoSize = true;
        cover.Controls.Add(label);

        cover.Shown += delegate {
            label.Location = new Point(
                (cover.ClientSize.Width - label.Width) / 2,
                (cover.ClientSize.Height - label.Height) / 2);
            HideTaskbar();
            Thread worker = new Thread(RunUpdate);
            worker.IsBackground = true;
            worker.Start();
        };

        System.Windows.Forms.Timer onTop = new System.Windows.Forms.Timer();
        onTop.Interval = 400;
        onTop.Tick += delegate { HideTaskbar(); cover.TopMost = true; };
        onTop.Start();

        Application.Run(cover);
    }

    static void HideTaskbar() {
        try {
            IntPtr tray = FindWindow("Shell_TrayWnd", null);
            if (tray != IntPtr.Zero) ShowWindow(tray, SW_HIDE);
        } catch { }
    }

    static void SetShell(string value) {
        using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ShellKeyPath, true)) {
            if (k != null) k.SetValue("Shell", value, RegistryValueKind.String);
        }
    }

    static void KillByName(string name) {
        foreach (Process p in Process.GetProcessesByName(name)) {
            try { p.Kill(); } catch { }
        }
    }

    static void WaitGone(string name, int timeoutMs) {
        int waited = 0;
        while (Process.GetProcessesByName(name).Length > 0 && waited < timeoutMs) {
            Thread.Sleep(250);
            waited += 250;
        }
    }

    static void WaitPresent(string name, int timeoutMs) {
        int waited = 0;
        while (Process.GetProcessesByName(name).Length == 0 && waited < timeoutMs) {
            Thread.Sleep(250);
            waited += 250;
        }
    }

    static void RunUpdate() {
        try {
            WaitGone("Alpine Shell", 15000);
            KillByName("Alpine Shell");
            Thread.Sleep(500);

            if (installerPath.Length > 0) {
                ProcessStartInfo psi = new ProcessStartInfo(installerPath, "/S");
                psi.UseShellExecute = false;
                Process inst = Process.Start(psi);
                if (inst != null) inst.WaitForExit();
            }

            HandBackToAlpine();
            WaitPresent("Alpine Shell", 30000);
            Thread.Sleep(1500);
        } catch {
            try { HandBackToAlpine(); } catch { }
        } finally {
            try { cover.Invoke((Action)Application.Exit); }
            catch { Application.Exit(); }
        }
    }

    static void HandBackToAlpine() {
        if (alpineExe.Length > 0) SetShell(alpineExe);
        KillByName("explorer");
    }
}
