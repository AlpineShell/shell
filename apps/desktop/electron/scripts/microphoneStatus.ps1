[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class MicDetect {
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection {
        int GetCount(out int count);
        int Item(int index, out IMMDevice device);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2 {
        int _placeholder1();
        int _placeholder2();
        int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator {
        int GetCount(out int count);
        int GetSession(int index, out IAudioSessionControl session);
    }

    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int GetGroupingParam(out Guid grouping);
        int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid grouping, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
    }

    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2 {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int GetGroupingParam(out Guid grouping);
        int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid grouping, [MarshalAs(UnmanagedType.LPStruct)] Guid ctx);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out int pid);
        int IsSystemSoundsSession();
        int SetDuckingPreference(int optOut);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator {}

    static readonly Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");

    public static string[] GetActiveCapturers() {
        var names = new List<string>();
        try {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            IMMDeviceCollection devices;
            enumerator.EnumAudioEndpoints(1, 1, out devices);
            int count;
            devices.GetCount(out count);
            for (int i = 0; i < count; i++) {
                IMMDevice device;
                devices.Item(i, out device);
                object obj;
                device.Activate(IID_IAudioSessionManager2, 0x17, IntPtr.Zero, out obj);
                var mgr = (IAudioSessionManager2)obj;
                IAudioSessionEnumerator sessionEnum;
                mgr.GetSessionEnumerator(out sessionEnum);
                int sCount;
                sessionEnum.GetCount(out sCount);
                for (int j = 0; j < sCount; j++) {
                    IAudioSessionControl ctrl;
                    sessionEnum.GetSession(j, out ctrl);
                    int state;
                    ctrl.GetState(out state);
                    if (state == 1) {
                        try {
                            var ctrl2 = (IAudioSessionControl2)ctrl;
                            int pid;
                            ctrl2.GetProcessId(out pid);
                            if (pid > 0) {
                                var proc = Process.GetProcessById(pid);
                                if (!names.Contains(proc.ProcessName))
                                    names.Add(proc.ProcessName);
                            }
                        } catch {}
                    }
                }
            }
        } catch {}
        return names.ToArray();
    }
}
'@ -ErrorAction SilentlyContinue

$results = [MicDetect]::GetActiveCapturers()

if ($results.Count -eq 0) {
    Write-Output '{}'
} else {
    @{ active = $true; apps = $results } | ConvertTo-Json -Compress
}
