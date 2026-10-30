#pragma once

#include "callback.h"
#include "http_result.h"
#include "logs.h"

#include <functional>
#include <mutex>
#include <string>
#include <vector>

struct FieldView {
  std::string label;
  std::string value;
};

struct RowView {
  std::string code;
  std::string title;
  std::string requirementText;
  std::string valueText;
  bool collected = false;
  std::vector<FieldView> requirements;
};

struct TaskView {
  std::string taskId;
  std::string deviceType;
  std::string deviceName;
  std::string contextText;
  bool allCollected = false;
  bool pending = false;
  std::vector<FieldView> targets;
  std::vector<RowView> rows;
};

class TaskService {
 public:
  TaskService(LogStore& logs, std::string exeDir);

  enum class ProcessMode { Overwrite, Queue };

  void setUiNotify(std::function<void(bool focusLatest)> notify);
  void setConfirmTimeoutSeconds(int seconds);
  void setCallbackRetryMs(int milliseconds);
  ProcessMode processMode() const;
  void setProcessMode(ProcessMode mode);
  bool mockCollectEnabled() const;
  std::string logFilePath() const;
  void updateSettings(ProcessMode mode, bool mockCollect, const std::string& logFile);
  HttpResult closeTask(const std::string& taskId);

  HttpResult getCallback() const;
  HttpResult putCallback(const nlohmann::json& body);
  HttpResult acceptTask(const nlohmann::json& body);
  HttpResult health() const;

  HttpResult testCollect(const nlohmann::json& body);
  HttpResult testRetest(const nlohmann::json& body);
  HttpResult testClear(const nlohmann::json& body);
  HttpResult testSubmit(const nlohmann::json& body);
  HttpResult testGet(const std::string& taskId) const;

  std::vector<TaskView> views() const;
  void tick();

 private:
  struct Item {
    std::string code;
    nlohmann::json requirement = nullptr;
    bool collected = false;
    nlohmann::json value = nullptr;
  };

  enum class Phase { Pending, Finishing };

  struct Task {
    std::string taskId;
    std::string deviceType;
    std::string acceptedAt;
    nlohmann::json context = nullptr;
    std::vector<Item> items;
    Phase phase = Phase::Pending;
    long long deadlineMs = 0;
  };

  struct FinishJob {
    std::string taskId;
    std::string deviceType;
    std::string url;
    std::string body;
    std::string deliveredOutcome;
    std::string errorCode;
    std::string deliveredMessage;
  };

  void notify(bool focusLatest);
  void logEvent(const std::string& outcome, const std::string& message, const std::string* taskId,
                const std::string* deviceType, const std::string* errorCode);
  void loadCallback();
  void saveCallback() const;
  void loadAppSettings();
  void saveAppSettings() const;
  std::string defaultLogPath() const;
  HttpResult mutateCollect(const nlohmann::json& body, bool retest);
  bool fillItem(Item& item, const std::string& deviceType);
  std::string valueText(const Item& item, const std::string& deviceType) const;
  nlohmann::json buildResults(const Task& task) const;
  FinishJob makeFinishJob(Task& task, bool completed, const std::string& errorCode, const std::string& errorMessage);
  CallbackPostResult runFinish(FinishJob job);
  static long long nowMs();

  LogStore& logs_;
  std::string exeDir_;
  mutable std::mutex mu_;
  std::string callbackUrl_;
  std::string callbackUpdatedAt_;
  std::vector<Task> tasks_;
  ProcessMode mode_ = ProcessMode::Overwrite;
  bool mockCollect_ = true;
  std::string logFile_;
  int timeoutSeconds_ = 1800;
  int retryMs_ = 5000;
  std::function<void(bool)> notify_;
};
