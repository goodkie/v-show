Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
WshShell.CurrentDirectory = rootDir
bundledNode = fso.GetAbsolutePathName(fso.BuildPath(rootDir, "runtime\node\node.exe"))
If fso.FileExists(bundledNode) Then
    cmd = """" & bundledNode & """ """ & scriptDir & "\server.js"""
Else
    cmd = "node """ & scriptDir & "\server.js"""
End If
WshShell.Run cmd, 0, False
Set WshShell = Nothing
Set fso = Nothing
