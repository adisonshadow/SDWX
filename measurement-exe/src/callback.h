#pragma once

#include <string>

enum class CallbackFailure { None, EmptyUrl, Timeout, Unreachable, HttpStatus };

struct CallbackPostResult {
  bool delivered = false;
  int status = 0;
  CallbackFailure failure = CallbackFailure::None;
};

CallbackPostResult postCallback(const std::string& url, const std::string& body, int retryIntervalMs);
std::string callbackFailureMessage(const CallbackPostResult& result, const std::string& url);
