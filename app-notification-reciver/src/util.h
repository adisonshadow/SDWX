#pragma once

#include <string>

std::wstring utf8ToWide(const std::string& text);
std::string wideToUtf8(const std::wstring& text);
std::string nowIso8601();
std::string exeDirectory();
std::string readTextFile(const std::string& path);
bool writeTextFile(const std::string& path, const std::string& content);
std::string joinPath(const std::string& dir, const std::string& name);
std::string trimAscii(std::string text);
std::string urlDecode(const std::string& text);
std::string queryParam(const std::string& url, const std::string& key);
