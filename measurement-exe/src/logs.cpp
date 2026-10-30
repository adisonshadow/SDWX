#include "logs.h"

#include "util.h"

namespace {

nlohmann::json toJson(const LogEntry& entry) {
  nlohmann::json item;
  item["time"] = entry.time;
  item["taskId"] = entry.hasTaskId ? nlohmann::json(entry.taskId) : nlohmann::json(nullptr);
  item["deviceType"] = entry.hasDeviceType ? nlohmann::json(entry.deviceType) : nlohmann::json(nullptr);
  item["outcome"] = entry.outcome;
  item["errorCode"] = entry.hasErrorCode ? nlohmann::json(entry.errorCode) : nlohmann::json(nullptr);
  item["message"] = entry.message;
  return item;
}

std::string oneLine(std::string text) {
  for (char& ch : text) {
    if (ch == '\r' || ch == '\n' || ch == '\t') ch = ' ';
  }
  return text;
}

std::string logLine(const LogEntry& entry) {
  std::string line = entry.time + " " + entry.outcome;
  if (entry.hasTaskId) line += " taskId=" + entry.taskId;
  if (entry.hasDeviceType) line += " deviceType=" + entry.deviceType;
  if (entry.hasErrorCode) line += " errorCode=" + entry.errorCode;
  if (!entry.message.empty()) line += " " + oneLine(entry.message);
  line += "\n";
  return line;
}

}  // namespace

void LogStore::setFilePath(std::string path) {
  std::lock_guard<std::mutex> lock(mu_);
  filePath_ = std::move(path);
}

void LogStore::add(LogEntry entry) {
  std::string line = logLine(entry);
  std::lock_guard<std::mutex> lock(mu_);
  entries_.push_front(std::move(entry));
  while (entries_.size() > 1000) entries_.pop_back();
  if (!filePath_.empty()) appendTextFile(filePath_, line);
}

nlohmann::json LogStore::query(int limit) const {
  std::lock_guard<std::mutex> lock(mu_);
  nlohmann::json logs = nlohmann::json::array();
  int count = 0;
  for (const auto& entry : entries_) {
    if (count >= limit) break;
    logs.push_back(toJson(entry));
    ++count;
  }
  return {
      {"limit", limit},
      {"count", count},
      {"retainedMax", 1000},
      {"logs", std::move(logs)},
  };
}

int LogStore::size() const {
  std::lock_guard<std::mutex> lock(mu_);
  return static_cast<int>(entries_.size());
}
