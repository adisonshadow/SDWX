cmake_minimum_required(VERSION 3.20)
cmake_policy(SET CMP0091 NEW)

project(notification-receiver LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(notification-receiver WIN32
  src/main.cpp
  src/util.cpp
  src/http.cpp
  src/sound.cpp
  src/client.cpp
  src/panel.cpp
  app.manifest
  app.rc
)

target_include_directories(notification-receiver PRIVATE
  src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/../measurement-exe/third_party
)

target_compile_definitions(notification-receiver PRIVATE
  _WIN32_WINNT=0x0601
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  UNICODE
  _UNICODE
)

if(MSVC)
  target_compile_options(notification-receiver PRIVATE /utf-8 /W3 /EHsc)
else()
  target_compile_options(notification-receiver PRIVATE -finput-charset=UTF-8 -fexec-charset=UTF-8)
  target_link_options(notification-receiver PRIVATE -static -static-libgcc -static-libstdc++)
endif()

target_link_libraries(notification-receiver PRIVATE winhttp winmm comctl32 shell32 user32 gdi32 advapi32)
