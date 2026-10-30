#include "tasks.h"

#include "callback.h"
#include "mock_collect.h"
#include "standard.h"
#include "util.h"

#include <algorithm>
#include <chrono>
#include <mutex>
#include <unordered_set>

namespace {

std::string clipText(std::string text, size_t maxLen) {
  if (text.size() <= maxLen) return text;
  return text.substr(0, maxLen) + "...";
}

}  // namespace

TaskService::TaskService(LogStore& logs, std::string exeDir) : logs_(logs), exeDir_(std::move(exeDir)) {
  loadCallback();
  loadAppSettings();
}

void TaskService::setUiNotify(std::function<void(bool)> notify) { notify_ = std::move(notify); }

void TaskService::setConfirmTimeoutSeconds(int seconds) {
  if (seconds > 0) timeoutSeconds_ = seconds;
}

void TaskService::setCallbackRetryMs(int milliseconds) {
  if (milliseconds >= 0) retryMs_ = milliseconds;
}

std::string TaskService::defaultLogPath() const { return joinPath(exeDir_, "measurement-adapter.log"); }

void TaskService::loadAppSettings() {
  logFile_ = defaultLogPath();
  std::string configText = readTextFile(joinPath(exeDir_, "config.json"));
  if (!configText.empty()) {
    try {
      auto config = nlohmann::json::parse(configText);
      if (config.is_object()) {
        if (config.contains("confirmTimeoutSeconds") && config["confirmTimeoutSeconds"].is_number_integer()) {
          int seconds = config["confirmTimeoutSeconds"].get<int>();
          if (seconds > 0) timeoutSeconds_ = seconds;
        }
        if (config.contains("processMode") && config["processMode"].is_string()) {
          std::string mode = config["processMode"].get<std::string>();
          if (mode == "queue") mode_ = ProcessMode::Queue;
          else if (mode == "overwrite") mode_ = ProcessMode::Overwrite;
        }
        if (config.contains("mockCollect") && config["mockCollect"].is_boolean()) {
          mockCollect_ = config["mockCollect"].get<bool>();
        }
        if (config.contains("logFile") && config["logFile"].is_string() && !config["logFile"].get<std::string>().empty()) {
          logFile_ = config["logFile"].get<std::string>();
        }
      }
    } catch (...) {
    }
  }
  logs_.setFilePath(logFile_);
}

void TaskService::saveAppSettings() const {
  nlohmann::json config = nlohmann::json::object();
  std::string text = readTextFile(joinPath(exeDir_, "config.json"));
  if (!text.empty()) {
    try {
      auto parsed = nlohmann::json::parse(text);
      if (parsed.is_object()) config = std::move(parsed);
    } catch (...) {
    }
  }
  config["processMode"] = mode_ == ProcessMode::Queue ? "queue" : "overwrite";
  config["mockCollect"] = mockCollect_;
  config["logFile"] = logFile_;
  writeTextFile(joinPath(exeDir_, "config.json"), dumpJson(config));
}

TaskService::ProcessMode TaskService::processMode() const {
  std::lock_guard<std::mutex> lock(mu_);
  return mode_;
}

void TaskService::setProcessMode(ProcessMode mode) {
  std::lock_guard<std::mutex> lock(mu_);
  mode_ = mode;
}

bool TaskService::mockCollectEnabled() const {
  std::lock_guard<std::mutex> lock(mu_);
  return mockCollect_;
}

std::string TaskService::logFilePath() const {
  std::lock_guard<std::mutex> lock(mu_);
  return logFile_;
}

void TaskService::updateSettings(ProcessMode mode, bool mockCollect, const std::string& logFile) {
  std::lock_guard<std::mutex> lock(mu_);
  mode_ = mode;
  mockCollect_ = mockCollect;
  logFile_ = logFile.empty() ? defaultLogPath() : logFile;
  logs_.setFilePath(logFile_);
  ensureFileExists(logFile_);
  saveAppSettings();
}

void TaskService::notify(bool focusLatest) {
  if (notify_) notify_(focusLatest);
}

void TaskService::logEvent(const std::string& outcome, const std::string& message, const std::string* taskId,
                           const std::string* deviceType, const std::string* errorCode) {
  LogEntry entry;
  entry.time = nowIso8601();
  entry.outcome = outcome;
  entry.message = message;
  if (taskId && !taskId->empty()) {
    entry.hasTaskId = true;
    entry.taskId = *taskId;
  }
  if (deviceType && !deviceType->empty()) {
    entry.hasDeviceType = true;
    entry.deviceType = *deviceType;
  }
  if (errorCode && !errorCode->empty()) {
    entry.hasErrorCode = true;
    entry.errorCode = *errorCode;
  }
  logs_.add(std::move(entry));
}

void TaskService::loadCallback() {
  std::string text = readTextFile(joinPath(exeDir_, "callback.json"));
  if (text.empty()) return;
  try {
    auto json = nlohmann::json::parse(text);
    if (json.is_object() && json.contains("callbackUrl") && json["callbackUrl"].is_string()) {
      std::string url = json["callbackUrl"].get<std::string>();
      if (!url.empty()) {
        callbackUrl_ = url;
        if (json.contains("updatedAt") && json["updatedAt"].is_string()) callbackUpdatedAt_ = json["updatedAt"].get<std::string>();
      }
    }
  } catch (...) {
  }
}

void TaskService::saveCallback() const {
  nlohmann::json json = {
      {"callbackUrl", callbackUrl_},
      {"updatedAt", callbackUpdatedAt_},
  };
  writeTextFile(joinPath(exeDir_, "callback.json"), dumpJson(json));
}

long long TaskService::nowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

HttpResult TaskService::health() const {
  HttpResult result;
  result.body = {{"status", "ok"}, {"standardRevision", standardRevision()}};
  return result;
}

HttpResult TaskService::getCallback() const {
  std::lock_guard<std::mutex> lock(mu_);
  HttpResult result;
  result.body = {
      {"callbackUrl", callbackUrl_.empty() ? nlohmann::json(nullptr) : nlohmann::json(callbackUrl_)},
      {"updatedAt", callbackUpdatedAt_.empty() ? nlohmann::json(nullptr) : nlohmann::json(callbackUpdatedAt_)},
  };
  return result;
}

HttpResult TaskService::putCallback(const nlohmann::json& body) {
  if (!body.is_object() || !body.contains("callbackUrl") || !body["callbackUrl"].is_string() ||
      body["callbackUrl"].get<std::string>().empty()) {
    return httpError(400, "CALLBACK_URL_EMPTY", "callbackUrl 不能为空");
  }
  std::lock_guard<std::mutex> lock(mu_);
  callbackUrl_ = body["callbackUrl"].get<std::string>();
  callbackUpdatedAt_ = nowIso8601();
  saveCallback();
  HttpResult result;
  result.body = {{"callbackUrl", callbackUrl_}, {"updatedAt", callbackUpdatedAt_}};
  return result;
}

HttpResult TaskService::acceptTask(const nlohmann::json& body) {
  auto reject = [&](int status, const std::string& code, const std::string& message, const std::string* taskId,
                    const std::string* deviceType) {
    logEvent("rejected", message, taskId, deviceType, &code);
    return httpError(status, code, message);
  };

  if (!body.is_object()) {
    return reject(400, "BAD_REQUEST", "报文必须是 JSON 对象", nullptr, nullptr);
  }

  std::string taskId;
  const std::string* taskIdPtr = nullptr;
  if (body.contains("taskId") && body["taskId"].is_string()) {
    taskId = body["taskId"].get<std::string>();
    taskIdPtr = taskId.empty() ? nullptr : &taskId;
  }
  if (!body.contains("taskId") || !body["taskId"].is_string() || taskId.empty()) {
    return reject(400, "TASK_ID_EMPTY", "taskId 不能为空", nullptr, nullptr);
  }

  std::string deviceType;
  const std::string* devicePtr = nullptr;
  if (body.contains("deviceType") && body["deviceType"].is_string()) {
    deviceType = body["deviceType"].get<std::string>();
    if (!deviceType.empty()) devicePtr = &deviceType;
  }

  {
    std::lock_guard<std::mutex> lock(mu_);
    if (callbackUrl_.empty()) {
      return reject(400, "CALLBACK_NOT_REGISTERED", "尚未注册回调地址", taskIdPtr, devicePtr);
    }
  }

  const DeviceDef* device = devicePtr ? findDevice(deviceType) : nullptr;
  if (!device) {
    return reject(400, "DEVICE_TYPE_UNKNOWN", "未知的设备类型", taskIdPtr, devicePtr);
  }

  if (!body.contains("params") || !body["params"].is_array() || body["params"].empty()) {
    return reject(400, "PARAMS_EMPTY", "params 不能为空", taskIdPtr, devicePtr);
  }

  std::vector<Item> items;
  std::unordered_set<std::string> seen;
  for (const auto& param : body["params"]) {
    if (!param.is_object() || !param.contains("code") || !param["code"].is_string() || param["code"].get<std::string>().empty()) {
      return reject(400, "PARAM_UNKNOWN", std::string(device->name) + "的标准测量参数中不存在该项", taskIdPtr, devicePtr);
    }
    std::string code = param["code"].get<std::string>();
    if (!findParam(*device, code)) {
      return reject(400, "PARAM_UNKNOWN", std::string(device->name) + "的标准测量参数中不存在 " + code, taskIdPtr, devicePtr);
    }
    if (!seen.insert(code).second) {
      return reject(400, "PARAM_DUPLICATED", "参数 code 重复: " + code, taskIdPtr, devicePtr);
    }
    const nlohmann::json* requirement = nullptr;
    if (param.contains("requirement") && !param["requirement"].is_null()) {
      if (!param["requirement"].is_object()) {
        return reject(400, "BAD_REQUEST", "requirement 必须是对象", taskIdPtr, devicePtr);
      }
      requirement = &param["requirement"];
    }
    Item item;
    item.code = code;
    item.requirement = requirement ? *requirement : nlohmann::json(nullptr);
    items.push_back(std::move(item));
  }

  nlohmann::json context = nullptr;
  if (body.contains("context") && !body["context"].is_null()) {
    if (!body["context"].is_object()) {
      return reject(400, "BAD_REQUEST", "context 必须是对象", taskIdPtr, devicePtr);
    }
    context = body["context"];
  }

  std::string acceptedAt;
  bool focusLatest = true;
  {
    std::lock_guard<std::mutex> lock(mu_);
    for (const auto& task : tasks_) {
      if (task.taskId == taskId) {
        return reject(409, "TASK_DUPLICATED", "任务号已存在", taskIdPtr, devicePtr);
      }
    }
    if (mode_ == ProcessMode::Overwrite) {
      tasks_.erase(std::remove_if(tasks_.begin(), tasks_.end(),
                                  [](const Task& task) { return task.phase == Phase::Pending; }),
                   tasks_.end());
    }
    focusLatest = mode_ != ProcessMode::Queue;
    Task task;
    task.taskId = taskId;
    task.deviceType = deviceType;
    task.acceptedAt = nowIso8601();
    task.context = std::move(context);
    task.items = std::move(items);
    task.phase = Phase::Pending;
    task.deadlineMs = nowMs() + static_cast<long long>(timeoutSeconds_) * 1000LL;
    acceptedAt = task.acceptedAt;
    tasks_.push_back(std::move(task));
    logEvent("accepted", "已接受", taskIdPtr, devicePtr, nullptr);
  }
  notify(focusLatest);
  HttpResult result;
  result.body = {{"taskId", taskId}, {"deviceType", deviceType}, {"acceptedAt", acceptedAt}};
  return result;
}

bool TaskService::fillItem(Item& item, const std::string& deviceType) {
  const DeviceDef* device = findDevice(deviceType);
  if (!device) return false;
  const ParamDef* param = findParam(*device, item.code);
  if (!param) return false;
  item.value = mockCollectValue(item.code, param->valueType, item.requirement);
  item.collected = true;
  return true;
}

HttpResult TaskService::mutateCollect(const nlohmann::json& body, bool retest) {
  if (!body.is_object() || !body.contains("taskId") || !body["taskId"].is_string() || !body.contains("code") ||
      !body["code"].is_string()) {
    return httpError(400, "BAD_REQUEST", "需要 taskId 和 code");
  }
  std::string taskId = body["taskId"].get<std::string>();
  std::string code = body["code"].get<std::string>();
  std::lock_guard<std::mutex> lock(mu_);
  if (!mockCollect_) return httpError(400, "MOCK_DISABLED", "未启用开发模拟采集");
  for (auto& task : tasks_) {
    if (task.taskId != taskId) continue;
    if (task.phase != Phase::Pending) return httpError(409, "DEVICE_BUSY", "任务正在提交");
    for (auto& item : task.items) {
      if (item.code != code) continue;
      if (!retest && item.collected) return httpError(400, "ALREADY_COLLECTED", "该项已采集，请使用重测");
      if (!fillItem(item, task.deviceType)) return httpError(500, "INTERNAL_ERROR", "无法采集该参数");
      notify(false);
      HttpResult result;
      result.body = {{"taskId", taskId}, {"code", code}, {"collected", true}};
      return result;
    }
    return httpError(400, "PARAM_UNKNOWN", "本次任务不包含该参数");
  }
  return httpError(404, "TASK_NOT_FOUND", "未找到任务");
}

HttpResult TaskService::closeTask(const std::string& taskId) {
  bool removed = false;
  {
    std::lock_guard<std::mutex> lock(mu_);
    if (mode_ != ProcessMode::Queue) return httpError(400, "BAD_REQUEST", "仅队列模式可以关闭任务");
    for (auto it = tasks_.begin(); it != tasks_.end(); ++it) {
      if (it->taskId != taskId) continue;
      if (it->phase != Phase::Pending) return httpError(409, "DEVICE_BUSY", "任务正在提交，不能关闭");
      tasks_.erase(it);
      removed = true;
      break;
    }
  }
  if (!removed) return httpError(404, "TASK_NOT_FOUND", "未找到任务");
  notify(false);
  HttpResult result;
  result.body = {{"taskId", taskId}, {"closed", true}};
  return result;
}

HttpResult TaskService::testCollect(const nlohmann::json& body) { return mutateCollect(body, false); }

HttpResult TaskService::testRetest(const nlohmann::json& body) { return mutateCollect(body, true); }

HttpResult TaskService::testClear(const nlohmann::json& body) {
  if (!body.is_object() || !body.contains("taskId") || !body["taskId"].is_string()) {
    return httpError(400, "BAD_REQUEST", "需要 taskId");
  }
  std::string taskId = body["taskId"].get<std::string>();
  std::lock_guard<std::mutex> lock(mu_);
  for (auto& task : tasks_) {
    if (task.taskId != taskId) continue;
    if (task.phase != Phase::Pending) return httpError(409, "DEVICE_BUSY", "任务正在提交");
    for (auto& item : task.items) {
      item.collected = false;
      item.value = nullptr;
    }
    notify(false);
    HttpResult result;
    result.body = {{"taskId", taskId}, {"cleared", true}};
    return result;
  }
  return httpError(404, "TASK_NOT_FOUND", "未找到任务");
}

std::string TaskService::valueText(const Item& item, const std::string& deviceType) const {
  if (!item.collected) return "未采集";
  const DeviceDef* device = findDevice(deviceType);
  const ParamDef* param = device ? findParam(*device, item.code) : nullptr;
  if (param && param->valueType == "image" && item.value.is_array()) {
    return "已采集 " + std::to_string(item.value.size()) + " 张图片";
  }
  if (param && param->valueType == "string" && item.value.is_string()) return item.value.get<std::string>();
  if (param && param->valueType == "boolean" && item.value.is_boolean()) return item.value.get<bool>() ? "是" : "否";
  return dumpJson(item.value);
}

nlohmann::json TaskService::buildResults(const Task& task) const {
  const DeviceDef* device = findDevice(task.deviceType);
  nlohmann::json results = nlohmann::json::array();
  for (const auto& item : task.items) {
    const ParamDef* param = device ? findParam(*device, item.code) : nullptr;
    nlohmann::json row;
    row["code"] = item.code;
    row["name"] = param ? param->name : "";
    row["valueType"] = param ? param->valueType : "";
    row["unit"] = (param && !param->unit.empty()) ? nlohmann::json(param->unit) : nlohmann::json(nullptr);
    row["value"] = item.value;
    row["requirement"] = item.requirement.is_null() ? nlohmann::json(nullptr) : item.requirement;
    results.push_back(std::move(row));
  }
  return results;
}

TaskService::FinishJob TaskService::makeFinishJob(Task& task, bool completed, const std::string& errorCode,
                                                  const std::string& errorMessage) {
  task.phase = Phase::Finishing;
  nlohmann::json payload;
  payload["taskId"] = task.taskId;
  payload["deviceType"] = task.deviceType;
  payload["standardRevision"] = standardRevision();
  payload["status"] = completed ? "completed" : "failed";
  payload["acceptedAt"] = task.acceptedAt;
  payload["completedAt"] = nowIso8601();
  payload["context"] = task.context.is_null() ? nlohmann::json(nullptr) : task.context;
  if (completed) {
    payload["results"] = buildResults(task);
    payload["error"] = nullptr;
  } else {
    payload["results"] = nullptr;
    payload["error"] = {{"code", errorCode}, {"message", errorMessage}};
  }
  FinishJob job;
  job.taskId = task.taskId;
  job.deviceType = task.deviceType;
  job.url = callbackUrl_;
  job.body = dumpJson(payload);
  job.deliveredOutcome = completed ? "completed" : "failed";
  job.errorCode = completed ? "" : errorCode;
  job.deliveredMessage = completed ? "测量完成，回调成功" : "测量失败，回调成功";
  return job;
}

CallbackPostResult TaskService::runFinish(FinishJob job) {
  CallbackPostResult posted;
  if (job.url.empty()) {
    posted.failure = CallbackFailure::EmptyUrl;
  } else {
    posted = postCallback(job.url, job.body, retryMs_);
  }
  std::string failMessage = callbackFailureMessage(posted, job.url);
  std::lock_guard<std::mutex> lock(mu_);
  for (auto it = tasks_.begin(); it != tasks_.end(); ++it) {
    if (it->taskId != job.taskId) continue;
    if (posted.delivered) {
      logEvent(job.deliveredOutcome, job.deliveredMessage, &job.taskId, &job.deviceType,
               job.errorCode.empty() ? nullptr : &job.errorCode);
      tasks_.erase(it);
    } else if (job.deliveredOutcome == "completed") {
      std::string code = "CALLBACK_FAILED";
      logEvent("callback_failed", failMessage, &job.taskId, &job.deviceType, &code);
      it->phase = Phase::Pending;
      it->deadlineMs = nowMs() + static_cast<long long>(timeoutSeconds_) * 1000LL;
    } else {
      std::string code = "CALLBACK_FAILED";
      logEvent("callback_failed", failMessage, &job.taskId, &job.deviceType, &code);
      tasks_.erase(it);
    }
    break;
  }
  notify(false);
  return posted;
}

HttpResult TaskService::testSubmit(const nlohmann::json& body) {
  if (!body.is_object() || !body.contains("taskId") || !body["taskId"].is_string()) {
    return httpError(400, "BAD_REQUEST", "需要 taskId");
  }
  std::string taskId = body["taskId"].get<std::string>();
  FinishJob job;
  {
    std::lock_guard<std::mutex> lock(mu_);
    for (auto& task : tasks_) {
      if (task.taskId != taskId) continue;
      if (task.phase != Phase::Pending) return httpError(409, "DEVICE_BUSY", "任务正在提交");
      for (const auto& item : task.items) {
        if (!item.collected) return httpError(400, "RESULTS_INCOMPLETE", "尚有参数未采集");
      }
      if (callbackUrl_.empty()) return httpError(400, "CALLBACK_NOT_REGISTERED", "尚未配置回调地址，无法提交");
      job = makeFinishJob(task, true, "", "");
      break;
    }
  }
  if (job.taskId.empty()) return httpError(404, "TASK_NOT_FOUND", "未找到任务");
  std::string callbackUrl = job.url;
  CallbackPostResult posted = runFinish(std::move(job));
  HttpResult result;
  result.body = {
      {"taskId", taskId},
      {"submitted", true},
      {"delivered", posted.delivered},
      {"message", posted.delivered ? "" : callbackFailureMessage(posted, callbackUrl)},
  };
  return result;
}

HttpResult TaskService::testGet(const std::string& taskId) const {
  std::lock_guard<std::mutex> lock(mu_);
  for (const auto& task : tasks_) {
    if (task.taskId != taskId) continue;
    nlohmann::json items = nlohmann::json::array();
    for (const auto& item : task.items) {
      items.push_back({
          {"code", item.code},
          {"collected", item.collected},
          {"value", item.collected ? item.value : nlohmann::json(nullptr)},
      });
    }
    HttpResult result;
    result.body = {{"taskId", task.taskId}, {"deviceType", task.deviceType}, {"items", std::move(items)}};
    return result;
  }
  return httpError(404, "TASK_NOT_FOUND", "未找到任务");
}

std::vector<TaskView> TaskService::views() const {
  std::lock_guard<std::mutex> lock(mu_);
  std::vector<TaskView> views;
  views.reserve(tasks_.size());
  for (auto it = tasks_.rbegin(); it != tasks_.rend(); ++it) {
    const DeviceDef* device = findDevice(it->deviceType);
    TaskView view;
    view.taskId = it->taskId;
    view.deviceType = it->deviceType;
    view.deviceName = device ? device->name : it->deviceType;
    view.contextText = clipText(formatContextText(it->context), 480);
    for (const auto& field : listContextFields(it->context)) view.targets.push_back({field.label, field.value});
    view.pending = it->phase == Phase::Pending;
    view.allCollected = true;
    for (const auto& item : it->items) {
      const ParamDef* param = device ? findParam(*device, item.code) : nullptr;
      RowView row;
      row.code = item.code;
      std::string name = param ? param->name : item.code;
      if (param && !param->unit.empty()) row.title = name + " (" + param->unit + ")";
      else row.title = name;
      row.requirementText = clipText(formatRequirementText(item.requirement, param ? param->unit : ""), 320);
      for (const auto& field : listRequirementFields(item.requirement, param ? param->unit : "")) {
        row.requirements.push_back({field.label, field.value});
      }
      row.valueText = valueText(item, it->deviceType);
      row.collected = item.collected;
      if (!item.collected) view.allCollected = false;
      view.rows.push_back(std::move(row));
    }
    views.push_back(std::move(view));
  }
  return views;
}

void TaskService::tick() {
  std::vector<FinishJob> jobs;
  {
    std::lock_guard<std::mutex> lock(mu_);
    long long now = nowMs();
    for (auto& task : tasks_) {
      if (task.phase == Phase::Pending && now >= task.deadlineMs) {
        jobs.push_back(makeFinishJob(task, false, "TIMEOUT", "等待操作员在设备上确认结果超时"));
      }
    }
  }
  for (auto& job : jobs) runFinish(std::move(job));
}
