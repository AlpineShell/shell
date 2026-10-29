using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading;

[ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IClassFactory
{
    [PreserveSig] int CreateInstance(IntPtr outer, ref Guid iid, out IntPtr instance);
    [PreserveSig] int LockServer(bool locked);
}

[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellServiceProvider
{
    [PreserveSig] int QueryService(ref Guid service, ref Guid iid, out IntPtr instance);
}

public static class HostOutput
{
    static readonly object Gate = new object();

    public static void Line(string text)
    {
        lock (Gate)
        {
            Console.Out.WriteLine(text);
            Console.Out.Flush();
        }
    }

    public static void Problem(string text)
    {
        lock (Gate)
        {
            Console.Error.WriteLine(text);
            Console.Error.Flush();
        }
    }
}

public static class WinRt
{
    [DllImport("combase.dll")] static extern int WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string text, int length, out IntPtr hstring);
    [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr hstring);
    [DllImport("combase.dll")] static extern IntPtr WindowsGetStringRawBuffer(IntPtr hstring, out uint length);
    [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr classId, ref Guid iid, out IntPtr factory);
    [DllImport("combase.dll")] static extern int RoActivateInstance(IntPtr classId, out IntPtr instance);

    public static IntPtr CreateString(string text)
    {
        IntPtr hstring;
        int hr = WindowsCreateString(text, text.Length, out hstring);
        if (hr != 0) throw new COMException("WindowsCreateString", hr);
        return hstring;
    }

    public static void DeleteString(IntPtr hstring)
    {
        if (hstring != IntPtr.Zero) WindowsDeleteString(hstring);
    }

    public static string ReadString(IntPtr hstring)
    {
        if (hstring == IntPtr.Zero) return "";
        uint length;
        IntPtr raw = WindowsGetStringRawBuffer(hstring, out length);
        return raw == IntPtr.Zero ? "" : Marshal.PtrToStringUni(raw, (int)length);
    }

    public static IntPtr ActivationFactory(string className, Guid iid)
    {
        IntPtr name = CreateString(className);
        try
        {
            IntPtr factory;
            int hr = RoGetActivationFactory(name, ref iid, out factory);
            if (hr != 0) throw new COMException("RoGetActivationFactory " + className, hr);
            return factory;
        }
        finally { DeleteString(name); }
    }

    public static IntPtr Activate(string className)
    {
        IntPtr name = CreateString(className);
        try
        {
            IntPtr instance;
            int hr = RoActivateInstance(name, out instance);
            if (hr != 0) throw new COMException("RoActivateInstance " + className, hr);
            return instance;
        }
        finally { DeleteString(name); }
    }

    public static IntPtr Method(IntPtr instance, int slot)
    {
        return Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size);
    }

    public static IntPtr Query(IntPtr instance, string iid)
    {
        Guid wanted = new Guid(iid);
        IntPtr result;
        int hr = Marshal.QueryInterface(instance, ref wanted, out result);
        if (hr != 0) throw new COMException("QueryInterface " + iid, hr);
        return result;
    }
}

public static class PromptRequest
{
    const string IBufferIid = "905A0FE0-BC53-11DF-8C49-001E4FC686DA";
    const string IBufferByteAccessIid = "905A0FEF-BC53-11DF-8C49-001E4FC686DA";

    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetLengthMethod(IntPtr self, out uint length);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetBytesMethod(IntPtr self, out IntPtr bytes);

    [DllImport("ole32.dll")] static extern int CreateStreamOnHGlobal(IntPtr global, bool deleteOnRelease, out IStream stream);
    [DllImport("ole32.dll")] static extern int CoUnmarshalInterface(IStream stream, ref Guid iid, out IntPtr instance);

    public static byte[] ReadBuffer(IntPtr buffer)
    {
        IntPtr asBuffer = WinRt.Query(buffer, IBufferIid);
        IntPtr byteAccess = IntPtr.Zero;
        try
        {
            uint length;
            GetLengthMethod getLength = (GetLengthMethod)Marshal.GetDelegateForFunctionPointer(WinRt.Method(asBuffer, 7), typeof(GetLengthMethod));
            int hr = getLength(asBuffer, out length);
            if (hr != 0) throw new COMException("IBuffer.Length", hr);
            byteAccess = WinRt.Query(buffer, IBufferByteAccessIid);
            IntPtr bytes;
            GetBytesMethod getBytes = (GetBytesMethod)Marshal.GetDelegateForFunctionPointer(WinRt.Method(byteAccess, 3), typeof(GetBytesMethod));
            hr = getBytes(byteAccess, out bytes);
            if (hr != 0) throw new COMException("IBufferByteAccess.Buffer", hr);
            byte[] copy = new byte[length];
            Marshal.Copy(bytes, copy, 0, (int)length);
            return copy;
        }
        finally
        {
            Marshal.Release(asBuffer);
            if (byteAccess != IntPtr.Zero) Marshal.Release(byteAccess);
        }
    }

    static int ReadBigEndian(byte[] data, int offset)
    {
        return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    }

    static int EndOfKey(byte[] data, string key)
    {
        byte[] name = Encoding.ASCII.GetBytes(key);
        for (int start = 4; start + name.Length <= data.Length; start++)
        {
            if (ReadBigEndian(data, start - 4) != name.Length) continue;
            bool same = true;
            for (int k = 0; k < name.Length; k++)
            {
                if (data[start + k] != name[k]) { same = false; break; }
            }
            if (same) return start + name.Length;
        }
        return -1;
    }

    public static byte[] Value(byte[] data, string key)
    {
        int end = EndOfKey(data, key);
        if (end < 0 || end + 8 > data.Length) return null;
        int length = ReadBigEndian(data, end + 4);
        if (length < 0 || end + 8 + length > data.Length) return null;
        byte[] value = new byte[length];
        Array.Copy(data, end + 8, value, 0, length);
        return value;
    }

    public static IntPtr Unmarshal(byte[] objref)
    {
        IStream stream;
        int hr = CreateStreamOnHGlobal(IntPtr.Zero, true, out stream);
        if (hr != 0) throw new COMException("CreateStreamOnHGlobal", hr);
        stream.Write(objref, objref.Length, IntPtr.Zero);
        stream.Seek(0, 0, IntPtr.Zero);
        Guid unknown = new Guid("00000000-0000-0000-C000-000000000046");
        IntPtr instance;
        hr = CoUnmarshalInterface(stream, ref unknown, out instance);
        Marshal.ReleaseComObject(stream);
        if (hr != 0) throw new COMException("CoUnmarshalInterface", hr);
        return instance;
    }
}

public static class PromptAnswer
{
    const string PropertyValueStaticsIid = "629BDBC8-D932-4FF4-96B9-8D96C5C1E858";
    const string StringObjectMapIid = "1B0D3570-0877-5EC2-8A2C-3B9539506ACA";
    const string PropertySetIid = "8A43ED9F-F4E6-4421-ACF9-1DAB2986820C";
    const string ProtocolForResultsOperationIid = "D581293A-6DE9-4D28-9378-F86782E182BB";
    const string InspectableIid = "AF86E2E0-B12D-4C6A-9C5A-D7AA65101E90";

    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateStringMethod(IntPtr self, IntPtr value, out IntPtr boxed);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int InsertMethod(IntPtr self, IntPtr key, IntPtr value, out byte replaced);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ReportCompletedMethod(IntPtr self, IntPtr data);

    public static void Report(IntPtr operation, string userAction)
    {
        IntPtr factory = WinRt.ActivationFactory("Windows.Foundation.PropertyValue", new Guid(InspectableIid));
        IntPtr statics = WinRt.Query(factory, PropertyValueStaticsIid);
        IntPtr actionText = WinRt.CreateString(userAction);
        IntPtr key = WinRt.CreateString("UserAction");
        IntPtr boxed = IntPtr.Zero;
        IntPtr valueSet = IntPtr.Zero;
        IntPtr map = IntPtr.Zero;
        IntPtr propertySet = IntPtr.Zero;
        IntPtr resultOperation = IntPtr.Zero;
        try
        {
            CreateStringMethod createString = (CreateStringMethod)Marshal.GetDelegateForFunctionPointer(WinRt.Method(statics, 18), typeof(CreateStringMethod));
            int hr = createString(statics, actionText, out boxed);
            if (hr != 0) throw new COMException("PropertyValue.CreateString", hr);

            valueSet = WinRt.Activate("Windows.Foundation.Collections.ValueSet");
            map = WinRt.Query(valueSet, StringObjectMapIid);
            byte replaced;
            InsertMethod insert = (InsertMethod)Marshal.GetDelegateForFunctionPointer(WinRt.Method(map, 10), typeof(InsertMethod));
            hr = insert(map, key, boxed, out replaced);
            if (hr != 0) throw new COMException("ValueSet.Insert", hr);
            propertySet = WinRt.Query(valueSet, PropertySetIid);

            resultOperation = WinRt.Query(operation, ProtocolForResultsOperationIid);
            ReportCompletedMethod reportCompleted = (ReportCompletedMethod)Marshal.GetDelegateForFunctionPointer(WinRt.Method(resultOperation, 6), typeof(ReportCompletedMethod));
            hr = reportCompleted(resultOperation, propertySet);
            if (hr != 0) throw new COMException("ProtocolForResultsOperation.ReportCompleted", hr);
        }
        finally
        {
            WinRt.DeleteString(actionText);
            WinRt.DeleteString(key);
            foreach (IntPtr held in new IntPtr[] { boxed, valueSet, map, propertySet, resultOperation, statics, factory })
            {
                if (held != IntPtr.Zero) Marshal.Release(held);
            }
        }
    }
}

public static class PendingPrompts
{
    const int UnansweredLimitMinutes = 15;

    class Pending
    {
        public IntPtr Operation;
        public Timer Expiry;
    }

    static readonly object Gate = new object();
    static readonly Dictionary<int, Pending> ById = new Dictionary<int, Pending>();
    static int lastId;

    public static int Add(IntPtr operation)
    {
        lock (Gate)
        {
            int id = ++lastId;
            Pending pending = new Pending();
            pending.Operation = operation;
            pending.Expiry = new Timer(delegate { Answer(id, "norun"); }, null, UnansweredLimitMinutes * 60000, Timeout.Infinite);
            ById[id] = pending;
            return id;
        }
    }

    public static void Answer(int id, string userAction)
    {
        Pending pending;
        lock (Gate)
        {
            if (!ById.TryGetValue(id, out pending)) return;
            ById.Remove(id);
        }
        pending.Expiry.Dispose();
        try
        {
            PromptAnswer.Report(pending.Operation, userAction);
        }
        catch (Exception e)
        {
            HostOutput.Problem("answer " + id + " failed: " + e.Message);
        }
        finally
        {
            Marshal.Release(pending.Operation);
        }
    }

    public static void AnswerAll(string userAction)
    {
        List<int> ids;
        lock (Gate) { ids = new List<int>(ById.Keys); }
        foreach (int id in ids) Answer(id, userAction);
    }
}

public static class ModalExperienceManager
{
    const int ShowForContractWithPluginSlot = 8;
    const int SlotCount = 24;
    const int NotImplemented = unchecked((int)0x80004001);
    const int NoInterface = unchecked((int)0x80004002);
    const int Failed = unchecked((int)0x80004005);
    const string SmartScreenPromptApp = "Microsoft.Windows.Apprep.ChxApp_cw5n1h2txyewy!App";

    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int QueryInterfaceMethod(IntPtr self, ref Guid iid, out IntPtr instance);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint ReferenceMethod(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ManagerMethod(IntPtr self, IntPtr app, IntPtr plugin, IntPtr contract, IntPtr pluginId, IntPtr inputData, IntPtr options, IntPtr ownerWindow, IntPtr eventHandler, IntPtr experience);

    static readonly List<Delegate> Methods = new List<Delegate>();
    static readonly HashSet<Guid> Interfaces = new HashSet<Guid>();
    static readonly object Gate = new object();
    static IntPtr instance;

    public static IntPtr Get(Guid managerIid)
    {
        lock (Gate)
        {
            if (instance != IntPtr.Zero) return instance;
            Interfaces.Add(managerIid);
            Interfaces.Add(new Guid("00000000-0000-0000-C000-000000000046"));
            Interfaces.Add(new Guid("AF86E2E0-B12D-4C6A-9C5A-D7AA65101E90"));
            Interfaces.Add(new Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"));

            IntPtr vtable = Marshal.AllocHGlobal(IntPtr.Size * SlotCount);
            QueryInterfaceMethod queryInterface = QueryInterface;
            ReferenceMethod addRef = KeepAlive;
            ReferenceMethod release = KeepAlive;
            Methods.Add(queryInterface);
            Methods.Add(addRef);
            Methods.Add(release);
            Marshal.WriteIntPtr(vtable, 0, Marshal.GetFunctionPointerForDelegate(queryInterface));
            Marshal.WriteIntPtr(vtable, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(addRef));
            Marshal.WriteIntPtr(vtable, IntPtr.Size * 2, Marshal.GetFunctionPointerForDelegate(release));
            for (int slot = 3; slot < SlotCount; slot++)
            {
                ManagerMethod method = slot == ShowForContractWithPluginSlot ? new ManagerMethod(ShowForContractWithPlugin) : new ManagerMethod(Unsupported);
                Methods.Add(method);
                Marshal.WriteIntPtr(vtable, IntPtr.Size * slot, Marshal.GetFunctionPointerForDelegate(method));
            }
            instance = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(instance, vtable);
            return instance;
        }
    }

    static int QueryInterface(IntPtr self, ref Guid iid, out IntPtr result)
    {
        bool supported = Interfaces.Contains(iid);
        result = supported ? self : IntPtr.Zero;
        return supported ? 0 : NoInterface;
    }

    static uint KeepAlive(IntPtr self)
    {
        return 1;
    }

    static int Unsupported(IntPtr self, IntPtr app, IntPtr plugin, IntPtr contract, IntPtr pluginId, IntPtr inputData, IntPtr options, IntPtr ownerWindow, IntPtr eventHandler, IntPtr experience)
    {
        return NotImplemented;
    }

    static int ShowForContractWithPlugin(IntPtr self, IntPtr app, IntPtr plugin, IntPtr contract, IntPtr pluginId, IntPtr inputData, IntPtr options, IntPtr ownerWindow, IntPtr eventHandler, IntPtr experience)
    {
        try
        {
            if (WinRt.ReadString(app) != SmartScreenPromptApp) return NotImplemented;
            byte[] data = PromptRequest.ReadBuffer(inputData);
            byte[] html = PromptRequest.Value(data, "HtmlContent");
            byte[] resultOperation = PromptRequest.Value(data, "ProtocolForResultsOperation");
            if (html == null || resultOperation == null) return NotImplemented;
            int id = PendingPrompts.Add(PromptRequest.Unmarshal(resultOperation));
            if (experience != IntPtr.Zero) Marshal.WriteIntPtr(experience, IntPtr.Zero);
            HostOutput.Line("prompt " + id + " " + Convert.ToBase64String(html));
            return 0;
        }
        catch (Exception e)
        {
            HostOutput.Problem("prompt request failed: " + e.Message);
            return Failed;
        }
    }
}

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class ImmersiveShellServices : IShellServiceProvider
{
    static readonly Guid ModalExperienceManagerService = new Guid("FAACF24C-7DE0-4EA3-9D2A-0DCC7475E219");

    public int QueryService(ref Guid service, ref Guid iid, out IntPtr result)
    {
        if (service == ModalExperienceManagerService)
        {
            result = ModalExperienceManager.Get(iid);
            return 0;
        }
        result = IntPtr.Zero;
        return unchecked((int)0x80004002);
    }
}

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class ImmersiveShellFactory : IClassFactory
{
    public int CreateInstance(IntPtr outer, ref Guid iid, out IntPtr result)
    {
        result = IntPtr.Zero;
        if (outer != IntPtr.Zero) return unchecked((int)0x80040110);
        IntPtr unknown = Marshal.GetIUnknownForObject(new ImmersiveShellServices());
        try { return Marshal.QueryInterface(unknown, ref iid, out result); }
        finally { Marshal.Release(unknown); }
    }

    public int LockServer(bool locked)
    {
        return 0;
    }
}

public static class SmartScreenHost
{
    const uint LocalServer = 4;
    const uint MultipleUse = 1;
    static readonly Guid ImmersiveShell = new Guid("C2F03A33-21F5-47FA-B4BB-156362A2F239");

    [DllImport("ole32.dll")] static extern int CoRegisterClassObject(ref Guid clsid, [MarshalAs(UnmanagedType.IUnknown)] object factory, uint context, uint flags, out uint cookie);
    [DllImport("ole32.dll")] static extern int CoRevokeClassObject(uint cookie);

    [MTAThread]
    public static int Main()
    {
        Guid clsid = ImmersiveShell;
        uint cookie;
        int hr = CoRegisterClassObject(ref clsid, new ImmersiveShellFactory(), LocalServer, MultipleUse, out cookie);
        if (hr != 0)
        {
            HostOutput.Line("failed " + hr.ToString("X8"));
            return 1;
        }
        HostOutput.Line("ready");
        try
        {
            string line;
            while ((line = Console.In.ReadLine()) != null) HandleCommand(line);
        }
        finally
        {
            CoRevokeClassObject(cookie);
            PendingPrompts.AnswerAll("norun");
        }
        return 0;
    }

    static void HandleCommand(string line)
    {
        string[] parts = line.Trim().TrimStart((char)0xFEFF).Split(' ');
        int id;
        if (parts.Length != 3 || parts[0] != "answer" || !int.TryParse(parts[1], out id)) return;
        if (parts[2] != "run" && parts[2] != "norun") return;
        string userAction = parts[2];
        ThreadPool.QueueUserWorkItem(delegate { PendingPrompts.Answer(id, userAction); });
    }
}
