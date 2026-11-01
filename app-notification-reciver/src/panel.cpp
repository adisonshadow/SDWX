#include "panel.h"

#include "client.h"
#include "resource.h"
#include "sound.h"
#include "util.h"

#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>

#include <algorithm>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr UINT WM_APP_REFRESH = WM_APP + 1;
constexpr UINT WM_TRAY = WM_APP + 2;
constexpr UINT WM_APP_SHOW = WM_APP + 8;
constexpr UINT ID_TRAY_SHOW = 1;
constexpr UINT ID_TRAY_EXIT = 2;
constexpr UINT ID_TRAY_SETTINGS = 3;
constexpr UINT ID_TRAY_TOPMOST = 4;
constexpr UINT ID_TRAY_VERSION = 5;
constexpr int IDC_SET_URL = 1101;
constexpr int IDC_SET_LOGIN = 1102;
constexpr int IDC_SET_STARTUP = 1103;
constexpr int IDC_SET_SOUND = 1104;
constexpr int IDC_SET_FLASH = 1105;
constexpr int IDC_SET_SAVE = 1106;
constexpr int IDC_SET_CLOSE = 1107;
constexpr int IDC_SET_STATUS = 1108;
constexpr int IDC_SET_LOGOUT = 1109;
constexpr int IDC_SET_LABEL = 1110;
constexpr int IDC_ACCEPT_BY = 1201;
constexpr int IDC_SET_HINT = 1112;
constexpr wchar_t kAppVersion[] = L"1.0.0";
constexpr wchar_t kRunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t kRunValueName[] = L"app-notification-reciver";

enum class HitAction { Hide, Settings, CloseCard, Expand, Accept, Complete, Cancel, Login };

struct Hit {
  RECT rc{};
  HitAction action = HitAction::Hide;
  std::string id;
  bool enabled = true;
  bool body = false;
  std::wstring label;
  COLORREF fill = RGB(36, 99, 168);
};

struct CardDraw {
  CallItem item;
  bool expanded = false;
  bool busy = false;
  int top = 0;
  int height = 0;
  RECT titleRc{};
  RECT closeRc{};
  RECT summaryRc{};
  RECT bodyRc{};
  RECT editRc{};
  RECT acceptRc{};
  RECT completeRc{};
  RECT cancelRc{};
};

HINSTANCE g_inst = nullptr;
HWND g_hwnd = nullptr;
HWND g_settings = nullptr;
HWND g_acceptEdit = nullptr;
HFONT g_font = nullptr;
HFONT g_fontBold = nullptr;
HICON g_iconBig = nullptr;
HICON g_iconSmall = nullptr;
NOTIFYICONDATAW g_nid{};
UINT g_taskbarCreated = 0;
ReceiverService* g_service = nullptr;
std::thread g_poller;
HANDLE g_stop = nullptr;
HANDLE g_wake = nullptr;
std::atomic<bool> g_uiAlive{true};
std::mutex g_snapMu;
PollSnapshot g_snap;
std::vector<CallItem> g_open;
std::vector<std::string> g_popupIds;
std::vector<CardDraw> g_cards;
std::vector<Hit> g_hits;
std::wstring g_banner;
std::wstring g_loginPrompt;
RECT g_loginTextRc{};
bool g_showLogin = false;
std::string g_displayName;
std::string g_expandedId;
std::string g_busyId;
std::string g_editBoundId;
int g_appliedSeq = 0;
int g_dpi = 96;
int g_titleH = 40;
int g_bannerH = 0;
int g_viewTop = 0;
int g_viewHeight = 0;
int g_bodyHeight = 0;
int g_scroll = 0;
int g_pressed = -1;
bool g_alwaysOnTop = true;
bool g_thumbVisible = false;
bool g_dragThumb = false;
int g_dragY = 0;
int g_dragScroll = 0;
RECT g_thumb{};
RECT g_track{};
int g_flashStep = -1;

void openSettings();
void launchLogin(HWND statusOwner);
void refreshAccountRow(HWND hwnd, bool force);

int dp(int value) { return MulDiv(value, g_dpi <= 0 ? 96 : g_dpi, 96); }

HFONT makeFont(int dpi, int weight) {
  return CreateFontW(-MulDiv(9, dpi, 72), 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                      CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei");
}

std::wstring prettyTime(const std::string& iso) {
  if (iso.size() >= 19) {
    std::string text = iso.substr(0, 19);
    if (text[10] == 'T') text[10] = ' ';
    return utf8ToWide(text);
  }
  return utf8ToWide(iso);
}

std::wstring statusText(const std::string& status) {
  if (status == "accepted") return L"已接受";
  if (status == "completed") return L"处理完成";
  if (status == "cancelled") return L"已取消";
  return L"已发出";
}

COLORREF statusColor(const std::string& status) {
  if (status == "accepted") return RGB(29, 78, 137);
  if (status == "completed") return RGB(31, 122, 77);
  if (status == "cancelled") return RGB(110, 118, 128);
  return RGB(194, 65, 12);
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

void updateTip() {
  if (!g_hwnd) return;
  std::wstring tip = L"异常呼叫";
  if (!g_banner.empty()) {
    tip += L" - ";
    tip += g_banner;
  } else if (!g_displayName.empty()) {
    tip += L" - ";
    tip += utf8ToWide(g_displayName);
  }
  if (tip.size() > 120) tip.resize(120);
  g_nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  wcscpy_s(g_nid.szTip, tip.c_str());
  Shell_NotifyIconW(NIM_MODIFY, &g_nid);
}

void addTray() {
  g_nid = {};
  g_nid.cbSize = NOTIFYICONDATA_V2_SIZE;
  g_nid.hWnd = g_hwnd;
  g_nid.uID = 1;
  g_nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  g_nid.uCallbackMessage = WM_TRAY;
  g_nid.hIcon = g_iconSmall ? g_iconSmall : LoadIconW(nullptr, IDI_APPLICATION);
  wcscpy_s(g_nid.szTip, L"异常呼叫");
  Shell_NotifyIconW(NIM_ADD, &g_nid);
  updateTip();
}

HICON loadAppIcon(int cx, int cy) {
  return static_cast<HICON>(LoadImageW(g_inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, cx, cy, LR_DEFAULTCOLOR));
}

int textHeight(const std::wstring& text, int width) {
  if (!g_hwnd || width < 1) return dp(22);
  HDC dc = GetDC(g_hwnd);
  HGDIOBJ old = SelectObject(dc, g_font);
  RECT rc{0, 0, std::max(1, width), 0};
  DrawTextW(dc, text.empty() ? L" " : text.c_str(), -1, &rc, DT_LEFT | DT_WORDBREAK | DT_CALCRECT | DT_NOPREFIX);
  SelectObject(dc, old);
  ReleaseDC(g_hwnd, dc);
  return std::max(dp(18), static_cast<int>(rc.bottom - rc.top));
}

void clampScroll() {
  int maxScroll = std::max(0, g_bodyHeight - g_viewHeight);
  if (g_scroll < 0) g_scroll = 0;
  if (g_scroll > maxScroll) g_scroll = maxScroll;
}

void updateThumb() {
  g_thumbVisible = g_bodyHeight > g_viewHeight && g_viewHeight > 0;
  if (!g_thumbVisible) return;
  RECT client{};
  GetClientRect(g_hwnd, &client);
  int width = client.right - client.left;
  g_track = RECT{width - dp(8), g_viewTop + dp(4), width - dp(3), g_viewTop + g_viewHeight - dp(4)};
  int trackH = std::max(1, static_cast<int>(g_track.bottom - g_track.top));
  int thumbH = std::max(dp(24), trackH * g_viewHeight / std::max(1, g_bodyHeight));
  if (thumbH > trackH) thumbH = trackH;
  int maxScroll = std::max(1, g_bodyHeight - g_viewHeight);
  int travel = std::max(1, trackH - thumbH);
  int top = g_track.top + g_scroll * travel / maxScroll;
  g_thumb = RECT{g_track.left, top, g_track.right, top + thumbH};
}

void positionEdit() {
  if (!g_acceptEdit) return;
  const CardDraw* card = nullptr;
  for (const auto& item : g_cards) {
    if (item.expanded) card = &item;
  }
  if (!card || g_expandedId.empty()) {
    ShowWindow(g_acceptEdit, SW_HIDE);
    g_editBoundId.clear();
    return;
  }
  RECT rc = card->editRc;
  OffsetRect(&rc, 0, g_viewTop - g_scroll);
  if (rc.bottom < g_viewTop || rc.top > g_viewTop + g_viewHeight) {
    ShowWindow(g_acceptEdit, SW_HIDE);
    return;
  }
  SetWindowPos(g_acceptEdit, HWND_TOP, rc.left, rc.top, std::max(1, static_cast<int>(rc.right - rc.left)),
               std::max(1, static_cast<int>(rc.bottom - rc.top)), SWP_NOACTIVATE);
  ShowWindow(g_acceptEdit, SW_SHOW);
  if (g_editBoundId != card->item.id) {
    std::string value = card->item.acceptedBy.empty() ? g_displayName : card->item.acceptedBy;
    SetWindowTextW(g_acceptEdit, utf8ToWide(value).c_str());
    g_editBoundId = card->item.id;
  }
}

void addBodyHit(RECT rc, HitAction action, const std::string& id, bool enabled, const std::wstring& label, COLORREF fill) {
  Hit hit;
  hit.rc = rc;
  hit.action = action;
  hit.id = id;
  hit.enabled = enabled;
  hit.body = true;
  hit.label = label;
  hit.fill = fill;
  g_hits.push_back(hit);
}

void layoutPanel() {
  if (!g_hwnd) return;
  g_hits.clear();
  g_cards.clear();
  int width = dp(400);
  int margin = dp(12);
  int contentW = width - margin * 2 - dp(10);
  int y = dp(8);
  for (const auto& id : g_popupIds) {
    const CallItem* found = nullptr;
    for (const auto& item : g_open) {
      if (item.id == id) found = &item;
    }
    if (!found) continue;
    CardDraw card;
    card.item = *found;
    card.expanded = g_expandedId == found->id;
    card.busy = g_busyId == found->id;
    card.top = y;
    int innerL = margin + dp(16);
    int innerR = margin + contentW - dp(12);
    int innerW = std::max(dp(40), innerR - innerL);
    int cursor = y + dp(10);
    card.titleRc = RECT{innerL, cursor, innerR - dp(28), cursor + dp(24)};
    card.closeRc = RECT{innerR - dp(22), cursor, innerR, cursor + dp(22)};
    cursor += dp(28);
    if (!card.expanded) {
      card.summaryRc = RECT{innerL, cursor, innerR, cursor + dp(22)};
      cursor += dp(22);
      cursor += dp(10);
    } else {
      auto line = [&](int height) {
        RECT rc{innerL, cursor, innerR, cursor + height};
        cursor += height;
        return rc;
      };
      line(dp(22));
      line(dp(22));
      line(dp(22));
      std::wstring content = card.item.content.empty() ? L"（无描述）" : utf8ToWide(card.item.content);
      int contentH = std::min(dp(96), textHeight(content, innerW));
      card.bodyRc = line(dp(20) + contentH);
      cursor += dp(4);
      RECT editRow = line(dp(28));
      card.editRc = RECT{editRow.left + dp(64), editRow.top, editRow.right, editRow.bottom};
      if (!card.item.acceptedAt.empty()) line(dp(22));
      if (!card.item.completedAt.empty()) line(dp(22));
      cursor += dp(8);
      int gap = dp(8);
      int buttonW = std::max(dp(72), (innerW - gap * 2) / 3);
      int buttonH = dp(32);
      card.acceptRc = RECT{innerL, cursor, innerL + buttonW, cursor + buttonH};
      card.completeRc = RECT{card.acceptRc.right + gap, cursor, card.acceptRc.right + gap + buttonW, cursor + buttonH};
      card.cancelRc = RECT{card.completeRc.right + gap, cursor, card.completeRc.right + gap + buttonW, cursor + buttonH};
      cursor += buttonH + dp(12);
    }
    card.height = cursor - y;
    y = cursor + dp(8);
    g_cards.push_back(card);
  }
  g_bodyHeight = y;

  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int workH = std::max(dp(200), static_cast<int>(work.bottom - work.top));
  g_titleH = dp(40);
  bool loggedOut = !g_service || g_service->config().token.empty();
  bool sessionEnded = g_banner.find(L"登录已过期") != std::wstring::npos || g_banner.find(L"请先在设置里登录") != std::wstring::npos;
  g_showLogin = g_cards.empty() && (loggedOut || sessionEnded);
  g_loginPrompt = L"未登录";
  if (g_showLogin && !g_banner.empty() && g_banner != L"请先在设置里登录") g_loginPrompt = g_banner;
  if (g_showLogin || g_banner.empty()) g_bannerH = 0;
  else g_bannerH = std::max(dp(40), textHeight(g_banner, width - dp(24)) + dp(12));
  int maxWindow = workH * 70 / 100;
  int maxBody = std::max(dp(72), maxWindow - g_titleH - g_bannerH);
  g_viewTop = g_titleH + g_bannerH;
  if (!g_cards.empty()) {
    g_viewHeight = std::min(g_bodyHeight, maxBody);
  } else if (g_showLogin) {
    int promptH = std::max(dp(22), textHeight(g_loginPrompt, width - dp(32)));
    int textY = g_viewTop + dp(14);
    g_loginTextRc = RECT{dp(16), textY, width - dp(16), textY + promptH};
    g_viewHeight = (g_loginTextRc.bottom - g_viewTop) + dp(10) + dp(32) + dp(16);
  } else {
    g_viewHeight = dp(72);
  }
  clampScroll();
  int height = g_viewTop + g_viewHeight;
  int x = work.right - width - dp(12);
  int top = work.top + dp(12);
  UINT flags = SWP_NOACTIVATE;
  if (!g_uiAlive.load()) flags |= SWP_NOZORDER;
  SetWindowPos(g_hwnd, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, x, top, width, height, flags);

  for (const auto& card : g_cards) {
    bool acceptOn = card.item.status == "sent" && !card.busy;
    bool laterOn = (card.item.status == "sent" || card.item.status == "accepted") && !card.busy;
    addBodyHit(card.titleRc, HitAction::Expand, card.item.id, true, L"", 0);
    if (!card.expanded) addBodyHit(card.summaryRc, HitAction::Expand, card.item.id, true, L"", 0);
    addBodyHit(card.closeRc, HitAction::CloseCard, card.item.id, true, L"", 0);
    if (card.expanded) {
      addBodyHit(card.acceptRc, HitAction::Accept, card.item.id, acceptOn, L"已接受", RGB(36, 99, 168));
      addBodyHit(card.completeRc, HitAction::Complete, card.item.id, laterOn, L"处理完成", RGB(31, 122, 77));
      addBodyHit(card.cancelRc, HitAction::Cancel, card.item.id, laterOn, L"已取消", RGB(90, 98, 110));
    }
  }

  int icon = dp(28);
  int hideX = width - dp(6) - icon;
  int gearX = hideX - icon;
  Hit gear;
  gear.rc = RECT{gearX, std::max(0, (g_titleH - icon) / 2), gearX + icon, std::max(0, (g_titleH - icon) / 2) + icon};
  gear.action = HitAction::Settings;
  g_hits.push_back(gear);
  Hit hide;
  hide.rc = RECT{hideX, gear.rc.top, hideX + icon, gear.rc.bottom};
  hide.action = HitAction::Hide;
  g_hits.push_back(hide);
  if (g_showLogin) {
    Hit login;
    int top = g_loginTextRc.bottom + dp(10);
    login.rc = RECT{dp(16), top, dp(16) + dp(120), top + dp(32)};
    login.action = HitAction::Login;
    login.label = L"登录";
    login.fill = RGB(36, 99, 168);
    g_hits.push_back(login);
  }
  updateThumb();
  positionEdit();
  InvalidateRect(g_hwnd, nullptr, FALSE);
}

std::wstring editText() {
  if (!g_acceptEdit) return L"";
  int count = GetWindowTextLengthW(g_acceptEdit);
  std::wstring text(static_cast<size_t>(count + 1), L'\0');
  if (count > 0) GetWindowTextW(g_acceptEdit, text.data(), count + 1);
  text.resize(wcslen(text.c_str()));
  return text;
}

void dismissCard(const std::string& id) {
  g_popupIds.erase(std::remove(g_popupIds.begin(), g_popupIds.end(), id), g_popupIds.end());
  if (g_expandedId == id) g_expandedId.clear();
  layoutPanel();
  if (g_popupIds.empty()) ShowWindow(g_hwnd, SW_HIDE);
}

void submitCard(const std::string& id, CallAction action) {
  if (!g_service || g_busyId == id) return;
  CallJob job;
  job.id = id;
  job.action = action;
  job.acceptedBy = wideToUtf8(editText());
  if (job.acceptedBy.empty()) job.acceptedBy = g_displayName;
  g_busyId = id;
  g_service->enqueue(std::move(job));
  layoutPanel();
}

void toggleCard(const std::string& id) {
  g_expandedId = (g_expandedId == id) ? std::string() : id;
  layoutPanel();
}

void showAll(bool activate) {
  g_popupIds.clear();
  for (const auto& item : g_open) g_popupIds.push_back(item.id);
  layoutPanel();
  ShowWindow(g_hwnd, activate ? SW_SHOW : SW_SHOWNOACTIVATE);
  if (activate) SetForegroundWindow(g_hwnd);
}

void startFlash() {
  if (!g_hwnd) return;
  g_flashStep = 0;
  SetTimer(g_hwnd, 1, 140, nullptr);
  SetLayeredWindowAttributes(g_hwnd, 0, 150, LWA_ALPHA);
}

void applySnapshot(PollSnapshot snap) {
  bool notify = snap.seq != g_appliedSeq;
  g_appliedSeq = snap.seq;
  g_displayName = snap.displayName;
  g_banner = utf8ToWide(snap.actionError.empty() ? snap.error : snap.actionError);
  g_open = std::move(snap.openItems);
  g_popupIds.erase(std::remove_if(g_popupIds.begin(), g_popupIds.end(),
                                  [&](const std::string& id) {
                                    return std::none_of(g_open.begin(), g_open.end(),
                                                        [&](const CallItem& item) { return item.id == id; });
                                  }),
                   g_popupIds.end());
  if (!g_expandedId.empty() &&
      std::find(g_popupIds.begin(), g_popupIds.end(), g_expandedId) == g_popupIds.end()) {
    g_expandedId.clear();
  }
  bool arrived = false;
  for (auto it = snap.freshIds.rbegin(); it != snap.freshIds.rend(); ++it) {
    if (std::find(g_popupIds.begin(), g_popupIds.end(), *it) != g_popupIds.end()) continue;
    if (std::none_of(g_open.begin(), g_open.end(), [&](const CallItem& item) { return item.id == *it; })) continue;
    g_popupIds.insert(g_popupIds.begin(), *it);
    arrived = true;
  }
  g_busyId.clear();
  layoutPanel();
  if (notify && arrived) {
    ShowWindow(g_hwnd, SW_SHOWNOACTIVATE);
    if (!snap.soundKey.empty()) playAlert(snap.soundKey);
    if (snap.flash) startFlash();
  }
  updateTip();
  if (g_settings) refreshAccountRow(g_settings, false);
}

void publish(PollSnapshot snap) {
  {
    std::lock_guard<std::mutex> lock(g_snapMu);
    g_snap = std::move(snap);
  }
  if (g_uiAlive.load() && g_hwnd) PostMessageW(g_hwnd, WM_APP_REFRESH, 0, 0);
}

void pollLoop() {
  for (;;) {
    if (WaitForSingleObject(g_stop, 0) == WAIT_OBJECT_0) break;
    PollSnapshot snap;
    try {
      if (g_service) snap = g_service->poll();
    } catch (...) {
      snap.error = "轮询失败";
    }
    publish(std::move(snap));
    HANDLE waits[2] = {g_stop, g_wake};
    DWORD result = WaitForMultipleObjects(2, waits, FALSE, 4000);
    if (result == WAIT_OBJECT_0) break;
  }
}

void drawRound(HDC hdc, RECT rc, COLORREF fill, COLORREF border, int radius) {
  HPEN pen = CreatePen(PS_SOLID, 1, border);
  HBRUSH brush = CreateSolidBrush(fill);
  HGDIOBJ oldPen = SelectObject(hdc, pen);
  HGDIOBJ oldBrush = SelectObject(hdc, brush);
  RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom, radius, radius);
  SelectObject(hdc, oldPen);
  SelectObject(hdc, oldBrush);
  DeleteObject(pen);
  DeleteObject(brush);
}

void drawLabel(HDC hdc, RECT rc, const std::wstring& text, COLORREF color, bool bold, bool right, bool wrap) {
  SelectObject(hdc, bold ? g_fontBold : g_font);
  SetTextColor(hdc, color);
  UINT format = DT_NOPREFIX | DT_END_ELLIPSIS | (right ? DT_RIGHT : DT_LEFT);
  format |= wrap ? DT_WORDBREAK : (DT_SINGLELINE | DT_VCENTER);
  DrawTextW(hdc, text.c_str(), -1, &rc, format);
}

void paint(HDC target) {
  RECT client{};
  GetClientRect(g_hwnd, &client);
  int width = client.right - client.left;
  int height = client.bottom - client.top;
  HDC mem = CreateCompatibleDC(target);
  HBITMAP bmp = CreateCompatibleBitmap(target, std::max(1, width), std::max(1, height));
  HGDIOBJ oldBmp = SelectObject(mem, bmp);
  HBRUSH bg = CreateSolidBrush(RGB(236, 239, 244));
  FillRect(mem, &client, bg);
  DeleteObject(bg);
  SetBkMode(mem, TRANSPARENT);

  RECT title{0, 0, width, g_titleH};
  HBRUSH titleBrush = CreateSolidBrush(RGB(24, 58, 110));
  FillRect(mem, &title, titleBrush);
  DeleteObject(titleBrush);
  int appIcon = dp(20);
  if (g_iconBig) DrawIconEx(mem, dp(10), std::max(0, (g_titleH - appIcon) / 2), g_iconBig, appIcon, appIcon, 0, nullptr, DI_NORMAL);
  RECT titleText{dp(36), 0, width - dp(72), g_titleH};
  drawLabel(mem, titleText, L"异常呼叫", RGB(255, 255, 255), true, false, false);
  for (const auto& hit : g_hits) {
    if (hit.action == HitAction::Settings || hit.action == HitAction::Hide) {
      int cx = (hit.rc.left + hit.rc.right) / 2;
      int cy = (hit.rc.top + hit.rc.bottom) / 2;
      HPEN pen = CreatePen(PS_SOLID, dp(2), RGB(255, 255, 255));
      HGDIOBJ oldPen = SelectObject(mem, pen);
      HGDIOBJ oldBrush = SelectObject(mem, GetStockObject(HOLLOW_BRUSH));
      if (hit.action == HitAction::Hide) {
        int inset = dp(8);
        MoveToEx(mem, hit.rc.left + inset, cy, nullptr);
        LineTo(mem, hit.rc.right - inset, cy);
      } else {
        int r = dp(6);
        Ellipse(mem, cx - r, cy - r, cx + r, cy + r);
        Ellipse(mem, cx - dp(2), cy - dp(2), cx + dp(2), cy + dp(2));
      }
      SelectObject(mem, oldBrush);
      SelectObject(mem, oldPen);
      DeleteObject(pen);
    }
  }

  if (g_bannerH > 0) {
    RECT banner{0, g_titleH, width, g_titleH + g_bannerH};
    HBRUSH bannerBrush = CreateSolidBrush(RGB(255, 244, 230));
    FillRect(mem, &banner, bannerBrush);
    DeleteObject(bannerBrush);
    InflateRect(&banner, -dp(12), -dp(4));
    drawLabel(mem, banner, g_banner, RGB(140, 70, 10), false, false, true);
  }

  IntersectClipRect(mem, 0, g_viewTop, width, g_viewTop + g_viewHeight);
  if (g_cards.empty()) {
    if (g_showLogin) {
      drawLabel(mem, g_loginTextRc, g_loginPrompt, RGB(90, 98, 110), false, false, true);
    } else if (g_banner.empty()) {
      RECT empty{dp(16), g_viewTop, width - dp(16), g_viewTop + g_viewHeight};
      drawLabel(mem, empty, L"暂无待处理呼叫", RGB(90, 98, 110), false, false, true);
    }
  }
  for (const auto& card : g_cards) {
    RECT box{dp(12), card.top, dp(400) - dp(12) - dp(10), card.top + card.height};
    OffsetRect(&box, 0, g_viewTop - g_scroll);
    drawRound(mem, box, RGB(255, 255, 255), RGB(214, 220, 228), dp(8));
    RECT bar = box;
    bar.right = bar.left + dp(5);
    HBRUSH barBrush = CreateSolidBrush(statusColor(card.item.status));
    FillRect(mem, &bar, barBrush);
    DeleteObject(barBrush);

    auto shift = [&](RECT rc) {
      OffsetRect(&rc, 0, g_viewTop - g_scroll);
      return rc;
    };
    drawLabel(mem, shift(card.titleRc), utf8ToWide(card.item.typeName), RGB(31, 41, 51), true, false, false);
    RECT statusRc = shift(card.titleRc);
    statusRc.right = shift(card.closeRc).left - dp(6);
    drawLabel(mem, statusRc, statusText(card.item.status), statusColor(card.item.status), false, true, false);
    drawLabel(mem, shift(card.closeRc), L"×", RGB(90, 98, 110), true, false, false);
    if (!card.expanded) {
      std::wstring summary;
      if (!card.item.callerName.empty()) summary += utf8ToWide(card.item.callerName);
      if (!card.item.workstationLabel.empty()) {
        if (!summary.empty()) summary += L" · ";
        summary += utf8ToWide(card.item.workstationLabel);
      }
      if (!card.item.content.empty()) {
        if (!summary.empty()) summary += L" · ";
        summary += utf8ToWide(card.item.content);
      }
      if (summary.empty()) summary = L"点击查看";
      drawLabel(mem, shift(card.summaryRc), summary, RGB(92, 107, 122), false, false, false);
    } else {
      int x = card.titleRc.left;
      int right = card.titleRc.right;
      int lineY = card.titleRc.bottom + dp(4);
      auto drawLine = [&](const std::wstring& text) {
        RECT rc{x, lineY, right + dp(28), lineY + dp(22)};
        drawLabel(mem, shift(rc), text, RGB(31, 41, 51), false, false, false);
        lineY += dp(22);
      };
      drawLine(L"呼叫人  " + utf8ToWide(card.item.callerName.empty() ? "-" : card.item.callerName));
      drawLine(L"工位  " + utf8ToWide(card.item.workstationLabel.empty() ? "-" : card.item.workstationLabel));
      drawLine(L"时间  " + (card.item.callTime.empty() ? std::wstring(L"-") : prettyTime(card.item.callTime)));
      std::wstring content = card.item.content.empty() ? L"（无描述）" : utf8ToWide(card.item.content);
      RECT contentRc = shift(card.bodyRc);
      drawLabel(mem, contentRc, L"问题  " + content, RGB(31, 41, 51), false, false, true);
      RECT who{x, card.editRc.top, card.editRc.left - dp(6), card.editRc.bottom};
      drawLabel(mem, shift(who), L"接受人", RGB(31, 41, 51), false, false, false);
      lineY = card.editRc.bottom + dp(4);
      if (!card.item.acceptedAt.empty()) drawLine(L"接受时间  " + prettyTime(card.item.acceptedAt));
      if (!card.item.completedAt.empty()) drawLine(L"完成时间  " + prettyTime(card.item.completedAt));
    }
  }
  for (const auto& hit : g_hits) {
    if (hit.label.empty()) continue;
    RECT rc = hit.rc;
    if (hit.body) OffsetRect(&rc, 0, g_viewTop - g_scroll);
    COLORREF fill = hit.enabled ? hit.fill : RGB(186, 190, 196);
    drawRound(mem, rc, fill, fill, dp(8));
    SelectObject(mem, g_font);
    SetTextColor(mem, RGB(255, 255, 255));
    DrawTextW(mem, hit.label.c_str(), -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
  }
  SelectClipRgn(mem, nullptr);
  if (g_thumbVisible) {
    HBRUSH trackBrush = CreateSolidBrush(RGB(226, 230, 236));
    FillRect(mem, &g_track, trackBrush);
    DeleteObject(trackBrush);
    HBRUSH thumbBrush = CreateSolidBrush(RGB(150, 158, 170));
    FillRect(mem, &g_thumb, thumbBrush);
    DeleteObject(thumbBrush);
  }

  BitBlt(target, 0, 0, width, height, mem, 0, 0, SRCCOPY);
  SelectObject(mem, oldBmp);
  DeleteObject(bmp);
  DeleteDC(mem);
}

int hitTest(int x, int y) {
  POINT pt{x, y};
  if (g_thumbVisible && PtInRect(&g_thumb, pt)) return -2;
  for (int i = static_cast<int>(g_hits.size()) - 1; i >= 0; --i) {
    RECT rc = g_hits[static_cast<size_t>(i)].rc;
    if (g_hits[static_cast<size_t>(i)].body) OffsetRect(&rc, 0, g_viewTop - g_scroll);
    if (PtInRect(&rc, pt)) return i;
  }
  return -1;
}

void fire(const Hit& hit) {
  if (!hit.enabled) return;
  if (hit.action == HitAction::Hide) ShowWindow(g_hwnd, SW_HIDE);
  else if (hit.action == HitAction::Settings) openSettings();
  else if (hit.action == HitAction::CloseCard) dismissCard(hit.id);
  else if (hit.action == HitAction::Expand) toggleCard(hit.id);
  else if (hit.action == HitAction::Accept) submitCard(hit.id, CallAction::Accept);
  else if (hit.action == HitAction::Complete) submitCard(hit.id, CallAction::Complete);
  else if (hit.action == HitAction::Cancel) submitCard(hit.id, CallAction::Cancel);
  else if (hit.action == HitAction::Login) launchLogin(nullptr);
}

std::wstring trimWide(std::wstring text) {
  auto space = [](wchar_t ch) { return ch == L' ' || ch == L'\t' || ch == L'\r' || ch == L'\n'; };
  while (!text.empty() && space(text.front())) text.erase(text.begin());
  while (!text.empty() && space(text.back())) text.pop_back();
  return text;
}

std::wstring controlText(HWND parent, int id) {
  HWND child = GetDlgItem(parent, id);
  if (!child) return L"";
  int count = GetWindowTextLengthW(child);
  std::wstring text(static_cast<size_t>(count + 1), L'\0');
  if (count > 0) GetWindowTextW(child, text.data(), count + 1);
  text.resize(wcslen(text.c_str()));
  return trimWide(text);
}

HWND addChild(HWND parent, const wchar_t* klass, const wchar_t* text, DWORD exStyle, DWORD style, int id, int x, int y, int w, int h) {
  HWND hwnd = CreateWindowExW(exStyle, klass, text, WS_CHILD | WS_VISIBLE | style, x, y, w, h, parent,
                              reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), g_inst, nullptr);
  if (hwnd && g_font) SendMessageW(hwnd, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);
  return hwnd;
}

bool looksLikeUrl(const std::string& text) {
  return text.rfind("http://", 0) == 0 || text.rfind("https://", 0) == 0;
}

void setStatus(HWND hwnd, const std::wstring& text) {
  HWND status = GetDlgItem(hwnd, IDC_SET_STATUS);
  if (status) SetWindowTextW(status, text.c_str());
}

bool saveSettingsFrom(HWND hwnd, bool requireUrl) {
  if (!g_service) return false;
  AppConfig config = g_service->config();
  config.apiBase = trimAscii(wideToUtf8(controlText(hwnd, IDC_SET_URL)));
  config.playSound = SendMessageW(GetDlgItem(hwnd, IDC_SET_SOUND), BM_GETCHECK, 0, 0) == BST_CHECKED;
  config.flashOnNotify = SendMessageW(GetDlgItem(hwnd, IDC_SET_FLASH), BM_GETCHECK, 0, 0) == BST_CHECKED;
  config.alwaysOnTop = g_alwaysOnTop;
  if (requireUrl && config.apiBase.empty()) {
    setStatus(hwnd, L"请先填写接口地址");
    return false;
  }
  if (!config.apiBase.empty() && !looksLikeUrl(config.apiBase)) {
    setStatus(hwnd, L"接口地址需要以 http:// 或 https:// 开头");
    return false;
  }
  bool startup = SendMessageW(GetDlgItem(hwnd, IDC_SET_STARTUP), BM_GETCHECK, 0, 0) == BST_CHECKED;
  g_service->updateConfig(config);
  setStartupEnabled(startup);
  setStatus(hwnd, L"已保存");
  return true;
}

void launchLogin(HWND statusOwner) {
  if (!g_service) return;
  if (statusOwner && !saveSettingsFrom(statusOwner, true)) return;
  AppConfig config = g_service->config();
  std::string root = trimAscii(config.apiBase);
  while (!root.empty() && (root.back() == '/' || root.back() == '\\')) root.pop_back();
  std::wstring status;
  if (root.empty() || !looksLikeUrl(root)) {
    status = L"请先在设置里填写接口地址";
  } else {
    std::wstring url = utf8ToWide(root) + L"/auth/notify-app";
    // SSO 回调落在 localhost。127.0.0.1 是另一个站点，登录后回不到这个页面。
    const std::wstring loopback = L"://127.0.0.1";
    const auto loopbackAt = url.find(loopback);
    if (loopbackAt != std::wstring::npos) url.replace(loopbackAt, loopback.size(), L"://localhost");
    HINSTANCE launched = ShellExecuteW(statusOwner ? statusOwner : g_hwnd, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    status = reinterpret_cast<INT_PTR>(launched) <= 32 ? L"无法打开浏览器" : L"已打开浏览器，登录后点「打开通知APP」";
  }
  if (statusOwner) setStatus(statusOwner, status);
  else if (status != L"已打开浏览器，登录后点「打开通知APP」") {
    g_banner = status;
    layoutPanel();
    updateTip();
  }
}

void logoutAccount(HWND hwnd) {
  if (!g_service) return;
  AppConfig config = g_service->config();
  config.token.clear();
  config.refreshToken.clear();
  config.displayName.clear();
  g_service->updateConfig(config);
  g_displayName.clear();
  g_banner = L"未登录";
  g_open.clear();
  g_popupIds.clear();
  g_expandedId.clear();
  layoutPanel();
  updateTip();
  if (hwnd) refreshAccountRow(hwnd, true);
}

std::wstring accountLabel(const AppConfig& config) {
  if (config.token.empty()) return L"未登录";
  if (config.displayName.empty()) return L"已登录";
  return L"已登录：" + utf8ToWide(config.displayName);
}

void moveControl(HWND parent, int id, int x, int y, int w, int h, bool show) {
  HWND child = GetDlgItem(parent, id);
  if (!child) return;
  SetWindowPos(child, nullptr, x, y, std::max(1, w), std::max(1, h), SWP_NOZORDER | SWP_NOACTIVATE);
  ShowWindow(child, show ? SW_SHOW : SW_HIDE);
}

int textWidth(const std::wstring& text) {
  HDC dc = GetDC(g_hwnd ? g_hwnd : g_settings);
  HGDIOBJ old = SelectObject(dc, g_font ? g_font : GetStockObject(DEFAULT_GUI_FONT));
  SIZE size{};
  GetTextExtentPoint32W(dc, text.c_str(), static_cast<int>(text.size()), &size);
  SelectObject(dc, old);
  ReleaseDC(g_hwnd ? g_hwnd : g_settings, dc);
  return size.cx;
}

void resizeSettings(HWND hwnd, int clientNeed) {
  RECT window{};
  RECT client{};
  GetWindowRect(hwnd, &window);
  GetClientRect(hwnd, &client);
  int chromeH = (window.bottom - window.top) - (client.bottom - client.top);
  int chromeW = (window.right - window.left) - (client.right - client.left);
  int width = (client.right - client.left) + chromeW;
  int height = clientNeed + chromeH;
  SetWindowPos(hwnd, nullptr, 0, 0, width, height, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
}

int placeSettings(HWND hwnd) {
  RECT client{};
  GetClientRect(hwnd, &client);
  int width = std::max(dp(320), static_cast<int>(client.right - client.left));
  int margin = dp(16);
  int contentW = std::max(dp(200), width - margin * 2);
  int y = margin;
  int labelH = dp(22);
  int editH = dp(28);
  int checkH = dp(28);
  int gap = dp(8);
  bool loggedIn = g_service && !g_service->config().token.empty();
  std::wstring account = g_service ? accountLabel(g_service->config()) : L"未登录";
  moveControl(hwnd, IDC_SET_LABEL, margin, y, contentW, labelH, true);
  y += labelH + dp(2);
  moveControl(hwnd, IDC_SET_URL, margin, y, contentW, editH, true);
  y += editH + gap;
  moveControl(hwnd, IDC_SET_HINT, margin, y, contentW, dp(52), true);
  y += dp(52) + gap;
  if (!loggedIn) {
    moveControl(hwnd, IDC_SET_LOGIN, margin, y, dp(120), dp(32), true);
    y += dp(32) + gap;
  } else {
    moveControl(hwnd, IDC_SET_LOGIN, 0, 0, dp(120), dp(32), false);
  }
  moveControl(hwnd, IDC_SET_STARTUP, margin, y, contentW, checkH, true);
  y += checkH;
  moveControl(hwnd, IDC_SET_SOUND, margin, y, contentW, checkH, true);
  y += checkH;
  moveControl(hwnd, IDC_SET_FLASH, margin, y, contentW, checkH, true);
  y += checkH + gap;
  int rowH = dp(32);
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_STATUS), account.c_str());
  if (loggedIn) {
    int buttonW = dp(108);
    int textW = std::min(std::max(dp(48), textWidth(account) + dp(6)), std::max(dp(48), contentW - buttonW - gap));
    moveControl(hwnd, IDC_SET_STATUS, margin, y, textW, rowH, true);
    moveControl(hwnd, IDC_SET_LOGOUT, margin + textW + gap, y + dp(2), buttonW, dp(28), true);
  } else {
    moveControl(hwnd, IDC_SET_STATUS, margin, y, contentW, rowH, true);
    moveControl(hwnd, IDC_SET_LOGOUT, 0, 0, dp(108), dp(28), false);
  }
  y += rowH + gap;
  int half = (contentW - gap) / 2;
  moveControl(hwnd, IDC_SET_SAVE, margin, y, half, dp(32), true);
  moveControl(hwnd, IDC_SET_CLOSE, margin + half + gap, y, contentW - half - gap, dp(32), true);
  return y + dp(32) + margin;
}

bool g_rowReady = false;
bool g_rowLoggedIn = false;
std::string g_rowName;

void refreshAccountRow(HWND hwnd, bool force) {
  if (!hwnd || !IsWindow(hwnd)) return;
  bool loggedIn = g_service && !g_service->config().token.empty();
  std::string name = g_service ? g_service->config().displayName : "";
  if (!force && g_rowReady && loggedIn == g_rowLoggedIn && name == g_rowName) return;
  g_rowReady = true;
  g_rowLoggedIn = loggedIn;
  g_rowName = name;
  int need = placeSettings(hwnd);
  resizeSettings(hwnd, need);
}

void fillSettings(HWND hwnd) {
  if (!g_service) return;
  AppConfig config = g_service->config();
  SetWindowTextW(GetDlgItem(hwnd, IDC_SET_URL), utf8ToWide(config.apiBase).c_str());
  SendMessageW(GetDlgItem(hwnd, IDC_SET_STARTUP), BM_SETCHECK, startupEnabled() ? BST_CHECKED : BST_UNCHECKED, 0);
  SendMessageW(GetDlgItem(hwnd, IDC_SET_SOUND), BM_SETCHECK, config.playSound ? BST_CHECKED : BST_UNCHECKED, 0);
  SendMessageW(GetDlgItem(hwnd, IDC_SET_FLASH), BM_SETCHECK, config.flashOnNotify ? BST_CHECKED : BST_UNCHECKED, 0);
  refreshAccountRow(hwnd, true);
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
  int checkH = dp(28);
  int gap = dp(8);
  addChild(hwnd, L"STATIC", L"接口地址", 0, SS_LEFT, IDC_SET_LABEL, margin, y, contentW, labelH);
  y += labelH + dp(2);
  addChild(hwnd, L"EDIT", L"", WS_EX_CLIENTEDGE, ES_AUTOHSCROLL | WS_TABSTOP, IDC_SET_URL, margin, y, contentW, editH);
  y += editH + gap;
  addChild(hwnd, L"STATIC", L"填 IPS 的访问地址，例如 http://127.0.0.1:6082。点「登录」打开浏览器，成功后在页面上点「打开通知APP」。",
           0, SS_LEFT, IDC_SET_HINT, margin, y, contentW, dp(52));
  y += dp(52) + gap;
  addChild(hwnd, L"BUTTON", L"登录", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_LOGIN, margin, y, dp(120), dp(32));
  y += dp(32) + gap;
  addChild(hwnd, L"BUTTON", L"开机自启动", 0, BS_AUTOCHECKBOX | WS_TABSTOP, IDC_SET_STARTUP, margin, y, contentW, checkH);
  y += checkH;
  addChild(hwnd, L"BUTTON", L"播放声音", 0, BS_AUTOCHECKBOX | WS_TABSTOP, IDC_SET_SOUND, margin, y, contentW, checkH);
  y += checkH;
  addChild(hwnd, L"BUTTON", L"新通知出现时闪动 3 下", 0, BS_AUTOCHECKBOX | WS_TABSTOP, IDC_SET_FLASH, margin, y, contentW, checkH);
  y += checkH + gap;
  addChild(hwnd, L"STATIC", L"", 0, SS_LEFT | SS_CENTERIMAGE, IDC_SET_STATUS, margin, y, contentW, dp(32));
  addChild(hwnd, L"BUTTON", L"退出登录", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_LOGOUT, margin, y, dp(108), dp(28));
  y += dp(32) + gap;
  int half = (contentW - gap) / 2;
  addChild(hwnd, L"BUTTON", L"保存", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_SAVE, margin, y, half, dp(32));
  addChild(hwnd, L"BUTTON", L"关闭", 0, BS_PUSHBUTTON | WS_TABSTOP, IDC_SET_CLOSE, margin + half + gap, y, contentW - half - gap, dp(32));
  return y + dp(32) + margin;
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
      if (LOWORD(wParam) == IDC_SET_SAVE) saveSettingsFrom(hwnd, false);
      else if (LOWORD(wParam) == IDC_SET_LOGIN) launchLogin(hwnd);
      else if (LOWORD(wParam) == IDC_SET_LOGOUT) logoutAccount(hwnd);
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
    wc.lpszClassName = L"NotificationReceiverSettings";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_BTNFACE + 1);
    wc.hIcon = g_iconBig;
    wc.hIconSm = g_iconSmall;
    RegisterClassExW(&wc);
    registered = true;
  }
  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int width = dp(480);
  int height = dp(460);
  int x = work.left + std::max(0, (static_cast<int>(work.right - work.left) - width) / 2);
  int y = work.top + std::max(0, (static_cast<int>(work.bottom - work.top) - height) / 2);
  DWORD exStyle = WS_EX_APPWINDOW;
  if (g_alwaysOnTop) exStyle |= WS_EX_TOPMOST;
  g_settings = CreateWindowExW(exStyle, L"NotificationReceiverSettings", L"设置",
                               WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_CLIPCHILDREN, x, y, width, height, g_hwnd, nullptr,
                               g_inst, nullptr);
  if (!g_settings) return;
  ShowWindow(g_settings, SW_SHOW);
  SetForegroundWindow(g_settings);
}

void applyLoginUrl(const std::wstring& url) {
  std::string text = wideToUtf8(url);
  std::string token = queryParam(text, "token");
  std::string refresh = queryParam(text, "refresh");
  std::string name = queryParam(text, "name");
  if (token.empty() || !g_service) return;
  g_service->setToken(token, name, refresh);
  if (!name.empty()) g_displayName = name;
  g_banner.clear();
  updateTip();
  layoutPanel();
  if (g_settings) refreshAccountRow(g_settings, true);
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
    addTray();
    return 0;
  }
  switch (msg) {
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps{};
      HDC hdc = BeginPaint(hwnd, &ps);
      paint(hdc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_APP_REFRESH: {
      PollSnapshot snap;
      {
        std::lock_guard<std::mutex> lock(g_snapMu);
        snap = g_snap;
      }
      applySnapshot(std::move(snap));
      return 0;
    }
    case WM_APP_SHOW:
      showAll(true);
      return 0;
    case WM_COPYDATA: {
      auto* data = reinterpret_cast<COPYDATASTRUCT*>(lParam);
      if (data && data->dwData == 1 && data->lpData) applyLoginUrl(reinterpret_cast<wchar_t*>(data->lpData));
      return TRUE;
    }
    case WM_TIMER:
      if (wParam == 1) {
        g_flashStep += 1;
        if (g_flashStep >= 6) {
          KillTimer(hwnd, 1);
          g_flashStep = -1;
          SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        } else {
          SetLayeredWindowAttributes(hwnd, 0, (g_flashStep % 2 == 0) ? 150 : 255, LWA_ALPHA);
        }
      }
      return 0;
    case WM_MOUSEWHEEL: {
      int delta = GET_WHEEL_DELTA_WPARAM(wParam);
      if (delta != 0 && g_bodyHeight > g_viewHeight) {
        g_scroll -= (delta / WHEEL_DELTA) * dp(48);
        clampScroll();
        updateThumb();
        positionEdit();
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;
    }
    case WM_LBUTTONDOWN: {
      int x = GET_X_LPARAM(lParam);
      int y = GET_Y_LPARAM(lParam);
      if (g_thumbVisible && PtInRect(&g_thumb, POINT{x, y})) {
        g_dragThumb = true;
        g_dragY = y;
        g_dragScroll = g_scroll;
        SetCapture(hwnd);
        return 0;
      }
      if (g_thumbVisible && PtInRect(&g_track, POINT{x, y})) {
        int page = std::max(dp(48), g_viewHeight * 4 / 5);
        g_scroll += y < g_thumb.top ? -page : page;
        clampScroll();
        updateThumb();
        positionEdit();
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
      }
      g_pressed = hitTest(x, y);
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
        positionEdit();
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
        if (hit >= 0 && hit == g_pressed) fire(g_hits[static_cast<size_t>(hit)]);
        g_pressed = -1;
      }
      return 0;
    case WM_KEYDOWN:
      if (wParam == VK_ESCAPE) ShowWindow(hwnd, SW_HIDE);
      return 0;
    case WM_DISPLAYCHANGE:
    case WM_SETTINGCHANGE:
      layoutPanel();
      return 0;
    case WM_CLOSE:
      ShowWindow(hwnd, SW_HIDE);
      return 0;
    case WM_TRAY:
      if (lParam == WM_LBUTTONUP || lParam == WM_LBUTTONDBLCLK) showAll(true);
      else if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) showTrayMenu();
      return 0;
    case WM_COMMAND:
      if (LOWORD(wParam) == ID_TRAY_SHOW) showAll(true);
      else if (LOWORD(wParam) == ID_TRAY_SETTINGS) openSettings();
      else if (LOWORD(wParam) == ID_TRAY_TOPMOST) {
        g_alwaysOnTop = !g_alwaysOnTop;
        if (g_service) {
          AppConfig config = g_service->config();
          config.alwaysOnTop = g_alwaysOnTop;
          g_service->updateConfig(config);
        }
        SetWindowPos(g_hwnd, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        if (g_settings) {
          SetWindowPos(g_settings, g_alwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
      } else if (LOWORD(wParam) == ID_TRAY_EXIT) {
        DestroyWindow(hwnd);
      }
      return 0;
    case WM_DESTROY:
      g_uiAlive = false;
      KillTimer(hwnd, 1);
      Shell_NotifyIconW(NIM_DELETE, &g_nid);
      if (g_iconSmall && g_iconSmall != g_iconBig) DestroyIcon(g_iconSmall);
      if (g_iconBig) DestroyIcon(g_iconBig);
      g_iconSmall = nullptr;
      g_iconBig = nullptr;
      if (g_font) DeleteObject(g_font);
      if (g_fontBold) DeleteObject(g_fontBold);
      g_font = nullptr;
      g_fontBold = nullptr;
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

}  // namespace

void registerProtocol() {
  wchar_t path[MAX_PATH]{};
  GetModuleFileNameW(nullptr, path, MAX_PATH);
  std::wstring command = L"\"";
  command += path;
  command += L"\" \"%1\"";
  const wchar_t* base = L"Software\\Classes\\notify-receiver";
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, base, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr) != ERROR_SUCCESS) return;
  const wchar_t* desc = L"URL:异常呼叫通知";
  RegSetValueExW(key, nullptr, 0, REG_SZ, reinterpret_cast<const BYTE*>(desc),
                 static_cast<DWORD>((wcslen(desc) + 1) * sizeof(wchar_t)));
  RegSetValueExW(key, L"URL Protocol", 0, REG_SZ, reinterpret_cast<const BYTE*>(L""), sizeof(wchar_t));
  RegCloseKey(key);
  std::wstring commandPath = std::wstring(base) + L"\\shell\\open\\command";
  if (RegCreateKeyExW(HKEY_CURRENT_USER, commandPath.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr) !=
      ERROR_SUCCESS) {
    return;
  }
  RegSetValueExW(key, nullptr, 0, REG_SZ, reinterpret_cast<const BYTE*>(command.c_str()),
                 static_cast<DWORD>((command.size() + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
}

bool createPanel(void* instance, const std::wstring& launchUrl) {
  g_inst = static_cast<HINSTANCE>(instance);
  g_service = new ReceiverService(joinPath(exeDirectory(), "config.json"));
  AppConfig config = g_service->config();
  g_alwaysOnTop = config.alwaysOnTop;
  g_displayName = config.displayName;
  g_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
  g_iconBig = loadAppIcon(GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON));
  g_iconSmall = loadAppIcon(GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON));
  if (!g_iconBig) g_iconBig = LoadIconW(nullptr, IDI_APPLICATION);
  if (!g_iconSmall) g_iconSmall = g_iconBig;

  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = panelProc;
  wc.hInstance = g_inst;
  wc.lpszClassName = L"NotificationReceiverPanel";
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  wc.hIcon = g_iconBig;
  wc.hIconSm = g_iconSmall;
  RegisterClassExW(&wc);

  DWORD exStyle = WS_EX_TOOLWINDOW | WS_EX_LAYERED;
  if (g_alwaysOnTop) exStyle |= WS_EX_TOPMOST;
  g_hwnd = CreateWindowExW(exStyle, wc.lpszClassName, L"异常呼叫", WS_POPUP | WS_CLIPCHILDREN, 0, 0, dp(400), dp(120), nullptr,
                           nullptr, g_inst, nullptr);
  if (!g_hwnd) return false;
  SetLayeredWindowAttributes(g_hwnd, 0, 255, LWA_ALPHA);

  HDC dc = GetDC(g_hwnd);
  int dpi = GetDeviceCaps(dc, LOGPIXELSY);
  if (dpi <= 0) dpi = 96;
  g_dpi = dpi;
  ReleaseDC(g_hwnd, dc);
  g_font = makeFont(dpi, FW_NORMAL);
  g_fontBold = makeFont(dpi, FW_SEMIBOLD);
  g_acceptEdit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"", WS_CHILD | ES_AUTOHSCROLL, 0, 0, 10, 10, g_hwnd,
                                 reinterpret_cast<HMENU>(static_cast<INT_PTR>(IDC_ACCEPT_BY)), g_inst, nullptr);
  if (g_acceptEdit && g_font) SendMessageW(g_acceptEdit, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);

  addTray();
  g_stop = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  g_wake = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_service->setWake([] { if (g_wake) SetEvent(g_wake); });
  if (!launchUrl.empty()) applyLoginUrl(launchUrl);
  layoutPanel();
  g_poller = std::thread(pollLoop);
  return true;
}

void stopReceiver() {
  g_uiAlive = false;
  if (g_stop) SetEvent(g_stop);
  if (g_poller.joinable()) g_poller.join();
  delete g_service;
  g_service = nullptr;
  if (g_stop) CloseHandle(g_stop);
  if (g_wake) CloseHandle(g_wake);
  g_stop = nullptr;
  g_wake = nullptr;
}
