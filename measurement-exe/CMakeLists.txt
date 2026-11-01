cmake_minimum_required(VERSION 3.20)
cmake_policy(SET CMP0091 NEW)

project(measurement-adapter LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(measurement-adapter WIN32
  src/main.cpp
  src/util.cpp
  src/standard.cpp
  src/logs.cpp
  src/mock_collect.cpp
  src/callback.cpp
  src/tasks.cpp
  src/http_server.cpp
  src/panel.cpp
  src/device_probe.cpp
  app.manifest
  app.rc
)

target_include_directories(measurement-adapter PRIVATE src third_party ${CMAKE_CURRENT_SOURCE_DIR})

target_compile_definitions(measurement-adapter PRIVATE
  _WIN32_WINNT=0x0601
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  UNICODE
  _UNICODE
)

if(MSVC)
  target_compile_options(measurement-adapter PRIVATE /utf-8 /W3 /EHsc /bigobj)
else()
  target_compile_options(measurement-adapter PRIVATE -finput-charset=UTF-8 -fexec-charset=UTF-8)
  target_link_options(measurement-adapter PRIVATE -static -static-libgcc -static-libstdc++)
endif()

target_link_libraries(measurement-adapter PRIVATE ws2_32 winhttp comctl32 shell32 user32 gdi32 gdiplus msimg32 ole32 advapi32 setupapi cfgmgr32)

add_custom_command(TARGET measurement-adapter POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/standard-params.json"
          "$<TARGET_FILE_DIR:measurement-adapter>/standard-params.json"
  VERBATIM)
