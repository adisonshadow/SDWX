#include "panel.h"

#include "resource.h"

#include "json.hpp"
#include "tasks.h"
#include "util.h"

#include <windows.h>
#include <windowsx.h>
#include <objidl.h>
#include <gdiplus.h>
#include <shellapi.h>
#include <winreg.h>

#include <algorithm>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr UINT WM_APP_REFRESH = WM_APP + 1;
constexpr UINT WM_TRAY = WM_APP + 2;
constexpr UINT WM_APP_WARN = WM_APP + 3;
constexpr UINT ID_TRAY_SHOW = 1;
constexpr UINT ID_TRAY_EXIT = 2;
constexpr UINT ID_TRAY_SETTINGS = 3;
constexpr UINT ID_TRAY_TOPMOST = 4;
constexpr UINT ID_TRAY_VERSION = 5;
constexpr UINT ID_SWITCH_BASE = 4000;
constexpr int IDC_SET_URL = 1101;
constexpr int IDC_SET_OVERWRITE = 1102;
constexpr int IDC_SET_QUEUE = 1103;
constexpr int IDC_SET_MOCK = 1104;
constexpr int IDC_SET_STARTUP = 1105;
constexpr int IDC_SET_LOG = 1106;
constexpr int IDC_SET_LOCATE = 1107;
constexpr int IDC_SET_SAVE = 1108;
constexpr int IDC_SET_CLOSE = 1109;
constexpr int IDC_SET_STATUS = 1110;
constexpr wchar_t kAppVersion[] = L"1.0.0";
constexpr wchar_t kHeaderTitle[] = L"SD厂N车间数字化测量采集";
constexpr wchar_t kRunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t kRunValueName[] = L"measurement-adapter";

enum class HitAction { Hide, Switch, Collect, Clear, Submit, Settings, Close, MockFill, Back };

struct Hit {
  RECT rc{};
  HitAction action = HitAction::Hide;
  int row = -1;
  bool enabled = true;
  bool busy = false;
  bool body = false;
  std::wstring label;
};

struct TextRun {
  RECT rc{};
  std::wstring text;
  COLORREF color = RGB(32, 32, 32);
  bool bold = false;
  bool warning = false;
  bool right = false;
  bool single = false;
  bool body = false;
  bool tag = false;
};

TaskService* g_tasks = nullptr;
HWND g_hwnd = nullptr;
HINSTANCE g_inst = nullptr;
HFONT g_font = nullptr;
HFONT g_fontBold = nullptr;
NOTIFYICONDATAW g_nid{};
std::wstring g_shownId;
bool g_followLatest = true;
std::vector<Hit> g_hits;
std::vector<TextRun> g_lines;
std::vector<std::string> g_switchIds;
int g_pressed = -1;
int g_width = 440;
int g_height = 140;
int g_dpi = 96;
int g_titleH = 36;
int g_scroll = 0;
int g_bodyHeight = 0;
int g_viewTop = 0;
int g_viewHeight = 0;
int g_footerTop = 0;
bool g_dragThumb = false;
int g_dragY = 0;
int g_dragScroll = 0;
bool g_thumbVisible = false;
RECT g_thumb{};
RECT g_track{};
std::wstring g_scrollTask;
bool g_alwaysOnTop = true;
bool g_submitting = false;
bool g_undelivered = false;
std::wstring g_notice;
UINT g_taskbarCreated = 0;
HWND g_settings = nullptr;
HICON g_iconBig = nullptr;
HICON g_iconSmall = nullptr;
HBITMAP g_settingsBmp = nullptr;
HBITMAP g_hideBmp = nullptr;
int g_settingsBmpW = 0;
int g_settingsBmpH = 0;
int g_hideBmpW = 0;
int g_hideBmpH = 0;
ULONG_PTR g_gdiplus = 0;

HFONT makeFont(int dpi, int weight) {
  return CreateFontW(-MulDiv(9, dpi, 72), 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE,
                      L"Microsoft YaHei");
}

void addText(int x, int y, int w, int h, const std::wstring& text, COLORREF color, bool bold = false, bool body = false,
             bool right = false, bool single = false, bool tag = false) {
  TextRun run;
  run.rc = RECT{x, y, x + w, y + h};
  run.text = text;
  run.color = color;
  run.bold = bold;
  run.body = body;
  run.right = right;
  run.single = single;
  run.tag = tag;
  g_lines.push_back(run);
}

void addButton(int x, int y, int w, int h, const std::wstring& label, HitAction action, int row, bool enabled, bool busy = false,
               bool body = false) {
  Hit hit;
  hit.rc = RECT{x, y, x + w, y + h};
  hit.action = action;
  hit.row = row;
  hit.enabled = enabled;
  hit.busy = busy;
  hit.body = body;
  hit.label = label;
  g_hits.push_back(hit);
}

int dp(int value) { return MulDiv(value, g_dpi <= 0 ? 96 : g_dpi, 96); }

int textHeight(HFONT font, const std::wstring& text, int width, int maxHeight, bool single = false) {
  if (!g_hwnd || width < 1) return dp(20);
  HDC dc = GetDC(g_hwnd);
  HGDIOBJ old = SelectObject(dc, font ? font : g_font);
  RECT rc{0, 0, std::max(1, width), 0};
  UINT flags = DT_LEFT | DT_CALCRECT | DT_NOPREFIX | (single ? DT_SINGLELINE : DT_WORDBREAK);
  DrawTextW(dc, text.empty() ? L" " : text.c_str(), -1, &rc, flags);
  SelectObject(dc, old);
  ReleaseDC(g_hwnd, dc);
  int height = rc.bottom - rc.top;
  if (height < dp(18)) height = dp(18);
  if (maxHeight > 0 && height > maxHeight) height = maxHeight;
  return height;
}

int textWidth(HFONT font, const std::wstring& text) {
  if (!g_hwnd || text.empty()) return 0;
  HDC dc = GetDC(g_hwnd);
  HGDIOBJ old = SelectObject(dc, font ? font : g_font);
  SIZE sz{};
  GetTextExtentPoint32W(dc, text.c_str(), static_cast<int>(text.size()), &sz);
  SelectObject(dc, old);
  ReleaseDC(g_hwnd, dc);
  return sz.cx;
}

void clampScroll() {
  int maxScroll = std::max(0, g_bodyHeight - g_viewHeight);
  if (g_scroll < 0) g_scroll = 0;
  if (g_scroll > maxScroll) g_scroll = maxScroll;
}

void updateThumb() {
  g_thumbVisible = g_viewHeight > 0 && g_bodyHeight > g_viewHeight;
  if (!g_thumbVisible) {
    g_thumb = RECT{};
    g_track = RECT{};
    return;
  }
  int barW = dp(8);
  int trackTop = g_viewTop + dp(4);
  int trackBottom = g_viewTop + g_viewHeight - dp(4);
  int trackH = std::max(1, trackBottom - trackTop);
  int thumbH = std::max(dp(28), MulDiv(trackH, g_viewHeight, std::max(1, g_bodyHeight)));
  if (thumbH > trackH) thumbH = trackH;
  int maxScroll = std::max(1, g_bodyHeight - g_viewHeight);
  int travel = std::max(0, trackH - thumbH);
  int thumbY = trackTop + (travel * g_scroll) / maxScroll;
  g_thumb = RECT{g_width - dp(4) - barW, thumbY, g_width - dp(4), thumbY + thumbH};
  g_track = RECT{g_thumb.left, trackTop, g_thumb.right, trackBottom};
}

void addWarning(int x, int y, int w, int h, const std::wstring& text) {
  TextRun run;
  run.rc = RECT{x, y, x + w, y + h};
  run.text = text;
  run.color = RGB(128, 48, 0);
  run.warning = true;
  g_lines.push_back(run);
}

void placeWindow() {
  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int x = work.right - g_width - dp(16);
  int yPos = work.bottom - g_height - dp(16);
  if (yPos < work.top) yPos = work.top;
  SetWindowPos(g_hwnd, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, x, yPos, g_width, g_height, SWP_NOACTIVATE);
  InvalidateRect(g_hwnd, nullptr, FALSE);
}

void layoutPanel() {
  if (!g_hwnd || !g_tasks) return;
  auto views = g_tasks->views();
  g_lines.clear();
  g_hits.clear();
  g_switchIds.clear();

  const int margin = dp(14);
  const int gap = dp(8);
  int titleLabelW = dp(160);
  {
    HDC dc = GetDC(g_hwnd);
    HGDIOBJ old = SelectObject(dc, g_fontBold);
    SIZE sz{};
    GetTextExtentPoint32W(dc, kHeaderTitle, static_cast<int>(wcslen(kHeaderTitle)), &sz);
    if (sz.cx > 0) titleLabelW = sz.cx;
    SelectObject(dc, old);
    ReleaseDC(g_hwnd, dc);
  }
  const int icon = dp(20);
  const int iconGap = dp(8);
  const int iconPad = dp(10);
  int titleLeft = iconPad + icon + iconGap;
  int width = titleLeft + titleLabelW + dp(12) + icon * 2 + iconGap + iconPad;
  if (width < dp(520)) width = dp(520);
  g_titleH = dp(36);
  const TaskView* shown = nullptr;

  if (!views.empty()) {
    bool stillThere = false;
    for (const auto& view : views) {
      if (utf8ToWide(view.taskId) == g_shownId) stillThere = true;
    }
    if (g_followLatest || g_shownId.empty() || !stillThere) g_shownId = utf8ToWide(views.front().taskId);
    for (const auto& view : views) {
      if (utf8ToWide(view.taskId) == g_shownId) shown = &view;
    }
    if (!shown) shown = &views.front();
  } else {
    g_shownId.clear();
  }

  if (g_scrollTask != g_shownId) {
    g_scroll = 0;
    g_scrollTask = g_shownId;
  }

  int contentW = width - margin * 2;
  int y = dp(12);
  auto layoutBody = [&]() {
    y = dp(12);
    if (!shown) {
      int h = textHeight(g_font, L"等待测量任务", contentW, 0);
      addText(margin, y, contentW, h, L"等待测量任务", RGB(90, 90, 90), false, true);
      y += h + gap;
      if (g_submitting) {
        std::wstring busy = L"正在提交测量结果...";
        int bh = textHeight(g_font, busy, contentW, 0);
        addText(margin, y, contentW, bh, busy, RGB(140, 90, 0), false, true);
        y += bh + gap;
      }
      return;
    }
    if (g_undelivered) {
      std::wstring title = L"测量结果未送达";
      int titleH = textHeight(g_fontBold, title, contentW, dp(28));
      addText(margin, y, contentW, titleH, title, RGB(128, 48, 0), true, true);
      y += titleH + gap;
      std::wstring detail = g_notice.empty() ? L"测量结果未送达，已保留本次采集数据。" : g_notice;
      int detailH = textHeight(g_font, detail, contentW, dp(160));
      addText(margin, y, contentW, detailH, detail, RGB(90, 50, 20), false, true);
      y += detailH + gap;
      return;
    }
    bool queue = g_tasks->processMode() == TaskService::ProcessMode::Queue;
    int closeW = queue ? dp(88) : 0;
    int switchW = views.size() > 1 ? dp(84) : 0;
    int xRight = margin + contentW;
    if (closeW) {
      xRight -= closeW;
      addButton(xRight, y, closeW, dp(28), L"关闭任务", HitAction::Close, -1, shown->pending && !g_submitting, false, true);
      xRight -= gap;
    }
    if (switchW) {
      xRight -= switchW;
      addButton(xRight, y, switchW, dp(28), L"切换任务", HitAction::Switch, -1, !g_submitting, false, true);
      xRight -= gap;
      for (const auto& view : views) g_switchIds.push_back(view.taskId);
    }
    int nameW = std::max(dp(80), xRight - margin);
    std::wstring device = utf8ToWide(shown->deviceName);
    int nameH = textHeight(g_fontBold, device, nameW, dp(28), true);
    addText(margin, y, nameW, nameH, device, RGB(20, 20, 20), true, true, false, true);
    y += std::max(nameH, (closeW || switchW) ? dp(28) : nameH) + gap;

    int tagPadX = dp(8);
    int tagTextH = textHeight(g_font, L"国", dp(40), 0, true);
    int tagH = tagTextH + dp(4);
    auto addLabel = [&](int x, int yPos, const std::wstring& label) {
      int w = textWidth(g_font, label);
      addText(x, yPos, w, tagH, label, RGB(120, 124, 132), false, true, false, true);
      return w;
    };
    auto addTag = [&](int x, int yPos, int maxW, const std::wstring& text) {
      int w = textWidth(g_font, text) + tagPadX * 2;
      if (maxW > dp(28) && w > maxW) w = maxW;
      if (w < dp(28)) w = dp(28);
      addText(x, yPos, w, tagH, text, RGB(48, 52, 58), false, true, false, true, true);
      return w;
    };

    int taskLabelW = addLabel(margin, y, L"任务");
    addTag(margin + taskLabelW + dp(6), y, contentW - taskLabelW - dp(6), g_shownId);
    y += tagH + dp(6);
    if (queue && views.size() > 1) {
      std::wstring hint = L"队列中有 " + std::to_wstring(views.size()) + L" 个任务，可切换当前要处理的任务";
      int hintH = textHeight(g_font, hint, contentW, dp(40));
      addText(margin, y, contentW, hintH, hint, RGB(36, 99, 168), false, true);
      y += hintH + dp(4);
    }
    if (!g_tasks->mockCollectEnabled()) {
      std::wstring hint = L"开发模拟采集未启用，不能填入模拟数据";
      int hintH = textHeight(g_font, hint, contentW, dp(24));
      addText(margin, y, contentW, hintH, hint, RGB(140, 90, 0), false, true);
      y += hintH + dp(4);
    }

    std::wstring targetHead = L"测量目标";
    int targetHeadH = textHeight(g_fontBold, targetHead, contentW, dp(24), true);
    addText(margin, y, contentW, targetHeadH, targetHead, RGB(20, 20, 20), true, true, false, true);
    y += targetHeadH + dp(3);
    if (shown->targets.empty()) {
      addText(margin, y, contentW, tagH, L"无", RGB(140, 140, 140), false, true, false, true);
      y += tagH + dp(12);
    } else {
      for (const auto& field : shown->targets) {
        std::wstring label = utf8ToWide(field.label);
        std::wstring value = utf8ToWide(field.value);
        int labelW = addLabel(margin, y, label);
        addTag(margin + labelW + dp(6), y, contentW - labelW - dp(6), value);
        y += tagH + dp(6);
      }
      y += dp(6);
    }

    for (const auto& row : shown->rows) {
      std::wstring title = utf8ToWide(row.title);
      std::wstring value = row.collected ? utf8ToWide(row.valueText) : L"未采集";
      int titleH = textHeight(g_fontBold, title, contentW, dp(24), true);
      addText(margin, y, contentW, titleH, title, RGB(20, 20, 20), true, true, false, true);
      y += titleH + dp(4);
      int valueGap = dp(12);
      int valueW = textWidth(g_font, value) + dp(2);
      int maxValueW = std::max(dp(72), contentW / 2);
      if (valueW > maxValueW) valueW = maxValueW;
      int reqW = std::max(dp(80), contentW - valueW - valueGap);
      valueW = contentW - reqW - valueGap;
      int blockTop = y;
      int cursorX = margin;
      int cursorY = y;
      int limitX = margin + reqW;
      if (row.requirements.empty()) {
        addText(margin, y, reqW, tagH, L"无要求", RGB(150, 150, 150), false, true, false, true);
        y += tagH;
      } else {
        for (const auto& field : row.requirements) {
          std::wstring label = utf8ToWide(field.label);
          std::wstring fieldValue = utf8ToWide(field.value);
          int labelW = textWidth(g_font, label);
          int naturalTag = textWidth(g_font, fieldValue) + tagPadX * 2;
          int maxTag = std::max(dp(36), reqW - labelW - dp(6));
          int tagW = std::min(std::max(naturalTag, dp(28)), maxTag);
          int need = labelW + dp(6) + tagW;
          if (cursorX > margin && cursorX + need > limitX) {
            cursorY += tagH + dp(4);
            cursorX = margin;
          }
          addText(cursorX, cursorY, labelW, tagH, label, RGB(120, 124, 132), false, true, false, true);
          addText(cursorX + labelW + dp(6), cursorY, tagW, tagH, fieldValue, RGB(48, 52, 58), false, true, false, true, true);
          cursorX += need + dp(10);
        }
        y = cursorY + tagH;
      }
      COLORREF valueColor = row.collected ? RGB(16, 122, 64) : RGB(130, 130, 130);
      addText(margin + reqW + valueGap, blockTop, valueW, std::max(tagH, y - blockTop), value, valueColor, false, true, true, true);
      y += dp(12);
    }
  };

  int gutter = 0;
  int buttonH = dp(36);
  int footerH = dp(14);
  if (shown) footerH += buttonH + dp(12);
  int noticeH = 0;
  if (!g_notice.empty() && !g_undelivered) {
    noticeH = textHeight(g_font, g_notice, width - margin * 2 - dp(16), dp(80)) + dp(16);
    footerH += noticeH + gap;
  }
  int screenH = GetSystemMetrics(SM_CYSCREEN);
  if (screenH < dp(200)) screenH = dp(200);
  int limit = MulDiv(screenH, 70, 100);
  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int workLimit = (work.bottom - work.top) - dp(8);
  if (workLimit > dp(160) && limit > workLimit) limit = workLimit;
  for (int pass = 0; pass < 2; ++pass) {
    g_lines.clear();
    g_hits.clear();
    g_switchIds.clear();
    contentW = width - margin * 2 - gutter;
    layoutBody();
    g_bodyHeight = y + dp(4);
    int maxView = std::max(dp(48), limit - g_titleH - footerH);
    if (g_bodyHeight > maxView && gutter == 0) {
      gutter = dp(16);
      continue;
    }
    g_viewHeight = std::min(g_bodyHeight, maxView);
    break;
  }
  g_viewTop = g_titleH;
  g_footerTop = g_viewTop + g_viewHeight;
  g_height = g_footerTop + footerH;
  clampScroll();

  int footY = g_footerTop + dp(10);
  if (!g_notice.empty() && !g_undelivered) {
    int pad = dp(8);
    addWarning(margin, footY, contentW, noticeH, g_notice);
    footY += noticeH + gap;
  }
  auto fitButton = [&](const std::wstring& label) { return textWidth(g_font, label) + dp(36); };
  if (shown && g_undelivered) {
    int backW = std::min(contentW, fitButton(L"返回当前测量"));
    addButton(margin, footY, backW, buttonH, L"返回当前测量", HitAction::Back, -1, true);
  } else if (shown) {
    int buttonGap = dp(8);
    bool canSubmit = shown->pending && shown->allCollected && !g_submitting;
    bool mock = g_tasks->mockCollectEnabled();
    int buttonX = margin;
    if (mock) {
      int mockW = fitButton(L"模拟数据");
      addButton(buttonX, footY, mockW, buttonH, L"模拟数据", HitAction::MockFill, -1, shown->pending && !g_submitting);
      buttonX += mockW + buttonGap;
    }
    int clearW = fitButton(L"清除重测");
    addButton(buttonX, footY, clearW, buttonH, L"清除重测", HitAction::Clear, -1, shown->pending && !g_submitting);
    int submitW = std::max(fitButton(L"提交测量"), fitButton(L"提交中"));
    int submitX = margin + contentW - submitW;
    addButton(submitX, footY, submitW, buttonH, g_submitting ? L"提交中" : L"提交测量", HitAction::Submit, -1, canSubmit, g_submitting);
  }

  int iconY = std::max(0, (g_titleH - icon) / 2);
  int hideX = width - iconPad - icon;
  int settingsX = hideX - iconGap - icon;
  addButton(settingsX, iconY, icon, icon, L"", HitAction::Settings, -1, true);
  addButton(hideX, iconY, icon, icon, L"", HitAction::Hide, -1, true);
  g_width = width;
  updateThumb();
  placeWindow();
}

std::string settingsPath() { return joinPath(exeDirectory(), "config.json"); }

void loadWindowSettings() {
  std::string text = readTextFile(settingsPath());
  if (text.empty()) return;
  try {
    auto config = nlohmann::json::parse(text);
    if (config.is_object() && config.contains("alwaysOnTop") && config["alwaysOnTop"].is_boolean()) {
      g_alwaysOnTop = config["alwaysOnTop"].get<bool>();
    }
  } catch (...) {
  }
}

void saveWindowSettings() {
  nlohmann::json config = nlohmann::json::object();
  std::string text = readTextFile(settingsPath());
  if (!text.empty()) {
    try {
      auto parsed = nlohmann::json::parse(text);
      if (parsed.is_object()) config = std::move(parsed);
    } catch (...) {
    }
  }
  config["alwaysOnTop"] = g_alwaysOnTop;
  writeTextFile(settingsPath(), config.dump(-1, ' ', false));
}

bool startupEnabled() {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kRunKey, 0, KEY_QUERY_VALUE, &key) != ERROR_SUCCESS) return false;
  DWORD type = 0;
  DWORD size = 0;
  LONG rc = RegQueryValueExW(key, kRunValueName, nullptr, &type, nullptr, &size);
  RegCloseKey(key);
  return rc == ERROR_SUCCESS && (type == REG_SZ || type == REG_EXPAND_SZ) && size > sizeof(wchar_t);
}

void setStartupEnabled(bool enabled) {
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, kRunKey, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr) != ERROR_SUCCESS) return;
  if (!enabled) {
    RegDeleteValueW(key, kRunValueName);
  } else {
    wchar_t path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    std::wstring command = L"\"";
    command += path;
    command += L"\"";
    RegSetValueExW(key, kRunValueName, 0, REG_SZ, reinterpret_cast<const BYTE*>(command.c_str()),
                   static_cast<DWORD>((command.size() + 1) * sizeof(wchar_t)));
  }
  RegCloseKey(key);
}

void showPanel() {
  if (!g_hwnd) return;
  layoutPanel();
  ShowWindow(g_hwnd, SW_SHOW);
  SetForegroundWindow(g_hwnd);
}

int hitTest(int x, int y) {
  POINT pt{x, y};
  for (int i = static_cast<int>(g_hits.size()) - 1; i >= 0; --i) {
    const Hit& hit = g_hits[static_cast<size_t>(i)];
    RECT rc = hit.rc;
    if (hit.body) {
      if (y < g_viewTop || y >= g_viewTop + g_viewHeight) continue;
      if (g_thumbVisible && x >= g_track.left) continue;
      OffsetRect(&rc, 0, g_viewTop - g_scroll);
    }
    if (PtInRect(&rc, pt)) return i;
  }
  return -1;
}

const TaskView* currentView(const std::vector<TaskView>& views) {
  for (const auto& view : views) {
    if (utf8ToWide(view.taskId) == g_shownId) return &view;
  }
  return views.empty() ? nullptr : &views.front();
}

void openSettings();
void closeTaskFromPanel();

void fire(int index) {
  if (index < 0 || index >= static_cast<int>(g_hits.size())) return;
  const Hit& hit = g_hits[static_cast<size_t>(index)];
  if (!hit.enabled || !g_tasks) return;
  if (hit.action == HitAction::Hide) {
    ShowWindow(g_hwnd, SW_HIDE);
    return;
  }
  if (hit.action == HitAction::Settings) {
    openSettings();
    return;
  }
  if (hit.action == HitAction::Close) {
    closeTaskFromPanel();
    return;
  }
  if (hit.action == HitAction::Back) {
    g_undelivered = false;
    g_notice.clear();
    layoutPanel();
    return;
  }
  if (hit.action == HitAction::Switch) {
    HMENU menu = CreatePopupMenu();
    auto views = g_tasks->views();
    for (size_t i = 0; i < views.size() && i < g_switchIds.size(); ++i) {
      std::wstring label = utf8ToWide(views[i].deviceName + " " + views[i].taskId);
      AppendMenuW(menu, MF_STRING, ID_SWITCH_BASE + static_cast<UINT>(i), label.c_str());
    }
    POINT pt{};
    GetCursorPos(&pt);
    SetForegroundWindow(g_hwnd);
    int cmd = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_LEFTALIGN, pt.x, pt.y, 0, g_hwnd, nullptr);
    DestroyMenu(menu);
    if (cmd >= static_cast<int>(ID_SWITCH_BASE)) {
      size_t picked = static_cast<size_t>(cmd - static_cast<int>(ID_SWITCH_BASE));
      if (picked < g_switchIds.size()) {
        g_followLatest = false;
        g_shownId = utf8ToWide(g_switchIds[picked]);
        layoutPanel();
      }
    }
    return;
  }

  auto views = g_tasks->views();
  const TaskView* view = currentView(views);
  if (!view) return;
  if (hit.action == HitAction::Collect) {
    if (hit.row < 0 || hit.row >= static_cast<int>(view->rows.size())) return;
    g_notice.clear();
    nlohmann::json body = {{"taskId", view->taskId}, {"code", view->rows[static_cast<size_t>(hit.row)].code}};
    if (view->rows[static_cast<size_t>(hit.row)].collected) g_tasks->testRetest(body);
    else g_tasks->testCollect(body);
    return;
  }
  if (hit.action == HitAction::Clear) {
    g_notice.clear();
    g_undelivered = false;
    g_tasks->testClear({{"taskId", view->taskId}});
    return;
  }
  if (hit.action == HitAction::MockFill) {
    if (!g_tasks->mockCollectEnabled()) return;
    g_notice.clear();
    g_undelivered = false;
    for (const auto& row : view->rows) {
      nlohmann::json body = {{"taskId", view->taskId}, {"code", row.code}};
      if (row.collected) g_tasks->testRetest(body);
      else g_tasks->testCollect(body);
    }
    return;
  }
  if (hit.action == HitAction::Submit) {
    if (g_submitting) return;
    if (!view->allCollected) {
      g_notice = L"尚有参数未采集，无法提交";
      layoutPanel();
      MessageBoxW(g_hwnd, g_notice.c_str(), L"测量适配程序", MB_ICONWARNING | MB_OK);
      return;
    }
    g_submitting = true;
    g_notice.clear();
    layoutPanel();
    std::string taskId = view->taskId;
    std::thread([taskId] {
      std::wstring notice;
      if (g_tasks) {
        HttpResult result = g_tasks->testSubmit({{"taskId", taskId}});
        bool delivered = result.status >= 200 && result.status < 300;
        if (result.body.contains("delivered") && result.body["delivered"].is_boolean()) {
          delivered = result.body["delivered"].get<bool>();
        }
        if (!delivered) {
          std::string message = "提交失败";
          if (result.body.contains("message") && result.body["message"].is_string() &&
              !result.body["message"].get<std::string>().empty()) {
            message = result.body["message"].get<std::string>();
          }
          notice = utf8ToWide(message);
        }
      }
      auto* text = new std::wstring(std::move(notice));
      if (!g_hwnd || !PostMessageW(g_hwnd, WM_APP_WARN, 0, reinterpret_cast<LPARAM>(text))) delete text;
    }).detach();
  }
}

HBITMAP bitmapFromPngResource(int id, int& outW, int& outH) {
  outW = 0;
  outH = 0;
  HRSRC found = FindResourceW(g_inst, MAKEINTRESOURCEW(id), RT_RCDATA);
  if (!found) return nullptr;
  HGLOBAL loaded = LoadResource(g_inst, found);
  DWORD size = SizeofResource(g_inst, found);
  void* bytes = LockResource(loaded);
  if (!bytes || size == 0) return nullptr;
  HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, size);
  if (!memory) return nullptr;
  void* buffer = GlobalLock(memory);
  if (!buffer) {
    GlobalFree(memory);
    return nullptr;
  }
  memcpy(buffer, bytes, size);
  GlobalUnlock(memory);
  IStream* stream = nullptr;
  if (CreateStreamOnHGlobal(memory, TRUE, &stream) != S_OK) {
    GlobalFree(memory);
    return nullptr;
  }
  Gdiplus::Bitmap bitmap(stream, FALSE);
  if (bitmap.GetLastStatus() != Gdiplus::Ok) {
    stream->Release();
    return nullptr;
  }
  UINT width = bitmap.GetWidth();
  UINT height = bitmap.GetHeight();
  BITMAPINFO info{};
  info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  info.bmiHeader.biWidth = static_cast<LONG>(width);
  info.bmiHeader.biHeight = -static_cast<LONG>(height);
  info.bmiHeader.biPlanes = 1;
  info.bmiHeader.biBitCount = 32;
  info.bmiHeader.biCompression = BI_RGB;
  void* bits = nullptr;
  HBITMAP dib = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
  Gdiplus::BitmapData data{};
  Gdiplus::Rect rect(0, 0, static_cast<INT>(width), static_cast<INT>(height));
  if (!dib || !bits || bitmap.LockBits(&rect, Gdiplus::ImageLockModeRead, PixelFormat32bppARGB, &data) != Gdiplus::Ok) {
    if (dib) DeleteObject(dib);
    stream->Release();
    return nullptr;
  }
  auto* dst = static_cast<unsigned char*>(bits);
  for (UINT y = 0; y < height; ++y) {
    auto* src = static_cast<unsigned char*>(data.Scan0) + static_cast<size_t>(y) * static_cast<size_t>(data.Stride);
    auto* row = dst + static_cast<size_t>(y) * width * 4;
    for (UINT x = 0; x < width; ++x) {
      unsigned int b = src[x * 4 + 0];
      unsigned int g = src[x * 4 + 1];
      unsigned int r = src[x * 4 + 2];
      unsigned int a = src[x * 4 + 3];
      row[x * 4 + 0] = static_cast<unsigned char>(b * a / 255);
      row[x * 4 + 1] = static_cast<unsigned char>(g * a / 255);
      row[x * 4 + 2] = static_cast<unsigned char>(r * a / 255);
      row[x * 4 + 3] = static_cast<unsigned char>(a);
    }
  }
  bitmap.UnlockBits(&data);
  stream->Release();
  outW = static_cast<int>(width);
  outH = static_cast<int>(height);
  return dib;
}

void loadHeaderIcons() {
  if (!g_gdiplus) {
    Gdiplus::GdiplusStartupInput input;
    if (Gdiplus::GdiplusStartup(&g_gdiplus, &input, nullptr) != Gdiplus::Ok) {
      g_gdiplus = 0;
      return;
    }
  }
  g_settingsBmp = bitmapFromPngResource(IDR_HEADER_SETTINGS, g_settingsBmpW, g_settingsBmpH);
  g_hideBmp = bitmapFromPngResource(IDR_HEADER_HIDE, g_hideBmpW, g_hideBmpH);
}

void drawHeaderIcon(HDC dc, const RECT& rc, HBITMAP bmp, int srcW, int srcH) {
  if (!bmp || srcW < 1 || srcH < 1) return;
  int pad = std::max(1, dp(2));
  int x = rc.left + pad;
  int y = rc.top + pad;
  int w = (rc.right - rc.left) - pad * 2;
  int h = (rc.bottom - rc.top) - pad * 2;
  if (w < 1 || h < 1) return;
  HDC mem = CreateCompatibleDC(dc);
  HGDIOBJ old = SelectObject(mem, bmp);
  BLENDFUNCTION blend{};
  blend.BlendOp = AC_SRC_OVER;
  blend.SourceConstantAlpha = 255;
  blend.AlphaFormat = AC_SRC_ALPHA;
  AlphaBlend(dc, x, y, w, h, mem, 0, 0, srcW, srcH, blend);
  SelectObject(mem, old);
  DeleteDC(mem);
}

void paint(HDC target) {
  RECT client{};
  GetClientRect(g_hwnd, &client);
  int width = std::max(1L, client.right - client.left);
  int height = std::max(1L, client.bottom - client.top);
  HDC mem = CreateCompatibleDC(target);
  HBITMAP bmp = CreateCompatibleBitmap(target, width, height);
  HGDIOBJ oldBmp = SelectObject(mem, bmp);
  HBRUSH bgBrush = CreateSolidBrush(RGB(248, 249, 251));
  FillRect(mem, &client, bgBrush);
  RECT title{0, 0, width, g_titleH};
  HBRUSH titleBrush = CreateSolidBrush(RGB(24, 58, 110));
  SetBkMode(mem, TRANSPARENT);

  auto drawRun = [&](const TextRun& run, int dy) {
    RECT rc = run.rc;
    OffsetRect(&rc, 0, dy);
    if (run.tag) {
      COLORREF fill = RGB(232, 234, 238);
      int radius = dp(6);
      HPEN pen = CreatePen(PS_SOLID, 1, fill);
      HBRUSH brush = CreateSolidBrush(fill);
      HGDIOBJ oldPen = SelectObject(mem, pen);
      HGDIOBJ oldBrush = SelectObject(mem, brush);
      RoundRect(mem, rc.left, rc.top, rc.right, rc.bottom, radius, radius);
      SelectObject(mem, oldPen);
      SelectObject(mem, oldBrush);
      DeleteObject(pen);
      DeleteObject(brush);
      InflateRect(&rc, -dp(8), -dp(2));
    } else if (run.warning) {
      HBRUSH warnBrush = CreateSolidBrush(RGB(255, 236, 214));
      FillRect(mem, &rc, warnBrush);
      DeleteObject(warnBrush);
      InflateRect(&rc, -dp(8), -dp(6));
    }
    SelectObject(mem, run.bold ? g_fontBold : g_font);
    SetTextColor(mem, run.color);
    UINT format = DT_NOPREFIX | DT_END_ELLIPSIS | (run.right ? DT_RIGHT : DT_LEFT);
    format |= run.single ? (DT_SINGLELINE | DT_VCENTER) : DT_WORDBREAK;
    DrawTextW(mem, run.text.c_str(), -1, &rc, format);
  };
  auto drawHit = [&](const Hit& hit, int dy) {
    RECT rc = hit.rc;
    OffsetRect(&rc, 0, dy);
    if (hit.action == HitAction::Settings || hit.action == HitAction::Hide) return;
    COLORREF fill = RGB(36, 99, 168);
    if (hit.busy) fill = RGB(184, 116, 20);
    else if (!hit.enabled) fill = RGB(186, 190, 196);
    int radius = dp(8);
    HPEN pen = CreatePen(PS_SOLID, 1, fill);
    HBRUSH brush = CreateSolidBrush(fill);
    HGDIOBJ oldPen = SelectObject(mem, pen);
    HGDIOBJ oldBrush = SelectObject(mem, brush);
    RoundRect(mem, rc.left, rc.top, rc.right, rc.bottom, radius, radius);
    SelectObject(mem, oldPen);
    SelectObject(mem, oldBrush);
    DeleteObject(pen);
    DeleteObject(brush);
    SelectObject(mem, g_font);
    SetTextColor(mem, RGB(255, 255, 255));
    DrawTextW(mem, hit.label.c_str(), -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
  };

  if (g_viewHeight > 0) {
    IntersectClipRect(mem, 0, g_viewTop, width, g_viewTop + g_viewHeight);
    for (const auto& run : g_lines) {
      if (run.body) drawRun(run, g_viewTop - g_scroll);
    }
    for (const auto& hit : g_hits) {
      if (hit.body) drawHit(hit, g_viewTop - g_scroll);
    }
    SelectClipRgn(mem, nullptr);
  }
  RECT footer{0, g_footerTop, width, height};
  FillRect(mem, &footer, bgBrush);
  if (g_footerTop > g_titleH) {
    HPEN pen = CreatePen(PS_SOLID, 1, RGB(220, 224, 230));
    HGDIOBJ oldPen = SelectObject(mem, pen);
    MoveToEx(mem, 0, g_footerTop, nullptr);
    LineTo(mem, width, g_footerTop);
    SelectObject(mem, oldPen);
    DeleteObject(pen);
  }
  for (const auto& run : g_lines) {
    if (!run.body) drawRun(run, 0);
  }
  for (const auto& hit : g_hits) {
    if (!hit.body) drawHit(hit, 0);
  }
  if (g_thumbVisible) {
    HBRUSH trackBrush = CreateSolidBrush(RGB(226, 230, 236));
    FillRect(mem, &g_track, trackBrush);
    DeleteObject(trackBrush);
    HBRUSH thumbBrush = CreateSolidBrush(RGB(150, 158, 170));
    FillRect(mem, &g_thumb, thumbBrush);
    DeleteObject(thumbBrush);
  }

  FillRect(mem, &title, titleBrush);
  SetBkMode(mem, TRANSPARENT);
  SelectObject(mem, g_fontBold);
  SetTextColor(mem, RGB(255, 255, 255));
  int titleLeft = dp(10) + dp(20) + dp(8);
  int titleRight = width - dp(72);
  for (const auto& hit : g_hits) {
    if (hit.action == HitAction::Settings) titleRight = hit.rc.left - dp(4);
  }
  int appIcon = dp(20);
  int appX = dp(10);
  int appY = std::max(0, (g_titleH - appIcon) / 2);
  HICON brand = g_iconBig ? g_iconBig : g_iconSmall;
  if (brand) DrawIconEx(mem, appX, appY, brand, appIcon, appIcon, 0, nullptr, DI_NORMAL);
  RECT titleText{titleLeft, 0, titleRight, g_titleH};
  DrawTextW(mem, kHeaderTitle, -1, &titleText, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);
  for (const auto& hit : g_hits) {
    if (hit.action == HitAction::Settings) drawHeaderIcon(mem, hit.rc, g_settingsBmp, g_settingsBmpW, g_settingsBmpH);
    else if (hit.action == HitAction::Hide) drawHeaderIcon(mem, hit.rc, g_hideBmp, g_hideBmpW, g_hideBmpH);
  }

  DeleteObject(bgBrush);
  DeleteObject(titleBrush);
  BitBlt(target, 0, 0, width, height, mem, 0, 0, SRCCOPY);
  SelectObject(mem, oldBmp);
  DeleteObject(bmp);
  DeleteDC(mem);
}

HICON loadAppIcon(int cx, int cy) {
  return static_cast<HICON>(LoadImageW(g_inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, cx, cy, LR_DEFAULTCOLOR));
}

void loadAppIcons() {
  g_iconBig = loadAppIcon(GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON));
  g_iconSmall = loadAppIcon(GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON));
  if (!g_iconBig) g_iconBig = LoadIconW(nullptr, IDI_APPLICATION);
  if (!g_iconSmall) g_iconSmall = g_iconBig;
}

void addTray() {
  g_nid = {};
  g_nid.cbSize = NOTIFYICONDATA_V2_SIZE;
  g_nid.hWnd = g_hwnd;
  g_nid.uID = 1;
  g_nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  g_nid.uCallbackMessage = WM_TRAY;
  g_nid.hIcon = g_iconSmall ? g_iconSmall : LoadIconW(nullptr, IDI_APPLICATION);
  std::wstring tip = std::wstring(L"测量适配程序 ") + kAppVersion;
  wcscpy_s(g_nid.szTip, tip.c_str());
  Shell_NotifyIconW(NIM_ADD, &g_nid);
}

std::wstring trimWide(std::wstring text) {
  auto space = [](wchar_t ch) { return ch == L' ' || ch == L'\t' || ch == L'\r' || ch == L'\n'; };
  while (!text.empty() && space(text.front())) text.erase(text.begin());
  while (!text.empty() && space(text.back())) text.pop_back();
  return text;
}

std::wstring controlText(HWND parent, int id) {
  HWND child = GetDlgItem(parent, id);
  int n = GetWindowTextLengthW(child);
  std::wstring text(static_cast<size_t>(n + 1), L'\0');
  if (n > 0) GetWindowTextW(child, &text[0], n + 1);
  text.resize(wcslen(text.c_str()));
  return trimWide(text);
}

HWND addChild(HWND parent, const wchar_t* klass, const wchar_t* text, DWORD exStyle, DWORD style, int id, int x, int y, int w, int h) {
  HWND hwnd = CreateWindowExW(exStyle, klass, text, WS_CHILD | WS_VISIBLE | style, x, y, w, h, parent,
                              reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), g_inst, nullptr);
  if (hwnd && g_font) SendMessageW(hwnd, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);
  return hwnd;
}

void fillSettings(HWND hwnd) {
  std::string url;
  if (g_tasks) {
    HttpResult callback = g_tasks->getCallback();
    if (callback.body.contains("callbackUrl") && callback.body["callbackUrl"].is_string()) {
      url = callback.body["callbackUrl"].get<std::string>();
    }
  }
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_URL), utf8ToWide(url).c_str());
  int modeId = (g_tasks && g_tasks->processMode() == TaskService::ProcessMode::Queue) ? IDC_SET_QUEUE : IDC_SET_OVERWRITE;
  CheckRadioButton(hwnd, IDC_SET_OVERWRITE, IDC_SET_QUEUE, modeId);
  SendMessageW(GetDlgItem(hwnd, IDC_SET_MOCK), BM_SETCHECK,
               (g_tasks && g_tasks->mockCollectEnabled()) ? BST_CHECKED : BST_UNCHECKED, 0);
  SendMessageW(GetDlgItem(hwnd, IDC_SET_STARTUP), BM_SETCHECK, startupEnabled() ? BST_CHECKED : BST_UNCHECKED, 0);
  std::string logPath = g_tasks ? g_tasks->logFilePath() : "";
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_LOG), utf8ToWide(logPath).c_str());
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), L"");
}

int layoutSettings(HWND hwnd) {
  RECT client{};
  GetClientRect(hwnd, &client);
  int width = client.right - client.left;
  int margin = dp(16);
  int contentW = std::max(dp(200), width - margin * 2);
  int y = margin;
  int labelH = dp(22);
  int editH = dp(28);
  int radioH = dp(40);
  int checkH = dp(28);
  int gap = dp(8);
  addChild(hwnd, L"STATIC", L"回调地址", 0, SS_LEFT, 0, margin, y, contentW, labelH);
  y += labelH + dp(2);
  addChild(hwnd, L"EDIT", L"", WS_EX_CLIENTEDGE, ES_AUTOHSCROLL | WS_TABSTOP, IDC_SET_URL, margin, y, contentW, editH);
  y += editH + gap + dp(4);
  addChild(hwnd, L"STATIC", L"处理 API 的模式", 0, SS_LEFT, 0, margin, y, contentW, labelH);
  y += labelH + dp(2);
  addChild(hwnd, L"BUTTON", L"覆盖模式（只保留最近一个任务，其余丢弃）", 0,
           BS_AUTORADIOBUTTON | BS_MULTILINE | WS_GROUP | WS_TABSTOP, IDC_SET_OVERWRITE, margin, y, contentW, radioH);
  y += radioH + dp(2);
  addChild(hwnd, L"BUTTON", L"队列模式（多个任务排队，可选择先处理哪一个，也可强制关闭）", 0,
           BS_AUTORADIOBUTTON | BS_MULTILINE | WS_TABSTOP, IDC_SET_QUEUE, margin, y, contentW, radioH);
  y += radioH + gap;
  addChild(hwnd, L"BUTTON", L"启用开发模拟采集", 0, BS_AUTOCHECKBOX | WS_GROUP | WS_TABSTOP, IDC_SET_MOCK, margin, y, contentW, checkH);
  y += checkH + dp(4);
  addChild(hwnd, L"BUTTON", L"开机自启动", 0, BS_AUTOCHECKBOX | WS_TABSTOP, IDC_SET_STARTUP, margin, y, contentW, checkH);
  y += checkH + gap;
  addChild(hwnd, L"STATIC", L"日志文件地址", 0, SS_LEFT, 0, margin, y, contentW, labelH);
  y += labelH + dp(2);
  addChild(hwnd, L"EDIT", L"", WS_EX_CLIENTEDGE, ES_AUTOHSCROLL | WS_TABSTOP, IDC_SET_LOG, margin, y, contentW, editH);
  y += editH + gap;
  addChild(hwnd, L"BUTTON", L"定位到日志文件", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_LOCATE, margin, y, dp(140), dp(30));
  y += dp(30) + gap;
  addChild(hwnd, L"STATIC", L"", 0, SS_LEFT, IDC_SET_STATUS, margin, y, contentW, labelH);
  y += labelH + gap;
  int half = (contentW - gap) / 2;
  addChild(hwnd, L"BUTTON", L"保存", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_SAVE, margin, y, half, dp(32));
  addChild(hwnd, L"BUTTON", L"关闭", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_CLOSE, margin + half + gap, y, contentW - half - gap, dp(32));
  return y + dp(32) + margin;
}

void saveSettingsFrom(HWND hwnd) {
  if (!g_tasks) return;
  std::wstring url = controlText(hwnd, IDC_SET_URL);
  if (!url.empty()) {
    HttpResult saved = g_tasks->putCallback({{"callbackUrl", wideToUtf8(url)}});
    if (saved.status < 200 || saved.status >= 300) {
      std::string message = "回调地址保存失败";
      if (saved.body.contains("message") && saved.body["message"].is_string()) {
        message = saved.body["message"].get<std::string>();
      }
      SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), utf8ToWide(message).c_str());
      return;
    }
  }
  bool queue = SendMessageW(GetDlgItem(hwnd, IDC_SET_QUEUE), BM_GETCHECK, 0, 0) == BST_CHECKED;
  bool mock = SendMessageW(GetDlgItem(hwnd, IDC_SET_MOCK), BM_GETCHECK, 0, 0) == BST_CHECKED;
  bool startup = SendMessageW(GetDlgItem(hwnd, IDC_SET_STARTUP), BM_GETCHECK, 0, 0) == BST_CHECKED;
  g_tasks->updateSettings(queue ? TaskService::ProcessMode::Queue : TaskService::ProcessMode::Overwrite, mock,
                          wideToUtf8(controlText(hwnd, IDC_SET_LOG)));
  setStartupEnabled(startup);
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_LOG), utf8ToWide(g_tasks->logFilePath()).c_str());
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), L"已保存");
  if (g_hwnd) layoutPanel();
}

void locateLogFrom(HWND hwnd) {
  std::wstring path = controlText(hwnd, IDC_SET_LOG);
  if (path.empty() && g_tasks) path = utf8ToWide(g_tasks->logFilePath());
  if (path.empty()) {
    SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), L"请先填写日志文件地址");
    return;
  }
  if (!ensureFileExists(wideToUtf8(path))) {
    SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), L"无法创建日志文件");
    return;
  }
  std::wstring args = L"/select,\"" + path + L"\"";
  HINSTANCE launched = ShellExecuteW(hwnd, L"open", L"explorer.exe", args.c_str(), nullptr, SW_SHOWNORMAL);
  if (reinterpret_cast<INT_PTR>(launched) <= 32) {
    SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), L"无法打开日志文件所在位置");
  }
}

LRESULT CALLBACK settingsProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_CREATE: {
      int need = layoutSettings(hwnd);
      RECT window{};
      RECT client{};
      GetWindowRect(hwnd, &window);
      GetClientRect(hwnd, &client);
      int chromeH = (window.bottom - window.top) - (client.bottom - client.top);
      int chromeW = (window.right - window.left) - (client.right - client.left);
      int width = (client.right - client.left) + chromeW;
      int height = need + chromeH;
      RECT work{};
      SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
      int x = work.left + std::max(0, (static_cast<int>(work.right - work.left) - width) / 2);
      int y = work.top + std::max(0, (static_cast<int>(work.bottom - work.top) - height) / 2);
      SetWindowPos(hwnd, nullptr, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
      fillSettings(hwnd);
      return 0;
    }
    case WM_COMMAND:
      if (LOWORD(wParam) == IDC_SET_SAVE) saveSettingsFrom(hwnd);
      else if (LOWORD(wParam) == IDC_SET_LOCATE) locateLogFrom(hwnd);
      else if (LOWORD(wParam) == IDC_SET_CLOSE) DestroyWindow(hwnd);
      return 0;
    case WM_CLOSE:
      DestroyWindow(hwnd);
      return 0;
    case WM_DESTROY:
      if (hwnd == g_settings) g_settings = nullptr;
      return 0;
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

void openSettings() {
  if (!g_inst) return;
  if (g_settings && IsWindow(g_settings)) {
    ShowWindow(g_settings, SW_SHOW);
    SetForegroundWindow(g_settings);
    return;
  }
  static bool registered = false;
  if (!registered) {
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = settingsProc;
    wc.hInstance = g_inst;
    wc.lpszClassName = L"MeasurementAdapterSettings";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_BTNFACE + 1);
    wc.hIcon = g_iconBig;
    wc.hIconSm = g_iconSmall;
    RegisterClassExW(&wc);
    registered = true;
  }
  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int width = dp(500);
  int height = dp(560);
  int x = work.left + std::max(0, (static_cast<int>(work.right - work.left) - width) / 2);
  int y = work.top + std::max(0, (static_cast<int>(work.bottom - work.top) - height) / 2);
  DWORD exStyle = WS_EX_APPWINDOW;
  if (g_alwaysOnTop) exStyle |= WS_EX_TOPMOST;
  g_settings = CreateWindowExW(exStyle, L"MeasurementAdapterSettings", L"设置",
                               WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_CLIPCHILDREN, x, y, width, height, g_hwnd,
                               nullptr, g_inst, nullptr);
  if (!g_settings) return;
  ShowWindow(g_settings, SW_SHOW);
  SetForegroundWindow(g_settings);
}

void closeTaskFromPanel() {
  if (!g_tasks || g_tasks->processMode() != TaskService::ProcessMode::Queue) return;
  auto views = g_tasks->views();
  if (views.empty()) return;
  std::string picked;
  if (views.size() == 1) {
    picked = views[0].taskId;
  } else {
    HMENU menu = CreatePopupMenu();
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, L"选择要关闭的任务");
    for (size_t i = 0; i < views.size(); ++i) {
      std::wstring label = utf8ToWide(views[i].deviceName + "  " + views[i].taskId);
      AppendMenuW(menu, MF_STRING, ID_SWITCH_BASE + static_cast<UINT>(i), label.c_str());
    }
    POINT pt{};
    GetCursorPos(&pt);
    SetForegroundWindow(g_hwnd);
    int cmd = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_LEFTALIGN, pt.x, pt.y, 0, g_hwnd, nullptr);
    DestroyMenu(menu);
    if (cmd < static_cast<int>(ID_SWITCH_BASE)) return;
    size_t index = static_cast<size_t>(cmd - static_cast<int>(ID_SWITCH_BASE));
    if (index >= views.size()) return;
    picked = views[index].taskId;
  }
  std::wstring prompt = L"强制关闭任务 " + utf8ToWide(picked) + L" ？\n该任务会从本机队列移除，不会回调服务端。";
  if (MessageBoxW(g_hwnd, prompt.c_str(), L"关闭任务", MB_YESNO | MB_ICONWARNING) != IDYES) return;
  HttpResult result = g_tasks->closeTask(picked);
  if (result.status < 200 || result.status >= 300) {
    std::string message = "无法关闭任务";
    if (result.body.contains("message") && result.body["message"].is_string()) {
      message = result.body["message"].get<std::string>();
    }
    g_notice = utf8ToWide(message);
    layoutPanel();
    MessageBoxW(g_hwnd, g_notice.c_str(), L"测量适配程序", MB_ICONWARNING | MB_OK);
    return;
  }
  layoutPanel();
}

void showTrayMenu() {
  HMENU menu = CreatePopupMenu();
  AppendMenuW(menu, MF_STRING, ID_TRAY_SHOW, L"显示面板");
  AppendMenuW(menu, MF_STRING, ID_TRAY_SETTINGS, L"设置");
  AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(menu, MF_STRING | (g_alwaysOnTop ? MF_CHECKED : 0), ID_TRAY_TOPMOST, L"窗口始终居于最上");
  AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
  std::wstring version = std::wstring(L"版本 ") + kAppVersion;
  AppendMenuW(menu, MF_STRING | MF_GRAYED, ID_TRAY_VERSION, version.c_str());
  AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(menu, MF_STRING, ID_TRAY_EXIT, L"退出");
  POINT pt{};
  GetCursorPos(&pt);
  SetForegroundWindow(g_hwnd);
  TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RIGHTALIGN | TPM_BOTTOMALIGN, pt.x, pt.y, 0, g_hwnd, nullptr);
  PostMessageW(g_hwnd, WM_NULL, 0, 0);
  DestroyMenu(menu);
}

LRESULT CALLBACK panelProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  if (g_taskbarCreated != 0 && msg == g_taskbarCreated) {
    Shell_NotifyIconW(NIM_ADD, &g_nid);
    return 0;
  }
  switch (msg) {
    case WM_CREATE:
      return 0;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps{};
      HDC hdc = BeginPaint(hwnd, &ps);
      paint(hdc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_APP_REFRESH:
      if (wParam) {
        g_followLatest = true;
        if (!g_submitting) {
          g_notice.clear();
          g_undelivered = false;
        }
      }
      layoutPanel();
      return 0;
    case WM_APP_WARN: {
      g_submitting = false;
      std::wstring notice;
      if (lParam) {
        auto* text = reinterpret_cast<std::wstring*>(lParam);
        notice = *text;
        delete text;
      }
      g_notice = notice;
      g_undelivered = !notice.empty();
      layoutPanel();
      return 0;
    }
    case WM_MOUSEWHEEL: {
      int delta = GET_WHEEL_DELTA_WPARAM(wParam);
      if (delta == 0 || g_bodyHeight <= g_viewHeight) return 0;
      g_scroll -= (delta / WHEEL_DELTA) * dp(48);
      clampScroll();
      updateThumb();
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    }
    case WM_LBUTTONDOWN: {
      POINT pt{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
      if (g_thumbVisible && PtInRect(&g_thumb, pt)) {
        g_dragThumb = true;
        g_dragY = pt.y;
        g_dragScroll = g_scroll;
        SetCapture(hwnd);
        return 0;
      }
      if (g_thumbVisible && PtInRect(&g_track, pt)) {
        int page = std::max(dp(48), g_viewHeight * 4 / 5);
        g_scroll += pt.y < g_thumb.top ? -page : page;
        clampScroll();
        updateThumb();
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
      }
      g_pressed = hitTest(pt.x, pt.y);
      if (g_pressed >= 0) SetCapture(hwnd);
      return 0;
    }
    case WM_MOUSEMOVE:
      if (g_dragThumb) {
        int trackH = g_track.bottom - g_track.top;
        int thumbH = g_thumb.bottom - g_thumb.top;
        int travel = std::max(1, trackH - thumbH);
        int maxScroll = std::max(0, g_bodyHeight - g_viewHeight);
        g_scroll = g_dragScroll + (GET_Y_LPARAM(lParam) - g_dragY) * maxScroll / travel;
        clampScroll();
        updateThumb();
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;
    case WM_LBUTTONUP:
      if (g_dragThumb) {
        g_dragThumb = false;
        if (GetCapture() == hwnd) ReleaseCapture();
        return 0;
      }
      if (GetCapture() == hwnd) ReleaseCapture();
      {
        int hit = hitTest(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
        if (hit == g_pressed) fire(hit);
        g_pressed = -1;
      }
      return 0;
    case WM_DISPLAYCHANGE:
    case WM_SETTINGCHANGE:
      layoutPanel();
      return 0;
    case WM_CLOSE:
      ShowWindow(hwnd, SW_HIDE);
      return 0;
    case WM_TRAY:
      if (lParam == WM_LBUTTONUP || lParam == WM_LBUTTONDBLCLK) {
        showPanel();
      } else if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) {
        showTrayMenu();
      }
      return 0;
    case WM_COMMAND:
      if (LOWORD(wParam) == ID_TRAY_SHOW) {
        showPanel();
      } else if (LOWORD(wParam) == ID_TRAY_SETTINGS) {
        openSettings();
      } else if (LOWORD(wParam) == ID_TRAY_TOPMOST) {
        g_alwaysOnTop = !g_alwaysOnTop;
        saveWindowSettings();
        if (g_hwnd) {
          SetWindowPos(g_hwnd, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                       SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        if (g_settings) {
          SetWindowPos(g_settings, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                       SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
      } else if (LOWORD(wParam) == ID_TRAY_EXIT) {
        DestroyWindow(hwnd);
      }
      return 0;
    case WM_DESTROY:
      Shell_NotifyIconW(NIM_DELETE, &g_nid);
      if (g_iconSmall && g_iconSmall != g_iconBig) DestroyIcon(g_iconSmall);
      if (g_iconBig) DestroyIcon(g_iconBig);
      g_iconSmall = nullptr;
      g_iconBig = nullptr;
      if (g_settingsBmp) DeleteObject(g_settingsBmp);
      if (g_hideBmp) DeleteObject(g_hideBmp);
      g_settingsBmp = nullptr;
      g_hideBmp = nullptr;
      if (g_gdiplus) {
        Gdiplus::GdiplusShutdown(g_gdiplus);
        g_gdiplus = 0;
      }
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

}  // namespace

void notifyPanel(bool focusLatest) {
  if (g_hwnd) PostMessageW(g_hwnd, WM_APP_REFRESH, focusLatest ? 1 : 0, 0);
}

void* createPanel(void* instance, TaskService& tasks) {
  g_tasks = &tasks;
  g_inst = static_cast<HINSTANCE>(instance);
  g_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
  loadWindowSettings();
  loadAppIcons();
  loadHeaderIcons();
  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = panelProc;
  wc.hInstance = g_inst;
  wc.lpszClassName = L"MeasurementAdapterPanel";
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  wc.hIcon = g_iconBig;
  wc.hIconSm = g_iconSmall;
  RegisterClassExW(&wc);

  DWORD exStyle = WS_EX_TOOLWINDOW;
  if (g_alwaysOnTop) exStyle |= WS_EX_TOPMOST;
  g_hwnd = CreateWindowExW(exStyle, wc.lpszClassName, kHeaderTitle, WS_POPUP, 100, 100, g_width, g_height, nullptr,
                           nullptr, g_inst, nullptr);
  if (!g_hwnd) return nullptr;

  HDC dc = GetDC(g_hwnd);
  int dpi = GetDeviceCaps(dc, LOGPIXELSY);
  if (dpi <= 0) dpi = 96;
  g_dpi = dpi;
  ReleaseDC(g_hwnd, dc);
  g_font = makeFont(dpi, FW_NORMAL);
  g_fontBold = makeFont(dpi, FW_SEMIBOLD);

  addTray();
  layoutPanel();
  ShowWindow(g_hwnd, SW_SHOW);
  return g_hwnd;
}
