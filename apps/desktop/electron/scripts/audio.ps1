param([string]$Action, [int]$Value)

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(ref Guid pguidEventContext);
    int VolumeStepDown(ref Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float pfPeak);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    [PreserveSig] int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}

[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint pcDevices);
    [PreserveSig] int Item(uint nDevice, out IMMDevice ppDevice);
}

[StructLayout(LayoutKind.Sequential)]
struct PropertyKey {
    public Guid FormatId;
    public int PropertyId;
}

[StructLayout(LayoutKind.Sequential)]
struct PropVariant {
    public ushort ValueType;
    public ushort Reserved1;
    public ushort Reserved2;
    public ushort Reserved3;
    public IntPtr Data;
    public IntPtr Data2;
}

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
    [PreserveSig] int GetCount(out uint cProps);
    [PreserveSig] int GetAt(uint iProp, out PropertyKey pkey);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant pv);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant propvar);
    [PreserveSig] int Commit();
}

[ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
    [PreserveSig] int GetMixFormat();
    [PreserveSig] int GetDeviceFormat();
    [PreserveSig] int ResetDeviceFormat();
    [PreserveSig] int SetDeviceFormat();
    [PreserveSig] int GetProcessingPeriod();
    [PreserveSig] int SetProcessingPeriod();
    [PreserveSig] int GetShareMode();
    [PreserveSig] int SetShareMode();
    [PreserveSig] int GetPropertyValue();
    [PreserveSig] int SetPropertyValue();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    [PreserveSig] int SetEndpointVisibility();
}

[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
class PolicyConfigComObject {}

public class AudioEndpoint {
    public string Id { get; set; }
    public string Name { get; set; }
    public string Flow { get; set; }
    public bool IsDefault { get; set; }
}

public static class AudioDevices {
    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant pvar);

    private const int RenderFlow = 0;
    private const int CaptureFlow = 1;
    private const int ActiveDevices = 1;
    private const int MultimediaRole = 1;
    private const int RoleCount = 3;
    private const ushort WideStringType = 31;
    private static readonly Guid FriendlyNameFormat = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0");
    private const int FriendlyNameProperty = 14;

    private static void Release(object instance) {
        if (instance != null && Marshal.IsComObject(instance)) Marshal.ReleaseComObject(instance);
    }

    private static T TakeInterface<T>(IntPtr pointer) {
        try {
            return (T)Marshal.GetObjectForIUnknown(pointer);
        } finally {
            Marshal.Release(pointer);
        }
    }

    public static AudioEndpoint[] List() {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
        try {
            var endpoints = new List<AudioEndpoint>();
            AddEndpoints(enumerator, RenderFlow, "output", endpoints);
            AddEndpoints(enumerator, CaptureFlow, "input", endpoints);
            return endpoints.ToArray();
        } finally {
            Release(enumerator);
        }
    }

    public static bool SetDefault(string deviceId) {
        var policy = (IPolicyConfig)new PolicyConfigComObject();
        try {
            for (int role = 0; role < RoleCount; role++) {
                if (policy.SetDefaultEndpoint(deviceId, role) != 0) return false;
            }
            return true;
        } finally {
            Release(policy);
        }
    }

    private static string DefaultEndpointId(IMMDeviceEnumerator enumerator, int dataFlow) {
        IMMDevice device;
        if (enumerator.GetDefaultAudioEndpoint(dataFlow, MultimediaRole, out device) != 0 || device == null) return null;
        try {
            string deviceId;
            device.GetId(out deviceId);
            return deviceId;
        } finally {
            Release(device);
        }
    }

    private static void AddEndpoints(IMMDeviceEnumerator enumerator, int dataFlow, string flow, List<AudioEndpoint> endpoints) {
        string defaultId = DefaultEndpointId(enumerator, dataFlow);
        IntPtr collectionPointer;
        if (enumerator.EnumAudioEndpoints(dataFlow, ActiveDevices, out collectionPointer) != 0 || collectionPointer == IntPtr.Zero) return;
        var collection = TakeInterface<IMMDeviceCollection>(collectionPointer);
        try {
            uint count;
            if (collection.GetCount(out count) != 0) return;
            for (uint index = 0; index < count; index++) {
                IMMDevice device;
                if (collection.Item(index, out device) != 0 || device == null) continue;
                try {
                    string deviceId;
                    device.GetId(out deviceId);
                    endpoints.Add(new AudioEndpoint {
                        Id = deviceId,
                        Name = FriendlyName(device),
                        Flow = flow,
                        IsDefault = deviceId == defaultId
                    });
                } finally {
                    Release(device);
                }
            }
        } finally {
            Release(collection);
        }
    }

    private static string FriendlyName(IMMDevice device) {
        IntPtr storePointer;
        if (device.OpenPropertyStore(0, out storePointer) != 0 || storePointer == IntPtr.Zero) return null;
        var store = TakeInterface<IPropertyStore>(storePointer);
        try {
            var key = new PropertyKey { FormatId = FriendlyNameFormat, PropertyId = FriendlyNameProperty };
            PropVariant value;
            if (store.GetValue(ref key, out value) != 0) return null;
            try {
                return value.ValueType == WideStringType ? Marshal.PtrToStringUni(value.Data) : null;
            } finally {
                PropVariantClear(ref value);
            }
        } finally {
            Release(store);
        }
    }
}

public class Audio {
    private static IMMDeviceEnumerator deviceEnumerator;
    private static string boundDeviceId;
    private static IAudioEndpointVolume boundVolume;
    private static IAudioMeterInformation boundMeter;

    private static void ReleaseComReference(object instance) {
        if (instance == null) return;
        try {
            if (Marshal.IsComObject(instance)) Marshal.ReleaseComObject(instance);
        } catch {
        }
    }

    private static void ReleaseActivatedInterfaces() {
        ReleaseComReference(boundMeter);
        ReleaseComReference(boundVolume);
        boundVolume = null;
        boundMeter = null;
        boundDeviceId = null;
    }

    private static void ReleaseBinding() {
        ReleaseActivatedInterfaces();
        ReleaseComReference(deviceEnumerator);
        deviceEnumerator = null;
    }

    private static void BindDefaultEndpoint() {
        if (deviceEnumerator == null)
            deviceEnumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
        IMMDevice device;
        deviceEnumerator.GetDefaultAudioEndpoint(0, 1, out device);
        if (device == null) throw new InvalidOperationException("no default render endpoint");
        try {
            string deviceId;
            device.GetId(out deviceId);
            if (deviceId == boundDeviceId && boundVolume != null && boundMeter != null) return;
            var volumeIid = typeof(IAudioEndpointVolume).GUID;
            object volumeInterface;
            device.Activate(ref volumeIid, 1, IntPtr.Zero, out volumeInterface);
            var meterIid = typeof(IAudioMeterInformation).GUID;
            object meterInterface;
            device.Activate(ref meterIid, 1, IntPtr.Zero, out meterInterface);
            ReleaseActivatedInterfaces();
            boundVolume = (IAudioEndpointVolume)volumeInterface;
            boundMeter = (IAudioMeterInformation)meterInterface;
            boundDeviceId = deviceId;
        } finally {
            ReleaseComReference(device);
        }
    }

    private static bool IsRecoverableComFailure(Exception error) {
        return error is COMException
            || error is InvalidComObjectException
            || error is InvalidCastException
            || error is NullReferenceException
            || error is InvalidOperationException;
    }

    private static T OnBoundEndpoint<T>(Func<T> body) {
        try {
            BindDefaultEndpoint();
            return body();
        } catch (Exception error) {
            if (!IsRecoverableComFailure(error)) throw;
            ReleaseBinding();
            BindDefaultEndpoint();
            return body();
        }
    }

    private static float ReadVolume() {
        float level;
        boundVolume.GetMasterVolumeLevelScalar(out level);
        return level;
    }

    private static bool ReadMute() {
        bool muted;
        boundVolume.GetMute(out muted);
        return muted;
    }

    public static float GetVolume() {
        return OnBoundEndpoint(new Func<float>(ReadVolume));
    }

    public static void SetVolume(float level) {
        OnBoundEndpoint(new Func<bool>(delegate {
            var context = Guid.Empty;
            boundVolume.SetMasterVolumeLevelScalar(level, ref context);
            return true;
        }));
    }

    public static bool GetMute() {
        return OnBoundEndpoint(new Func<bool>(ReadMute));
    }

    public static void SetMute(bool mute) {
        OnBoundEndpoint(new Func<bool>(delegate {
            var context = Guid.Empty;
            boundVolume.SetMute(mute, ref context);
            return true;
        }));
    }

    private static int ReadVolumePercent() {
        return (int)Math.Round(ReadVolume() * 100);
    }

    private static string FormatState() {
        return ReadVolumePercent() + "|" + (ReadMute() ? "1" : "0");
    }

    public static string GetState() {
        return OnBoundEndpoint(new Func<string>(FormatState));
    }

    public static string StepVolume(int deltaPercent) {
        return OnBoundEndpoint(new Func<string>(delegate {
            var context = Guid.Empty;
            int steppedPercent = Math.Max(0, Math.Min(100, ReadVolumePercent() + deltaPercent));
            boundVolume.SetMasterVolumeLevelScalar(steppedPercent / 100f, ref context);
            if (ReadMute()) boundVolume.SetMute(false, ref context);
            return FormatState();
        }));
    }

    public static string ToggleMute() {
        return OnBoundEndpoint(new Func<string>(delegate {
            var context = Guid.Empty;
            boundVolume.SetMute(!ReadMute(), ref context);
            return FormatState();
        }));
    }

    public static float GetPeak() {
        return OnBoundEndpoint(new Func<float>(delegate {
            float peak;
            boundMeter.GetPeakValue(out peak);
            return peak;
        }));
    }
}
"@

switch ($Action) {
    "get" { [math]::Round([Audio]::GetVolume() * 100) }
    "set" { [Audio]::SetVolume($Value / 100.0) }
    "getMute" { [Audio]::GetMute() }
    "setMute" { [Audio]::SetMute($Value -ne 0) }
}
