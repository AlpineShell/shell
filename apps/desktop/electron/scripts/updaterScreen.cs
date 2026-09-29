using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
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
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] static extern int GetDeviceCaps(IntPtr hdc, int nIndex);

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
    const int SW_SHOWNA = 8;
    const int LOGPIXELSY = 90;
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
    const string PreviewFlag = "--preview";
    const string LeaveShellToExplorerFlag = "--leave-shell-to-explorer";
    const string AlpineProcessName = "Alpine Shell";
    const string ExplorerProcessName = "explorer";
    const int ReadyTimeoutMs = 60000;
    const int AlpineStartGraceMs = 3000;
    const int ExplorerRestartSettleMs = 1500;

    static string installerPath = "";
    static string alpineExe = "";
    static string version = "";
    static string readyMarkerPath = "";
    static string logoPath = "";
    static string displayFontPath = "";
    static Image brandLogo = null;
    static MemoryStream brandLogoStream = null;
    static PrivateFontCollection displayFonts = null;
    static FontFamily displayFontFamily = null;

    static readonly List<Form> covers = new List<Form>();
    static volatile bool suppressTaskbar = true;
    static bool workerStarted = false;
    static bool previewMode = false;
    static bool handShellBackToAlpine = true;
    static float dpiScale = 1f;

    public static readonly Color CoverGround = ColorTranslator.FromHtml("#212120");
    public static readonly Color PrimaryInk = ColorTranslator.FromHtml("#ebebe7");
    public static readonly Color SecondaryInk = ColorTranslator.FromHtml("#b8b8b2");
    static readonly string bodyFontFamily = ResolveBodyFontFamily();

    [STAThread]
    static void Main(string[] args) {
        List<string> positional = new List<string>();
        foreach (string arg in args) {
            if (arg == PreviewFlag) {
                previewMode = true;
                suppressTaskbar = false;
            } else if (arg == LeaveShellToExplorerFlag) {
                handShellBackToAlpine = false;
            } else {
                positional.Add(arg);
            }
        }

        if (positional.Count > 0) installerPath = positional[0];
        if (positional.Count > 1) alpineExe = positional[1];
        if (positional.Count > 2) version = positional[2];
        if (positional.Count > 3) logoPath = positional[3];
        if (positional.Count > 4) displayFontPath = positional[4];

        try { SetProcessDPIAware(); } catch { }
        dpiScale = ResolveDpiScale();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        LoadDisplayFont();
        brandLogo = LoadBrandLogo();

        foreach (Screen screen in Screen.AllScreens) {
            covers.Add(CreateCover(screen));
        }
        if (covers.Count == 0) return;

        System.Windows.Forms.Timer onTop = new System.Windows.Forms.Timer();
        onTop.Interval = 250;
        onTop.Tick += delegate { KeepOnTop(); };
        onTop.Start();

        Form primary = covers[0];
        primary.FormClosed += delegate { UninstallInputGuard(); };
        primary.Shown += delegate {
            if (workerStarted) return;
            workerStarted = true;
            if (!previewMode) InstallInputGuard();
            try { SetForegroundWindow(primary.Handle); } catch { }
            try { BringWindowToTop(primary.Handle); } catch { }
            KeepOnTop();
            if (previewMode) return;
            Thread worker = new Thread(RunUpdate);
            worker.IsBackground = true;
            worker.Start();
        };

        for (int i = 1; i < covers.Count; i++) covers[i].Show();
        Application.Run(primary);
    }

    static float ResolveDpiScale() {
        IntPtr screenDc = IntPtr.Zero;
        try {
            screenDc = GetDC(IntPtr.Zero);
            if (screenDc == IntPtr.Zero) return 1f;
            int screenDpi = GetDeviceCaps(screenDc, LOGPIXELSY);
            if (screenDpi > 0) return screenDpi / 96f;
        } catch {
        } finally {
            if (screenDc != IntPtr.Zero) {
                try { ReleaseDC(IntPtr.Zero, screenDc); } catch { }
            }
        }
        return 1f;
    }

    static int ScaleUnits(int designUnits) {
        return (int)Math.Round(designUnits * dpiScale);
    }

    static string ResolveBodyFontFamily() {
        try {
            using (new FontFamily("Segoe UI Variable Text")) { }
            return "Segoe UI Variable Text";
        } catch (ArgumentException) {
            return "Segoe UI";
        }
    }

    static Font BodyFont(float size, FontStyle style) {
        try {
            return new Font(bodyFontFamily, size, style);
        } catch (ArgumentException) {
            return new Font("Segoe UI", size, style);
        }
    }

    static void LoadDisplayFont() {
        try {
            if (displayFontPath.Length == 0 || !File.Exists(displayFontPath)) return;
            displayFonts = new PrivateFontCollection();
            displayFonts.AddFontFile(displayFontPath);
            if (displayFonts.Families.Length > 0) displayFontFamily = displayFonts.Families[0];
        } catch { }
    }

    static Font DisplayFont(float size) {
        if (displayFontFamily != null) {
            try {
                return new Font(displayFontFamily, size, FontStyle.Regular);
            } catch (ArgumentException) { }
        }
        return BodyFont(size, FontStyle.Regular);
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
        CoverForm cover = new CoverForm();
        cover.FormBorderStyle = FormBorderStyle.None;
        cover.StartPosition = FormStartPosition.Manual;
        cover.Bounds = screen.Bounds;
        cover.BackColor = CoverGround;
        cover.TopMost = true;
        cover.ShowInTaskbar = false;
        cover.ControlBox = false;
        cover.Cursor = Cursors.WaitCursor;

        int logoSlotHeight = ScaleUnits(48);
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
            wordmark.ForeColor = PrimaryInk;
            wordmark.Font = DisplayFont(30f);
            wordmark.AutoSize = true;
            wordmark.UseCompatibleTextRendering = true;
        }
        cover.Controls.Add(wordmark);

        Label wordmarkSlot = wordmark;
        cover.Paint += delegate(object paintSender, PaintEventArgs paintArgs) {
            if (brandLogo == null || wordmarkSlot.Top <= 0) return;
            Graphics g = paintArgs.Graphics;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(brandLogo, wordmarkSlot.Bounds);
        };

        Label title = new Label();
        title.Text = "Updating Alpine Shell";
        title.ForeColor = PrimaryInk;
        title.Font = DisplayFont(20f);
        title.AutoSize = true;
        title.BackColor = Color.Transparent;
        title.UseCompatibleTextRendering = true;
        cover.Controls.Add(title);

        Label subtitle = new Label();
        subtitle.Text = version.Length > 0
            ? "Installing version " + version + " \u2014 please don't turn off your PC"
            : "Please don't turn off your PC";
        subtitle.ForeColor = SecondaryInk;
        subtitle.Font = BodyFont(11f, FontStyle.Regular);
        subtitle.AutoSize = true;
        subtitle.BackColor = Color.Transparent;
        subtitle.UseCompatibleTextRendering = true;
        cover.Controls.Add(subtitle);

        if (previewMode) AllowPreviewDismissal(cover);

        Form captured = cover;
        Label capturedWordmark = wordmark;
        Label capturedTitle = title;
        Label capturedSubtitle = subtitle;
        EventHandler layout = delegate { LayoutCover(captured, capturedWordmark, capturedTitle, capturedSubtitle); };
        cover.Load += layout;
        cover.Resize += layout;

        return cover;
    }

    static void AllowPreviewDismissal(Form cover) {
        cover.KeyPreview = true;
        cover.KeyDown += delegate(object keySender, KeyEventArgs keyArgs) {
            if (keyArgs.KeyCode == Keys.Escape) Application.Exit();
        };
        cover.Click += delegate { Application.Exit(); };
    }

    static void LayoutCover(Form cover, Control wordmark, Control title, Control subtitle) {
        int centerX = cover.ClientSize.Width / 2;
        int wordmarkGap = ScaleUnits(40);
        int titleGap = ScaleUnits(10);
        int blockHeight = wordmark.Height + wordmarkGap + title.Height + titleGap + subtitle.Height;
        int top = (cover.ClientSize.Height - blockHeight) / 2;

        wordmark.Location = new Point(centerX - wordmark.Width / 2, top);
        title.Location = new Point(centerX - title.Width / 2, wordmark.Bottom + wordmarkGap);
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

    static void RestoreTaskbar() {
        suppressTaskbar = false;
        try {
            IntPtr tray = FindWindow("Shell_TrayWnd", null);
            if (tray != IntPtr.Zero) ShowWindow(tray, SW_SHOWNA);
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

    static void DeleteMarker() {
        try {
            if (readyMarkerPath.Length > 0 && File.Exists(readyMarkerPath)) File.Delete(readyMarkerPath);
        } catch { }
    }

    static bool IsRunningInThisSession(string processName) {
        try {
            int sessionId;
            using (Process self = Process.GetCurrentProcess()) sessionId = self.SessionId;
            bool running = false;
            foreach (Process p in Process.GetProcessesByName(processName)) {
                using (p) {
                    if (p.SessionId == sessionId) running = true;
                }
            }
            return running;
        } catch {
            return true;
        }
    }

    static bool WaitForMarker(int timeoutMs) {
        if (readyMarkerPath.Length == 0) {
            Thread.Sleep(4000);
            return IsRunningInThisSession(AlpineProcessName);
        }
        int waited = 0;
        while (waited < timeoutMs) {
            try {
                if (File.Exists(readyMarkerPath)) return true;
            } catch { }
            if (waited >= AlpineStartGraceMs && !IsRunningInThisSession(AlpineProcessName)) return false;
            Thread.Sleep(120);
            waited += 120;
        }
        return false;
    }

    static void RunUpdate() {
        bool alpineCameUp = false;
        try {
            try { readyMarkerPath = Path.Combine(Path.GetTempPath(), "alpine-shell-update-ready.flag"); } catch { readyMarkerPath = ""; }

            WaitGone(AlpineProcessName, 15000);
            KillByName(AlpineProcessName);
            Thread.Sleep(500);

            RunInstaller();
            alpineCameUp = StartUpdatedAlpine();
        } catch {
            alpineCameUp = false;
        } finally {
            if (alpineCameUp) {
                try { Thread.Sleep(300); } catch { }
            } else {
                try { FallBackToExplorer(); } catch { }
            }
            DeleteMarker();
            FadeOutAndExit();
        }
    }

    static void RunInstaller() {
        if (installerPath.Length == 0) return;
        try {
            ProcessStartInfo psi = new ProcessStartInfo(installerPath, "/S");
            psi.UseShellExecute = false;
            using (Process inst = Process.Start(psi)) {
                if (inst != null) inst.WaitForExit();
            }
        } catch { }
    }

    static bool StartUpdatedAlpine() {
        if (alpineExe.Length == 0 || !File.Exists(alpineExe)) return false;
        DeleteMarker();
        if (handShellBackToAlpine) {
            suppressTaskbar = false;
            SetShell(BuildShellValue());
        }
        if (!LaunchAlpine()) return false;
        if (handShellBackToAlpine) KillByName(ExplorerProcessName);
        if (!WaitForMarker(ReadyTimeoutMs)) return false;
        if (handShellBackToAlpine) {
            try { SetShell(alpineExe); } catch { }
        } else {
            RestoreTaskbar();
        }
        return true;
    }

    static void FallBackToExplorer() {
        suppressTaskbar = false;
        try { SetShell("explorer.exe"); } catch { }
        KillByName(AlpineProcessName);
        Thread.Sleep(ExplorerRestartSettleMs);
        if (!IsRunningInThisSession(ExplorerProcessName)) StartExplorer();
        RestoreTaskbar();
    }

    static void StartExplorer() {
        try {
            string windowsDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            ProcessStartInfo psi = new ProcessStartInfo(Path.Combine(windowsDir, "explorer.exe"));
            psi.UseShellExecute = false;
            psi.WorkingDirectory = windowsDir;
            using (Process.Start(psi)) { }
        } catch { }
    }

    static string BuildShellValue() {
        if (readyMarkerPath.Length > 0) {
            return "\"" + alpineExe + "\" --update-ready-marker \"" + readyMarkerPath + "\"";
        }
        return alpineExe;
    }

    static bool LaunchAlpine() {
        try {
            ProcessStartInfo psi = new ProcessStartInfo(alpineExe);
            psi.UseShellExecute = true;
            if (readyMarkerPath.Length > 0) psi.Arguments = "--update-ready-marker \"" + readyMarkerPath + "\"";
            try { psi.WorkingDirectory = System.IO.Path.GetDirectoryName(alpineExe); } catch { }
            using (Process.Start(psi)) { }
            return true;
        } catch {
            return false;
        }
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

class CoverForm : Form {
    public CoverForm() {
        DoubleBuffered = true;
    }
}
