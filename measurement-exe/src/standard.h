#pragma once

#include "json.hpp"

#include <string>
#include <vector>

struct ParamDef {
  std::string code;
  std::string name;
  std::string valueType;
  std::string unit;
  std::string description;
};

struct DeviceDef {
  std::string deviceType;
  std::string name;
  std::vector<ParamDef> params;
};

struct DisplayField {
  std::string label;
  std::string value;
};

bool loadStandardParams(const std::string& path, std::string& error);
const std::string& standardRevision();
const DeviceDef* findDevice(const std::string& deviceType);
const ParamDef* findParam(const DeviceDef& device, const std::string& code);
std::vector<DisplayField> listContextFields(const nlohmann::json& context);
std::vector<DisplayField> listRequirementFields(const nlohmann::json& requirement, const std::string& unit);
std::string formatContextText(const nlohmann::json& context);
std::string formatRequirementText(const nlohmann::json& requirement, const std::string& unit);
