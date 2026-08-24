param([string]$Action, [int]$Value)

Add-Type -TypeDefinition @"
using System;
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
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}

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

    public static string GetState() {
        return OnBoundEndpoint(new Func<string>(delegate {
            return ((int)Math.Round(ReadVolume() * 100)) + "|" + (ReadMute() ? "1" : "0");
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
