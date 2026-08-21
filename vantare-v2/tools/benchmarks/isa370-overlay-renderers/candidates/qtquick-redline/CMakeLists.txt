cmake_minimum_required(VERSION 3.22)

project(isa370_qtquick_redline VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Qt6 6.10 REQUIRED COMPONENTS Core Gui Quick)
qt_standard_project_setup(REQUIRES 6.10)

set(REDLINE_CORE_SOURCES
    replayloader.cpp replayloader.h
    replaymodels.cpp replaymodels.h
    redlinefonts.cpp redlinefonts.h
    sceneplayback.cpp sceneplayback.h
    qtmotiontrace.cpp qtmotiontrace.h
)

qt_add_executable(isa370_qtquick_redline
    main.cpp
    overlaywindow.cpp overlaywindow.h
    ${REDLINE_CORE_SOURCES}
)

qt_add_qml_module(isa370_qtquick_redline
    URI Vantare.RedlineBench
    VERSION 1.0
    QML_FILES
        Main.qml
        qml/theme/RedlineTokens.qml
        qml/common/Panel.qml
        qml/common/Slot.qml
        qml/common/Status.qml
        qml/standings/Battle.qml
        qml/standings/ClassBlock.qml
        qml/standings/FastestGlyph.qml
        qml/standings/StandingsRedline.qml
        qml/standings/StandingsRow.qml
        qml/delta/DeltaRedline.qml
        qml/pedals/PedalRail.qml
        qml/pedals/PedalsRedline.qml
        qml/relative/ApproachIndicator.qml
        qml/relative/CrossingBudget.qml
        qml/relative/MirrorRelative.qml
        qml/relative/ProximityRelative.qml
        qml/relative/RelativeAxis.qml
        qml/relative/RelativeModelRow.qml
        qml/relative/RelativeRedline.qml
        qml/relative/RelativeRow.qml
        qml/relative/RelativeTokens.qml
        qml/relative/TrafficRelative.qml
)

target_link_libraries(isa370_qtquick_redline PRIVATE Qt6::Core Qt6::Quick)

set(REDLINE_REPLAY_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../../replay/redline-viewmodels-v1.jsonl")
set(REDLINE_MANIFEST_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../../replay/redline-viewmodels-v1.manifest.json")
function(package_redline_replay target)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:${target}>/replay"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${REDLINE_REPLAY_SOURCE}"
            "$<TARGET_FILE_DIR:${target}>/replay/redline-viewmodels-v1.jsonl"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${REDLINE_MANIFEST_SOURCE}"
            "$<TARGET_FILE_DIR:${target}>/replay/redline-viewmodels-v1.manifest.json"
        VERBATIM
    )
endfunction()
package_redline_replay(isa370_qtquick_redline)

set(REDLINE_FONT_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/assets/fonts/barlow-semi-condensed")
function(package_redline_fonts target)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:${target}>/fonts"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${REDLINE_FONT_SOURCE}/BarlowSemiCondensed-Regular.ttf"
            "${REDLINE_FONT_SOURCE}/BarlowSemiCondensed-SemiBold.ttf"
            "${REDLINE_FONT_SOURCE}/BarlowSemiCondensed-Bold.ttf"
            "${REDLINE_FONT_SOURCE}/BarlowSemiCondensed-ExtraBold.ttf"
            "${REDLINE_FONT_SOURCE}/OFL.txt"
            "$<TARGET_FILE_DIR:${target}>/fonts"
        VERBATIM
    )
endfunction()
package_redline_fonts(isa370_qtquick_redline)
if(WIN32)
    target_link_libraries(isa370_qtquick_redline PRIVATE user32)
endif()
if(MSVC)
    # Qt's generated QML cache instantiates templates that trigger C4702 inside
    # Qt 6.10.2 headers. Keep /WX for the candidate while suppressing only that
    # third-party generated-code diagnostic.
    target_compile_options(isa370_qtquick_redline PRIVATE /utf-8 /W4 /WX /wd4702)
endif()

include(CTest)
if(BUILD_TESTING)
    find_package(Qt6 6.10 REQUIRED COMPONENTS Test)
    qt_add_executable(isa370_qtquick_redline_tests
        tests/redline_replay_test.cpp
        ${REDLINE_CORE_SOURCES}
    )
    set_target_properties(isa370_qtquick_redline_tests PROPERTIES WIN32_EXECUTABLE FALSE)
    target_include_directories(isa370_qtquick_redline_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    target_link_libraries(isa370_qtquick_redline_tests PRIVATE Qt6::Core Qt6::Gui Qt6::Quick Qt6::Test)
    if(MSVC)
        target_compile_options(isa370_qtquick_redline_tests PRIVATE /utf-8 /W4 /WX)
    endif()
    package_redline_replay(isa370_qtquick_redline_tests)
    package_redline_fonts(isa370_qtquick_redline_tests)
    add_test(NAME isa370_qtquick_redline_core COMMAND isa370_qtquick_redline_tests)
    set_tests_properties(isa370_qtquick_redline_core PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    find_program(QMLTESTRUNNER_EXECUTABLE
        NAMES qmltestrunner qmltestrunner.exe
        HINTS "${Qt6_DIR}/../../../bin"
        REQUIRED
    )
    add_test(
        NAME isa370_qtquick_redline_delta_pedals
        COMMAND "${QMLTESTRUNNER_EXECUTABLE}"
            -input "${CMAKE_CURRENT_SOURCE_DIR}/tests/tst_delta_pedals_contract.qml"
            -import "${CMAKE_CURRENT_SOURCE_DIR}/qml"
            -o -,txt
    )
    set_tests_properties(isa370_qtquick_redline_delta_pedals PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QPA_FONTDIR=C:\\Windows\\Fonts"
    )
    qt_add_executable(isa370_qtquick_redline_relative_tests
        tests/test_relative_foundation.cpp
        replaymodels.cpp replaymodels.h replayloader.h
    )
    set_target_properties(isa370_qtquick_redline_relative_tests PROPERTIES WIN32_EXECUTABLE FALSE)
    target_include_directories(isa370_qtquick_redline_relative_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    target_compile_definitions(isa370_qtquick_redline_relative_tests PRIVATE
        RELATIVE_QML_PATH="${CMAKE_CURRENT_SOURCE_DIR}/qml/relative/RelativeRedline.qml"
    )
    target_link_libraries(isa370_qtquick_redline_relative_tests PRIVATE
        Qt6::Core Qt6::Gui Qt6::Quick Qt6::Test
    )
    if(MSVC)
        target_compile_options(isa370_qtquick_redline_relative_tests PRIVATE /utf-8 /W4 /WX)
    endif()
    add_test(NAME isa370_qtquick_redline_relative COMMAND isa370_qtquick_redline_relative_tests)
    set_tests_properties(isa370_qtquick_redline_relative PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;QT_QPA_FONTDIR=C:\\Windows\\Fonts"
        TIMEOUT 15
    )
    qt_add_executable(isa370_qtquick_redline_motion_trace_tests
        tests/qtmotiontrace_test.cpp
        qtmotiontrace.cpp qtmotiontrace.h
        replayloader.h
    )
    set_target_properties(isa370_qtquick_redline_motion_trace_tests PROPERTIES WIN32_EXECUTABLE FALSE)
    target_include_directories(isa370_qtquick_redline_motion_trace_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    target_link_libraries(isa370_qtquick_redline_motion_trace_tests PRIVATE Qt6::Core Qt6::Test)
    if(MSVC)
        target_compile_options(isa370_qtquick_redline_motion_trace_tests PRIVATE /utf-8 /W4 /WX)
    endif()
    add_test(NAME isa370_qtquick_redline_motion_trace COMMAND isa370_qtquick_redline_motion_trace_tests)
endif()
