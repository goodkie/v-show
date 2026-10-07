Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "node """ & scriptDir & "\privacy-relay-service.js"""
WshShell.Run cmd, 0, False
Set WshShell = Nothing
Set fso = Nothing
