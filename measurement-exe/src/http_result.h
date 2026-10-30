#pragma once

#include "json.hpp"

struct HttpResult {
  int status = 200;
  nlohmann::json body = nlohmann::json::object();
};

inline HttpResult httpError(int status, const std::string& code, const std::string& message) {
  HttpResult result;
  result.status = status;
  result.body = {{"code", code}, {"message", message}};
  return result;
}

inline std::string dumpJson(const nlohmann::json& body) {
  return body.dump(-1, ' ', false);
}
