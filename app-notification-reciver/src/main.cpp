#include "panel.h"
#include "util.h"

#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>

namespace {

std::wstring protocolArg() {
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!argv) return L"";
  std::wstring found;
  for (int i = 1; i < argc; ++i) {
    std::wstring arg = argv[i];
    if (arg.find(L"notify-receiver:") != std::wstring::npos) {
      found = std::move(arg);
      break;
    }
  }
  LocalFree(argv);
  return found;
}

bool sendTo(HWND hwnd, const std::wstring& launch) {
  if (!hwnd) return false;
  if (launch.empty()) {
    PostMessageW(hwnd, WM_APP + 8, 0, 0);
    return true;
  }
  COPYDATASTRUCT data{};
  data.dwData = 1;
  data.cbData = static_cast<DWORD>((launch.size() + 1) * sizeof(wchar_t));
  data.lpData = const_cast<wchar_t*>(launch.c_str());
  DWORD_PTR result = 0;
  LRESULT sent = SendMessageTimeoutW(hwnd, WM_COPYDATA, 0, reinterpret_cast<LPARAM>(&data), SMTO_ABORTIFHUNG, 3000, &result);
  return sent != 0;
}

bool forwardExisting(const std::wstring& launch) {
  HWND hwnd = FindWindowW(L"NotificationReceiverPanel", nullptr);
  if (!hwnd) return false;
  sendTo(hwnd, launch);
  return true;
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
  std::wstring launch = protocolArg();
  if (forwardExisting(launch)) return 0;

  HANDLE mutex = CreateMutexW(nullptr, TRUE, L"Local\\SDWX.NotificationReceiver");
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    for (int i = 0; i < 25 && !forwardExisting(launch); ++i) Sleep(100);
    if (mutex) CloseHandle(mutex);
    return 0;
  }

  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&controls);
  registerProtocol();
  if (!createPanel(instance, launch)) {
    MessageBoxW(nullptr, L"无法启动异常呼叫通知程序。", L"异常呼叫", MB_ICONERROR);
    if (mutex) CloseHandle(mutex);
    return 1;
  }

  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  stopReceiver();
  if (mutex) CloseHandle(mutex);
  return 0;
}
