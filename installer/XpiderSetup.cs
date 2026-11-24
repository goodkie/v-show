using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace XpiderSetup
{
    static class Program
    {
        private const string APP_NAME = "XPIDER AutoForm Sender Pro";
        private const string APP_VERSION = "7.1.0";
        private const string EXTENSION_ID = "ldlijlaccfeelfdhgnjbibniocefckjj";
        private const string PAYLOAD_RESOURCE = "XPIDER_PAYLOAD.zip";
        private const string PERSONAL_SEED_RESOURCE = "XPIDER_PERSONAL_SEED.bin";
        private const string UNINSTALL_REG_KEY = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\XPIDER_AutoForm_Sender_Pro";
        private const string EMAIL_HOST_NAME = "com.xpider.email_sidecar";
        private const string RELAY_HOST_NAME = "com.xpider.privacy_relay";

        [STAThread]
        static int Main(string[] args)
        {
            bool silent = false;
            bool uninstall = false;
            bool retainData = true;
            bool skipRegistry = false;
            bool skipShortcuts = false;
            bool skipBrowser = false;
            bool showInfo = false;
            bool restartSidecar = false;
            bool forceSeed = false;
            int delayMs = 0;
            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "XPIDER", "App");
            string stateDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "XPIDER", "Sidecar");

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i] ?? "";
                if (a.Equals("--silent", StringComparison.OrdinalIgnoreCase) || a.Equals("/S", StringComparison.OrdinalIgnoreCase))
                    silent = true;
                else if (a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase))
                    uninstall = true;
                else if (a.Equals("--retain-data", StringComparison.OrdinalIgnoreCase))
                    retainData = true;
                else if (a.Equals("--purge-data", StringComparison.OrdinalIgnoreCase))
                    retainData = false;
                else if (a.Equals("--skip-registry", StringComparison.OrdinalIgnoreCase))
                    skipRegistry = true;
                else if (a.Equals("--skip-shortcuts", StringComparison.OrdinalIgnoreCase))
                    skipShortcuts = true;
                else if (a.Equals("--skip-browser", StringComparison.OrdinalIgnoreCase))
                    skipBrowser = true;
                else if (a.Equals("--restart-sidecar", StringComparison.OrdinalIgnoreCase))
                    restartSidecar = true;
                else if (a.Equals("--force-seed", StringComparison.OrdinalIgnoreCase))
                    forceSeed = true;
                else if (a.Equals("--delay-ms", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    int parsedDelay;
                    if (int.TryParse(args[++i], out parsedDelay))
                        delayMs = Math.Max(0, Math.Min(10000, parsedDelay));
                }
                else if (a.Equals("--info", StringComparison.OrdinalIgnoreCase) || a.Equals("--version", StringComparison.OrdinalIgnoreCase))
                    showInfo = true;
                else if (a.Equals("--install-dir", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    installDir = Path.GetFullPath(args[++i]);
                else if (a.Equals("--state-dir", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    stateDir = Path.GetFullPath(args[++i]);
            }

            bool hasPersonalSeed = HasEmbeddedPersonalSeed();
            if (showInfo)
            {
                Console.WriteLine("APP=" + APP_NAME);
                Console.WriteLine("VERSION=" + APP_VERSION);
                Console.WriteLine("SIGNED=UNSIGNED");
                Console.WriteLine("EXTENSION_ID=" + EXTENSION_ID);
                Console.WriteLine("PERSONAL_SEED_BUNDLED=" + (hasPersonalSeed ? "TRUE_LOCAL_ONLY" : "FALSE_PUBLIC_CLEAN"));
                Console.WriteLine("DEFAULT_INSTALL_DIR=" + installDir);
                Console.WriteLine("DEFAULT_STATE_DIR=" + stateDir);
                return 0;
            }

            if (delayMs > 0)
            {
                System.Threading.Thread.Sleep(delayMs);
            }

            if (silent)
            {
                try
                {
                    if (uninstall)
                    {
                        RunUninstall(installDir, stateDir, retainData, skipRegistry, msg => Console.WriteLine(msg));
                    }
                    else
                    {
                        RunInstall(installDir, stateDir, skipRegistry, skipShortcuts, skipBrowser, restartSidecar, forceSeed, msg => Console.WriteLine(msg));
                    }
                    return 0;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("[XPIDER_SETUP_ERROR] " + ex.Message);
                    return 1;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(installDir, stateDir, uninstall, hasPersonalSeed));
            return 0;
        }

        internal static bool HasEmbeddedPersonalSeed()
        {
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(PERSONAL_SEED_RESOURCE))
                {
                    return s != null;
                }
            }
            catch { return false; }
        }

        internal static void StopInstalledSidecar(string installDir, Action<string> log)
        {
            bool stoppedAny = false;
            try
            {
                string targetNode = Path.GetFullPath(Path.Combine(installDir, "runtime", "node.exe"));
                foreach (var proc in Process.GetProcessesByName("node"))
                {
                    try
                    {
                        string pPath = proc.MainModule != null ? Path.GetFullPath(proc.MainModule.FileName) : "";
                        if (string.Equals(pPath, targetNode, StringComparison.OrdinalIgnoreCase))
                        {
                            log("Stopping installed runtime process PID=" + proc.Id);
                            proc.Kill();
                            proc.WaitForExit(5000);
                            stoppedAny = true;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            if (stoppedAny) System.Threading.Thread.Sleep(600);
        }

        private static void ExtractEntryWithRetry(ZipArchiveEntry entry, string destPath)
        {
            for (int attempt = 0; attempt < 8; attempt++)
            {
                try
                {
                    entry.ExtractToFile(destPath, true);
                    return;
                }
                catch (IOException)
                {
                    if (attempt == 7) throw;
                    System.Threading.Thread.Sleep(300);
                }
            }
        }

        internal static void RunInstall(string installDir, string stateDir, bool skipRegistry, bool skipShortcuts, bool skipBrowser, bool restartSidecar, bool forceSeed, Action<string> log)
        {
            log("Installing " + APP_NAME + " v" + APP_VERSION + " (UNSIGNED user-scope package)...");
            log("Install directory: " + installDir);
            log("Durable user data directory (preserved across upgrades): " + stateDir);

            StopInstalledSidecar(installDir, log);
            Directory.CreateDirectory(installDir);
            Directory.CreateDirectory(stateDir);

            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream resStream = asm.GetManifestResourceStream(PAYLOAD_RESOURCE))
            {
                if (resStream == null)
                    throw new InvalidOperationException("Embedded payload resource missing: " + PAYLOAD_RESOURCE);

                using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                {
                    string rootFull = Path.GetFullPath(installDir);
                    if (!rootFull.EndsWith(Path.DirectorySeparatorChar.ToString()))
                        rootFull += Path.DirectorySeparatorChar;

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string rel = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                        if (string.IsNullOrEmpty(rel)) continue;
                        string destPath = Path.GetFullPath(Path.Combine(installDir, rel));
                        if (!destPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidOperationException("Unsafe zip entry rejected: " + entry.FullName);

                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            Directory.CreateDirectory(destPath);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(destPath));
                        ExtractEntryWithRetry(entry, destPath);
                    }
                }
            }

            // Copy this setup executable as the local uninstaller inside installDir
            try
            {
                string selfExe = Assembly.GetExecutingAssembly().Location;
                string uninstExe = Path.Combine(installDir, "XPIDER_UNINSTALL.exe");
                if (!string.Equals(Path.GetFullPath(selfExe), Path.GetFullPath(uninstExe), StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(selfExe, uninstExe, true);
                }
            }
            catch (Exception copyEx)
            {
                log("Warning copying local uninstaller: " + copyEx.Message);
            }

            string nodeExe = Path.Combine(installDir, "runtime", "node.exe");
            if (!File.Exists(nodeExe))
                throw new FileNotFoundException("Bundled Node runtime missing after extraction: " + nodeExe);

            // LOCAL-ONLY Personal Build hook: apply bundled settings & re-seal DPAPI OAuth vault for this PC
            using (Stream seedStream = asm.GetManifestResourceStream(PERSONAL_SEED_RESOURCE))
            {
                if (seedStream != null)
                {
                    string migrationScript = Path.Combine(installDir, "companion", "xpider-personal-migration.js");
                    if (File.Exists(migrationScript))
                    {
                        string tmpSeed = Path.Combine(Path.GetTempPath(), "xpider_seed_" + Guid.NewGuid().ToString("N") + ".bin");
                        try
                        {
                            using (FileStream fsOut = File.Create(tmpSeed))
                            {
                                seedStream.CopyTo(fsOut);
                            }
                            string seedArgs = "\"" + migrationScript + "\" --apply-seed --seed \"" + tmpSeed + "\" --target-state-dir \"" + stateDir + "\" --delete-after" + (forceSeed ? " --overwrite" : "");
                            ProcessStartInfo psi = new ProcessStartInfo
                            {
                                FileName = nodeExe,
                                Arguments = seedArgs,
                                UseShellExecute = false,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                                CreateNoWindow = true
                            };
                            using (Process p = Process.Start(psi))
                            {
                                string stdOut = p.StandardOutput.ReadToEnd();
                                string stdErr = p.StandardError.ReadToEnd();
                                p.WaitForExit(30000);
                                if (p.ExitCode != 0)
                                    throw new InvalidOperationException("Personal settings seed failed (exit=" + p.ExitCode + "): " + stdErr.Trim());
                                foreach (string line in stdOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                                    log("[PERSONAL_SEED] " + line);
                            }
                        }
                        finally
                        {
                            try { if (File.Exists(tmpSeed)) File.Delete(tmpSeed); } catch { }
                        }
                    }
                }
            }

            // Write native host wrappers in stateDir\native_host pointing strictly to install-relative runtime\node.exe
            string nhDir = Path.Combine(stateDir, "native_host");
            Directory.CreateDirectory(nhDir);

            string emailHostScript = Path.Combine(installDir, "companion", "email-test-sidecar-native-host.js");
            string emailBatPath = Path.Combine(nhDir, "xpider_email_sidecar_host.bat");
            string emailManifestPath = Path.Combine(nhDir, EMAIL_HOST_NAME + ".json");
            File.WriteAllText(emailBatPath, "@echo off\r\n\"" + nodeExe + "\" \"" + emailHostScript + "\"\r\n", Encoding.ASCII);
            string emailManifestJson = "{\r\n" +
                "  \"name\": \"" + EMAIL_HOST_NAME + "\",\r\n" +
                "  \"description\": \"XPIDER Isolated Email Sidecar Native Messaging Host\",\r\n" +
                "  \"path\": \"" + EscapeJson(emailBatPath) + "\",\r\n" +
                "  \"type\": \"stdio\",\r\n" +
                "  \"allowed_origins\": [\"chrome-extension://" + EXTENSION_ID + "/\"]\r\n" +
                "}\r\n";
            File.WriteAllText(emailManifestPath, emailManifestJson, new UTF8Encoding(false));

            string relayHostScript = Path.Combine(installDir, "companion", "native_host", "xpider_native_host.js");
            string relayManifestPath = null;
            if (File.Exists(relayHostScript))
            {
                string relayBatPath = Path.Combine(nhDir, "xpider_privacy_relay_host.bat");
                relayManifestPath = Path.Combine(nhDir, RELAY_HOST_NAME + ".json");
                File.WriteAllText(relayBatPath, "@echo off\r\n\"" + nodeExe + "\" \"" + relayHostScript + "\"\r\n", Encoding.ASCII);
                string relayManifestJson = "{\r\n" +
                    "  \"name\": \"" + RELAY_HOST_NAME + "\",\r\n" +
                    "  \"description\": \"XPIDER Privacy Relay Native Messaging Host\",\r\n" +
                    "  \"path\": \"" + EscapeJson(relayBatPath) + "\",\r\n" +
                    "  \"type\": \"stdio\",\r\n" +
                    "  \"allowed_origins\": [\"chrome-extension://" + EXTENSION_ID + "/\"]\r\n" +
                    "}\r\n";
                File.WriteAllText(relayManifestPath, relayManifestJson, new UTF8Encoding(false));
            }

            if (!skipRegistry)
            {
                RegisterNativeHost(EMAIL_HOST_NAME, emailManifestPath);
                if (!string.IsNullOrEmpty(relayManifestPath))
                    RegisterNativeHost(RELAY_HOST_NAME, relayManifestPath);
                RegisterUninstallEntry(installDir, stateDir);
                log("Registered HKCU Native Messaging Hosts (Chrome & Edge) and Add/Remove Programs entry.");
            }
            else
            {
                log("Skipped HKCU registry updates (--skip-registry).");
            }

            // Write installation receipt metadata (zero secrets)
            string metaPath = Path.Combine(installDir, "INSTALL_RECEIPT.json");
            string metaJson = "{\r\n" +
                "  \"app\": \"" + APP_NAME + "\",\r\n" +
                "  \"version\": \"" + APP_VERSION + "\",\r\n" +
                "  \"signed\": \"UNSIGNED\",\r\n" +
                "  \"extensionId\": \"" + EXTENSION_ID + "\",\r\n" +
                "  \"installDir\": \"" + EscapeJson(installDir) + "\",\r\n" +
                "  \"stateDir\": \"" + EscapeJson(stateDir) + "\",\r\n" +
                "  \"installedAt\": \"" + DateTime.UtcNow.ToString("o") + "\"\r\n" +
                "}\r\n";
            File.WriteAllText(metaPath, metaJson, new UTF8Encoding(false));

            if (!skipShortcuts)
            {
                try
                {
                    string startMenuDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                        "XPIDER AutoForm Sender Pro");
                    Directory.CreateDirectory(startMenuDir);
                    File.WriteAllText(
                        Path.Combine(startMenuDir, "Open XPIDER Extension Folder.url"),
                        "[InternetShortcut]\r\nURL=file:///" + Path.Combine(installDir, "extension").Replace('\\', '/') + "\r\n",
                        Encoding.UTF8);
                }
                catch (Exception scEx)
                {
                    log("Warning creating Start Menu folder shortcut: " + scEx.Message);
                }
            }

            log("INSTALL_COMPLETE: " + installDir);
            log("EXTENSION_LOAD_DIR: " + Path.Combine(installDir, "extension"));
            log("NOTE: Per Chrome/Edge policy, Secure Preferences is NOT modified. Load the unpacked extension folder once in chrome://extensions or edge://extensions (pinned ID " + EXTENSION_ID + ").");

            if (restartSidecar)
            {
                try
                {
                    string sidecarCli = Path.Combine(installDir, "companion", "email-test-sidecar-cli.js");
                    if (File.Exists(sidecarCli))
                    {
                        ProcessStartInfo sPsi = new ProcessStartInfo
                        {
                            FileName = nodeExe,
                            Arguments = "\"" + sidecarCli + "\"",
                            WorkingDirectory = installDir,
                            UseShellExecute = false,
                            CreateNoWindow = true
                        };
                        Process.Start(sPsi);
                        log("SIDECAR_RESTARTED: " + sidecarCli);
                    }
                }
                catch (Exception scStartEx)
                {
                    log("Warning restarting Sidecar: " + scStartEx.Message);
                }
            }

            if (!skipBrowser)
            {
                try
                {
                    Process.Start("explorer.exe", Path.Combine(installDir, "extension"));
                }
                catch { }
            }
        }

        internal static void RunUninstall(string installDir, string stateDir, bool retainData, bool skipRegistry, Action<string> log)
        {
            log("Uninstalling " + APP_NAME + "...");
            StopInstalledSidecar(installDir, log);

            if (!skipRegistry)
            {
                UnregisterNativeHost(EMAIL_HOST_NAME);
                UnregisterNativeHost(RELAY_HOST_NAME);
                try { Registry.CurrentUser.DeleteSubKeyTree(UNINSTALL_REG_KEY, false); } catch { }
                log("Removed HKCU Native Messaging Host and Add/Remove Programs entries.");
            }

            try
            {
                string startMenuDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                    "XPIDER AutoForm Sender Pro");
                if (Directory.Exists(startMenuDir))
                    Directory.Delete(startMenuDir, true);
            }
            catch { }

            if (Directory.Exists(installDir))
            {
                string selfExe = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
                bool runningFromInstallDir = selfExe.StartsWith(Path.GetFullPath(installDir), StringComparison.OrdinalIgnoreCase);
                if (!runningFromInstallDir)
                {
                    Directory.Delete(installDir, true);
                    log("Removed application directory: " + installDir);
                }
                else
                {
                    foreach (var dir in Directory.GetDirectories(installDir))
                    {
                        try { Directory.Delete(dir, true); } catch { }
                    }
                    foreach (var file in Directory.GetFiles(installDir))
                    {
                        if (!string.Equals(Path.GetFullPath(file), selfExe, StringComparison.OrdinalIgnoreCase))
                        {
                            try { File.Delete(file); } catch { }
                        }
                    }
                    log("Removed application files (local uninstaller binary will clean up on exit).");
                }
            }

            if (retainData)
            {
                log("DATA_RETAINED: Preserved durable user data at " + stateDir);
            }
            else if (Directory.Exists(stateDir))
            {
                Directory.Delete(stateDir, true);
                log("DATA_PURGED: Removed user data directory " + stateDir);
            }

            log("UNINSTALL_COMPLETE");
        }

        private static void RegisterNativeHost(string hostName, string manifestPath)
        {
            string[] roots = new[]
            {
                @"Software\Google\Chrome\NativeMessagingHosts\" + hostName,
                @"Software\Microsoft\Edge\NativeMessagingHosts\" + hostName
            };
            foreach (string sub in roots)
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(sub))
                {
                    if (k != null) k.SetValue("", manifestPath, RegistryValueKind.String);
                }
            }
        }

        private static void UnregisterNativeHost(string hostName)
        {
            string[] roots = new[]
            {
                @"Software\Google\Chrome\NativeMessagingHosts\" + hostName,
                @"Software\Microsoft\Edge\NativeMessagingHosts\" + hostName
            };
            foreach (string sub in roots)
            {
                try { Registry.CurrentUser.DeleteSubKeyTree(sub, false); } catch { }
            }
        }

        private static void RegisterUninstallEntry(string installDir, string stateDir)
        {
            string uninstExe = Path.Combine(installDir, "XPIDER_UNINSTALL.exe");
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(UNINSTALL_REG_KEY))
            {
                if (k == null) return;
                k.SetValue("DisplayName", APP_NAME + " (v" + APP_VERSION + " · User Scope · UNSIGNED)", RegistryValueKind.String);
                k.SetValue("DisplayVersion", APP_VERSION, RegistryValueKind.String);
                k.SetValue("Publisher", "XPIDER", RegistryValueKind.String);
                k.SetValue("InstallLocation", installDir, RegistryValueKind.String);
                k.SetValue("UninstallString", "\"" + uninstExe + "\" --uninstall --retain-data --install-dir \"" + installDir + "\" --state-dir \"" + stateDir + "\"", RegistryValueKind.String);
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        private static string EscapeJson(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private class SetupForm : Form
        {
            private readonly TextBox txtInstallDir;
            private readonly TextBox txtLog;
            private readonly CheckBox chkRetainData;
            private readonly Button btnInstall;
            private readonly Button btnUninstall;
            private readonly string stateDir;

            public SetupForm(string defaultInstallDir, string defaultStateDir, bool startUninstallMode, bool hasPersonalSeed)
            {
                this.stateDir = defaultStateDir;
                this.Text = APP_NAME + " v" + APP_VERSION + (hasPersonalSeed ? " Setup [PERSONAL LOCAL-ONLY · DO NOT UPLOAD]" : " Setup (UNSIGNED)");
                this.Size = new Size(640, 480);
                this.StartPosition = FormStartPosition.CenterScreen;
                this.FormBorderStyle = FormBorderStyle.FixedDialog;
                this.MaximizeBox = false;

                Label lblHeader = new Label
                {
                    Text = APP_NAME + " v" + APP_VERSION + (hasPersonalSeed ? " — 개인 전용 로컬 통합 설치기 (API 키·OAuth 포함 · GitHub 업로드 금지)\n" : " — Windows 10/11 x64 사용자 설치 (UNSIGNED)\n") +
                           "• Node.js 런타임 내장 (별도 Node 설치 불필요 · 관리자 권한 불필요)\n" +
                           (hasPersonalSeed
                               ? "• 개인 API 키·이미지 호스팅·수신거부·Gmail OAuth(이 PC용 DPAPI 재암호화)·계정 목록을 자동 복원합니다\n"
                               : "• 기존 V7 데이터(%LOCALAPPDATA%\\XPIDER\\Sidecar) 보존 · 새 PC에서는 DPAPI 키/OAuth 재연결 필요\n") +
                           "• 브라우저 정책 준수: Secure Preferences 미변경 · 확장 폴더 로드 시 고정 ID (" + EXTENSION_ID + ") 유지",
                    Location = new Point(16, 12),
                    Size = new Size(595, 76)
                };
                this.Controls.Add(lblHeader);

                Label lblPath = new Label { Text = "설치 경로 (Install Folder):", Location = new Point(16, 94), Size = new Size(160, 20) };
                txtInstallDir = new TextBox { Text = defaultInstallDir, Location = new Point(16, 116), Size = new Size(590, 24) };
                this.Controls.Add(lblPath);
                this.Controls.Add(txtInstallDir);

                chkRetainData = new CheckBox
                {
                    Text = "제거 시 사용자 데이터 보존 (%LOCALAPPDATA%\\XPIDER\\Sidecar — 동의/수신거부/이력 유지)",
                    Checked = true,
                    Location = new Point(16, 148),
                    Size = new Size(590, 24)
                };
                this.Controls.Add(chkRetainData);

                btnInstall = new Button
                {
                    Text = "설치 / 업그레이드 (Install / Upgrade)",
                    Location = new Point(16, 180),
                    Size = new Size(285, 34)
                };
                btnInstall.Click += (s, e) => DoInstall();
                this.Controls.Add(btnInstall);

                btnUninstall = new Button
                {
                    Text = "제거 (Uninstall)",
                    Location = new Point(320, 180),
                    Size = new Size(286, 34)
                };
                btnUninstall.Click += (s, e) => DoUninstall();
                this.Controls.Add(btnUninstall);

                txtLog = new TextBox
                {
                    Multiline = true,
                    ReadOnly = true,
                    ScrollBars = ScrollBars.Vertical,
                    Location = new Point(16, 224),
                    Size = new Size(590, 205),
                    Font = new Font("Consolas", 9f)
                };
                this.Controls.Add(txtLog);

                if (startUninstallMode)
                {
                    AppendLog("제거 모드로 시작되었습니다. [제거 (Uninstall)] 버튼을 누르세요.");
                }
            }

            private void AppendLog(string line)
            {
                if (txtLog.InvokeRequired)
                {
                    txtLog.Invoke(new Action<string>(AppendLog), line);
                    return;
                }
                txtLog.AppendText(line + Environment.NewLine);
            }

            private void DoInstall()
            {
                btnInstall.Enabled = false;
                btnUninstall.Enabled = false;
                try
                {
                    RunInstall(txtInstallDir.Text.Trim(), stateDir, false, false, false, true, false, AppendLog);
                    string extPath = Path.Combine(txtInstallDir.Text.Trim(), "extension");
                    try { Clipboard.SetText(extPath); } catch { }
                    MessageBox.Show(
                        "설치가 완료되었습니다!\n\n" +
                        "Chrome 또는 Edge에서 chrome://extensions (개발자 모드 ON) → '압축해제된 확장 프로그램을 로드합니다'를 클릭하고 아래 폴더를 선택하세요 (클립보드에 자동 복사됨):\n\n" +
                        extPath + "\n\n고정 확장 ID: " + EXTENSION_ID,
                        APP_NAME + " 설치 완료",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    AppendLog("ERROR: " + ex.Message);
                    MessageBox.Show("설치 실패: " + ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally
                {
                    btnInstall.Enabled = true;
                    btnUninstall.Enabled = true;
                }
            }

            private void DoUninstall()
            {
                btnInstall.Enabled = false;
                btnUninstall.Enabled = false;
                try
                {
                    RunUninstall(txtInstallDir.Text.Trim(), stateDir, chkRetainData.Checked, false, AppendLog);
                    MessageBox.Show("제거가 완료되었습니다." + (chkRetainData.Checked ? "\n사용자 데이터는 보존되었습니다." : ""), APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    AppendLog("ERROR: " + ex.Message);
                    MessageBox.Show("제거 실패: " + ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally
                {
                    btnInstall.Enabled = true;
                    btnUninstall.Enabled = true;
                }
            }
        }
    }
}
