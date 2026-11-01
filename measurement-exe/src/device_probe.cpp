#include "device_probe.h"

#include <windows.h>
#include <setupapi.h>
#include <cfgmgr32.h>
#include <commctrl.h>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr UINT WM_READER_DONE = WM_APP + 20;
constexpr UINT WM_READER_LOG = WM_APP + 21;
constexpr int IDC_SCAN = 1201;
constexpr int IDC_LIST = 1202;
constexpr int IDC_BAUD = 1203;
constexpr int IDC_DATA = 1204;
constexpr int IDC_PARITY = 1205;
constexpr int IDC_STOP = 1206;
constexpr int IDC_OPEN = 1207;
constexpr int IDC_HEX = 1208;
constexpr int IDC_SEND_EDIT = 1209;
constexpr int IDC_SEND = 1210;
constexpr int IDC_CLEAR = 1211;
constexpr int IDC_LOG = 1212;
constexpr int IDC_HINT = 1213;
constexpr int IDC_STATUS = 1214;

const GUID kComPortGuid = {0x86E0D1E0, 0x8089, 0x11D0, {0x9C, 0xE4, 0x08, 0x00, 0x3E, 0x30, 0x1F, 0x73}};
const GUID kUsbDeviceGuid = {0xA5DCBF10, 0x6530, 0x11D2, {0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED}};

struct ProbeDevice {
  std::wstring kind;
  std::wstring name;
  std::wstring port;
  std::wstring protocol;
  std::wstring allowText;
  bool allow = false;
  std::wstring instanceId;
};

struct ProbeState {
  HWND hwnd = nullptr;
  HFONT font = nullptr;
  int dpi = 96;
  std::vector<ProbeDevice> devices;
  int selected = -1;
  HANDLE port = INVALID_HANDLE_VALUE;
  std::thread reader;
  std::atomic<bool> stop{false};
  HICON iconBig = nullptr;
  HICON iconSmall = nullptr;
};

ProbeState* g_state = nullptr;
HWND g_window = nullptr;

int dp(const ProbeState* state, int value) { return MulDiv(value, state && state->dpi > 0 ? state->dpi : 96, 96); }

std::wstring regValue(HKEY key, const wchar_t* name) {
  DWORD type = 0;
  DWORD bytes = 0;
  if (RegQueryValueExW(key, name, nullptr, &type, nullptr, &bytes) != ERROR_SUCCESS || type != REG_SZ || bytes < sizeof(wchar_t)) {
    return L"";
  }
  std::wstring text(bytes / sizeof(wchar_t), L'\0');
  if (RegQueryValueExW(key, name, nullptr, &type, reinterpret_cast<BYTE*>(&text[0]), &bytes) != ERROR_SUCCESS) return L"";
  while (!text.empty() && text.back() == L'\0') text.pop_back();
  return text;
}

std::wstring deviceProperty(HDEVINFO info, SP_DEVINFO_DATA* device, DWORD property) {
  DWORD type = 0;
  DWORD bytes = 0;
  SetupDiGetDeviceRegistryPropertyW(info, device, property, &type, nullptr, 0, &bytes);
  if (bytes < sizeof(wchar_t)) return L"";
  std::vector<wchar_t> buffer(bytes / sizeof(wchar_t) + 1, L'\0');
  if (!SetupDiGetDeviceRegistryPropertyW(info, device, property, &type, reinterpret_cast<BYTE*>(buffer.data()), bytes, nullptr)) {
    return L"";
  }
  return buffer[0] ? std::wstring(buffer.data()) : L"";
}

std::wstring deviceId(DEVINST node) {
  wchar_t text[MAX_DEVICE_ID_LEN];
  if (CM_Get_Device_IDW(node, text, MAX_DEVICE_ID_LEN, 0) != CR_SUCCESS) return L"";
  return text;
}

std::vector<std::wstring> ancestorIds(DEVINST node) {
  std::vector<std::wstring> ids;
  for (int i = 0; i < 16; ++i) {
    DEVINST parent = 0;
    if (CM_Get_Parent(&parent, node, 0) != CR_SUCCESS) break;
    std::wstring id = deviceId(parent);
    if (!id.empty()) ids.push_back(id);
    node = parent;
  }
  return ids;
}

bool containsUsb(const std::wstring& text) {
  std::wstring upper = text;
  for (wchar_t& ch : upper) {
    if (ch >= L'a' && ch <= L'z') ch = static_cast<wchar_t>(ch - L'a' + L'A');
  }
  return upper.find(L"USB\\") != std::wstring::npos || upper.find(L"USB") != std::wstring::npos;
}

int comNumber(const std::wstring& port) {
  if (port.size() < 4) return 10000;
  return _wtoi(port.c_str() + 3);
}

std::vector<ProbeDevice> scanDevices() {
  std::vector<ProbeDevice> devices;
  std::vector<std::wstring> usedByCom;
  HDEVINFO comInfo = SetupDiGetClassDevsW(&kComPortGuid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
  if (comInfo != INVALID_HANDLE_VALUE) {
    SP_DEVICE_INTERFACE_DATA iface{};
    iface.cbSize = sizeof(iface);
    for (DWORD index = 0; SetupDiEnumDeviceInterfaces(comInfo, nullptr, &kComPortGuid, index, &iface); ++index) {
      DWORD bytes = 0;
      SetupDiGetDeviceInterfaceDetailW(comInfo, &iface, nullptr, 0, &bytes, nullptr);
      if (bytes < sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W)) continue;
      std::vector<unsigned char> buffer(bytes);
      auto* detail = reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W*>(buffer.data());
      detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W);
      SP_DEVINFO_DATA device{};
      device.cbSize = sizeof(device);
      if (!SetupDiGetDeviceInterfaceDetailW(comInfo, &iface, detail, bytes, nullptr, &device)) continue;
      HKEY key = SetupDiOpenDevRegKey(comInfo, &device, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
      std::wstring port = key == INVALID_HANDLE_VALUE ? L"" : regValue(key, L"PortName");
      if (key != INVALID_HANDLE_VALUE) RegCloseKey(key);
      if (port.empty()) continue;
      bool duplicated = false;
      for (const auto& item : devices) {
        if (item.port == port) duplicated = true;
      }
      if (duplicated) continue;
      ProbeDevice row;
      row.port = port;
      row.instanceId = deviceId(device.DevInst);
      row.name = deviceProperty(comInfo, &device, SPDRP_FRIENDLYNAME);
      if (row.name.empty()) row.name = deviceProperty(comInfo, &device, SPDRP_DEVICEDESC);
      if (row.name.empty()) row.name = port;
      std::wstring hardware = deviceProperty(comInfo, &device, SPDRP_HARDWAREID);
      bool usb = containsUsb(hardware) || containsUsb(row.name);
      if (!usb) {
        for (const auto& ancestor : ancestorIds(device.DevInst)) {
          if (containsUsb(ancestor)) usb = true;
        }
      }
      row.kind = usb ? L"USB转串口" : L"COM口";
      row.protocol = L"Modbus RTU";
      row.allow = true;
      row.allowText = L"是";
      usedByCom.push_back(row.instanceId);
      for (const auto& ancestor : ancestorIds(device.DevInst)) usedByCom.push_back(ancestor);
      devices.push_back(std::move(row));
    }
    SetupDiDestroyDeviceInfoList(comInfo);
  }

  HDEVINFO usbInfo = SetupDiGetClassDevsW(&kUsbDeviceGuid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
  if (usbInfo != INVALID_HANDLE_VALUE) {
    SP_DEVICE_INTERFACE_DATA iface{};
    iface.cbSize = sizeof(iface);
    for (DWORD index = 0; SetupDiEnumDeviceInterfaces(usbInfo, nullptr, &kUsbDeviceGuid, index, &iface); ++index) {
      DWORD bytes = 0;
      SetupDiGetDeviceInterfaceDetailW(usbInfo, &iface, nullptr, 0, &bytes, nullptr);
      if (bytes < sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W)) continue;
      std::vector<unsigned char> buffer(bytes);
      auto* detail = reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W*>(buffer.data());
      detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W);
      SP_DEVINFO_DATA device{};
      device.cbSize = sizeof(device);
      if (!SetupDiGetDeviceInterfaceDetailW(usbInfo, &iface, detail, bytes, nullptr, &device)) continue;
      std::wstring id = deviceId(device.DevInst);
      bool used = false;
      for (const auto& known : usedByCom) {
        if (known == id) used = true;
      }
      if (used || id.empty()) continue;
      std::wstring name = deviceProperty(usbInfo, &device, SPDRP_FRIENDLYNAME);
      if (name.empty()) name = deviceProperty(usbInfo, &device, SPDRP_DEVICEDESC);
      std::wstring upper = name;
      for (wchar_t& ch : upper) {
        if (ch >= L'a' && ch <= L'z') ch = static_cast<wchar_t>(ch - L'a' + L'A');
      }
      const wchar_t* skip[] = {L"HUB", L"集线器", L"鼠标", L"MOUSE", L"键盘", L"KEYBOARD", L"蓝牙", L"BLUETOOTH",
                               L"音频", L"AUDIO", L"显示器", L"MONITOR", L"打印机", L"PRINTER", L"摄像头", L"CAMERA",
                               L"HID", L"输入"};
      bool consumer = false;
      for (const wchar_t* word : skip) {
        if (upper.find(word) != std::wstring::npos) consumer = true;
      }
      if (consumer) continue;
      ProbeDevice row;
      row.kind = L"USB";
      row.instanceId = id;
      row.name = name.empty() ? id : name;
      row.port = L"—";
      row.protocol = L"—";
      row.allow = false;
      row.allowText = L"否";
      devices.push_back(std::move(row));
    }
    SetupDiDestroyDeviceInfoList(usbInfo);
  }

  std::stable_sort(devices.begin(), devices.end(), [](const ProbeDevice& a, const ProbeDevice& b) {
    if (a.allow != b.allow) return a.allow && !b.allow;
    if (a.port != b.port) return comNumber(a.port) < comNumber(b.port);
    return a.name < b.name;
  });
  return devices;
}

std::wstring nowTime() {
  SYSTEMTIME time{};
  GetLocalTime(&time);
  wchar_t text[16];
  wsprintfW(text, L"%02u:%02u:%02u", time.wHour, time.wMinute, time.wSecond);
  return text;
}

std::wstring toHex(const unsigned char* data, size_t size) {
  static const wchar_t* digits = L"0123456789ABCDEF";
  std::wstring text;
  text.reserve(size * 3);
  for (size_t i = 0; i < size; ++i) {
    if (i) text.push_back(L' ');
    text.push_back(digits[data[i] >> 4]);
    text.push_back(digits[data[i] & 0x0F]);
  }
  return text;
}

bool parseHex(const std::wstring& text, std::vector<unsigned char>& out, std::wstring& error) {
  out.clear();
  int nibble = -1;
  for (wchar_t ch : text) {
    if (ch == L' ' || ch == L'\t' || ch == L'\r' || ch == L'\n' || ch == L',' || ch == L';') {
      if (nibble >= 0) {
        error = L"十六进制需要成对的字符";
        return false;
      }
      continue;
    }
    int value = -1;
    if (ch >= L'0' && ch <= L'9') value = ch - L'0';
    else if (ch >= L'a' && ch <= L'f') value = ch - L'a' + 10;
    else if (ch >= L'A' && ch <= L'F') value = ch - L'A' + 10;
    else if (ch == L'x' || ch == L'X') continue;
    else {
      error = L"十六进制里有无法识别的字符";
      return false;
    }
    if (nibble < 0) nibble = value;
    else {
      out.push_back(static_cast<unsigned char>((nibble << 4) | value));
      nibble = -1;
    }
  }
  if (nibble >= 0) {
    error = L"十六进制需要成对的字符";
    return false;
  }
  if (out.empty()) error = L"没有可发送的数据";
  return !out.empty();
}

void appendLog(HWND hwnd, const std::wstring& line) {
  HWND edit = GetDlgItem(hwnd, IDC_LOG);
  if (!edit) return;
  std::wstring text = line + L"\r\n";
  int length = GetWindowTextLengthW(edit);
  if (length > 60000) SetWindowTextW(edit, L"");
  length = GetWindowTextLengthW(edit);
  SendMessageW(edit, EM_SETSEL, length, length);
  SendMessageW(edit, EM_REPLACESEL, FALSE, reinterpret_cast<LPARAM>(text.c_str()));
}

void postLog(HWND hwnd, std::wstring line) {
  if (!hwnd) return;
  auto* text = new std::wstring(std::move(line));
  if (!PostMessageW(hwnd, WM_READER_LOG, 0, reinterpret_cast<LPARAM>(text))) delete text;
}

void readerMain(ProbeState* state) {
  HANDLE port = state->port;
  HWND hwnd = state->hwnd;
  while (!state->stop.load()) {
    unsigned char buffer[256];
    DWORD read = 0;
    if (!ReadFile(port, buffer, sizeof(buffer), &read, nullptr)) break;
    if (read == 0) continue;
    postLog(hwnd, nowTime() + L"  接收  " + std::to_wstring(read) + L" 字节  " + toHex(buffer, read));
  }
  postLog(hwnd, nowTime() + L"  串口读取已停止");
  PostMessageW(hwnd, WM_READER_DONE, 0, 0);
}

DWORD selectedDword(HWND combo, const DWORD* values, int count, DWORD fallback) {
  int index = static_cast<int>(SendMessageW(combo, CB_GETCURSEL, 0, 0));
  if (index < 0 || index >= count) return fallback;
  return values[index];
}

bool configurePort(HANDLE port, HWND hwnd) {
  DCB dcb{};
  dcb.DCBlength = sizeof(dcb);
  if (!GetCommState(port, &dcb)) return false;
  const DWORD baudValues[] = {CBR_9600, CBR_19200, CBR_38400, CBR_57600, CBR_115200};
  const DWORD dataValues[] = {8, 7};
  const DWORD parityValues[] = {NOPARITY, EVENPARITY, ODDPARITY};
  const DWORD stopValues[] = {ONESTOPBIT, TWOSTOPBITS};
  dcb.BaudRate = selectedDword(GetDlgItem(hwnd, IDC_BAUD), baudValues, 5, CBR_9600);
  dcb.ByteSize = static_cast<BYTE>(selectedDword(GetDlgItem(hwnd, IDC_DATA), dataValues, 2, 8));
  dcb.Parity = static_cast<BYTE>(selectedDword(GetDlgItem(hwnd, IDC_PARITY), parityValues, 3, NOPARITY));
  dcb.StopBits = static_cast<BYTE>(selectedDword(GetDlgItem(hwnd, IDC_STOP), stopValues, 2, ONESTOPBIT));
  dcb.fBinary = TRUE;
  dcb.fParity = dcb.Parity != NOPARITY;
  dcb.fOutxCtsFlow = FALSE;
  dcb.fOutxDsrFlow = FALSE;
  dcb.fDtrControl = DTR_CONTROL_ENABLE;
  dcb.fRtsControl = RTS_CONTROL_ENABLE;
  dcb.fOutX = FALSE;
  dcb.fInX = FALSE;
  if (!SetCommState(port, &dcb)) return false;
  COMMTIMEOUTS timeouts{};
  timeouts.ReadIntervalTimeout = 50;
  timeouts.ReadTotalTimeoutConstant = 200;
  timeouts.ReadTotalTimeoutMultiplier = 0;
  timeouts.WriteTotalTimeoutConstant = 500;
  timeouts.WriteTotalTimeoutMultiplier = 0;
  return SetCommTimeouts(port, &timeouts) == TRUE;
}

void setLineEnabled(HWND hwnd, bool enabled) {
  EnableWindow(GetDlgItem(hwnd, IDC_BAUD), enabled);
  EnableWindow(GetDlgItem(hwnd, IDC_DATA), enabled);
  EnableWindow(GetDlgItem(hwnd, IDC_PARITY), enabled);
  EnableWindow(GetDlgItem(hwnd, IDC_STOP), enabled);
}

void closePort(ProbeState* state) {
  if (!state) return;
  state->stop.store(true);
  if (state->reader.joinable()) state->reader.join();
  if (state->port != INVALID_HANDLE_VALUE) {
    CloseHandle(state->port);
    state->port = INVALID_HANDLE_VALUE;
  }
  state->stop.store(false);
  if (state->hwnd) {
    SetWindowTextW(GetDlgItem(state->hwnd, IDC_OPEN), L"打开串口");
    setLineEnabled(state->hwnd, true);
    EnableWindow(GetDlgItem(state->hwnd, IDC_SEND), FALSE);
  }
}

void fillList(ProbeState* state) {
  HWND list = GetDlgItem(state->hwnd, IDC_LIST);
  ListView_DeleteAllItems(list);
  for (int i = 0; i < static_cast<int>(state->devices.size()); ++i) {
    const ProbeDevice& device = state->devices[static_cast<size_t>(i)];
    LVITEMW item{};
    item.mask = LVIF_TEXT | LVIF_PARAM;
    item.iItem = i;
    item.pszText = const_cast<wchar_t*>(device.kind.c_str());
    item.lParam = i;
    ListView_InsertItem(list, &item);
    ListView_SetItemText(list, i, 1, const_cast<wchar_t*>(device.name.c_str()));
    ListView_SetItemText(list, i, 2, const_cast<wchar_t*>(device.port.c_str()));
    ListView_SetItemText(list, i, 3, const_cast<wchar_t*>(device.protocol.c_str()));
    ListView_SetItemText(list, i, 4, const_cast<wchar_t*>(device.allowText.c_str()));
  }
  state->selected = state->devices.empty() ? -1 : 0;
  if (state->selected >= 0) ListView_SetItemState(list, 0, LVIS_SELECTED | LVIS_FOCUSED, LVIS_SELECTED | LVIS_FOCUSED);
}

void updateSelection(ProbeState* state) {
  HWND list = GetDlgItem(state->hwnd, IDC_LIST);
  int index = ListView_GetNextItem(list, -1, LVNI_SELECTED);
  state->selected = index;
  std::wstring status = L"未选择设备";
  bool canOpen = false;
  if (index >= 0 && index < static_cast<int>(state->devices.size())) {
    const ProbeDevice& device = state->devices[static_cast<size_t>(index)];
    status = device.kind + L"  " + device.name + L"  协议 " + device.protocol + L"  允许采集 " + device.allowText;
    if (!device.allow) status += L"。原生 USB 这一阶段不能按串口收发";
    canOpen = device.allow && state->port == INVALID_HANDLE_VALUE;
  }
  SetWindowTextW(GetDlgItem(state->hwnd, IDC_STATUS), status.c_str());
  if (state->port == INVALID_HANDLE_VALUE) EnableWindow(GetDlgItem(state->hwnd, IDC_OPEN), canOpen ? TRUE : FALSE);
}

void rescan(ProbeState* state) {
  closePort(state);
  state->devices = scanDevices();
  fillList(state);
  updateSelection(state);
  std::wstring summary = L"扫描完成，共 " + std::to_wstring(state->devices.size()) + L" 个设备";
  appendLog(state->hwnd, nowTime() + L"  " + summary);
}

void openSelected(ProbeState* state) {
  if (state->port != INVALID_HANDLE_VALUE) {
    appendLog(state->hwnd, nowTime() + L"  关闭串口");
    closePort(state);
    updateSelection(state);
    return;
  }
  if (state->selected < 0 || state->selected >= static_cast<int>(state->devices.size())) return;
  const ProbeDevice& device = state->devices[static_cast<size_t>(state->selected)];
  if (!device.allow || device.port.empty() || device.port == L"—") return;
  std::wstring path = L"\\\\.\\" + device.port;
  HANDLE port = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (port == INVALID_HANDLE_VALUE) {
    appendLog(state->hwnd, nowTime() + L"  无法打开 " + device.port + L"，可能正被其他程序占用");
    return;
  }
  if (!configurePort(port, state->hwnd)) {
    CloseHandle(port);
    appendLog(state->hwnd, nowTime() + L"  无法设置 " + device.port + L" 的串口参数");
    return;
  }
  PurgeComm(port, PURGE_RXCLEAR | PURGE_TXCLEAR);
  state->port = port;
  state->stop.store(false);
  state->reader = std::thread(readerMain, state);
  SetWindowTextW(GetDlgItem(state->hwnd, IDC_OPEN), L"关闭串口");
  setLineEnabled(state->hwnd, false);
  EnableWindow(GetDlgItem(state->hwnd, IDC_SEND), TRUE);
  appendLog(state->hwnd, nowTime() + L"  已打开 " + device.port + L"，协议 " + device.protocol);
}

void sendCurrent(ProbeState* state) {
  if (state->port == INVALID_HANDLE_VALUE) return;
  HWND edit = GetDlgItem(state->hwnd, IDC_SEND_EDIT);
  int length = GetWindowTextLengthW(edit);
  std::wstring text(static_cast<size_t>(length + 1), L'\0');
  GetWindowTextW(edit, &text[0], length + 1);
  text.resize(wcslen(text.c_str()));
  std::vector<unsigned char> bytes;
  bool hex = SendMessageW(GetDlgItem(state->hwnd, IDC_HEX), BM_GETCHECK, 0, 0) == BST_CHECKED;
  if (hex) {
    std::wstring error;
    if (!parseHex(text, bytes, error)) {
      appendLog(state->hwnd, nowTime() + L"  " + error);
      return;
    }
  } else {
    int bytesNeeded = WideCharToMultiByte(CP_ACP, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    if (bytesNeeded <= 0) {
      appendLog(state->hwnd, nowTime() + L"  没有可发送的数据");
      return;
    }
    bytes.resize(static_cast<size_t>(bytesNeeded));
    WideCharToMultiByte(CP_ACP, 0, text.c_str(), static_cast<int>(text.size()), reinterpret_cast<char*>(bytes.data()), bytesNeeded, nullptr, nullptr);
  }
  DWORD written = 0;
  if (!WriteFile(state->port, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr)) {
    appendLog(state->hwnd, nowTime() + L"  发送失败");
    return;
  }
  appendLog(state->hwnd, nowTime() + L"  发送  " + std::to_wstring(written) + L" 字节  " + toHex(bytes.data(), written));
}

HWND addControl(HWND parent, const wchar_t* klass, const wchar_t* text, DWORD style, int id, int x, int y, int w, int h, HFONT font) {
  HWND hwnd = CreateWindowExW(0, klass, text, WS_CHILD | WS_VISIBLE | style, x, y, w, h, parent,
                              reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), nullptr, nullptr);
  if (hwnd && font) SendMessageW(hwnd, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  return hwnd;
}

void fillCombo(HWND combo, const wchar_t* const* items, int count, int selected) {
  for (int i = 0; i < count; ++i) SendMessageW(combo, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(items[i]));
  SendMessageW(combo, CB_SETCURSEL, selected, 0);
}

void layoutProbe(ProbeState* state) {
  HWND hwnd = state->hwnd;
  RECT client{};
  GetClientRect(hwnd, &client);
  int width = client.right - client.left;
  int margin = dp(state, 14);
  int gap = dp(state, 8);
  int contentW = std::max(dp(state, 240), width - margin * 2);
  int y = margin;
  int labelH = dp(state, 22);
  int buttonH = dp(state, 30);
  addControl(hwnd, L"STATIC", L"本窗口只识别设备和收发原始字节，不解析寄存器，也不换算测量值。", 0, IDC_HINT, margin, y, contentW - dp(state, 120), labelH, state->font);
  addControl(hwnd, L"BUTTON", L"重新扫描", BS_PUSHBUTTON | WS_TABSTOP, IDC_SCAN, margin + contentW - dp(state, 110), y - dp(state, 4), dp(state, 110), buttonH, state->font);
  y += buttonH + gap;
  HWND list = addControl(hwnd, WC_LISTVIEWW, L"", WS_BORDER | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS | WS_TABSTOP, IDC_LIST, margin, y, contentW, dp(state, 180), state->font);
  ListView_SetExtendedListViewStyle(list, LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_GRIDLINES);
  const wchar_t* headers[] = {L"通道", L"设备", L"端口", L"协议", L"允许采集"};
  int widths[] = {dp(state, 90), contentW - dp(state, 360), dp(state, 80), dp(state, 110), dp(state, 80)};
  for (int i = 0; i < 5; ++i) {
    LVCOLUMNW column{};
    column.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_FMT;
    column.fmt = LVCFMT_LEFT;
    column.cx = widths[i];
    column.pszText = const_cast<wchar_t*>(headers[i]);
    ListView_InsertColumn(list, i, &column);
  }
  y += dp(state, 180) + gap;
  addControl(hwnd, L"STATIC", L"", SS_LEFT, IDC_STATUS, margin, y, contentW, labelH, state->font);
  y += labelH + gap;
  int comboW = dp(state, 110);
  int comboH = dp(state, 200);
  addControl(hwnd, L"STATIC", L"波特率", SS_LEFT, 0, margin, y, dp(state, 50), labelH, state->font);
  HWND baud = addControl(hwnd, L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, IDC_BAUD, margin + dp(state, 52), y - dp(state, 2), comboW, comboH, state->font);
  addControl(hwnd, L"STATIC", L"数据位", SS_LEFT, 0, margin + dp(state, 176), y, dp(state, 50), labelH, state->font);
  HWND data = addControl(hwnd, L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, IDC_DATA, margin + dp(state, 226), y - dp(state, 2), dp(state, 70), comboH, state->font);
  addControl(hwnd, L"STATIC", L"校验", SS_LEFT, 0, margin + dp(state, 310), y, dp(state, 40), labelH, state->font);
  HWND parity = addControl(hwnd, L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, IDC_PARITY, margin + dp(state, 350), y - dp(state, 2), dp(state, 70), comboH, state->font);
  addControl(hwnd, L"STATIC", L"停止位", SS_LEFT, 0, margin + dp(state, 434), y, dp(state, 50), labelH, state->font);
  HWND stop = addControl(hwnd, L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, IDC_STOP, margin + dp(state, 486), y - dp(state, 2), dp(state, 70), comboH, state->font);
  addControl(hwnd, L"BUTTON", L"打开串口", BS_PUSHBUTTON | WS_TABSTOP, IDC_OPEN, margin + contentW - dp(state, 110), y - dp(state, 2), dp(state, 110), buttonH, state->font);
  const wchar_t* baudItems[] = {L"9600", L"19200", L"38400", L"57600", L"115200"};
  const wchar_t* dataItems[] = {L"8", L"7"};
  const wchar_t* parityItems[] = {L"无", L"偶", L"奇"};
  const wchar_t* stopItems[] = {L"1", L"2"};
  fillCombo(baud, baudItems, 5, 0);
  fillCombo(data, dataItems, 2, 0);
  fillCombo(parity, parityItems, 3, 0);
  fillCombo(stop, stopItems, 2, 0);
  y += buttonH + gap;
  addControl(hwnd, L"BUTTON", L"十六进制发送", BS_AUTOCHECKBOX | WS_TABSTOP, IDC_HEX, margin, y, dp(state, 130), labelH, state->font);
  SendMessageW(GetDlgItem(hwnd, IDC_HEX), BM_SETCHECK, BST_CHECKED, 0);
  addControl(hwnd, L"EDIT", L"", WS_BORDER | ES_AUTOHSCROLL | WS_TABSTOP, IDC_SEND_EDIT, margin + dp(state, 136), y - dp(state, 2), contentW - dp(state, 250), buttonH, state->font);
  addControl(hwnd, L"BUTTON", L"发送", BS_PUSHBUTTON | WS_TABSTOP, IDC_SEND, margin + contentW - dp(state, 200), y - dp(state, 2), dp(state, 80), buttonH, state->font);
  addControl(hwnd, L"BUTTON", L"清空记录", BS_PUSHBUTTON | WS_TABSTOP, IDC_CLEAR, margin + contentW - dp(state, 110), y - dp(state, 2), dp(state, 110), buttonH, state->font);
  EnableWindow(GetDlgItem(hwnd, IDC_SEND), FALSE);
  EnableWindow(GetDlgItem(hwnd, IDC_OPEN), FALSE);
  y += buttonH + gap;
  addControl(hwnd, L"EDIT", L"", WS_BORDER | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | WS_VSCROLL | WS_TABSTOP, IDC_LOG, margin, y, contentW, dp(state, 160), state->font);
}

LRESULT CALLBACK probeProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  ProbeState* state = reinterpret_cast<ProbeState*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
  switch (msg) {
    case WM_CREATE: {
      auto* created = new ProbeState();
      created->hwnd = hwnd;
      HDC dc = GetDC(hwnd);
      created->dpi = GetDeviceCaps(dc, LOGPIXELSY);
      if (created->dpi <= 0) created->dpi = 96;
      ReleaseDC(hwnd, dc);
      created->font = CreateFontW(-MulDiv(9, created->dpi, 72), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                                  OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei");
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(created));
      g_state = created;
      layoutProbe(created);
      rescan(created);
      return 0;
    }
    case WM_COMMAND:
      if (!state) return 0;
      if (LOWORD(wParam) == IDC_SCAN) rescan(state);
      else if (LOWORD(wParam) == IDC_OPEN) openSelected(state);
      else if (LOWORD(wParam) == IDC_SEND) sendCurrent(state);
      else if (LOWORD(wParam) == IDC_CLEAR) SetWindowTextW(GetDlgItem(hwnd, IDC_LOG), L"");
      return 0;
    case WM_NOTIFY:
      if (state && reinterpret_cast<NMHDR*>(lParam)->idFrom == IDC_LIST &&
          (reinterpret_cast<NMHDR*>(lParam)->code == LVN_ITEMCHANGED)) {
        auto* change = reinterpret_cast<NMLISTVIEW*>(lParam);
        if ((change->uNewState & LVIS_SELECTED) || (change->uOldState & LVIS_SELECTED)) updateSelection(state);
      }
      return 0;
    case WM_READER_LOG: {
      auto* text = reinterpret_cast<std::wstring*>(lParam);
      if (text) {
        appendLog(hwnd, *text);
        delete text;
      }
      return 0;
    }
    case WM_READER_DONE:
      if (!state) return 0;
      if (state->reader.joinable()) state->reader.join();
      if (state->port != INVALID_HANDLE_VALUE) {
        CloseHandle(state->port);
        state->port = INVALID_HANDLE_VALUE;
        SetWindowTextW(GetDlgItem(hwnd, IDC_OPEN), L"打开串口");
        setLineEnabled(hwnd, true);
        EnableWindow(GetDlgItem(hwnd, IDC_SEND), FALSE);
        updateSelection(state);
      }
      return 0;
    case WM_CLOSE:
      DestroyWindow(hwnd);
      return 0;
    case WM_DESTROY:
      if (state) {
        closePort(state);
        if (state->font) DeleteObject(state->font);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        delete state;
      }
      if (g_state && g_state->hwnd == hwnd) g_state = nullptr;
      if (g_window == hwnd) g_window = nullptr;
      return 0;
    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

}  // namespace

void openDeviceProbe(HWND owner) {
  if (g_window && IsWindow(g_window)) {
    ShowWindow(g_window, SW_SHOW);
    SetForegroundWindow(g_window);
    return;
  }
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_LISTVIEW_CLASSES | ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&controls);
  HINSTANCE instance = owner ? reinterpret_cast<HINSTANCE>(GetWindowLongPtrW(owner, GWLP_HINSTANCE)) : GetModuleHandleW(nullptr);
  static bool registered = false;
  if (!registered) {
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = probeProc;
    wc.hInstance = instance;
    wc.lpszClassName = L"MeasurementAdapterDeviceProbe";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_BTNFACE + 1);
    wc.hIcon = owner ? reinterpret_cast<HICON>(SendMessageW(owner, WM_GETICON, ICON_BIG, 0)) : nullptr;
    wc.hIconSm = owner ? reinterpret_cast<HICON>(SendMessageW(owner, WM_GETICON, ICON_SMALL, 0)) : nullptr;
    RegisterClassExW(&wc);
    registered = true;
  }
  HDC screen = GetDC(nullptr);
  int dpi = GetDeviceCaps(screen, LOGPIXELSY);
  ReleaseDC(nullptr, screen);
  if (dpi <= 0) dpi = 96;
  int width = MulDiv(760, dpi, 96);
  int height = MulDiv(640, dpi, 96);
  RECT work{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int x = work.left + std::max(0, (static_cast<int>(work.right - work.left) - width) / 2);
  int y = work.top + std::max(0, (static_cast<int>(work.bottom - work.top) - height) / 2);
  DWORD exStyle = WS_EX_APPWINDOW;
  if (owner && (GetWindowLongPtrW(owner, GWL_EXSTYLE) & WS_EX_TOPMOST)) exStyle |= WS_EX_TOPMOST;
  g_window = CreateWindowExW(exStyle, L"MeasurementAdapterDeviceProbe", L"设备检测",
                             WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_CLIPCHILDREN, x, y, width, height, owner, nullptr, instance, nullptr);
  if (!g_window) return;
  ShowWindow(g_window, SW_SHOW);
  SetForegroundWindow(g_window);
}
