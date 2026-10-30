#pragma once

#include <string>

std::wstring utf8ToWide(const std::string& text);
std::string wideToUtf8(const std::wstring& text);
std::string nowIso8601();
std::string exeDirectory();
std::string readTextFile(const std::string& path);
bool writeTextFile(const std::string& path, const std::string& content);
bool appendTextFile(const std::string& path, const std::string& content);
bool ensureFileExists(const std::string& path);
std::string joinPath(const std::string& dir, const std::string& name);
