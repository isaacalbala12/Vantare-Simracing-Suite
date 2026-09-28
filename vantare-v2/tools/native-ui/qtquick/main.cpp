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
#include <algorithm>

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
    Q_PROPERTY(QVariantList efficiencyRows READ efficiencyRows NOTIFY efficiencyChanged)
    Q_PROPERTY(QString efficiencyClock READ efficiencyClock NOTIFY efficiencyChanged)
    Q_PROPERTY(QString efficiencyClass READ efficiencyClass NOTIFY efficiencyChanged)
    Q_PROPERTY(QString efficiencyFooter READ efficiencyFooter NOTIFY efficiencyChanged)

public:
    explicit OverlayFeed(QUrl endpoint, bool efficiency, bool forceWidgetRefresh, QObject *parent = nullptr) : QObject(parent), endpoint_(std::move(endpoint)), efficiency_(efficiency), forceWidgetRefresh_(forceWidgetRefresh) {
        connectFeed();
    }
    QVariantList standings() const { return standings_; }
    QVariantList relative() const { return relative_; }
    QVariantMap player() const { return player_; }
    QVariantMap session() const { return session_; }
    QString state() const { return state_; }
    QString sessionId() const { return sessionId_; }
    int snapshotCount() const { return snapshotCount_; }
    int rowCount() const { return rowCount_; }
    QVariantList efficiencyRows() const { return efficiencyRows_; }
    QString efficiencyClock() const { return efficiencyClock_; }
    QString efficiencyClass() const { return efficiencyClass_; }
    QString efficiencyFooter() const { return efficiencyFooter_; }

signals:
    void changed();
    void efficiencyChanged();

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
                const auto standings = frame.value(QStringLiteral("standings")).toArray();
                rowCount_ = standings.size();
                if (efficiency_) {
                    const auto playerId = frame.value(QStringLiteral("player")).toObject().value(QStringLiteral("id")).toString();
                    QVariantList rows;
                    rows.reserve(std::min(10, rowCount_));
                    QString activeClass = QStringLiteral("—");
                    for (int i = 0; i < std::min(10, rowCount_); ++i) {
                        const auto row = standings.at(i).toObject();
                        const auto q = row.value(QStringLiteral("q")).toObject();
                        const auto baseQuality = q.value(QStringLiteral("q")).toString();
                        const bool isPlayer = !playerId.isEmpty() && row.value(QStringLiteral("id")).toString() == playerId;
                        const auto classId = row.value(QStringLiteral("classId")).toString();
                        if (isPlayer) activeClass = classId;
                        const auto usable = [&q, &baseQuality](QString field) {
                            const auto quality = q.value(field).toString(baseQuality);
                            return quality == QStringLiteral("fresh");
                        };
                        const double gap = row.value(QStringLiteral("gap")).toDouble();
                        const double lap = row.value(QStringLiteral("bestLap")).toDouble();
                        const auto gapText = row.value(QStringLiteral("position")).toInt() == 1 ? QStringLiteral("LÍDER")
                            : usable(QStringLiteral("gap")) && gap != 0
                                ? QStringLiteral("%1%2s").arg(gap > 0 ? QStringLiteral("+") : QString()).arg(gap, 0, 'f', 2)
                                : QStringLiteral("—");
                        const qint64 milliseconds = qRound64(lap * 1000);
                        const auto lapText = usable(QStringLiteral("bestLap")) && lap > 0
                            ? QStringLiteral("%1:%2.%3").arg(milliseconds / 60000).arg((milliseconds / 1000) % 60, 2, 10, QChar('0')).arg(milliseconds % 1000, 3, 10, QChar('0'))
                            : QStringLiteral("—");
                        rows.append(QVariantMap{{QStringLiteral("position"), row.value(QStringLiteral("position")).toInt()},
                            {QStringLiteral("driver"), row.value(QStringLiteral("driver")).toString().toUpper()},
                            {QStringLiteral("gap"), gapText}, {QStringLiteral("bestLap"), lapText}, {QStringLiteral("player"), isPlayer}});
                    }
                    if (activeClass == QStringLiteral("—")) {
                        for (const auto &entry : standings) {
                            const auto row = entry.toObject();
                            if (row.value(QStringLiteral("id")).toString() == playerId) {
                                activeClass = row.value(QStringLiteral("classId")).toString();
                                break;
                            }
                        }
                        if (activeClass == QStringLiteral("—") && !standings.isEmpty())
                            activeClass = standings.first().toObject().value(QStringLiteral("classId")).toString();
                    }
                    const auto remaining = frame.value(QStringLiteral("session")).toObject().value(QStringLiteral("remaining")).toObject();
                    const auto seconds = static_cast<int>(remaining.value(QStringLiteral("v")).toDouble());
                    const auto clock = remaining.value(QStringLiteral("q")).toString() != QStringLiteral("fresh") || seconds < 0
                        ? QStringLiteral("—")
                        : seconds >= 3600
                            ? QStringLiteral("%1:%2:%3").arg(seconds / 3600, 2, 10, QChar('0')).arg((seconds % 3600) / 60, 2, 10, QChar('0')).arg(seconds % 60, 2, 10, QChar('0'))
                            : QStringLiteral("%1:%2").arg(seconds / 60, 2, 10, QChar('0')).arg(seconds % 60, 2, 10, QChar('0'));
                    const auto trackField = frame.value(QStringLiteral("session")).toObject().value(QStringLiteral("track")).toObject();
                    const auto track = trackField.value(QStringLiteral("q")).toString() == QStringLiteral("fresh") && !trackField.value(QStringLiteral("v")).toString().isEmpty()
                        ? trackField.value(QStringLiteral("v")).toString(QStringLiteral("—")) : QStringLiteral("—");
                    const auto lapsField = frame.value(QStringLiteral("fuel")).toObject().value(QStringLiteral("sessionLaps")).toObject();
                    const auto laps = lapsField.value(QStringLiteral("q")).toString() == QStringLiteral("fresh")
                        ? QStringLiteral("≈%1").arg(lapsField.value(QStringLiteral("v")).toInt()) : QStringLiteral("—");
                    const auto footer = QStringLiteral("CIRCUITO %1     VUELTAS %2").arg(track, laps);
                    if (forceWidgetRefresh_ || rows != efficiencyRows_ || clock != efficiencyClock_ || activeClass != efficiencyClass_ || footer != efficiencyFooter_) {
                        efficiencyRows_ = std::move(rows);
                        efficiencyClock_ = clock;
                        efficiencyClass_ = activeClass;
                        efficiencyFooter_ = footer;
                        emit efficiencyChanged();
                    }
                    ++snapshotCount_;
                    emit changed();
                    continue;
                }
                standings_ = standings.toVariantList();
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
    int rowCount_ = 0;
    bool efficiency_ = false;
    bool forceWidgetRefresh_ = false;
    QVariantList efficiencyRows_;
    QString efficiencyClock_ = QStringLiteral("—");
    QString efficiencyClass_ = QStringLiteral("—");
    QString efficiencyFooter_ = QStringLiteral("CIRCUITO —     VUELTAS —");
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
    parser.addOption({"mode", "control, editor, overlay or efficiency", "mode", "control"});
    parser.addOption({"auto-close-ms", "Close automatically after milliseconds", "ms", "0"});
    parser.addOption({"screenshot", "Save this Qt window as a PNG after 1200 ms", "path"});
    parser.addOption({"expect-rows", "Exit successfully after receiving this many Go standings rows", "count", "0"});
    parser.addOption({"expect-snapshots", "Require this many Go snapshots; use 2 for a restart probe", "count", "1"});
    parser.addOption({"force-widget-refresh", "Diagnostic: refresh the widget for every snapshot"});
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
    const bool efficiency = parser.value("mode") == QStringLiteral("efficiency");
    if (!overlay && !editor && !efficiency && parser.value("mode") != QStringLiteral("control")) return 2;
    OverlayFeed feed(endpoint, efficiency, parser.isSet("force-widget-refresh"));
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("feed"), &feed);
    engine.setInitialProperties({{QStringLiteral("overlayMode"), overlay}, {QStringLiteral("editorMode"), editor}, {QStringLiteral("efficiencyMode"), efficiency}});
    engine.loadFromModule(QStringLiteral("Vantare.NativeGoTrial"), QStringLiteral("Main"));
    if (engine.rootObjects().isEmpty()) return 3;
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    if (!window) return 4;
    if (overlay) {
        if (!showOverlay(window)) return 5;
    } else {
        if (efficiency) {
            window->setFlag(Qt::FramelessWindowHint, true);
            window->setFlag(Qt::WindowStaysOnTopHint, true);
            window->setColor(Qt::transparent);
        }
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
            if (feed.rowCount() == expectedRows && feed.snapshotCount() >= expectedSnapshots)
                QTimer::singleShot(0, &app, &QCoreApplication::quit);
        });
        QTimer::singleShot(expectedSnapshots > 1 ? 15000 : 5000, &app, [&feed, expectedRows, expectedSnapshots] {
            if (feed.rowCount() != expectedRows || feed.snapshotCount() < expectedSnapshots)
                QCoreApplication::exit(6);
        });
    }
    return app.exec();
}

#include "main.moc"
