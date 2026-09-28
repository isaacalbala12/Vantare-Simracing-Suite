#include <QCommandLineParser>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTimer>

#ifdef Q_OS_WIN
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

class OverlayFeed final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList standings READ standings NOTIFY changed)
    Q_PROPERTY(QVariantList relative READ relative NOTIFY changed)
    Q_PROPERTY(QVariantMap player READ player NOTIFY changed)
    Q_PROPERTY(QVariantMap session READ session NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QString sessionId READ sessionId NOTIFY changed)

public:
    explicit OverlayFeed(QUrl endpoint, QObject *parent = nullptr) : QObject(parent), endpoint_(std::move(endpoint)) {
        connectFeed();
    }
    QVariantList standings() const { return standings_; }
    QVariantList relative() const { return relative_; }
    QVariantMap player() const { return player_; }
    QVariantMap session() const { return session_; }
    QString state() const { return state_; }
    QString sessionId() const { return sessionId_; }
    int snapshotCount() const { return snapshotCount_; }

signals:
    void changed();

private:
    void connectFeed() {
        QNetworkRequest request(endpoint_);
        request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        auto *reply = network_.get(request);
        connect(reply, &QIODevice::readyRead, this, [this, reply] {
            pending_.append(reply->readAll());
            if (pending_.size() > 4 * 1024 * 1024) {
                state_ = QStringLiteral("Go snapshot exceeds limit");
                emit changed();
                reply->abort();
                return;
            }
            qsizetype boundary;
            while ((boundary = pending_.indexOf("\n\n")) >= 0) {
                const QByteArray block = pending_.left(boundary);
                pending_.remove(0, boundary + 2);
                QByteArray eventName;
                QByteArray payload;
                for (const QByteArray &line : block.split('\n')) {
                    if (line.startsWith("event: ")) eventName = line.mid(7).trimmed();
                    if (line.startsWith("data: ")) payload = line.mid(6).trimmed();
                }
                if (eventName != "telemetry:overlay-v2:snapshot") continue;
                QJsonParseError parseError;
                const auto document = QJsonDocument::fromJson(payload, &parseError);
                if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
                    state_ = QStringLiteral("invalid Go snapshot");
                    emit changed();
                    continue;
                }
                const auto root = document.object();
                const auto frame = root.value(QStringLiteral("frame")).toObject();
                if (frame.value(QStringLiteral("contract")).toInt() != 2) {
                    state_ = QStringLiteral("unsupported Go contract");
                    emit changed();
                    continue;
                }
                standings_ = frame.value(QStringLiteral("standings")).toArray().toVariantList();
                relative_ = frame.value(QStringLiteral("relative")).toArray().toVariantList();
                player_ = frame.value(QStringLiteral("player")).toObject().toVariantMap();
                session_ = frame.value(QStringLiteral("session")).toObject().toVariantMap();
                sessionId_ = frame.value(QStringLiteral("sessionId")).toString();
                state_ = root.value(QStringLiteral("source")).toObject().value(QStringLiteral("state")).toString();
                ++snapshotCount_;
                emit changed();
            }
        });
        connect(reply, &QNetworkReply::finished, this, [this, reply] {
            pending_.clear();
            state_ = QStringLiteral("reconnecting");
            emit changed();
            reply->deleteLater();
            QTimer::singleShot(1000, this, [this] { connectFeed(); });
        });
    }

    QNetworkAccessManager network_;
    QUrl endpoint_;
    QByteArray pending_;
    QVariantList standings_;
    QVariantList relative_;
    QVariantMap player_;
    QVariantMap session_;
    QString state_ = QStringLiteral("connecting");
    QString sessionId_;
    int snapshotCount_ = 0;
};

static bool showOverlay(QQuickWindow *window) {
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
#endif
    return true;
}

int main(int argc, char **argv) {
    QQuickWindow::setDefaultAlphaBuffer(true);
#ifdef Q_OS_WIN
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D11);
#endif
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption({"endpoint", "Loopback Overlay V2 SSE endpoint", "url"});
    parser.addOption({"mode", "control, editor or overlay", "mode", "control"});
    parser.addOption({"auto-close-ms", "Close automatically after milliseconds", "ms", "0"});
    parser.addOption({"screenshot", "Save this Qt window as a PNG after 1200 ms", "path"});
    parser.addOption({"expect-rows", "Exit successfully after receiving this many Go standings rows", "count", "0"});
    parser.addOption({"expect-snapshots", "Require this many Go snapshots; use 2 for a restart probe", "count", "1"});
    parser.process(app);
    const QUrl endpoint(parser.value("endpoint"));
    if (!endpoint.isValid() || endpoint.scheme() != QStringLiteral("http") ||
        (endpoint.host() != QStringLiteral("127.0.0.1") && endpoint.host() != QStringLiteral("::1")) ||
        endpoint.path() != QStringLiteral("/telemetry/overlay-v2/projection")) {
        qCritical("--endpoint must be the loopback Overlay V2 projection URL");
        return 2;
    }
    const bool overlay = parser.value("mode") == QStringLiteral("overlay");
    const bool editor = parser.value("mode") == QStringLiteral("editor");
    if (!overlay && !editor && parser.value("mode") != QStringLiteral("control")) return 2;
    OverlayFeed feed(endpoint);
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("feed"), &feed);
    engine.setInitialProperties({{QStringLiteral("overlayMode"), overlay}, {QStringLiteral("editorMode"), editor}});
    engine.loadFromModule(QStringLiteral("Vantare.NativeGoTrial"), QStringLiteral("Main"));
    if (engine.rootObjects().isEmpty()) return 3;
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    if (!window) return 4;
    if (overlay) {
        if (!showOverlay(window)) return 5;
    } else {
        window->show();
    }
    if (parser.isSet("screenshot")) {
        const QString path = parser.value("screenshot");
        QTimer::singleShot(1200, window, [window, path] {
            if (!window->grabWindow().save(path)) qCritical("could not save Qt window screenshot");
        });
    }
    bool ok = false;
    const int closeMS = parser.value("auto-close-ms").toInt(&ok);
    if (ok && closeMS > 0) QTimer::singleShot(closeMS, &app, &QCoreApplication::quit);
    const int expectedRows = parser.value("expect-rows").toInt(&ok);
    if (!ok || expectedRows < 0) return 2;
    const int expectedSnapshots = parser.value("expect-snapshots").toInt(&ok);
    if (!ok || expectedSnapshots < 1) return 2;
    if (expectedRows > 0) {
        QObject::connect(&feed, &OverlayFeed::changed, &app, [&feed, expectedRows, expectedSnapshots, &app] {
            if (feed.standings().size() == expectedRows && feed.snapshotCount() >= expectedSnapshots)
                QTimer::singleShot(0, &app, &QCoreApplication::quit);
        });
        QTimer::singleShot(expectedSnapshots > 1 ? 15000 : 5000, &app, [&feed, expectedRows, expectedSnapshots] {
            if (feed.standings().size() != expectedRows || feed.snapshotCount() < expectedSnapshots)
                QCoreApplication::exit(6);
        });
    }
    return app.exec();
}

#include "main.moc"
