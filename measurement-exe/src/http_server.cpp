#include "http_server.h"

#include "httplib.h"
#include "http_result.h"
#include "logs.h"
#include "tasks.h"
#include "util.h"

#include <windows.h>

struct HttpServer::Impl {
  httplib::Server server;
};

namespace {

void writeResult(httplib::Response& res, const HttpResult& result) {
  res.status = result.status;
  res.set_content(dumpJson(result.body), "application/json; charset=utf-8");
}

bool readJson(const httplib::Request& req, nlohmann::json& out, HttpResult& error) {
  try {
    out = nlohmann::json::parse(req.body);
  } catch (...) {
    error = httpError(400, "BAD_REQUEST", "报文不是合法 JSON");
    return false;
  }
  return true;
}

bool parseLimit(const std::string& text, int& limit) {
  if (text.empty() || text.size() > 4) return false;
  int value = 0;
  for (char ch : text) {
    if (ch < '0' || ch > '9') return false;
    value = value * 10 + (ch - '0');
  }
  if (value < 1 || value > 1000) return false;
  limit = value;
  return true;
}

void logBadJson(LogStore& logs) {
  LogEntry entry;
  entry.time = nowIso8601();
  entry.outcome = "rejected";
  entry.hasErrorCode = true;
  entry.errorCode = "BAD_REQUEST";
  entry.message = "报文不是合法 JSON";
  logs.add(std::move(entry));
}

}  // namespace

bool HttpServer::start(TaskService& tasks, LogStore& logs, bool autotest, int port) {
  impl_ = new Impl();
  auto& server = impl_->server;

  server.Get("/api/measurement/health", [&tasks](const httplib::Request&, httplib::Response& res) {
    writeResult(res, tasks.health());
  });

  server.Get("/api/measurement/callback", [&tasks](const httplib::Request&, httplib::Response& res) {
    writeResult(res, tasks.getCallback());
  });

  server.Put("/api/measurement/callback", [&tasks](const httplib::Request& req, httplib::Response& res) {
    nlohmann::json body;
    HttpResult error;
    if (!readJson(req, body, error)) {
      writeResult(res, error);
      return;
    }
    writeResult(res, tasks.putCallback(body));
  });

  server.Post("/api/measurement/tasks", [&tasks, &logs](const httplib::Request& req, httplib::Response& res) {
    nlohmann::json body;
    HttpResult error;
    if (!readJson(req, body, error)) {
      logBadJson(logs);
      writeResult(res, error);
      return;
    }
    writeResult(res, tasks.acceptTask(body));
  });

  server.Get("/api/measurement/logs", [&logs](const httplib::Request& req, httplib::Response& res) {
    int limit = 100;
    if (req.has_param("limit")) {
      if (!parseLimit(req.get_param_value("limit"), limit)) {
        writeResult(res, httpError(400, "LIMIT_OUT_OF_RANGE", "limit 必须是 1 到 1000 的整数"));
        return;
      }
    }
    HttpResult result;
    result.body = logs.query(limit);
    writeResult(res, result);
  });

  if (autotest) {
    server.Post("/api/measurement/test/collect", [&tasks](const httplib::Request& req, httplib::Response& res) {
      nlohmann::json body;
      HttpResult error;
      if (!readJson(req, body, error)) {
        writeResult(res, error);
        return;
      }
      writeResult(res, tasks.testCollect(body));
    });
    server.Post("/api/measurement/test/retest", [&tasks](const httplib::Request& req, httplib::Response& res) {
      nlohmann::json body;
      HttpResult error;
      if (!readJson(req, body, error)) {
        writeResult(res, error);
        return;
      }
      writeResult(res, tasks.testRetest(body));
    });
    server.Post("/api/measurement/test/clear", [&tasks](const httplib::Request& req, httplib::Response& res) {
      nlohmann::json body;
      HttpResult error;
      if (!readJson(req, body, error)) {
        writeResult(res, error);
        return;
      }
      writeResult(res, tasks.testClear(body));
    });
    server.Post("/api/measurement/test/submit", [&tasks](const httplib::Request& req, httplib::Response& res) {
      nlohmann::json body;
      HttpResult error;
      if (!readJson(req, body, error)) {
        writeResult(res, error);
        return;
      }
      writeResult(res, tasks.testSubmit(body));
    });
    server.Get("/api/measurement/test/task", [&tasks](const httplib::Request& req, httplib::Response& res) {
      writeResult(res, tasks.testGet(req.get_param_value("taskId")));
    });
  }

  failed_ = false;
  thread_ = std::thread([this, port] {
    if (!impl_->server.listen("0.0.0.0", port)) failed_ = true;
  });

  for (int i = 0; i < 50; ++i) {
    if (impl_->server.is_running()) return true;
    if (failed_) break;
    Sleep(100);
  }
  if (impl_->server.is_running()) return true;
  impl_->server.stop();
  if (thread_.joinable()) thread_.join();
  delete impl_;
  impl_ = nullptr;
  return false;
}

HttpServer::~HttpServer() { stop(); }

void HttpServer::stop() {
  if (!impl_) return;
  impl_->server.stop();
  if (thread_.joinable()) thread_.join();
  delete impl_;
  impl_ = nullptr;
}
