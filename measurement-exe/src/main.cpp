#include "http_server.h"
#include "logs.h"
#include "panel.h"
#include "standard.h"
#include "tasks.h"
#include "util.h"

#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>

#include <atomic>
#include <cstdlib>
#include <string>
#include <thread>

namespace {

int envInt(const char* name, int fallback, bool nonNegative) {
  const char* value = std::getenv(name);
  if (!value || !*value) return fallback;
  char* end = nullptr;
  long parsed = std::strtol(value, &end, 10);
  if (end == value || *end != '\0') return fallback;
  if (nonNegative) {
    if (parsed < 0) return fallback;
  } else if (parsed <= 0) {
    return fallback;
  }
  return static_cast<int>(parsed);
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&controls);

  std::string standardError;
  if (!loadStandardParams(joinPath(exeDirectory(), "standard-params.json"), standardError)) {
    MessageBoxW(nullptr, utf8ToWide(standardError).c_str(), L"测量适配程序", MB_ICONERROR);
    return 1;
  }

  LogStore logs;
  TaskService tasks(logs, exeDirectory());
  if (std::getenv("MEASUREMENT_CONFIRM_TIMEOUT_SECONDS")) {
    tasks.setConfirmTimeoutSeconds(envInt("MEASUREMENT_CONFIRM_TIMEOUT_SECONDS", 1800, false));
  }
  if (std::getenv("MEASUREMENT_CALLBACK_RETRY_MS")) {
    tasks.setCallbackRetryMs(envInt("MEASUREMENT_CALLBACK_RETRY_MS", 5000, true));
  }
  if (const char* mode = std::getenv("MEASUREMENT_PROCESS_MODE")) {
    if (std::string(mode) == "queue") tasks.setProcessMode(TaskService::ProcessMode::Queue);
    else if (std::string(mode) == "overwrite") tasks.setProcessMode(TaskService::ProcessMode::Overwrite);
  }

  if (!createPanel(instance, tasks)) {
    MessageBoxW(nullptr, L"无法创建测量面板。", L"测量适配程序", MB_ICONERROR);
    return 1;
  }
  tasks.setUiNotify([](bool focusLatest) { notifyPanel(focusLatest); });

  bool autotest = false;
  if (const char* flag = std::getenv("MEASUREMENT_AUTOTEST")) autotest = std::string(flag) == "1";
  int port = envInt("MEASUREMENT_PORT", 3133, false);
  if (port < 1 || port > 65535) port = 3133;

  HttpServer server;
  if (!server.start(tasks, logs, autotest, port)) {
    wchar_t message[128];
    wsprintfW(message, L"端口 %d 已被占用，测量适配程序无法启动。", port);
    MessageBoxW(nullptr, message, L"测量适配程序", MB_ICONERROR);
    return 1;
  }

  std::atomic<bool> running{true};
  std::thread timer([&] {
    while (running.load()) {
      tasks.tick();
      Sleep(200);
    }
  });

  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  running = false;
  timer.join();
  server.stop();
  return 0;
}
