using System;
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager {
    IntPtr ActivateApplication(
        [In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
        [In, MarshalAs(UnmanagedType.LPWStr)] string arguments,
        [In] int options,
        [Out] out uint processId);
}

[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ApplicationActivationManager : IApplicationActivationManager {
    [MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
    public extern IntPtr ActivateApplication(
        [In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
        [In, MarshalAs(UnmanagedType.LPWStr)] string arguments,
        [In] int options,
        [Out] out uint processId);
}

class Program {
    static void Main(string[] args) {
        if (args.Length == 0) return;
        var mgr = new ApplicationActivationManager();
        var tasks = new Task[args.Length];
        for (int i = 0; i < args.Length; i++) {
            var aumid = args[i];
            tasks[i] = Task.Run(() => {
                try {
                    uint pid;
                    mgr.ActivateApplication(aumid, null, 0, out pid);
                    Console.WriteLine("launched:" + aumid + ":" + pid);
                } catch (Exception ex) {
                    Console.WriteLine("failed:" + aumid + ":" + ex.Message);
                }
            });
        }
        Task.WaitAll(tasks);
    }
}
