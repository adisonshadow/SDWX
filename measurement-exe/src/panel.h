#pragma once

class TaskService;

void* createPanel(void* instance, TaskService& tasks);
void notifyPanel(bool focusLatest);
