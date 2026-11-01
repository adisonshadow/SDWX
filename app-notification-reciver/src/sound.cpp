#include "sound.h"

#include <windows.h>
#include <mmsystem.h>

#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace {

constexpr int kRate = 22050;

void appendTone(std::vector<int16_t>& pcm, double freq, int ms) {
  int count = kRate * ms / 1000;
  for (int i = 0; i < count; ++i) {
    double env = 1.0;
    if (i < 180) env = i / 180.0;
    if (count - i < 280) env = std::min(env, (count - i) / 280.0);
    if (env < 0) env = 0;
    double sample = std::sin(2.0 * 3.14159265358979323846 * freq * i / kRate) * 0.35 * env;
    pcm.push_back(static_cast<int16_t>(sample * 32767.0));
  }
}

void appendSilence(std::vector<int16_t>& pcm, int ms) {
  pcm.insert(pcm.end(), static_cast<size_t>(kRate * ms / 1000), 0);
}

std::vector<int16_t> samplesFor(const std::string& key) {
  std::vector<int16_t> pcm;
  if (key == "alarm") {
    for (int i = 0; i < 3; ++i) {
      appendTone(pcm, 740, 140);
      appendTone(pcm, 494, 140);
    }
  } else if (key == "chime") {
    appendTone(pcm, 523, 160);
    appendTone(pcm, 659, 160);
    appendTone(pcm, 784, 240);
  } else {
    appendTone(pcm, 880, 160);
    appendSilence(pcm, 50);
    appendTone(pcm, 880, 180);
  }
  return pcm;
}

}  // namespace

void playAlert(const std::string& key) {
  auto pcm = samplesFor(key);
  if (pcm.empty()) return;
  uint32_t dataBytes = static_cast<uint32_t>(pcm.size() * sizeof(int16_t));
  std::vector<char> wav(44 + dataBytes);
  auto write32 = [&](size_t offset, uint32_t value) { std::memcpy(wav.data() + offset, &value, 4); };
  auto write16 = [&](size_t offset, uint16_t value) { std::memcpy(wav.data() + offset, &value, 2); };
  std::memcpy(wav.data(), "RIFF", 4);
  write32(4, 36 + dataBytes);
  std::memcpy(wav.data() + 8, "WAVEfmt ", 8);
  write32(16, 16);
  write16(20, 1);
  write16(22, 1);
  write32(24, kRate);
  write32(28, kRate * 2);
  write16(32, 2);
  write16(34, 16);
  std::memcpy(wav.data() + 36, "data", 4);
  write32(40, dataBytes);
  std::memcpy(wav.data() + 44, pcm.data(), dataBytes);

  static std::vector<char> holding;
  holding.swap(wav);
  PlaySoundW(reinterpret_cast<LPCWSTR>(holding.data()), nullptr, SND_MEMORY | SND_ASYNC | SND_NODEFAULT);
}
