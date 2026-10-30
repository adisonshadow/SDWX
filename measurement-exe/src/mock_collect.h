#pragma once

#include "json.hpp"

#include <string>

nlohmann::json mockCollectValue(const std::string& code, const std::string& valueType, const nlohmann::json& requirement);
