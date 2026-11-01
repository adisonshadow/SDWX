#pragma once

#include <functional>
#include <mutex>
#include <string>
#include <vector>

struct AppConfig {
  std::string apiBase = "http://127.0.0.1:6082";
  std::string token;
  std::string refreshToken;
  std::string displayName;
  bool playSound = true;
  bool flashOnNotify = true;
  bool alwaysOnTop = true;
};

struct CallItem {
  std::string id;
  std::string typeName;
  std::string typeCode;
  std::string content;
  std::string status;
  std::string callerName;
  std::string workstationLabel;
  std::string callTime;
  std::string acceptedBy;
  std::string acceptedAt;
  std::string completedAt;
  bool soundEnabled = false;
  std::string soundKey;
};

struct PollSnapshot {
  int seq = 0;
  std::string error;
  std::string displayName;
  std::vector<CallItem> openItems;
  std::vector<std::string> freshIds;
  std::string soundKey;
  bool flash = false;
  std::string actionError;
};

enum class CallAction { Accept, Complete, Cancel };

struct CallJob {
  std::string id;
  CallAction action = CallAction::Accept;
  std::string acceptedBy;
};

AppConfig loadConfig(const std::string& path);
bool saveConfig(const std::string& path, const AppConfig& config);

class ReceiverService {
 public:
  explicit ReceiverService(std::string configPath);
  AppConfig config() const;
  void updateConfig(const AppConfig& config);
  void setToken(const std::string& token, const std::string& displayName, const std::string& refreshToken = "");
  bool renewAccess(AppConfig& config);
  void setWake(std::function<void()> wake);
  void enqueue(CallJob job);
  PollSnapshot poll();

 private:
  std::string path_;
  mutable std::mutex mu_;
  AppConfig config_;
  std::vector<CallJob> jobs_;
  std::vector<std::string> seen_;
  bool primed_ = false;
  bool announceNext_ = false;
  int seq_ = 0;
  std::function<void()> wake_;
};
