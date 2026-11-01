#pragma once

#include <string>

void registerProtocol();
bool createPanel(void* instance, const std::wstring& launchUrl);
void stopReceiver();
