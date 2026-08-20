#include "overlaywindow.h"

#include <QQuickWindow>

#ifdef Q_OS_WIN
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

bool OverlayWindow::configure(QQuickWindow *window)
{
    if (window == nullptr) {
        return false;
    }
    window->setFlag(Qt::FramelessWindowHint, true);
    window->setFlag(Qt::WindowStaysOnTopHint, true);
    window->setFlag(Qt::WindowTransparentForInput, true);
    window->setFlag(Qt::WindowDoesNotAcceptFocus, true);
    window->setFlag(Qt::Tool, true);
    window->setColor(Qt::transparent);

#ifdef Q_OS_WIN
    window->create();
    const HWND hwnd = reinterpret_cast<HWND>(window->winId());
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    style |= WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW;
    style &= ~WS_EX_APPWINDOW;
    SetLastError(ERROR_SUCCESS);
    const LONG_PTR previous = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style);
    if (previous == 0 && GetLastError() != ERROR_SUCCESS) {
        return false;
    }
    window->setVisible(true);
    if (!SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, window->width(), window->height(),
                      SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED)) {
        return false;
    }
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
#else
    window->show();
#endif
    return true;
}
