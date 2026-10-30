#include "callback.h"

#include "util.h"

#include <windows.h>
#include <winhttp.h>

#include <chrono>
#include <thread>

struct HttpHandles {
  HINTERNET session = nullptr;
  HINTERNET connect = nullptr;
  HINTERNET request = nullptr;
  ~HttpHandles() {
    if (request) WinHttpCloseHandle(request);
    if (connect) WinHttpCloseHandle(connect);
    if (session) WinHttpCloseHandle(session);
  }
};

struct Attempt {
  bool http = false;
  int status = 0;
  DWORD error = 0;
};

Attempt postOnce(const std::string& url, const std::string& body) {
  Attempt attempt;
  std::wstring wurl = utf8ToWide(url);
  URL_COMPONENTS parts{};
  parts.dwStructSize = sizeof(parts);
  wchar_t host[256]{};
  wchar_t path[4096]{};
  wchar_t extra[2048]{};
  parts.lpszHostName = host;
  parts.dwHostNameLength = 256;
  parts.lpszUrlPath = path;
  parts.dwUrlPathLength = 4096;
  parts.lpszExtraInfo = extra;
  parts.dwExtraInfoLength = 2048;
  if (!WinHttpCrackUrl(wurl.c_str(), 0, 0, &parts)) {
    attempt.error = GetLastError();
    return attempt;
  }

  HttpHandles handles;
  handles.session = WinHttpOpen(L"measurement-adapter/1.0", WINHTTP_ACCESS_TYPE_NO_PROXY,
                                 WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!handles.session) {
    attempt.error = GetLastError();
    return attempt;
  }
  WinHttpSetTimeouts(handles.session, 5000, 5000, 10000, 10000);

  std::wstring hostName(parts.lpszHostName, parts.dwHostNameLength);
  handles.connect = WinHttpConnect(handles.session, hostName.c_str(), parts.nPort, 0);
  if (!handles.connect) {
    attempt.error = GetLastError();
    return attempt;
  }

  std::wstring objectName(parts.lpszUrlPath, parts.dwUrlPathLength);
  if (objectName.empty()) objectName = L"/";
  objectName.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  DWORD flags = (parts.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
  handles.request = WinHttpOpenRequest(handles.connect, L"POST", objectName.c_str(), nullptr,
                                        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!handles.request) {
    attempt.error = GetLastError();
    return attempt;
  }

  const wchar_t* headers = L"Content-Type: application/json; charset=utf-8\r\n";
  BOOL sent = WinHttpSendRequest(handles.request, headers, static_cast<DWORD>(-1),
                                  const_cast<char*>(body.data()), static_cast<DWORD>(body.size()),
                                  static_cast<DWORD>(body.size()), 0);
  if (!sent) {
    attempt.error = GetLastError();
    return attempt;
  }
  if (!WinHttpReceiveResponse(handles.request, nullptr)) {
    attempt.error = GetLastError();
    return attempt;
  }

  DWORD code = 0;
  DWORD size = sizeof(code);
  if (!WinHttpQueryHeaders(handles.request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                           WINHTTP_HEADER_NAME_BY_INDEX, &code, &size, WINHTTP_NO_HEADER_INDEX)) {
    attempt.error = GetLastError();
    return attempt;
  }
  attempt.http = true;
  attempt.status = static_cast<int>(code);
  return attempt;
}

CallbackFailure failureOf(const Attempt& attempt) {
  if (attempt.http) return CallbackFailure::HttpStatus;
  if (attempt.error == ERROR_WINHTTP_TIMEOUT) return CallbackFailure::Timeout;
  return CallbackFailure::Unreachable;
}

CallbackPostResult postCallback(const std::string& url, const std::string& body, int retryIntervalMs) {
  CallbackPostResult result;
  result.failure = CallbackFailure::Unreachable;
  if (retryIntervalMs < 0) retryIntervalMs = 0;
  for (int attempt = 0; attempt < 4; ++attempt) {
    Attempt once = postOnce(url, body);
    result.status = once.status;
    result.failure = failureOf(once);
    if (once.http && once.status >= 200 && once.status < 300) {
      result.delivered = true;
      result.failure = CallbackFailure::None;
      return result;
    }
    if (attempt < 3) {
      std::this_thread::sleep_for(std::chrono::milliseconds(retryIntervalMs));
    }
  }
  result.delivered = false;
  return result;
}

std::string callbackFailureMessage(const CallbackPostResult& result, const std::string& url) {
  if (result.delivered) return "";
  if (result.failure == CallbackFailure::EmptyUrl || url.empty()) return "尚未配置回调地址，无法提交";
  if (result.failure == CallbackFailure::Timeout) return "提交超时，回调地址无响应：" + url;
  if (result.failure == CallbackFailure::HttpStatus) {
    return "回调地址返回 HTTP " + std::to_string(result.status) + "，测量结果未送达";
  }
  return "无法连接回调地址，测量结果未送达：" + url;
}
