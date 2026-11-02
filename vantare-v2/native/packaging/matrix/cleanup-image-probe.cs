// QA executable only. The matrix compiles/copies it below its guarded root.
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

public static class CleanupImageProbe
{
    const string Identity = "VantareCleanupImageProbe-v1";
    [StructLayout(LayoutKind.Sequential)]
    struct Disposition { public uint Flags; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
        IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind,
        ref Disposition info, uint size);

    static void Require(bool valid, string cause)
    {
        if (!valid) throw new InvalidOperationException(cause);
    }
    static string Hash(Stream stream)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    public static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 4, "ARGUMENTS_REQUIRED");
            var image = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
            var root = Path.GetFullPath(args[0]).TrimEnd('\\', '/');
            var prefix = Path.GetFullPath("D:/VantareServer/qa/").TrimEnd('\\', '/') + "\\";
            Require(root.StartsWith(prefix, StringComparison.OrdinalIgnoreCase), "QA_ROOT_REQUIRED");
            Require(String.Equals(Path.GetDirectoryName(image), root, StringComparison.OrdinalIgnoreCase)
                && Path.GetFileName(image) == "CleanupImageProbe.exe", "OWN_IMAGE_ROOT_REQUIRED");
            Require(args[2] == Identity, "OWN_IDENTITY_REQUIRED");
            Require(args[1].Length == 64, "OWN_HASH_REQUIRED");
            for (var path = image; path != null; path = Path.GetDirectoryName(path))
            {
                Require(!Path.GetFileName(path).StartsWith(".env", StringComparison.OrdinalIgnoreCase), "ENV_PATH_REJECTED");
                Require((File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0, "REPARSE_REJECTED");
            }
            uint flags;
            Require(UInt32.TryParse(args[3], out flags) && (flags == 3 || flags == 19), "FLAGS_REJECTED");
            // DELETE | GENERIC_READ; share read/write/delete; OPEN_EXISTING.
            using (var handle = CreateFileW(image, 0x80010000, 7, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero))
            {
                if (handle.IsInvalid)
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OPEN_OWN_IMAGE_FAILED");
                using (var stream = new FileStream(handle, FileAccess.Read))
                {
                    Require(Hash(stream) == args[1], "OWN_HASH_MISMATCH");
                    var info = new Disposition { Flags = flags };
                    // FileDispositionInfoEx = 21 (Win32 FILE_INFO_BY_HANDLE_CLASS).
                    if (!SetFileInformationByHandle(handle, 21, ref info, 4))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OWN_IMAGE_DISPOSITION_FAILED");
                }
            }
            Require(!File.Exists(image), "OWN_IMAGE_NAME_REMAINS");
            Require(Directory.GetFileSystemEntries(root).Length == 0, "OWN_DIRECTORY_NOT_EMPTY");
            Directory.Delete(root);
            Require(!Directory.Exists(root), "OWN_DIRECTORY_REMAINS");
            Console.WriteLine("PASS OWN_IMAGE_AND_DIRECTORY_REMOVED flags=" + flags);
            return 0;
        }
        catch (Exception error)
        {
            var native = error as System.ComponentModel.Win32Exception;
            Console.Error.WriteLine(error.Message + " win32=" + (native == null ? 0 : native.NativeErrorCode));
            return 1;
        }
    }
}
