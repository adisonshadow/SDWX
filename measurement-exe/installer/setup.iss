; 测量适配程序安装脚本。用 Inno Setup 编译，安装包要求 Windows 7 SP1 及以上、能运行 64 位程序的系统。

#define MyAppName "SD厂N车间数字化测量采集"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "SDWX"
#define MyAppExeName "measurement-adapter.exe"
#define MyFirewallRule "测量适配程序 3133"

[Setup]
AppId={{8F4C2A19-6B7E-4D35-9A10-C3E5F7B21D84}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion=1.0.0.0
VersionInfoProductName={#MyAppName}
DefaultDirName={autopf}\SDWX\测量适配程序
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=MeasurementAdapter-1.0.0-setup
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=6.1sp1
PrivilegesRequired=admin
CloseApplications=no
RestartApplications=no
ShowLanguageDialog=no

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加选项:"; Flags: checkedonce

[Files]
Source: "..\build\Release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\standard-params.json"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#MyFirewallRule}"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#MyFirewallRule}"" dir=in action=allow protocol=TCP localport=3133 profile=any program=""{app}\{#MyAppExeName}"""; Flags: runhidden; StatusMsg: "正在允许端口 3133 接收入站连接..."
Filename: "{app}\{#MyAppExeName}"; Description: "启动测量采集"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#MyFirewallRule}"""; Flags: runhidden; RunOnceId: "RemoveFirewall"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM {#MyAppExeName} >nul 2>nul & exit /b 0', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
    Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM {#MyAppExeName} >nul 2>nul & exit /b 0', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
