QT += core gui qml quick testlib
CONFIG += testcase console c++20
CONFIG -= app_bundle
TEMPLATE = app
TARGET = test_relative_foundation

SOURCES += \
    test_relative_foundation.cpp \
    ../replaymodels.cpp

HEADERS += \
    ../replaymodels.h \
    ../replayloader.h

DEFINES += RELATIVE_QML_PATH=\\\"$$clean_path($$PWD/../qml/relative/RelativeRedline.qml)\\\"
