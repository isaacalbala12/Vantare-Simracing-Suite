cmake_minimum_required(VERSION 3.21)
project(vantare_widget_admin VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Widgets Test)

add_library(widget_matrix STATIC widget_matrix.cpp widget_matrix.h)
target_link_libraries(widget_matrix PUBLIC Qt6::Core)

add_executable(vantare-widget-admin WIN32 main.cpp)
target_link_libraries(vantare-widget-admin PRIVATE widget_matrix Qt6::Widgets)

enable_testing()
add_executable(widget_matrix_test widget_matrix_test.cpp)
target_link_libraries(widget_matrix_test PRIVATE widget_matrix Qt6::Test)
add_test(NAME widget_matrix_test COMMAND widget_matrix_test)
