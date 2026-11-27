Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
WshShell.CurrentDirectory = rootDir
bundledNodePrimary = fso.GetAbsolutePathName(fso.BuildPath(rootDir, "runtime\node.exe"))
bundledNodeLegacy = fso.GetAbsolutePathName(fso.BuildPath(rootDir, "runtime\node\node.exe"))
If fso.FileExists(bundledNodePrimary) Then
    nodeBin = bundledNodePrimary
ElseIf fso.FileExists(bundledNodeLegacy) Then
    nodeBin = bundledNodeLegacy
Else
    nodeBin = "node"
End If
cmd = Chr(34) & nodeBin & Chr(34) & " " & Chr(34) & scriptDir & "\ensure_companion_service.js" & Chr(34)
WshShell.Run cmd, 0, False
Set WshShell = Nothing
Set fso = Nothing
