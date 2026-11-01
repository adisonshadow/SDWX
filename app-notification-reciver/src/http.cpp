#include "http.h"

#include "util.h"

#include <windows.h>
#include <winhttp.h>

namespace {

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

std::wstring headerBlock(const std::string& token) {
  std::wstring headers = L"Content-Type: application/json; charset=utf-8\r\nAccept: application/json\r\n";
  if (!token.empty()) {
    headers += L"Authorization: Bearer ";
    headers += utf8ToWide(token);
    headers += L"\r\n";
  }
  return headers;
}

}  // namespace

HttpResponse httpRequest(const std::string& method, const std::string& url, const std::string& token,
                         const std::string& body) {
  HttpResponse result;
  std::wstring wurl = utf8ToWide(url);
  URL_COMPONENTS parts{};
  parts.dwStructSize = sizeof(parts);
  wchar_t host[256]{};
  wchar_t path[4096]{};
  wchar_t extra[4096]{};
  parts.lpszHostName = host;
  parts.dwHostNameLength = 256;
  parts.lpszUrlPath = path;
  parts.dwUrlPathLength = 4096;
  parts.lpszExtraInfo = extra;
  parts.dwExtraInfoLength = 4096;
  if (!WinHttpCrackUrl(wurl.c_str(), 0, 0, &parts)) {
    result.error = "接口地址无法识别";
    return result;
  }

  HttpHandles handles;
  handles.session = WinHttpOpen(L"notification-receiver/1.0", WINHTTP_ACCESS_TYPE_NO_PROXY, WINHTTP_NO_PROXY_NAME,
                                 WINHTTP_NO_PROXY_BYPASS, 0);
  if (!handles.session) {
    result.error = "无法发起网络请求";
    return result;
  }
  WinHttpSetTimeouts(handles.session, 4000, 4000, 8000, 8000);

  std::wstring hostName(parts.lpszHostName, parts.dwHostNameLength);
  handles.connect = WinHttpConnect(handles.session, hostName.c_str(), parts.nPort, 0);
  if (!handles.connect) {
    result.error = "无法连接接口地址";
    return result;
  }

  std::wstring objectName(parts.lpszUrlPath, parts.dwUrlPathLength);
  if (objectName.empty()) objectName = L"/";
  objectName.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  DWORD flags = (parts.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
  std::wstring verb = utf8ToWide(method);
  handles.request = WinHttpOpenRequest(handles.connect, verb.c_str(), objectName.c_str(), nullptr, WINHTTP_NO_REFERER,
                                        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!handles.request) {
    result.error = "无法创建请求";
    return result;
  }

  std::wstring headers = headerBlock(token);
  LPVOID payload = body.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char*>(body.data());
  DWORD payloadLen = static_cast<DWORD>(body.size());
  BOOL sent = WinHttpSendRequest(handles.request, headers.c_str(), static_cast<DWORD>(-1), payload, payloadLen, payloadLen, 0);
  if (!sent || !WinHttpReceiveResponse(handles.request, nullptr)) {
    result.error = "接口没有响应";
    return result;
  }

  DWORD code = 0;
  DWORD size = sizeof(code);
  if (!WinHttpQueryHeaders(handles.request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                           WINHTTP_HEADER_NAME_BY_INDEX, &code, &size, WINHTTP_NO_HEADER_INDEX)) {
    result.error = "无法读取接口状态";
    return result;
  }
  result.status = static_cast<int>(code);

  std::string response;
  for (;;) {
    DWORD available = 0;
    if (!WinHttpQueryDataAvailable(handles.request, &available)) break;
    if (available == 0) break;
    std::string chunk(available, '\0');
    DWORD read = 0;
    if (!WinHttpReadData(handles.request, chunk.data(), available, &read)) break;
    chunk.resize(read);
    response += chunk;
  }
  result.body = std::move(response);
  return result;
}
