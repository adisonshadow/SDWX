#pragma once

#include "json.hpp"

#include <deque>
#include <mutex>
#include <string>

struct LogEntry {
  std::string time;
  bool hasTaskId = false;
  std::string taskId;
  bool hasDeviceType = false;
  std::string deviceType;
  std::string outcome;
  bool hasErrorCode = false;
  std::string errorCode;
  std::string message;
};

class LogStore {
 public:
  void setFilePath(std::string path);
  void add(LogEntry entry);
  nlohmann::json query(int limit) const;
  int size() const;

 private:
  mutable std::mutex mu_;
  std::deque<LogEntry> entries_;
  std::string filePath_;
};
