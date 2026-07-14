Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -ReferencedAssemblies 'Accessibility', 'UIAutomationClient', 'UIAutomationTypes', 'WindowsBase' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using Accessibility;

public class BrowserTabWalker {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int n);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("oleacc.dll")] private static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint id, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);
    [DllImport("oleacc.dll")] private static extern int AccessibleChildren(IAccessible paccContainer, int iChildStart, int cChildren, [Out] object[] rgvarChildren, out int pcObtained);

    private const uint OBJID_CLIENT = 0xFFFFFFFC;
    private const int ROLE_PAGETABLIST = 0x3C;
    private const int ROLE_PAGETAB = 0x25;
    private const int ROLE_DOCUMENT = 0x0F;
    private const int STATE_SELECTED = 0x2;
    private const int MSAA_MAX_DEPTH = 14;
    private const string CHROMIUM_WINDOW_CLASS = "Chrome_WidgetWin_1";
    private const string FIREFOX_WINDOW_CLASS = "MozillaWindowClass";
    private static readonly HashSet<string> BrowserProcessNames = new HashSet<string> { "chrome", "msedge", "brave", "opera", "vivaldi", "firefox" };

    private class BrowserWindow {
        public long Hwnd;
        public string Browser;
        public bool IsFirefox;
    }

    private static List<BrowserWindow> FindBrowserWindows() {
        var windows = new List<BrowserWindow>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd) || GetWindowTextLength(hWnd) == 0) return true;
            var sb = new StringBuilder(64);
            GetClassName(hWnd, sb, 64);
            string windowClass = sb.ToString();
            bool isFirefox = windowClass == FIREFOX_WINDOW_CLASS;
            if (!isFirefox && windowClass != CHROMIUM_WINDOW_CLASS) return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            string processName;
            try { processName = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { return true; }
            if (!BrowserProcessNames.Contains(processName)) return true;
            windows.Add(new BrowserWindow { Hwnd = hWnd.ToInt64(), Browser = processName, IsFirefox = isFirefox });
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    private static string Sanitize(string value) {
        if (value == null) return "";
        return value.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
    }

    private static void AddRow(List<string> rows, BrowserWindow win, int index, bool selected, string title) {
        rows.Add(win.Hwnd + "\t" + win.Browser + "\t" + index + "\t" + (selected ? "1" : "0") + "\t" + Sanitize(title));
    }

    private static bool UiaInsideDocument(AutomationElement element, AutomationElement windowRoot) {
        var walker = TreeWalker.ControlViewWalker;
        AutomationElement current = element;
        for (int depth = 0; depth < 24; depth++) {
            AutomationElement parent;
            try { parent = walker.GetParent(current); } catch { return true; }
            if (parent == null) return false;
            try {
                if (Automation.Compare(parent, windowRoot)) return false;
                if (parent.Current.ControlType == ControlType.Document) return true;
            } catch { return true; }
            current = parent;
        }
        return true;
    }

    private static AutomationElement UiaTabStrip(AutomationElement window) {
        AutomationElementCollection candidates;
        try { candidates = window.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Tab)); } catch { return null; }
        foreach (AutomationElement candidate in candidates) {
            if (!UiaInsideDocument(candidate, window)) return candidate;
        }
        return null;
    }

    private static AutomationElementCollection UiaTabItems(long hwnd) {
        AutomationElement window;
        try { window = AutomationElement.FromHandle(new IntPtr(hwnd)); } catch { return null; }
        if (window == null) return null;
        AutomationElement strip = UiaTabStrip(window);
        if (strip == null) return null;
        try { return strip.FindAll(TreeScope.Children, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem)); } catch { return null; }
    }

    private static string UiaName(AutomationElement item) {
        try { return item.Current.Name; } catch { return null; }
    }

    private static bool UiaSelected(AutomationElement item) {
        try { return (bool)item.GetCurrentPropertyValue(SelectionItemPattern.IsSelectedProperty); } catch { return false; }
    }

    private static void ListUiaTabs(BrowserWindow win, List<string> rows) {
        var items = UiaTabItems(win.Hwnd);
        if (items == null) return;
        int index = 0;
        foreach (AutomationElement item in items) {
            string title = UiaName(item);
            if (!string.IsNullOrEmpty(title)) AddRow(rows, win, index, UiaSelected(item), title);
            index++;
        }
    }

    private static string ActivateUiaTab(BrowserWindow win, int index, string title) {
        var items = UiaTabItems(win.Hwnd);
        if (items == null || items.Count == 0) return "notabs";
        AutomationElement target = null;
        if (index >= 0 && index < items.Count && UiaNameStartsWith(items[index], title)) target = items[index];
        if (target == null) {
            foreach (AutomationElement item in items) {
                if (UiaNameStartsWith(item, title)) { target = item; break; }
            }
        }
        if (target == null && index >= 0 && index < items.Count) target = items[index];
        if (target == null) return "notfound";
        try {
            var pattern = (SelectionItemPattern)target.GetCurrentPattern(SelectionItemPattern.Pattern);
            pattern.Select();
            return "ok";
        } catch { return "error"; }
    }

    private static bool UiaNameStartsWith(AutomationElement item, string title) {
        string name = UiaName(item);
        return name != null && Sanitize(name).StartsWith(title);
    }

    private static IAccessible MsaaFromWindow(long hwnd) {
        Guid iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
        object obj;
        int hr = AccessibleObjectFromWindow(new IntPtr(hwnd), OBJID_CLIENT, ref iid, out obj);
        if (hr != 0) return null;
        return obj as IAccessible;
    }

    private static List<IAccessible> MsaaChildren(IAccessible acc) {
        var result = new List<IAccessible>();
        int count = 0;
        try { count = acc.accChildCount; } catch { return result; }
        if (count <= 0 || count > 512) return result;
        var raw = new object[count];
        int got;
        if (AccessibleChildren(acc, 0, count, raw, out got) != 0) return result;
        for (int i = 0; i < got; i++) {
            var child = raw[i] as IAccessible;
            if (child != null) result.Add(child);
        }
        return result;
    }

    private static int MsaaRole(IAccessible acc) {
        try {
            object role = acc.get_accRole(0);
            if (role is int) return (int)role;
        } catch { }
        return -1;
    }

    private static IAccessible MsaaFindTabList(IAccessible acc, int depth) {
        int role = MsaaRole(acc);
        if (role == ROLE_PAGETABLIST) return acc;
        if (role == ROLE_DOCUMENT || depth > MSAA_MAX_DEPTH) return null;
        foreach (var child in MsaaChildren(acc)) {
            var hit = MsaaFindTabList(child, depth + 1);
            if (hit != null) return hit;
        }
        return null;
    }

    private static List<IAccessible> MsaaTabItems(long hwnd) {
        var tabs = new List<IAccessible>();
        var root = MsaaFromWindow(hwnd);
        if (root == null) return tabs;
        var tabList = MsaaFindTabList(root, 0);
        if (tabList == null) return tabs;
        foreach (var child in MsaaChildren(tabList)) {
            if (MsaaRole(child) == ROLE_PAGETAB) tabs.Add(child);
        }
        return tabs;
    }

    private static string MsaaName(IAccessible acc) {
        try { return acc.get_accName(0); } catch { return null; }
    }

    private static bool MsaaSelected(IAccessible acc) {
        try {
            object state = acc.get_accState(0);
            if (state is int) return ((int)state & STATE_SELECTED) != 0;
        } catch { }
        return false;
    }

    private static void ListMsaaTabs(BrowserWindow win, List<string> rows) {
        var items = MsaaTabItems(win.Hwnd);
        int index = 0;
        foreach (var item in items) {
            string title = MsaaName(item);
            if (!string.IsNullOrEmpty(title)) AddRow(rows, win, index, MsaaSelected(item), title);
            index++;
        }
    }

    private static string ActivateMsaaTab(BrowserWindow win, int index, string title) {
        var items = MsaaTabItems(win.Hwnd);
        if (items.Count == 0) return "notabs";
        IAccessible target = null;
        if (index >= 0 && index < items.Count && MsaaNameStartsWith(items[index], title)) target = items[index];
        if (target == null) {
            foreach (var item in items) {
                if (MsaaNameStartsWith(item, title)) { target = item; break; }
            }
        }
        if (target == null && index >= 0 && index < items.Count) target = items[index];
        if (target == null) return "notfound";
        try { target.accDoDefaultAction(0); return "ok"; } catch { }
        try { target.accSelect(STATE_SELECTED, 0); return "ok"; } catch { }
        return "error";
    }

    private static bool MsaaNameStartsWith(IAccessible item, string title) {
        string name = MsaaName(item);
        return name != null && Sanitize(name).StartsWith(title);
    }

    public static string[] ListTabs() {
        var rows = new List<string>();
        foreach (var win in FindBrowserWindows()) {
            if (win.IsFirefox) {
                int before = rows.Count;
                ListMsaaTabs(win, rows);
                if (rows.Count == before) {
                    Thread.Sleep(300);
                    ListMsaaTabs(win, rows);
                }
            } else {
                ListUiaTabs(win, rows);
            }
        }
        return rows.ToArray();
    }

    public static string ActivateTab(long hwnd, int index, string title) {
        foreach (var win in FindBrowserWindows()) {
            if (win.Hwnd != hwnd) continue;
            if (win.IsFirefox) return ActivateMsaaTab(win, index, title);
            return ActivateUiaTab(win, index, title);
        }
        return "notfound";
    }
}
'@

function Get-BrowserTabs {
  try {
    $rows = [BrowserTabWalker]::ListTabs()
    if ($rows.Count -gt 0) { $rows -join "`n" } else { '' }
  } catch { '' }
}

function Select-BrowserTab([long]$Hwnd, [int]$Index, [string]$TitleBase64) {
  try {
    $title = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TitleBase64))
    [BrowserTabWalker]::ActivateTab($Hwnd, $Index, $title)
  } catch { 'error' }
}
