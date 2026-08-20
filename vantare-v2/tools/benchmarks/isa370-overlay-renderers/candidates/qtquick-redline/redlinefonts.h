#pragma once

#include <QString>

struct RedlineFontLoadResult {
    QString family;
    QString error;
    int loadedWeights = 0;

    [[nodiscard]] bool ok() const { return error.isEmpty(); }
};

class RedlineFonts final
{
public:
    [[nodiscard]] static RedlineFontLoadResult loadPackaged();
};
