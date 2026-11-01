#pragma once

#include <string>

struct HttpResponse {
  int status = 0;
  std::string body;
  std::string error;
};

HttpResponse httpRequest(const std::string& method, const std::string& url, const std::string& token,
                         const std::string& body);
