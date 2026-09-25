Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = scriptDir & "\AGY-Sync-Master.cmd"

WshShell.Run "cmd.exe /c """ & cmdPath & """", 0, False
