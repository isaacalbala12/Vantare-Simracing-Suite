#pragma once

class QQuickWindow;

class OverlayWindow final
{
public:
    [[nodiscard]] static bool configure(QQuickWindow *window);
};
