Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = scriptDir & "\AGY-Sync-Master.cmd"

' 0 = Hide window (콘솔 창 완전 숨김)
WshShell.Run "cmd.exe /c """ & cmdPath & """", 0, False
