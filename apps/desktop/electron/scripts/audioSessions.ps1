[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace AlpineShell.Audio
{
    public enum EDataFlow
    {
        eRender = 0,
        eCapture = 1,
        eAll = 2
    }

    public enum ERole
    {
        eConsole = 0,
        eMultimedia = 1,
        eCommunications = 2
    }

    public enum AudioSessionState
    {
        AudioSessionStateInactive = 0,
        AudioSessionStateActive = 1,
        AudioSessionStateExpired = 2
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject
    {
    }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IMMDeviceCollection devices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);

        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IMMDevice device);

        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr client);

        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig]
        int GetCount(out uint count);

        [PreserveSig]
        int Item(uint index, out IMMDevice device);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid interfaceId, uint classContext, IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object instance);

        [PreserveSig]
        int OpenPropertyStore(uint access, out IntPtr properties);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string deviceId);

        [PreserveSig]
        int GetState(out uint state);
    }

    [ComImport]
    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionManager2
    {
        [PreserveSig]
        int GetAudioSessionControl(IntPtr sessionGuid, uint streamFlags, out IntPtr sessionControl);

        [PreserveSig]
        int GetSimpleAudioVolume(IntPtr sessionGuid, uint streamFlags, out IntPtr audioVolume);

        [PreserveSig]
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnumerator);

        [PreserveSig]
        int RegisterSessionNotification(IntPtr notification);

        [PreserveSig]
        int UnregisterSessionNotification(IntPtr notification);

        [PreserveSig]
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);

        [PreserveSig]
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport]
    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionEnumerator
    {
        [PreserveSig]
        int GetCount(out int sessionCount);

        [PreserveSig]
        int GetSession(int sessionIndex, out IAudioSessionControl session);
    }

    [ComImport]
    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl
    {
        [PreserveSig]
        int GetState(out AudioSessionState state);

        [PreserveSig]
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);

        [PreserveSig]
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr eventContext);

        [PreserveSig]
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);

        [PreserveSig]
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr eventContext);

        [PreserveSig]
        int GetGroupingParam(out Guid groupingParam);

        [PreserveSig]
        int SetGroupingParam(ref Guid groupingParam, IntPtr eventContext);

        [PreserveSig]
        int RegisterAudioSessionNotification(IntPtr notifications);

        [PreserveSig]
        int UnregisterAudioSessionNotification(IntPtr notifications);
    }

    [ComImport]
    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl2
    {
        [PreserveSig]
        int GetState(out AudioSessionState state);

        [PreserveSig]
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);

        [PreserveSig]
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr eventContext);

        [PreserveSig]
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);

        [PreserveSig]
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr eventContext);

        [PreserveSig]
        int GetGroupingParam(out Guid groupingParam);

        [PreserveSig]
        int SetGroupingParam(ref Guid groupingParam, IntPtr eventContext);

        [PreserveSig]
        int RegisterAudioSessionNotification(IntPtr notifications);

        [PreserveSig]
        int UnregisterAudioSessionNotification(IntPtr notifications);

        [PreserveSig]
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionId);

        [PreserveSig]
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionInstanceId);

        [PreserveSig]
        int GetProcessId(out uint processId);

        [PreserveSig]
        int IsSystemSoundsSession();

        [PreserveSig]
        int SetDuckingPreference(int optOut);
    }

    [ComImport]
    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioMeterInformation
    {
        [PreserveSig]
        int GetPeakValue(out float peak);

        [PreserveSig]
        int GetMeteringChannelCount(out uint channelCount);

        [PreserveSig]
        int GetChannelsPeakValues(uint channelCount, [Out] float[] peakValues);

        [PreserveSig]
        int QueryHardwareSupport(out uint hardwareSupportMask);
    }

    public static class AudioSessionScanner
    {
        private const uint DeviceStateActive = 0x00000001;
        private const uint ClassContextAll = 0x17;
        private const int HrOk = 0;
        private const int HrFalse = 1;

        private static readonly Guid AudioSessionManager2InterfaceId =
            new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");

        public static uint[] GetActiveAudioProcessIds()
        {
            return Collect(-1.0f);
        }

        public static uint[] GetAudibleAudioProcessIds(float peakThreshold)
        {
            return Collect(peakThreshold);
        }

        private static uint[] Collect(float peakThreshold)
        {
            Dictionary<uint, bool> processIds = new Dictionary<uint, bool>();
            IMMDeviceEnumerator deviceEnumerator = null;
            try
            {
                deviceEnumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                if (deviceEnumerator == null)
                {
                    return new uint[0];
                }
                CollectFromDataFlow(deviceEnumerator, EDataFlow.eRender, peakThreshold, processIds);
                CollectFromDataFlow(deviceEnumerator, EDataFlow.eCapture, peakThreshold, processIds);
            }
            catch (Exception)
            {
            }
            finally
            {
                ReleaseComObject(deviceEnumerator);
            }

            uint[] result = new uint[processIds.Count];
            processIds.Keys.CopyTo(result, 0);
            return result;
        }

        private static void CollectFromDataFlow(IMMDeviceEnumerator deviceEnumerator, EDataFlow dataFlow,
            float peakThreshold, Dictionary<uint, bool> processIds)
        {
            IMMDeviceCollection deviceCollection = null;
            try
            {
                int hr = deviceEnumerator.EnumAudioEndpoints(dataFlow, DeviceStateActive, out deviceCollection);
                if (hr != HrOk || deviceCollection == null)
                {
                    return;
                }

                uint deviceCount = 0;
                if (deviceCollection.GetCount(out deviceCount) != HrOk)
                {
                    return;
                }

                for (uint index = 0; index < deviceCount; index++)
                {
                    IMMDevice device = null;
                    try
                    {
                        if (deviceCollection.Item(index, out device) != HrOk || device == null)
                        {
                            continue;
                        }
                        CollectFromDevice(device, peakThreshold, processIds);
                    }
                    catch (Exception)
                    {
                    }
                    finally
                    {
                        ReleaseComObject(device);
                    }
                }
            }
            catch (Exception)
            {
            }
            finally
            {
                ReleaseComObject(deviceCollection);
            }
        }

        private static void CollectFromDevice(IMMDevice device, float peakThreshold,
            Dictionary<uint, bool> processIds)
        {
            object activated = null;
            IAudioSessionManager2 sessionManager = null;
            IAudioSessionEnumerator sessionEnumerator = null;
            try
            {
                Guid interfaceId = AudioSessionManager2InterfaceId;
                int hr = device.Activate(ref interfaceId, ClassContextAll, IntPtr.Zero, out activated);
                if (hr != HrOk || activated == null)
                {
                    return;
                }

                sessionManager = activated as IAudioSessionManager2;
                if (sessionManager == null)
                {
                    return;
                }

                if (sessionManager.GetSessionEnumerator(out sessionEnumerator) != HrOk || sessionEnumerator == null)
                {
                    return;
                }

                int sessionCount = 0;
                if (sessionEnumerator.GetCount(out sessionCount) != HrOk)
                {
                    return;
                }

                for (int index = 0; index < sessionCount; index++)
                {
                    IAudioSessionControl session = null;
                    try
                    {
                        if (sessionEnumerator.GetSession(index, out session) != HrOk || session == null)
                        {
                            continue;
                        }
                        IAudioSessionControl2 extendedSession = session as IAudioSessionControl2;
                        if (extendedSession == null)
                        {
                            continue;
                        }
                        InspectSession(extendedSession, peakThreshold, processIds);
                    }
                    catch (Exception)
                    {
                    }
                    finally
                    {
                        ReleaseComObject(session);
                    }
                }
            }
            catch (Exception)
            {
            }
            finally
            {
                ReleaseComObject(sessionEnumerator);
                ReleaseComObject(sessionManager);
            }
        }

        private static void InspectSession(IAudioSessionControl2 session, float peakThreshold,
            Dictionary<uint, bool> processIds)
        {
            AudioSessionState state = AudioSessionState.AudioSessionStateExpired;
            if (session.GetState(out state) != HrOk)
            {
                return;
            }
            if (state != AudioSessionState.AudioSessionStateActive)
            {
                return;
            }

            if (session.IsSystemSoundsSession() == HrOk)
            {
                return;
            }

            uint processId = 0;
            int hr = session.GetProcessId(out processId);
            if (hr < 0)
            {
                return;
            }
            if (processId == 0 || processId == 4)
            {
                return;
            }

            if (peakThreshold >= 0.0f && !IsAbovePeakThreshold(session, peakThreshold))
            {
                return;
            }

            processIds[processId] = true;
        }

        private static bool IsAbovePeakThreshold(IAudioSessionControl2 session, float peakThreshold)
        {
            IAudioMeterInformation meter = session as IAudioMeterInformation;
            if (meter == null)
            {
                return true;
            }
            float peak = 0.0f;
            if (meter.GetPeakValue(out peak) != HrOk)
            {
                return true;
            }
            return peak >= peakThreshold;
        }

        private static void ReleaseComObject(object instance)
        {
            if (instance == null)
            {
                return;
            }
            try
            {
                if (Marshal.IsComObject(instance))
                {
                    Marshal.ReleaseComObject(instance);
                }
            }
            catch (Exception)
            {
            }
        }
    }
}
'@

$sessionProcessIds = [AlpineShell.Audio.AudioSessionScanner]::GetActiveAudioProcessIds()
if ($sessionProcessIds.Count -eq 0) { '[]' } else { ConvertTo-Json -Compress -InputObject @($sessionProcessIds | ForEach-Object { [int]$_ }) }
