using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class AlpineUpdater {
    [DllImport("user32.dll")] static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);

    delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);

    const int SW_HIDE = 0;
    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOACTIVATE = 0x0010;

    const int WH_KEYBOARD_LL = 13;
    const int HC_ACTION = 0;
    const int WM_KEYDOWN = 0x0100;
    const int WM_SYSKEYDOWN = 0x0104;
    const int VK_TAB = 0x09;
    const int VK_ESCAPE = 0x1B;
    const int VK_MENU = 0x12;
    const int VK_LWIN = 0x5B;
    const int VK_RWIN = 0x5C;
    const int VK_LEFT = 0x25;
    const int VK_UP = 0x26;
    const int VK_RIGHT = 0x27;
    const int VK_DOWN = 0x28;
    const int VK_D = 0x44;
    const int VK_E = 0x45;
    const int VK_R = 0x52;

    static IntPtr keyboardHook = IntPtr.Zero;
    static LowLevelKeyboardProc keyboardProc;

    const string ShellKeyPath = @"Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

    static string installerPath = "";
    static string alpineExe = "";
    static string version = "";
    static string logoPath = "";
    static Image brandLogo = null;
    static MemoryStream brandLogoStream = null;

    static readonly List<Form> covers = new List<Form>();
    static readonly List<SpinnerControl> spinners = new List<SpinnerControl>();
    static volatile bool suppressTaskbar = true;
    static bool workerStarted = false;

    public static readonly Color GradientTop = ColorTranslator.FromHtml("#001C30");
    public static readonly Color GradientBottom = ColorTranslator.FromHtml("#005896");
    static readonly string brandFontFamily = ResolveBrandFontFamily();

    [STAThread]
    static void Main(string[] args) {
        if (args.Length > 0) installerPath = args[0];
        if (args.Length > 1) alpineExe = args[1];
        if (args.Length > 2) version = args[2];
        if (args.Length > 3) logoPath = args[3];

        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        brandLogo = LoadBrandLogo();

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
        primary.FormClosed += delegate { UninstallInputGuard(); };
        primary.Shown += delegate {
            if (workerStarted) return;
            workerStarted = true;
            InstallInputGuard();
            try { SetForegroundWindow(primary.Handle); } catch { }
            try { BringWindowToTop(primary.Handle); } catch { }
            KeepOnTop();
            Thread worker = new Thread(RunUpdate);
            worker.IsBackground = true;
            worker.Start();
        };

        for (int i = 1; i < covers.Count; i++) covers[i].Show();
        Application.Run(primary);
    }

    static string ResolveBrandFontFamily() {
        try {
            using (new FontFamily("Segoe UI Variable Display")) { }
            return "Segoe UI Variable Display";
        } catch (ArgumentException) {
            return "Segoe UI";
        }
    }

    static Font BrandFont(float size, FontStyle style) {
        try {
            return new Font(brandFontFamily, size, style);
        } catch (ArgumentException) {
            return new Font("Segoe UI", size, style);
        }
    }

    static Image LoadBrandLogo() {
        try {
            if (logoPath.Length > 0 && File.Exists(logoPath)) {
                brandLogoStream = new MemoryStream(File.ReadAllBytes(logoPath));
                return Image.FromStream(brandLogoStream);
            }
        } catch { }
        return null;
    }

    static Form CreateCover(Screen screen) {
        Form cover = new Form();
        cover.FormBorderStyle = FormBorderStyle.None;
        cover.StartPosition = FormStartPosition.Manual;
        cover.Bounds = screen.Bounds;
        cover.BackColor = GradientTop;
        cover.TopMost = true;
        cover.ShowInTaskbar = false;
        cover.ControlBox = false;
        cover.Cursor = Cursors.WaitCursor;

        Form gradientTarget = cover;

        int logoSlotHeight = 48;
        int logoSlotWidth = 0;
        if (brandLogo != null) {
            logoSlotWidth = (int)Math.Round((double)brandLogo.Width * logoSlotHeight / brandLogo.Height);
        }

        Label wordmark = new Label();
        wordmark.BackColor = Color.Transparent;
        if (brandLogo != null) {
            wordmark.AutoSize = false;
            wordmark.Size = new Size(logoSlotWidth, logoSlotHeight);
            wordmark.Visible = false;
        } else {
            wordmark.Text = "Alpine Shell";
            wordmark.ForeColor = Color.White;
            wordmark.Font = BrandFont(26f, FontStyle.Bold);
            wordmark.AutoSize = true;
            wordmark.UseCompatibleTextRendering = true;
        }
        cover.Controls.Add(wordmark);

        Label wordmarkSlot = wordmark;
        cover.Paint += delegate(object paintSender, PaintEventArgs paintArgs) {
            Graphics g = paintArgs.Graphics;
            Rectangle area = gradientTarget.ClientRectangle;
            if (area.Width <= 0 || area.Height <= 0) return;
            using (LinearGradientBrush background = new LinearGradientBrush(area, GradientTop, GradientBottom, LinearGradientMode.Vertical)) {
                g.FillRectangle(background, area);
            }
            if (brandLogo != null && wordmarkSlot.Top > 0) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(brandLogo, wordmarkSlot.Bounds);
            }
        };

        SpinnerControl spinner = new SpinnerControl();
        spinner.Size = new Size(72, 72);
        spinner.BackColor = GradientTop;
        spinners.Add(spinner);
        cover.Controls.Add(spinner);

        Label title = new Label();
        title.Text = "Updating Alpine Shell";
        title.ForeColor = Color.White;
        title.Font = BrandFont(18f, FontStyle.Regular);
        title.AutoSize = true;
        title.BackColor = Color.Transparent;
        title.UseCompatibleTextRendering = true;
        cover.Controls.Add(title);

        Label subtitle = new Label();
        subtitle.Text = version.Length > 0
            ? "Installing version " + version + " \u2014 please don't turn off your PC"
            : "Please don't turn off your PC";
        subtitle.ForeColor = Color.FromArgb(179, 255, 255, 255);
        subtitle.Font = BrandFont(11f, FontStyle.Regular);
        subtitle.AutoSize = true;
        subtitle.BackColor = Color.Transparent;
        subtitle.UseCompatibleTextRendering = true;
        cover.Controls.Add(subtitle);

        Form captured = cover;
        SpinnerControl capturedSpinner = spinner;
        Label capturedWordmark = wordmark;
        Label capturedTitle = title;
        Label capturedSubtitle = subtitle;
        EventHandler layout = delegate { LayoutCover(captured, capturedWordmark, capturedSpinner, capturedTitle, capturedSubtitle); };
        cover.Shown += layout;
        cover.Resize += layout;

        return cover;
    }

    static void LayoutCover(Form cover, Control wordmark, Control spinner, Control title, Control subtitle) {
        int centerX = cover.ClientSize.Width / 2;
        int wordmarkGap = 40;
        int spinnerGap = 28;
        int titleGap = 8;
        int blockHeight = wordmark.Height + wordmarkGap + spinner.Height + spinnerGap + title.Height + titleGap + subtitle.Height;
        int top = (cover.ClientSize.Height - blockHeight) / 2;

        wordmark.Location = new Point(centerX - wordmark.Width / 2, top);
        spinner.Location = new Point(centerX - spinner.Width / 2, wordmark.Bottom + wordmarkGap);
        title.Location = new Point(centerX - title.Width / 2, spinner.Bottom + spinnerGap);
        subtitle.Location = new Point(centerX - subtitle.Width / 2, title.Bottom + titleGap);
        cover.Invalidate();
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

    static void InstallInputGuard() {
        if (keyboardHook != IntPtr.Zero) return;
        try {
            keyboardProc = new LowLevelKeyboardProc(KeyboardHookCallback);
            keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardProc, GetModuleHandle(null), 0);
        } catch { }
    }

    static void UninstallInputGuard() {
        try {
            if (keyboardHook != IntPtr.Zero) {
                UnhookWindowsHookEx(keyboardHook);
                keyboardHook = IntPtr.Zero;
            }
        } catch { }
    }

    static bool IsKeyDown(int vKey) {
        return (GetAsyncKeyState(vKey) & 0x8000) != 0;
    }

    static bool ShouldSwallow(int vkCode) {
        bool winDown = IsKeyDown(VK_LWIN) || IsKeyDown(VK_RWIN);
        bool altDown = IsKeyDown(VK_MENU);

        if (vkCode == VK_LWIN || vkCode == VK_RWIN) return true;
        if (vkCode == VK_TAB && altDown) return true;
        if (vkCode == VK_ESCAPE && altDown) return true;
        if (winDown && (vkCode == VK_LEFT || vkCode == VK_RIGHT || vkCode == VK_UP || vkCode == VK_DOWN)) return true;
        if (winDown && (vkCode == VK_D || vkCode == VK_E || vkCode == VK_R)) return true;
        return false;
    }

    static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode == HC_ACTION) {
            try {
                int message = wParam.ToInt32();
                if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
                    int vkCode = Marshal.ReadInt32(lParam);
                    if (ShouldSwallow(vkCode)) return (IntPtr)1;
                }
            } catch { }
        }
        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
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
            WaitPresent("Alpine Shell", 60000);
            Thread.Sleep(4000);
        } catch {
            try { HandBackToAlpine(); } catch { }
            try { Thread.Sleep(2000); } catch { }
        } finally {
            FadeOutAndExit();
        }
    }

    static void HandBackToAlpine() {
        suppressTaskbar = false;
        if (alpineExe.Length > 0) {
            SetShell(alpineExe);
            LaunchAlpine();
        }
        KillByName("explorer");
    }

    static void LaunchAlpine() {
        if (alpineExe.Length == 0) return;
        try {
            ProcessStartInfo psi = new ProcessStartInfo(alpineExe);
            psi.UseShellExecute = true;
            try { psi.WorkingDirectory = System.IO.Path.GetDirectoryName(alpineExe); } catch { }
            Process.Start(psi);
        } catch { }
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

        Control host = Parent;
        if (host != null && host.ClientSize.Height > 0) {
            Rectangle gradientArea = new Rectangle(0, -Top, Width, host.ClientSize.Height);
            using (LinearGradientBrush background = new LinearGradientBrush(gradientArea, AlpineUpdater.GradientTop, AlpineUpdater.GradientBottom, LinearGradientMode.Vertical)) {
                g.FillRectangle(background, 0, 0, Width, Height);
            }
        } else {
            g.Clear(BackColor);
        }

        int pad = 6;
        Rectangle ring = new Rectangle(pad, pad, Width - pad * 2 - 1, Height - pad * 2 - 1);
        float thickness = 5f;

        using (Pen track = new Pen(ColorTranslator.FromHtml("#404040"), thickness)) {
            g.DrawEllipse(track, ring);
        }
        using (Pen arc = new Pen(Color.White, thickness)) {
            arc.StartCap = LineCap.Round;
            arc.EndCap = LineCap.Round;
            g.DrawArc(arc, ring, angle, 100f);
        }
    }
}
