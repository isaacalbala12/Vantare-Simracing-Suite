#include "redlinefonts.h"

#include <QCoreApplication>
#include <QFontDatabase>

namespace {
constexpr auto familyName = "Barlow Semi Condensed";
constexpr const char *fontFiles[] = {
    "BarlowSemiCondensed-Regular.ttf",
    "BarlowSemiCondensed-SemiBold.ttf",
    "BarlowSemiCondensed-Bold.ttf",
    "BarlowSemiCondensed-ExtraBold.ttf",
};
} // namespace

RedlineFontLoadResult RedlineFonts::loadPackaged()
{
    RedlineFontLoadResult result;
    result.family = QString::fromLatin1(familyName);
    const QString directory = QCoreApplication::applicationDirPath() + QStringLiteral("/fonts/");
    for (const char *fileName : fontFiles) {
        const int fontId = QFontDatabase::addApplicationFont(directory + QString::fromLatin1(fileName));
        if (fontId < 0) {
            result.error = QStringLiteral("cannot load packaged Redline font: %1")
                               .arg(QString::fromLatin1(fileName));
            return result;
        }
        const QStringList families = QFontDatabase::applicationFontFamilies(fontId);
        if (!families.contains(result.family)) {
            result.error = QStringLiteral("packaged font has unexpected family: %1")
                               .arg(QString::fromLatin1(fileName));
            return result;
        }
        ++result.loadedWeights;
    }
    return result;
}
