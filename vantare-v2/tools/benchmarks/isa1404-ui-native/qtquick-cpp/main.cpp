#include <QCommandLineParser>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTimer>
#include <QVariantList>

#ifdef Q_OS_WIN
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace {
QVariantList loadRows(const QString &path, QString *error) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        *error = QStringLiteral("cannot open fixture: %1").arg(file.errorString());
        return {};
    }
    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(file.readAll(), &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        *error = QStringLiteral("invalid fixture: %1").arg(parseError.errorString());
        return {};
    }
    const QJsonArray source = document.object().value(QStringLiteral("scene")).toObject().value(QStringLiteral("rows")).toArray();
    QVariantList rows;
    rows.reserve(source.size());
    for (const QJsonValue &value : source) rows.push_back(value.toObject().toVariantMap());
    if (rows.size() != 8) *error = QStringLiteral("fixture must contain exactly 8 rows");
    return rows;
}

bool configureOverlay(QQuickWindow *window) {
    window->setFlag(Qt::FramelessWindowHint, true);
    window->setFlag(Qt::WindowStaysOnTopHint, true);
    window->setFlag(Qt::WindowTransparentForInput, true);
    window->setFlag(Qt::WindowDoesNotAcceptFocus, true);
    window->setColor(Qt::transparent);
    window->show();
#ifdef Q_OS_WIN
    const HWND handle = reinterpret_cast<HWND>(window->winId());
    LONG_PTR style = GetWindowLongPtrW(handle, GWL_EXSTYLE);
    style |= WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_APPWINDOW;
    style &= ~WS_EX_TOOLWINDOW;
    SetLastError(ERROR_SUCCESS);
    if (!SetWindowLongPtrW(handle, GWL_EXSTYLE, style) && GetLastError() != ERROR_SUCCESS) return false;
    if (!SetWindowPos(handle, HWND_TOPMOST, 80, 80, window->width(), window->height(), SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED)) return false;
    ShowWindow(handle, SW_SHOWNOACTIVATE);
#else
    window->show();
#endif
    return true;
}
}

int main(int argc, char **argv) {
    QQuickWindow::setDefaultAlphaBuffer(true);
#ifdef Q_OS_WIN
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D11);
#endif
    QGuiApplication app(argc, argv);
    QCoreApplication::setApplicationName(QStringLiteral("Vantare Qt Quick bakeoff"));
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption({"mode", "Window mode: control or overlay", "mode", "control"});
    parser.addOption({"hide-gap", "Hide the interval column"});
    parser.addOption({"auto-close-ms", "Close automatically after milliseconds", "ms", "0"});
    parser.addOption({"validate-only", "Validate the fixture without opening a window"});
    parser.process(app);
    const bool overlay = parser.value("mode") == QStringLiteral("overlay");
    if (!overlay && parser.value("mode") != QStringLiteral("control")) qFatal("mode must be control or overlay");
    QString fixtureError;
    const QString fixturePath = QCoreApplication::applicationDirPath() + QStringLiteral("/fixture.json");
    const QVariantList rows = loadRows(fixturePath, &fixtureError);
    if (!fixtureError.isEmpty()) qFatal("%s", qPrintable(fixtureError));
    if (parser.isSet("validate-only")) return rows.size() == 8 ? 0 : 2;

    QQmlApplicationEngine engine;
    engine.setInitialProperties({
        {QStringLiteral("overlayMode"), overlay},
        {QStringLiteral("initialShowGap"), !parser.isSet("hide-gap")},
        {QStringLiteral("fixtureRows"), rows},
    });
    engine.loadFromModule(QStringLiteral("Vantare.NativeBakeoff"), QStringLiteral("Main"));
    if (engine.rootObjects().isEmpty()) return 3;
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    if (!window) return 4;
    if (overlay) {
        if (!configureOverlay(window)) return 5;
    } else {
        window->show();
    }
    bool ok = false;
    const int closeMS = parser.value("auto-close-ms").toInt(&ok);
    if (ok && closeMS > 0) QTimer::singleShot(closeMS, &app, &QCoreApplication::quit);
    return app.exec();
}
