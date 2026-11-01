#include "util.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdio>
#include <fstream>
#include <sstream>

std::wstring utf8ToWide(const std::string& text) {
  if (text.empty()) return L"";
  int count = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
  if (count <= 0) return L"";
  std::wstring out(static_cast<size_t>(count), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), count);
  return out;
}

std::string wideToUtf8(const std::wstring& text) {
  if (text.empty()) return "";
  int count = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
  if (count <= 0) return "";
  std::string out(static_cast<size_t>(count), '\0');
  WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), count, nullptr, nullptr);
  return out;
}

std::string nowIso8601() {
  SYSTEMTIME st{};
  GetLocalTime(&st);
  TIME_ZONE_INFORMATION tzi{};
  DWORD kind = GetTimeZoneInformation(&tzi);
  int bias = tzi.Bias;
  if (kind == TIME_ZONE_ID_DAYLIGHT) bias += tzi.DaylightBias;
  else if (kind == TIME_ZONE_ID_STANDARD) bias += tzi.StandardBias;
  int offset = -bias;
  char sign = offset >= 0 ? '+' : '-';
  int absOff = offset >= 0 ? offset : -offset;
  char buf[40];
  std::snprintf(buf, sizeof(buf), "%04u-%02u-%02uT%02u:%02u:%02u%c%02d:%02d",
                st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond,
                sign, absOff / 60, absOff % 60);
  return buf;
}

std::string exeDirectory() {
  wchar_t buf[MAX_PATH];
  DWORD n = GetModuleFileNameW(nullptr, buf, MAX_PATH);
  std::wstring path(buf, n);
  auto pos = path.find_last_of(L"\\/");
  if (pos != std::wstring::npos) path.resize(pos);
  return wideToUtf8(path);
}

std::string readTextFile(const std::string& path) {
  std::wstring wpath = utf8ToWide(path);
  std::ifstream in(wpath.c_str(), std::ios::binary);
  if (!in) return "";
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

bool writeTextFile(const std::string& path, const std::string& content) {
  std::wstring wpath = utf8ToWide(path);
  std::ofstream out(wpath.c_str(), std::ios::binary | std::ios::trunc);
  if (!out) return false;
  out.write(content.data(), static_cast<std::streamsize>(content.size()));
  return static_cast<bool>(out);
}

std::string joinPath(const std::string& dir, const std::string& name) {
  if (dir.empty()) return name;
  char last = dir.back();
  if (last == '\\' || last == '/') return dir + name;
  return dir + "\\" + name;
}

std::string trimAscii(std::string text) {
  auto space = [](unsigned char ch) { return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n'; };
  while (!text.empty() && space(static_cast<unsigned char>(text.front()))) text.erase(text.begin());
  while (!text.empty() && space(static_cast<unsigned char>(text.back()))) text.pop_back();
  return text;
}

std::string urlDecode(const std::string& text) {
  std::string out;
  out.reserve(text.size());
  for (size_t i = 0; i < text.size(); ++i) {
    if (text[i] == '%' && i + 2 < text.size()) {
      auto hex = [](char ch) -> int {
        if (ch >= '0' && ch <= '9') return ch - '0';
        if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
        if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
        return -1;
      };
      int hi = hex(text[i + 1]);
      int lo = hex(text[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out.push_back(static_cast<char>((hi << 4) | lo));
        i += 2;
        continue;
      }
    }
    out.push_back(text[i]);
  }
  return out;
}

std::string queryParam(const std::string& url, const std::string& key) {
  std::string needle = key + "=";
  size_t pos = 0;
  while ((pos = url.find(needle, pos)) != std::string::npos) {
    if (pos == 0 || url[pos - 1] == '?' || url[pos - 1] == '&') {
      pos += needle.size();
      auto end = url.find_first_of("&#", pos);
      return urlDecode(url.substr(pos, end == std::string::npos ? std::string::npos : end - pos));
    }
    pos += needle.size();
  }
  return "";
}
