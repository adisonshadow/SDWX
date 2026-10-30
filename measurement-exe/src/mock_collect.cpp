#include "mock_collect.h"

#include <atomic>
#include <cmath>
#include <string>

namespace {

const char* kTinyJpeg =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMTEhUTExMWFRUXGBcYGBgYGBoYGBgYGBgaGBgYGBgcIS4lHB4rIRgYJjgmKy8xNTU1GiQ7QDs0Py40NTEBDAwMEA8QHhISHjQrJCs0NDQ2NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NP/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAH/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==";

std::atomic<int> gSeq{0};

double baseFor(const std::string& code) {
  if (code == "inner_diameter") return 49.998;
  if (code == "roundness") return 0.008;
  if (code == "cylindricity") return 0.011;
  if (code == "guide_wear") return 0.050;
  if (code == "coaxiality") return 0.010;
  if (code == "outer_diameter") return 24.200;
  if (code == "length") return 100.0;
  if (code == "thickness") return 2.0;
  if (code == "span") return 500.0;
  if (code == "deflection") return 1.2;
  if (code == "residual_deflection") return 0.05;
  return 1.0;
}

std::string textFor(const std::string& code) {
  if (code == "observation") return "无异常";
  if (code == "defect_location") return "未见缺陷";
  if (code == "remark") return "现场拍摄";
  return "已采集";
}

double round3(double value) {
  return std::round(value * 1000.0) / 1000.0;
}

}  // namespace

nlohmann::json mockCollectValue(const std::string& code, const std::string& valueType, const nlohmann::json& requirement) {
  int seq = gSeq.fetch_add(1) + 1;
  if (valueType == "number") {
    double base = baseFor(code);
    if (requirement.is_object() && requirement.contains("nominal") && requirement["nominal"].is_number()) {
      base = requirement["nominal"].get<double>();
    }
    return round3(base + seq * 0.001);
  }
  if (valueType == "string") {
    return textFor(code) + "#" + std::to_string(seq);
  }
  if (valueType == "boolean") return true;
  nlohmann::json image = {
      {"mimeType", "image/jpeg"},
      {"fileName", code + ".jpg"},
      {"contentBase64", kTinyJpeg},
  };
  return nlohmann::json::array({image});
}
