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

bool appendTextFile(const std::string& path, const std::string& content) {
  std::wstring wpath = utf8ToWide(path);
  std::ofstream out(wpath.c_str(), std::ios::binary | std::ios::app);
  if (!out) return false;
  out.write(content.data(), static_cast<std::streamsize>(content.size()));
  return static_cast<bool>(out);
}

bool ensureFileExists(const std::string& path) {
  std::wstring wpath = utf8ToWide(path);
  if (wpath.empty()) return false;
  auto pos = wpath.find_last_of(L"\\/");
  if (pos != std::wstring::npos && pos > 0) {
    CreateDirectoryW(wpath.substr(0, pos).c_str(), nullptr);
  }
  DWORD attr = GetFileAttributesW(wpath.c_str());
  if (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY)) return true;
  std::ofstream out(wpath.c_str(), std::ios::binary | std::ios::app);
  return static_cast<bool>(out);
}

std::string joinPath(const std::string& dir, const std::string& name) {
  if (dir.empty()) return name;
  char last = dir.back();
  if (last == '\\' || last == '/') return dir + name;
  return dir + "\\" + name;
}
