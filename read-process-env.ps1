param(
  [Parameter(Mandatory = $true)]
  [int]$PidToRead
)

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ProcEnvReader {
  [Flags]
  enum ProcessAccessFlags : uint {
    QueryInformation = 0x0400,
    VirtualMemoryRead = 0x0010
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_BASIC_INFORMATION {
    public IntPtr Reserved1;
    public IntPtr PebBaseAddress;
    public IntPtr Reserved2_0;
    public IntPtr Reserved2_1;
    public IntPtr UniqueProcessId;
    public IntPtr InheritedFromUniqueProcessId;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct UNICODE_STRING {
    public ushort Length;
    public ushort MaximumLength;
    public IntPtr Buffer;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(ProcessAccessFlags processAccess, bool bInheritHandle, int processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out IntPtr lpNumberOfBytesRead);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool CloseHandle(IntPtr hObject);

  [DllImport("ntdll.dll")]
  static extern int NtQueryInformationProcess(IntPtr processHandle, int processInformationClass, ref PROCESS_BASIC_INFORMATION processInformation, int processInformationLength, out int returnLength);

  static IntPtr ReadPtr(IntPtr handle, IntPtr address) {
    var buf = new byte[IntPtr.Size];
    IntPtr read;
    if (!ReadProcessMemory(handle, address, buf, buf.Length, out read)) throw new Exception("ReadProcessMemory pointer failed");
    return IntPtr.Size == 8 ? (IntPtr)BitConverter.ToInt64(buf, 0) : (IntPtr)BitConverter.ToInt32(buf, 0);
  }

  static ushort ReadUInt16(IntPtr handle, IntPtr address) {
    var buf = new byte[2];
    IntPtr read;
    if (!ReadProcessMemory(handle, address, buf, 2, out read)) throw new Exception("ReadProcessMemory ushort failed");
    return BitConverter.ToUInt16(buf, 0);
  }

  public static string[] ReadEnvironment(int pid) {
    var handle = OpenProcess(ProcessAccessFlags.QueryInformation | ProcessAccessFlags.VirtualMemoryRead, false, pid);
    if (handle == IntPtr.Zero) throw new Exception("OpenProcess failed: " + Marshal.GetLastWin32Error());
    try {
      var pbi = new PROCESS_BASIC_INFORMATION();
      int retLen;
      int status = NtQueryInformationProcess(handle, 0, ref pbi, Marshal.SizeOf<PROCESS_BASIC_INFORMATION>(), out retLen);
      if (status != 0) throw new Exception("NtQueryInformationProcess failed: " + status);

      IntPtr processParameters = ReadPtr(handle, pbi.PebBaseAddress + (IntPtr.Size == 8 ? 0x20 : 0x10));
      IntPtr environment = ReadPtr(handle, processParameters + (IntPtr.Size == 8 ? 0x80 : 0x48));

      var bytes = new List<byte>();
      var chunk = new byte[4096];
      long offset = 0;
      int trailingZeroBytes = 0;
      while (bytes.Count < 1024 * 1024) {
        IntPtr read;
        if (!ReadProcessMemory(handle, environment + (int)offset, chunk, chunk.Length, out read)) break;
        int readCount = read.ToInt32();
        if (readCount <= 0) break;
        for (int i = 0; i < readCount; i++) {
          bytes.Add(chunk[i]);
          if (chunk[i] == 0) trailingZeroBytes++; else trailingZeroBytes = 0;
          if (trailingZeroBytes >= 4) {
            var text = System.Text.Encoding.Unicode.GetString(bytes.ToArray());
            return text.TrimEnd('\0').Split(new char[] {'\0'}, StringSplitOptions.RemoveEmptyEntries);
          }
        }
        offset += readCount;
      }
      return new string[0];
    } finally {
      CloseHandle(handle);
    }
  }
}
"@

[ProcEnvReader]::ReadEnvironment($PidToRead) | Sort-Object
