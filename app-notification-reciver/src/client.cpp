#include "client.h"

#include "http.h"
#include "util.h"

#include "json.hpp"

#include <algorithm>

namespace {

using json = nlohmann::json;

std::string apiRoot(const std::string& base) {
  std::string root = trimAscii(base);
  while (!root.empty() && (root.back() == '/' || root.back() == '\\')) root.pop_back();
  return root;
}

std::string fieldText(const json& row, std::initializer_list<const char*> keys) {
  if (!row.is_object()) return "";
  for (const char* key : keys) {
    if (!row.contains(key) || row[key].is_null()) continue;
    if (row[key].is_string()) return row[key].get<std::string>();
    if (row[key].is_number() || row[key].is_boolean()) return row[key].dump();
  }
  return "";
}

bool fieldBool(const json& row, std::initializer_list<const char*> keys, bool fallback) {
  if (!row.is_object()) return fallback;
  for (const char* key : keys) {
    if (!row.contains(key) || row[key].is_null()) continue;
    if (row[key].is_boolean()) return row[key].get<bool>();
    if (row[key].is_number()) return row[key].get<double>() != 0;
    if (row[key].is_string()) {
      std::string text = row[key].get<std::string>();
      if (text == "true" || text == "1") return true;
      if (text == "false" || text == "0") return false;
    }
  }
  return fallback;
}

std::vector<std::string> parseRoleList(const json& value) {
  if (value.is_string()) {
    try {
      return parseRoleList(json::parse(value.get<std::string>()));
    } catch (...) {
      return {};
    }
  }
  if (!value.is_array()) return {};
  std::vector<std::string> ids;
  for (const auto& item : value) {
    if (item.is_string()) {
      std::string id = item.get<std::string>();
      if (!id.empty()) ids.push_back(id);
    } else if (item.is_object()) {
      std::string id = fieldText(item, {"role_id", "roleId", "id"});
      if (!id.empty()) ids.push_back(id);
    }
  }
  return ids;
}

bool roleKey(const std::string& key) {
  return key == "roles" || key == "roleIds" || key == "role_ids" || key == "roleId" || key == "role_id" ||
         key == "user_roles" || key == "userRoles";
}

void collectRoles(const json& node, std::vector<std::string>& out, const std::string& key, int depth) {
  if (depth > 6 || node.is_null()) return;
  if (roleKey(key)) {
    for (const auto& id : parseRoleList(node.is_string() || node.is_array() ? node : json::array())) {
      if (std::find(out.begin(), out.end(), id) == out.end()) out.push_back(id);
    }
    if (node.is_object()) {
      std::string id = fieldText(node, {"role_id", "roleId", "id"});
      if (!id.empty() && std::find(out.begin(), out.end(), id) == out.end()) out.push_back(id);
    }
    if (node.is_array() || node.is_string() || node.is_object()) {
      if (!node.is_object()) return;
    }
  }
  if (node.is_object()) {
    for (auto it = node.begin(); it != node.end(); ++it) collectRoles(it.value(), out, it.key(), depth + 1);
  }
}

json extractItems(const json& root) {
  const json* data = &root;
  json wrapped;
  if (root.is_object() && root.contains("data")) {
    wrapped = root["data"];
    data = &wrapped;
  }
  if (data->is_array()) return *data;
  if (!data->is_object()) return json::array();
  if (data->contains("items") && (*data)["items"].is_array()) return (*data)["items"];
  if (data->contains("preview") && (*data)["preview"].is_object()) {
    const auto& preview = (*data)["preview"];
    if (preview.contains("items") && preview["items"].is_array()) return preview["items"];
  }
  return json::array();
}

std::string messageOf(const json& root) {
  if (root.is_object() && root.contains("message") && root["message"].is_string()) return root["message"].get<std::string>();
  return "";
}

bool parseBody(const HttpResponse& response, json& root, std::string& error) {
  if (!response.error.empty() && response.status == 0) {
    error = response.error;
    return false;
  }
  if (response.body.empty()) {
    if (response.status >= 200 && response.status < 300) {
      root = json::object();
      return true;
    }
    error = "接口返回空内容";
    return false;
  }
  try {
    root = json::parse(response.body);
  } catch (...) {
    error = response.status == 0 ? response.error : "接口返回的不是 JSON";
    return false;
  }
  int code = 0;
  if (root.is_object() && root.contains("code") && root["code"].is_number()) code = root["code"].get<int>();
  if (response.status == 401 || code == 401) {
    error = "登录已过期，请在设置里重新登录";
    return false;
  }
  if (response.status >= 400 || code >= 400) {
    error = messageOf(root);
    if (error.empty()) error = "接口请求失败";
    return false;
  }
  return true;
}

std::string workstationLabel(const json& row) {
  std::string stationNo = fieldText(row, {"stationNo", "station_no", "workstationCode", "code"});
  if (!stationNo.empty()) return stationNo;
  std::string name = fieldText(row, {"name"});
  if (!name.empty()) return name;
  return fieldText(row, {"id"});
}

int soundRank(const std::string& key) {
  if (key == "alarm") return 3;
  if (key == "chime") return 2;
  return 1;
}

}  // namespace

AppConfig loadConfig(const std::string& path) {
  AppConfig config;
  std::string text = readTextFile(path);
  if (text.empty()) return config;
  try {
    json root = json::parse(text);
    if (!root.is_object()) return config;
    if (root.contains("apiBase") && root["apiBase"].is_string()) config.apiBase = trimAscii(root["apiBase"].get<std::string>());
    if (root.contains("token") && root["token"].is_string()) config.token = root["token"].get<std::string>();
    if (root.contains("displayName") && root["displayName"].is_string()) config.displayName = root["displayName"].get<std::string>();
    if (root.contains("playSound") && root["playSound"].is_boolean()) config.playSound = root["playSound"].get<bool>();
    if (root.contains("flashOnNotify") && root["flashOnNotify"].is_boolean()) config.flashOnNotify = root["flashOnNotify"].get<bool>();
    if (root.contains("alwaysOnTop") && root["alwaysOnTop"].is_boolean()) config.alwaysOnTop = root["alwaysOnTop"].get<bool>();
  } catch (...) {
  }
  if (config.apiBase.empty()) config.apiBase = "http://127.0.0.1:6082";
  return config;
}

bool saveConfig(const std::string& path, const AppConfig& config) {
  json root = {{"apiBase", config.apiBase},
               {"token", config.token},
               {"displayName", config.displayName},
               {"playSound", config.playSound},
               {"flashOnNotify", config.flashOnNotify},
               {"alwaysOnTop", config.alwaysOnTop}};
  return writeTextFile(path, root.dump(2));
}

ReceiverService::ReceiverService(std::string configPath) : path_(std::move(configPath)) {
  config_ = loadConfig(path_);
  if (readTextFile(path_).empty()) saveConfig(path_, config_);
}

AppConfig ReceiverService::config() const {
  std::lock_guard<std::mutex> lock(mu_);
  return config_;
}

void ReceiverService::updateConfig(const AppConfig& config) {
  std::function<void()> wake;
  {
    std::lock_guard<std::mutex> lock(mu_);
    if (apiRoot(config.apiBase) != apiRoot(config_.apiBase)) {
      seen_.clear();
      primed_ = false;
      announceNext_ = false;
    }
    config_ = config;
    saveConfig(path_, config_);
    wake = wake_;
  }
  if (wake) wake();
}

void ReceiverService::setToken(const std::string& token, const std::string& displayName) {
  std::function<void()> wake;
  {
    std::lock_guard<std::mutex> lock(mu_);
    config_.token = token;
    if (!displayName.empty()) config_.displayName = displayName;
    seen_.clear();
    primed_ = false;
    announceNext_ = true;
    saveConfig(path_, config_);
    wake = wake_;
  }
  if (wake) wake();
}

void ReceiverService::setWake(std::function<void()> wake) {
  std::lock_guard<std::mutex> lock(mu_);
  wake_ = std::move(wake);
}

void ReceiverService::enqueue(CallJob job) {
  std::function<void()> wake;
  {
    std::lock_guard<std::mutex> lock(mu_);
    jobs_.push_back(std::move(job));
    wake = wake_;
  }
  if (wake) wake();
}

PollSnapshot ReceiverService::poll() {
  PollSnapshot snap;
  AppConfig config;
  std::vector<CallJob> jobs;
  bool announce = false;
  {
    std::lock_guard<std::mutex> lock(mu_);
    config = config_;
    jobs.swap(jobs_);
    announce = announceNext_;
    announceNext_ = false;
    snap.displayName = config.displayName;
  }

  auto finish = [&](PollSnapshot done) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!done.error.empty() && announce && done.freshIds.empty()) announceNext_ = true;
    done.seq = ++seq_;
    if (done.displayName.empty()) done.displayName = config_.displayName;
    return done;
  };

  std::string root = apiRoot(config.apiBase);
  if (root.empty() || (root.rfind("http://", 0) != 0 && root.rfind("https://", 0) != 0)) {
    snap.error = "请先在设置里填写接口地址";
    return finish(snap);
  }
  if (config.token.empty()) {
    snap.error = "请先在设置里登录";
    return finish(snap);
  }

  auto runJob = [&](const CallJob& job) {
    json body = json::object();
    if (job.action == CallAction::Accept) {
      body["status"] = "accepted";
      body["acceptedBy"] = job.acceptedBy;
      body["acceptedAt"] = nowIso8601();
      body["isResponded"] = true;
    } else if (job.action == CallAction::Complete) {
      body["status"] = "completed";
      body["completedAt"] = nowIso8601();
      body["isResponded"] = true;
      if (!job.acceptedBy.empty()) body["acceptedBy"] = job.acceptedBy;
    } else {
      body["status"] = "cancelled";
    }
    std::string url = root + "/api/ips/crud/service/NotificationLog/" + job.id;
    HttpResponse response = httpRequest("PATCH", url, config.token, body.dump());
    json rootJson;
    std::string error;
    if (!parseBody(response, rootJson, error)) return error.empty() ? std::string("更新呼叫失败") : error;
    return std::string();
  };

  for (const auto& job : jobs) {
    std::string error = runJob(job);
    if (!error.empty()) {
      if (!snap.actionError.empty()) snap.actionError += "；";
      snap.actionError += error;
    }
  }

  json rolesRoot;
  std::string rolesError;
  HttpResponse rolesResponse = httpRequest("GET", root + "/api/ips/my-roles", config.token, "");
  std::vector<std::string> roleIds;
  std::string learnedName;
  if (!parseBody(rolesResponse, rolesRoot, rolesError)) {
    if (rolesResponse.status == 401 || rolesError.find("登录已过期") != std::string::npos) {
      snap.error = "登录已过期，请在设置里重新登录";
      return finish(snap);
    }
    HttpResponse me = httpRequest("GET", root + "/auth/me", config.token, "");
    json meRoot;
    std::string meError;
    if (!parseBody(me, meRoot, meError)) {
      snap.error = rolesError.empty() ? meError : rolesError;
      if (snap.error.empty()) snap.error = "读取登录身份失败";
      return finish(snap);
    }
    collectRoles(meRoot, roleIds, "", 0);
    if (meRoot.is_object() && meRoot.contains("data")) learnedName = fieldText(meRoot["data"], {"name", "username"});
  } else {
    collectRoles(rolesRoot, roleIds, "", 0);
    if (rolesRoot.is_object() && rolesRoot.contains("data") && rolesRoot["data"].is_object()) {
      const auto& data = rolesRoot["data"];
      if (data.contains("roleIds")) {
        for (const auto& id : parseRoleList(data["roleIds"])) {
          if (std::find(roleIds.begin(), roleIds.end(), id) == roleIds.end()) roleIds.push_back(id);
        }
      }
      learnedName = fieldText(data, {"name", "username"});
    }
  }
  if (!learnedName.empty() && config.displayName.empty()) {
    std::lock_guard<std::mutex> lock(mu_);
    if (config_.displayName.empty()) {
      config_.displayName = learnedName;
      saveConfig(path_, config_);
    }
    snap.displayName = learnedName;
  } else if (!learnedName.empty()) {
    snap.displayName = learnedName;
  }
  if (roleIds.empty()) {
    snap.error = "当前账号没有角色，不会接收呼叫";
    return finish(snap);
  }

  auto loadList = [&](const std::string& url, json& items, std::string& error) {
    HttpResponse response = httpRequest("GET", url, config.token, "");
    json rootJson;
    if (!parseBody(response, rootJson, error)) return false;
    items = extractItems(rootJson);
    return true;
  };

  json typeRows;
  std::string error;
  if (!loadList(root + "/api/ips/crud/service/CallType?pageSize=100", typeRows, error)) {
    snap.error = error.empty() ? "读取呼叫类型失败" : error;
    return finish(snap);
  }
  struct TypeInfo {
    std::string name;
    bool soundEnabled = false;
    std::string soundKey;
    std::vector<std::string> roleIds;
  };
  std::vector<std::pair<std::string, TypeInfo>> types;
  if (typeRows.is_array()) {
    for (const auto& row : typeRows) {
      TypeInfo info;
      info.name = fieldText(row, {"typeName", "type_name"});
      info.soundEnabled = fieldBool(row, {"soundEnabled", "sound_enabled"}, false);
      info.soundKey = fieldText(row, {"soundKey", "sound_key"});
      if (row.is_object()) {
        if (row.contains("roleIds")) info.roleIds = parseRoleList(row["roleIds"]);
        else if (row.contains("role_ids")) info.roleIds = parseRoleList(row["role_ids"]);
      }
      std::string code = fieldText(row, {"typeCode", "type_code"});
      if (!code.empty()) types.push_back({code, info});
    }
  }

  json stationRows;
  std::string stationError;
  std::vector<std::pair<std::string, std::string>> stations;
  if (loadList(root + "/api/ips/crud/master/Workstation?pageSize=100", stationRows, stationError) && stationRows.is_array()) {
    for (const auto& row : stationRows) {
      std::string id = fieldText(row, {"id"});
      if (!id.empty()) stations.push_back({id, workstationLabel(row)});
    }
  }

  json logs = json::array();
  for (const char* status : {"sent", "accepted"}) {
    json rows;
    std::string listError;
    std::string url = std::string(root) + "/api/ips/crud/service/NotificationLog?pageSize=100&status=" + status;
    if (!loadList(url, rows, listError)) {
      snap.error = listError.empty() ? "读取呼叫失败" : listError;
      return finish(snap);
    }
    if (rows.is_array()) {
      for (const auto& row : rows) logs.push_back(row);
    }
  }

  std::vector<CallItem> open;
  for (const auto& row : logs) {
    std::string status = fieldText(row, {"status"});
    if (status != "sent" && status != "accepted") continue;
    std::string typeCode = fieldText(row, {"callType", "call_type"});
    const TypeInfo* type = nullptr;
    for (const auto& entry : types) {
      if (entry.first == typeCode) {
        type = &entry.second;
        break;
      }
    }
    if (!type) continue;
    bool matched = false;
    for (const auto& role : type->roleIds) {
      if (std::find(roleIds.begin(), roleIds.end(), role) != roleIds.end()) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;
    CallItem item;
    item.id = fieldText(row, {"id"});
    if (item.id.empty()) continue;
    if (std::any_of(open.begin(), open.end(), [&](const CallItem& existing) { return existing.id == item.id; })) continue;
    item.typeCode = typeCode;
    item.typeName = type->name.empty() ? typeCode : type->name;
    item.content = fieldText(row, {"callContent", "call_content", "description"});
    item.status = status;
    item.callerName = fieldText(row, {"callerName", "caller_name"});
    item.callTime = fieldText(row, {"callTime", "call_time"});
    item.acceptedBy = fieldText(row, {"acceptedBy", "accepted_by"});
    item.acceptedAt = fieldText(row, {"acceptedAt", "accepted_at"});
    item.completedAt = fieldText(row, {"completedAt", "completed_at"});
    item.soundEnabled = type->soundEnabled;
    item.soundKey = type->soundKey.empty() ? "beep" : type->soundKey;
    std::string stationId = fieldText(row, {"workstationId", "workstation_id"});
    item.workstationLabel = stationId;
    for (const auto& station : stations) {
      if (station.first == stationId && !station.second.empty()) item.workstationLabel = station.second;
    }
    open.push_back(item);
  }
  std::sort(open.begin(), open.end(), [](const CallItem& a, const CallItem& b) { return a.callTime > b.callTime; });

  std::string bestSound;
  int bestRank = 0;
  {
    std::lock_guard<std::mutex> lock(mu_);
    if (seen_.size() > 2000) seen_.erase(seen_.begin(), seen_.begin() + 1000);
    for (const auto& item : open) {
      if (item.status != "sent") {
        if (std::find(seen_.begin(), seen_.end(), item.id) == seen_.end()) seen_.push_back(item.id);
        continue;
      }
      bool known = std::find(seen_.begin(), seen_.end(), item.id) != seen_.end();
      if ((primed_ && !known) || (announce && !known)) {
        snap.freshIds.push_back(item.id);
        if (config.playSound && item.soundEnabled) {
          int rank = soundRank(item.soundKey);
          if (rank >= bestRank) {
            bestRank = rank;
            bestSound = item.soundKey;
          }
        }
      }
      if (!known) seen_.push_back(item.id);
    }
    primed_ = true;
  }
  snap.openItems = std::move(open);
  snap.soundKey = bestSound;
  snap.flash = !snap.freshIds.empty() && config.flashOnNotify;
  return finish(std::move(snap));
}
