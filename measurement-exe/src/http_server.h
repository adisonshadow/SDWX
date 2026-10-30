#pragma once

#include <atomic>
#include <thread>

class LogStore;
class TaskService;

class HttpServer {
 public:
  bool start(TaskService& tasks, LogStore& logs, bool autotest, int port);
  void stop();
  ~HttpServer();

 private:
  // Opaque so the header does not include httplib.
  struct Impl;
  Impl* impl_ = nullptr;
  std::thread thread_;
  std::atomic<bool> failed_{false};
};
