#include "standard.h"

#include "util.h"

#include <sstream>
#include <unordered_set>

namespace {

struct FieldLabel {
  std::string key;
  std::string label;
  bool signedValue = false;
};

std::vector<DeviceDef> g_devices;
std::vector<FieldLabel> g_contextFields;
std::vector<FieldLabel> g_requirementFields;
std::string g_revision;

bool knownType(const std::string& valueType) {
  return valueType == "number" || valueType == "string" || valueType == "boolean" || valueType == "image";
}

std::string formatNumber(double value, bool showPlus) {
  std::ostringstream os;
  os.setf(std::ios::fixed);
  os.precision(6);
  os << value;
  std::string text = os.str();
  auto dot = text.find('.');
  if (dot != std::string::npos) {
    while (!text.empty() && text.back() == '0') text.pop_back();
    if (!text.empty() && text.back() == '.') text.pop_back();
  }
  if (text == "-0") text = "0";
  if (showPlus && value > 0.0) text.insert(text.begin(), '+');
  return text;
}

std::string scalarText(const nlohmann::json& value, bool showPlus, const std::string& unit) {
  if (value.is_string()) return value.get<std::string>();
  if (value.is_boolean()) return value.get<bool>() ? "是" : "否";
  if (value.is_number()) {
    std::string text = formatNumber(value.get<double>(), showPlus);
    if (!unit.empty()) text += " " + unit;
    return text;
  }
  if (value.is_null()) return "无";
  return value.dump(-1, ' ', false);
}

std::vector<DisplayField> listFields(const nlohmann::json& object, const std::vector<FieldLabel>& fields, const std::string& unit) {
  std::vector<DisplayField> parts;
  if (!object.is_object()) return parts;
  std::unordered_set<std::string> used;
  for (const auto& field : fields) {
    if (!object.contains(field.key) || object[field.key].is_null()) continue;
    parts.push_back({field.label, scalarText(object[field.key], field.signedValue, unit)});
    used.insert(field.key);
  }
  for (auto it = object.begin(); it != object.end(); ++it) {
    if (used.count(it.key())) continue;
    if (it.value().is_null()) continue;
    parts.push_back({it.key(), scalarText(it.value(), false, unit)});
  }
  return parts;
}

std::string joinFields(const std::vector<DisplayField>& parts, const std::string& separator) {
  std::string text;
  for (size_t i = 0; i < parts.size(); ++i) {
    if (i) text += separator;
    text += parts[i].label + " " + parts[i].value;
  }
  return text;
}

bool readFields(const nlohmann::json& root, const char* name, std::vector<FieldLabel>& out, std::string& error) {
  out.clear();
  if (!root.contains(name)) return true;
  if (!root[name].is_array()) {
    error = std::string(name) + " 必须是数组";
    return false;
  }
  for (const auto& item : root[name]) {
    if (!item.is_object() || !item.contains("key") || !item["key"].is_string() || item["key"].get<std::string>().empty() ||
        !item.contains("label") || !item["label"].is_string() || item["label"].get<std::string>().empty()) {
      error = std::string(name) + " 的每一项都要有 key 和 label";
      return false;
    }
    FieldLabel field;
    field.key = item["key"].get<std::string>();
    field.label = item["label"].get<std::string>();
    field.signedValue = item.contains("signed") && item["signed"].is_boolean() && item["signed"].get<bool>();
    out.push_back(std::move(field));
  }
  return true;
}

}  // namespace

bool loadStandardParams(const std::string& path, std::string& error) {
  g_devices.clear();
  g_contextFields.clear();
  g_requirementFields.clear();
  g_revision.clear();
  std::string text = readTextFile(path);
  if (text.size() >= 3 && static_cast<unsigned char>(text[0]) == 0xEF && static_cast<unsigned char>(text[1]) == 0xBB &&
      static_cast<unsigned char>(text[2]) == 0xBF) {
    text.erase(0, 3);
  }
  if (text.empty()) {
    error = "找不到标准参数文件：" + path;
    return false;
  }
  nlohmann::json root;
  try {
    root = nlohmann::json::parse(text);
  } catch (const std::exception& ex) {
    error = std::string("标准参数文件无法解析：") + ex.what();
    return false;
  }
  if (!root.is_object() || !root.contains("version") || !root["version"].is_string() || root["version"].get<std::string>().empty()) {
    error = "标准参数文件缺少 version";
    return false;
  }
  if (!root.contains("devices") || !root["devices"].is_array() || root["devices"].empty()) {
    error = "标准参数文件缺少 devices";
    return false;
  }
  if (!readFields(root, "contextFields", g_contextFields, error)) return false;
  if (!readFields(root, "requirementFields", g_requirementFields, error)) return false;

  std::unordered_set<std::string> deviceTypes;
  std::vector<DeviceDef> devices;
  for (const auto& deviceJson : root["devices"]) {
    if (!deviceJson.is_object() || !deviceJson.contains("deviceType") || !deviceJson["deviceType"].is_string() ||
        deviceJson["deviceType"].get<std::string>().empty() || !deviceJson.contains("name") || !deviceJson["name"].is_string() ||
        deviceJson["name"].get<std::string>().empty() || !deviceJson.contains("params") || !deviceJson["params"].is_array()) {
      error = "设备项缺少 deviceType、name 或 params";
      return false;
    }
    DeviceDef device;
    device.deviceType = deviceJson["deviceType"].get<std::string>();
    device.name = deviceJson["name"].get<std::string>();
    if (!deviceTypes.insert(device.deviceType).second) {
      error = "设备类型重复：" + device.deviceType;
      return false;
    }
    std::unordered_set<std::string> codes;
    for (const auto& paramJson : deviceJson["params"]) {
      if (!paramJson.is_object() || !paramJson.contains("code") || !paramJson["code"].is_string() ||
          paramJson["code"].get<std::string>().empty() || !paramJson.contains("name") || !paramJson["name"].is_string() ||
          paramJson["name"].get<std::string>().empty() || !paramJson.contains("valueType") || !paramJson["valueType"].is_string()) {
        error = device.deviceType + " 的参数缺少 code、name 或 valueType";
        return false;
      }
      ParamDef param;
      param.code = paramJson["code"].get<std::string>();
      param.name = paramJson["name"].get<std::string>();
      param.valueType = paramJson["valueType"].get<std::string>();
      if (!knownType(param.valueType)) {
        error = param.code + " 的 valueType 无法识别";
        return false;
      }
      if (paramJson.contains("unit") && !paramJson["unit"].is_null()) {
        if (!paramJson["unit"].is_string()) {
          error = param.code + " 的 unit 必须是字符串或 null";
          return false;
        }
        param.unit = paramJson["unit"].get<std::string>();
      }
      if (paramJson.contains("description") && paramJson["description"].is_string()) {
        param.description = paramJson["description"].get<std::string>();
      }
      if (!codes.insert(param.code).second) {
        error = device.deviceType + " 的参数重复：" + param.code;
        return false;
      }
      device.params.push_back(std::move(param));
    }
    if (device.params.empty()) {
      error = device.deviceType + " 没有参数";
      return false;
    }
    devices.push_back(std::move(device));
  }
  g_revision = root["version"].get<std::string>();
  g_devices = std::move(devices);
  return true;
}

const std::string& standardRevision() { return g_revision; }

const DeviceDef* findDevice(const std::string& deviceType) {
  for (const auto& device : g_devices) {
    if (device.deviceType == deviceType) return &device;
  }
  return nullptr;
}

const ParamDef* findParam(const DeviceDef& device, const std::string& code) {
  for (const auto& param : device.params) {
    if (param.code == code) return &param;
  }
  return nullptr;
}

std::vector<DisplayField> listContextFields(const nlohmann::json& context) {
  if (!context.is_object() || context.empty()) return {};
  return listFields(context, g_contextFields, "");
}

std::vector<DisplayField> listRequirementFields(const nlohmann::json& requirement, const std::string& unit) {
  if (!requirement.is_object() || requirement.empty()) return {};
  return listFields(requirement, g_requirementFields, unit);
}

std::string formatContextText(const nlohmann::json& context) {
  std::string text = joinFields(listContextFields(context), "\n");
  return text.empty() ? "无" : text;
}

std::string formatRequirementText(const nlohmann::json& requirement, const std::string& unit) {
  std::string text = joinFields(listRequirementFields(requirement, unit), "，");
  return text.empty() ? "无要求" : text;
}
