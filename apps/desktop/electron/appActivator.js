const { spawn } = require('child_process')
const { shellExecute, warm: warmShellExecute } = require('./shellExecute')

const TYPE_DEFINITION = [
  'Add-Type -TypeDefinition @\'',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public enum ActivateOptions { None = 0, DesignMode = 1, NoErrorUI = 2, NoSplashScreen = 4 }',
  '[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'public interface IApplicationActivationManager {',
  '    [PreserveSig] int ActivateApplication([In] string appUserModelId, [In] string arguments, [In] ActivateOptions options, [Out] out uint processId);',
  '    [PreserveSig] int ActivateForFile([In] string appUserModelId, [In] IntPtr itemArray, [In] string verb, [Out] out uint processId);',
  '    [PreserveSig] int ActivateForProtocol([In] string appUserModelId, [In] IntPtr itemArray, [Out] out uint processId);',
  '}',
  '[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]',
  'public class ApplicationActivationManager { }',
  'public static class AlpineAppActivator {',
  '    public static int Activate(string aumid) {',
  '        uint processId;',
  '        return ((IApplicationActivationManager)new ApplicationActivationManager()).ActivateApplication(aumid, null, ActivateOptions.None, out processId);',
  '    }',
  '}',
  '\'@',
].join('\n')

const FILE_EXPLORER_AUMID = 'Microsoft.Windows.Explorer'

let ps = null
let lineBuffer = ''

function handleOutput(chunk) {
  lineBuffer += chunk.toString()
  let newlineIndex
  while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
    const line = lineBuffer.slice(0, newlineIndex).trim()
    lineBuffer = lineBuffer.slice(newlineIndex + 1)
    if (line.startsWith('ALPINE_ACT_FAIL')) console.error('[appActivator]', line)
  }
}

function ensureProcess() {
  if (ps) return
  ps = spawn('powershell', ['-NoProfile', '-NoExit', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  })
  ps.stdout.on('data', handleOutput)
  ps.on('exit', () => {
    ps = null
    lineBuffer = ''
  })
  ps.stdin.write(`${TYPE_DEFINITION}\n\n`)
}

function escapeForSingleQuote(value) {
  return String(value).replace(/'/g, "''").replace(/[\r\n]/g, '')
}

function isPackagedAumid(appId) {
  return appId.includes('!')
}

function activatePackaged(aumid) {
  ensureProcess()
  const safe = escapeForSingleQuote(aumid)
  ps.stdin.write(`try { $__hr = [AlpineAppActivator]::Activate('${safe}'); if ($__hr -ne 0) { [Console]::Out.WriteLine('ALPINE_ACT_FAIL ${safe} ' + ('0x{0:X8}' -f $__hr)) } } catch { [Console]::Out.WriteLine('ALPINE_ACT_FAIL ${safe} ' + $_.Exception.Message) }\n`)
}

function activateViaAppsFolder(appId) {
  shellExecute(`shell:AppsFolder\\${appId}`, null)
}

function activate(appId) {
  if (!appId) return
  if (isPackagedAumid(appId)) activatePackaged(appId)
  else activateViaAppsFolder(appId)
}

function openFileExplorer() {
  activate(FILE_EXPLORER_AUMID)
}

function warm() {
  ensureProcess()
  warmShellExecute()
}

module.exports = { activate, openFileExplorer, warm }
