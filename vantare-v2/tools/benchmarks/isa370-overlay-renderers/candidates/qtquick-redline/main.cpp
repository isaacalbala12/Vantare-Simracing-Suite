#include "overlaywindow.h"
#include "qtmotiontrace.h"
#include "redlinefonts.h"
#include "replayloader.h"
#include "replaymodels.h"
#include "sceneplayback.h"

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTimer>

namespace {
QString configuredPath(const char *environmentName, const char *fallback)
{
    const QString configured = qEnvironmentVariable(environmentName).trimmed();
    return configured.isEmpty() ? QString::fromUtf8(fallback) : configured;
}

QString packagedReplayPath(const QString &fileName)
{
    return QCoreApplication::applicationDirPath() + QStringLiteral("/replay/") + fileName;
}
} // namespace

int main(int argc, char *argv[])
{
    QQuickWindow::setDefaultAlphaBuffer(true);
#ifdef Q_OS_WIN
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D11);
#endif
    QGuiApplication application(argc, argv);
    QCoreApplication::setApplicationName(QStringLiteral("ISA-370 Qt Quick Redline visual spike"));

    const RedlineFontLoadResult fonts = RedlineFonts::loadPackaged();
    if (!fonts.ok()) {
        qCritical().noquote() << fonts.error;
        return 5;
    }

    const QByteArray defaultReplay = packagedReplayPath(QStringLiteral("redline-viewmodels-v1.jsonl")).toUtf8();
    const QByteArray defaultManifest = packagedReplayPath(QStringLiteral("redline-viewmodels-v1.manifest.json")).toUtf8();
    const QString replayPath = configuredPath("VANTARE_REDLINE_REPLAY", defaultReplay.constData());
    const QString manifestPath = configuredPath("VANTARE_REDLINE_MANIFEST", defaultManifest.constData());
    const QString configuredScene = qEnvironmentVariable("VANTARE_REDLINE_SCENE").trimmed();
    const QString sceneId = configuredScene.isEmpty() ? QStringLiteral("standings-full") : configuredScene;
    const QString configuredVariant = qEnvironmentVariable("VANTARE_REDLINE_VARIANT").trimmed().toLower();
    const QString relativeVariant = configuredVariant.isEmpty() ? QStringLiteral("mirror") : configuredVariant;
    if (relativeVariant != QStringLiteral("mirror")
        && relativeVariant != QStringLiteral("proximity")
        && relativeVariant != QStringLiteral("traffic")) {
        qCritical().noquote() << QStringLiteral("unsupported Redline Relative variant: %1")
                                     .arg(relativeVariant);
        return 6;
    }
    const bool reducedMotion = qEnvironmentVariableIntValue("VANTARE_REDLINE_REDUCED_MOTION") == 1;
    const bool showHeader = qEnvironmentVariable("VANTARE_REDLINE_SHOW_HEADER").trimmed() != QStringLiteral("0");
    ReplayLoadResult loaded = ReplayLoader::load(replayPath, manifestPath, sceneId);
    if (!loaded.ok()) {
        qCritical().noquote() << QStringLiteral("replay rejected: %1").arg(loaded.error);
        return 2;
    }

    StandingsModel standings;
    RelativeModel relative;
    DeltaModel delta;
    PedalsModel pedals;
    ScenePlayback playback;
    QtMotionTrace motionTrace(qEnvironmentVariable("VANTARE_QT_MOTION_TRACE"),
                              loaded.custody.replaySha256, loaded.records.size());
    if (!motionTrace.error().isEmpty()) {
        qCritical().noquote() << motionTrace.error();
        return 7;
    }
    int traceFrame = 0;
    QObject::connect(&playback, &ScenePlayback::recordAdvanced, &application,
                     [&](const ReplayRecord &record) {
                         motionTrace.beginRecord(record, traceFrame);
                         standings.apply(record);
                         relative.apply(record);
                         delta.apply(record);
                         pedals.apply(record);
                         motionTrace.endRecord(record, traceFrame);
                         ++traceFrame;
                     });

    QQmlApplicationEngine engine;
    engine.setInitialProperties({
        {QStringLiteral("activeWidget"), loaded.records.first().widget},
        {QStringLiteral("activeScene"), sceneId},
        {QStringLiteral("standingsModel"), QVariant::fromValue(static_cast<QObject *>(&standings))},
        {QStringLiteral("relativeModel"), QVariant::fromValue(static_cast<QObject *>(&relative))},
        {QStringLiteral("deltaModel"), QVariant::fromValue(static_cast<QObject *>(&delta))},
        {QStringLiteral("pedalsModel"), QVariant::fromValue(static_cast<QObject *>(&pedals))},
        {QStringLiteral("playback"), QVariant::fromValue(static_cast<QObject *>(&playback))},
        {QStringLiteral("reducedMotion"), reducedMotion},
        {QStringLiteral("relativeVariant"), relativeVariant},
        {QStringLiteral("relativeShowHeader"), showHeader},
        {QStringLiteral("deltaShowHeader"), showHeader},
    });
    engine.loadFromModule(QStringLiteral("Vantare.RedlineBench"), QStringLiteral("Main"));
    if (engine.rootObjects().isEmpty()) {
        return 3;
    }
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    if (!OverlayWindow::configure(window)) {
        qCritical("failed to configure transparent click-through overlay window");
        return 4;
    }
    QObject::connect(window, &QQuickWindow::beforeSynchronizing, &application,
                     [&motionTrace] { motionTrace.qmlSync(); }, Qt::DirectConnection);
    QObject::connect(window, &QQuickWindow::frameSwapped, &application, [&] {
        if (motionTrace.present()) {
            QMetaObject::invokeMethod(&application, [&application] { application.quit(); },
                                      Qt::QueuedConnection);
        } else if (!motionTrace.error().isEmpty()) {
            qCritical().noquote() << motionTrace.error();
            QMetaObject::invokeMethod(&application, [&application] { application.exit(8); },
                                      Qt::QueuedConnection);
        }
    }, Qt::DirectConnection);
    QObject::connect(&playback, &ScenePlayback::finishedChanged, &application, [&] {
        if (!playback.finished() || !motionTrace.enabled()) {
            return;
        }
        QTimer::singleShot(250, &application, [&] {
            if (motionTrace.finish()) {
                application.quit();
            } else {
                qCritical().noquote() << motionTrace.error();
                application.exit(8);
            }
        });
    });

    qInfo().noquote()
        << QStringLiteral("redline-ready scene=%1 widget=%2 records=%3 replay-sha256=%4")
               .arg(sceneId, loaded.records.first().widget)
               .arg(loaded.records.size())
               .arg(loaded.custody.replaySha256);
    playback.setRecords(std::move(loaded.records));
    playback.start();
    return application.exec();
}
