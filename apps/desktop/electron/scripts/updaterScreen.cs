using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class AlpineUpdater {
    [DllImport("user32.dll")] static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    const int SW_HIDE = 0;
    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOACTIVATE = 0x0010;

    const string ShellKeyPath = @"Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

    static string installerPath = "";
    static string alpineExe = "";
    static string version = "";
    static string readyMarkerPath = "";

    static readonly List<Form> covers = new List<Form>();
    static readonly List<SpinnerControl> spinners = new List<SpinnerControl>();
    static volatile bool suppressTaskbar = true;
    static bool workerStarted = false;

    [STAThread]
    static void Main(string[] args) {
        if (args.Length > 0) installerPath = args[0];
        if (args.Length > 1) alpineExe = args[1];
        if (args.Length > 2) version = args[2];

        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        foreach (Screen screen in Screen.AllScreens) {
            covers.Add(CreateCover(screen));
        }
        if (covers.Count == 0) return;

        System.Windows.Forms.Timer spin = new System.Windows.Forms.Timer();
        spin.Interval = 16;
        spin.Tick += delegate {
            foreach (SpinnerControl s in spinners) s.Advance();
        };
        spin.Start();

        System.Windows.Forms.Timer onTop = new System.Windows.Forms.Timer();
        onTop.Interval = 250;
        onTop.Tick += delegate { KeepOnTop(); };
        onTop.Start();

        Form primary = covers[0];
        primary.Shown += delegate {
            if (workerStarted) return;
            workerStarted = true;
            KeepOnTop();
            Thread worker = new Thread(RunUpdate);
            worker.IsBackground = true;
            worker.Start();
        };

        for (int i = 1; i < covers.Count; i++) covers[i].Show();
        Application.Run(primary);
    }

    static Form CreateCover(Screen screen) {
        Form cover = new Form();
        cover.FormBorderStyle = FormBorderStyle.None;
        cover.StartPosition = FormStartPosition.Manual;
        cover.Bounds = screen.Bounds;
        cover.BackColor = ColorTranslator.FromHtml("#1a1a2e");
        cover.TopMost = true;
        cover.ShowInTaskbar = false;
        cover.ControlBox = false;
        cover.Cursor = Cursors.WaitCursor;

        SpinnerControl spinner = new SpinnerControl();
        spinner.Size = new Size(72, 72);
        spinner.BackColor = cover.BackColor;
        spinners.Add(spinner);
        cover.Controls.Add(spinner);

        Label title = new Label();
        title.Text = "Updating Alpine Shell";
        title.ForeColor = Color.White;
        title.Font = new Font("Segoe UI", 20f, FontStyle.Regular);
        title.AutoSize = true;
        title.BackColor = cover.BackColor;
        cover.Controls.Add(title);

        Label subtitle = new Label();
        subtitle.Text = version.Length > 0
            ? "Installing version " + version + " \u2014 please don't turn off your PC"
            : "Please don't turn off your PC";
        subtitle.ForeColor = ColorTranslator.FromHtml("#9aa0b4");
        subtitle.Font = new Font("Segoe UI", 11f, FontStyle.Regular);
        subtitle.AutoSize = true;
        subtitle.BackColor = cover.BackColor;
        cover.Controls.Add(subtitle);

        Form captured = cover;
        SpinnerControl capturedSpinner = spinner;
        Label capturedTitle = title;
        Label capturedSubtitle = subtitle;
        EventHandler layout = delegate { LayoutCover(captured, capturedSpinner, capturedTitle, capturedSubtitle); };
        cover.Shown += layout;
        cover.Resize += layout;

        return cover;
    }

    static void LayoutCover(Form cover, Control spinner, Control title, Control subtitle) {
        int centerX = cover.ClientSize.Width / 2;
        int spinnerGap = 32;
        int titleGap = 12;
        int blockHeight = spinner.Height + spinnerGap + title.Height + titleGap + subtitle.Height;
        int top = (cover.ClientSize.Height - blockHeight) / 2;

        spinner.Location = new Point(centerX - spinner.Width / 2, top);
        title.Location = new Point(centerX - title.Width / 2, spinner.Bottom + spinnerGap);
        subtitle.Location = new Point(centerX - subtitle.Width / 2, title.Bottom + titleGap);
    }

    static void KeepOnTop() {
        if (suppressTaskbar) HideTaskbars();
        foreach (Form f in covers) {
            try {
                if (f.IsHandleCreated) SetWindowPos(f.Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            } catch { }
        }
    }

    static void HideTaskbars() {
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

    static void DeleteMarker() {
        try {
            if (readyMarkerPath.Length > 0 && File.Exists(readyMarkerPath)) File.Delete(readyMarkerPath);
        } catch { }
    }

    static void WaitForMarker(int timeoutMs) {
        if (readyMarkerPath.Length == 0) {
            Thread.Sleep(4000);
            return;
        }
        int waited = 0;
        while (waited < timeoutMs) {
            try {
                if (File.Exists(readyMarkerPath)) return;
            } catch { }
            Thread.Sleep(120);
            waited += 120;
        }
    }

    static void RunUpdate() {
        try {
            try { readyMarkerPath = Path.Combine(Path.GetTempPath(), "alpine-shell-update-ready.flag"); } catch { readyMarkerPath = ""; }

            WaitGone("Alpine Shell", 15000);
            KillByName("Alpine Shell");
            Thread.Sleep(500);

            if (installerPath.Length > 0) {
                ProcessStartInfo psi = new ProcessStartInfo(installerPath, "/S");
                psi.UseShellExecute = false;
                Process inst = Process.Start(psi);
                if (inst != null) inst.WaitForExit();
            }

            DeleteMarker();
            HandBackToAlpine();
            WaitForMarker(60000);
            Thread.Sleep(300);
            DeleteMarker();
        } catch {
            try { HandBackToAlpine(); } catch { }
            try { Thread.Sleep(2000); } catch { }
        } finally {
            FadeOutAndExit();
        }
    }

    static void HandBackToAlpine() {
        suppressTaskbar = false;
        if (alpineExe.Length > 0) SetShell(BuildShellValue());
        KillByName("explorer");
    }

    static string BuildShellValue() {
        if (readyMarkerPath.Length > 0) {
            return "\"" + alpineExe + "\" --update-ready-marker \"" + readyMarkerPath + "\"";
        }
        return alpineExe;
    }

    static void FadeOutAndExit() {
        Form primary = covers.Count > 0 ? covers[0] : null;
        if (primary == null || !primary.IsHandleCreated) {
            try { Application.Exit(); } catch { }
            return;
        }
        try {
            primary.Invoke((Action)StartFade);
        } catch {
            try { Application.Exit(); } catch { }
        }
    }

    static void StartFade() {
        System.Windows.Forms.Timer fade = new System.Windows.Forms.Timer();
        fade.Interval = 16;
        fade.Tick += delegate {
            bool done = true;
            foreach (Form f in covers) {
                double next = f.Opacity - 0.08;
                if (next <= 0) {
                    next = 0;
                } else {
                    done = false;
                }
                try { f.Opacity = next; } catch { }
            }
            if (done) {
                fade.Stop();
                Application.Exit();
            }
        };
        fade.Start();
    }
}

class SpinnerControl : Control {
    float angle = 0f;

    public SpinnerControl() {
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
    }

    public void Advance() {
        angle = (angle + 6f) % 360f;
        if (IsHandleCreated) Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e) {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(BackColor);

        int pad = 6;
        Rectangle ring = new Rectangle(pad, pad, Width - pad * 2 - 1, Height - pad * 2 - 1);
        float thickness = 5f;

        using (Pen track = new Pen(Color.FromArgb(38, 255, 255, 255), thickness)) {
            g.DrawEllipse(track, ring);
        }
        using (Pen arc = new Pen(ColorTranslator.FromHtml("#7c9cff"), thickness)) {
            arc.StartCap = LineCap.Round;
            arc.EndCap = LineCap.Round;
            g.DrawArc(arc, ring, angle, 100f);
        }
    }
}
