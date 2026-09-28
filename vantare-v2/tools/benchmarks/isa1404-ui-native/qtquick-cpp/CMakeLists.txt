cmake_minimum_required(VERSION 3.22)
project(vantare_isa1404_qtquick LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(Qt6 6.10 REQUIRED COMPONENTS Core Gui Quick QuickControls2)
qt_standard_project_setup(REQUIRES 6.10)
qt_add_executable(vantare-qtquick-bakeoff main.cpp)
qt_add_qml_module(vantare-qtquick-bakeoff URI Vantare.NativeBakeoff VERSION 1.0 QML_FILES Main.qml)
target_link_libraries(vantare-qtquick-bakeoff PRIVATE Qt6::Core Qt6::Gui Qt6::Quick Qt6::QuickControls2)
if(WIN32)
  target_link_libraries(vantare-qtquick-bakeoff PRIVATE user32)
endif()
add_custom_command(TARGET vantare-qtquick-bakeoff POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/../shared/fixture.json"
    "$<TARGET_FILE_DIR:vantare-qtquick-bakeoff>/fixture.json")
