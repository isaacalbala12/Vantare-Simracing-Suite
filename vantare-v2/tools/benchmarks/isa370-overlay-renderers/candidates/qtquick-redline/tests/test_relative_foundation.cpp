#include "../replaymodels.h"

#include <QJsonArray>
#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtTest>

#include <memory>
#include <optional>

namespace {
QJsonObject row(const QString &id, const int position, const bool player,
                const QString &side, const std::optional<double> gap = std::nullopt)
{
    QJsonObject value{{QStringLiteral("id"), id},
                      {QStringLiteral("position"), position},
                      {QStringLiteral("driverNumber"), id.right(2)},
                      {QStringLiteral("driverName"), id + QStringLiteral(" Driver")},
                      {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                      {QStringLiteral("gapText"), gap ? QString::number(*gap, 'f', 1) : QStringLiteral("—")},
                      {QStringLiteral("isPlayer"), player},
                      {QStringLiteral("side"), side},
                      {QStringLiteral("tone"), QStringLiteral("neutral")}};
    if (gap)
        value.insert(QStringLiteral("gapSeconds"), *gap);
    return value;
}

ReplayRecord record(const QString &status, const QList<QJsonObject> &rows)
{
    QJsonArray array;
    for (const auto &value : rows)
        array.append(value);
    ReplayRecord result;
    result.widget = QStringLiteral("relative");
    result.viewModel = QJsonObject{{QStringLiteral("status"), status},
                                   {QStringLiteral("rows"), array},
                                   {QStringLiteral("rowHeightMode"), QStringLiteral("auto")},
                                   {QStringLiteral("columns"), QJsonArray{}}};
    return result;
}

QObject *named(QObject *root, const QString &name)
{
    if (!root)
        return nullptr;
    if (root->objectName() == name)
        return root;
    for (QObject *child : root->children()) {
        if (QObject *match = named(child, name))
            return match;
    }
    if (auto *item = qobject_cast<QQuickItem *>(root)) {
        for (QQuickItem *child : item->childItems()) {
            if (child->parent() == root)
                continue;
            if (QObject *match = named(child, name))
                return match;
        }
    }
    return nullptr;
}

std::unique_ptr<QQuickView> viewFor(RelativeModel &model, const bool reducedMotion = false)
{
    auto view = std::make_unique<QQuickView>();
    view->setResizeMode(QQuickView::SizeRootObjectToView);
    view->resize(420, 440);
    view->setInitialProperties({{QStringLiteral("rowsModel"), QVariant::fromValue(static_cast<QObject *>(&model))},
                                {QStringLiteral("variant"), QStringLiteral("mirror")},
                                {QStringLiteral("reducedMotion"), reducedMotion}});
    view->setSource(QUrl::fromLocalFile(QStringLiteral(RELATIVE_QML_PATH)));
    if (view->status() != QQuickView::Ready) {
        for (const QQmlError &error : view->errors())
            qWarning().noquote() << error.toString();
    }
    view->show();
    return view;
}
} // namespace

class RelativeFoundationTest final : public QObject
{
    Q_OBJECT

private slots:
    void initTestCase();
    void realFoundationSignalsDriveStableReadyMotion();
    void missingStatusAndPlayerRemovalNeverGhost();
    void reducedMotionCancelsAnInflightTransition();
    void missingGapDoesNotBecomeImminent();
    void crossingBudgetFollowsEventOrderInEveryVariant();
    void trafficThreatFollowsTheFoundation();
};

void RelativeFoundationTest::initTestCase()
{
    QCOMPARE(QGuiApplication::platformName(), QStringLiteral("offscreen"));
}

void RelativeFoundationTest::realFoundationSignalsDriveStableReadyMotion()
{
    RelativeModel model;
    model.apply(record(QStringLiteral("missing"),
                       {row(QStringLiteral("ahead"), 7, false, QStringLiteral("ahead"), 1.4),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    auto view = viewFor(model);
    QCOMPARE(view->status(), QQuickView::Ready);
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-ahead-all")), 250);

    QSignalSpy inserted(&model, &QAbstractItemModel::rowsInserted);
    QSignalSpy moved(&model, &QAbstractItemModel::rowsMoved);
    QSignalSpy removed(&model, &QAbstractItemModel::rowsRemoved);
    QSignalSpy changed(&model, &QAbstractItemModel::dataChanged);

    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("baseline"), 6, false, QStringLiteral("ahead"), 2.0),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-baseline-all")), 100);
    QCOMPARE(named(view->rootObject(), QStringLiteral("modelRow-baseline-all"))->property("visualEnterScaleY").toReal(), 1.0);
    QTest::qWait(30); // The one-frame readiness barrier arms after this apply has completed.

    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("baseline"), 6, false, QStringLiteral("ahead"), 2.0),
                        row(QStringLiteral("inserted"), 7, false, QStringLiteral("ahead"), 1.2),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    QCOMPARE(inserted.count(), 2); // baseline during missing->ready, then stable-ready inserted.
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-inserted-all")), 100);
    QObject *insertedRow = named(view->rootObject(), QStringLiteral("modelRow-inserted-all"));
    QTRY_VERIFY_WITH_TIMEOUT(insertedRow->property("visualEnterScaleY").toReal() < 1.0, 100);
    QVERIFY(insertedRow->property("opacity").toReal() < 1.0);
    QTRY_COMPARE_WITH_TIMEOUT(insertedRow->property("visualEnterScaleY").toReal(), 1.0, 450);
    QTRY_COMPARE_WITH_TIMEOUT(insertedRow->property("opacity").toReal(), 1.0, 450);

    auto renamed = row(QStringLiteral("inserted"), 7, false, QStringLiteral("ahead"), 1.2);
    renamed.insert(QStringLiteral("driverName"), QStringLiteral("Renamed Driver"));
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("baseline"), 6, false, QStringLiteral("ahead"), 2.0),
                        renamed,
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    QVERIFY(changed.count() >= 1);
    QCOMPARE(insertedRow->property("visualEnterScaleY").toReal(), 1.0);

    QObject *baseline = named(view->rootObject(), QStringLiteral("modelRow-baseline-all"));
    const qreal oldY = baseline->property("y").toReal();
    model.apply(record(QStringLiteral("ready"),
                       {renamed,
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6),
                        row(QStringLiteral("baseline"), 6, false, QStringLiteral("ahead"), 2.0)}));
    QVERIFY(moved.count() >= 1);
    QTest::qWait(20);
    QVERIFY(baseline->property("y").toReal() < 90.0);
    QVERIFY(baseline->property("y").toReal() >= oldY);
    QTRY_COMPARE_WITH_TIMEOUT(qRound(baseline->property("y").toReal()), 126, 550);

    model.apply(record(QStringLiteral("ready"),
                       {renamed,
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("baseline"), 6, false, QStringLiteral("ahead"), 2.0)}));
    QVERIFY(removed.count() >= 2);
    QTest::qWait(260);
    QVERIFY(named(view->rootObject(), QStringLiteral("modelRow-behind-all")));
    QTRY_VERIFY_WITH_TIMEOUT(!named(view->rootObject(), QStringLiteral("modelRow-behind-all")), 180);
}

void RelativeFoundationTest::missingStatusAndPlayerRemovalNeverGhost()
{
    RelativeModel model;
    model.apply(record(QStringLiteral("missing"),
                       {row(QStringLiteral("ahead"), 7, false, QStringLiteral("ahead"), 1.4),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    auto view = viewFor(model);
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-player-all")), 250);

    model.apply(record(QStringLiteral("missing"),
                       {row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6),
                        row(QStringLiteral("instant"), 10, false, QStringLiteral("behind"), -1.5),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0)}));
    QTRY_VERIFY_WITH_TIMEOUT(!named(view->rootObject(), QStringLiteral("modelRow-ahead-all")), 100);
    QObject *instant = named(view->rootObject(), QStringLiteral("modelRow-instant-all"));
    QVERIFY(instant);
    QCOMPARE(instant->property("opacity").toReal(), 1.0);
    QCOMPARE(instant->property("visualEnterScaleY").toReal(), 1.0);

    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6),
                        row(QStringLiteral("instant"), 10, false, QStringLiteral("behind"), -1.5),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0)}));
    QTest::qWait(30);
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6),
                        row(QStringLiteral("instant"), 10, false, QStringLiteral("behind"), -1.5)}));
    QTRY_VERIFY_WITH_TIMEOUT(!named(view->rootObject(), QStringLiteral("modelRow-player-all")), 100);
    QTRY_COMPARE_WITH_TIMEOUT(view->rootObject()->property("playerIndex").toInt(), -1, 100);

    model.apply(record(QStringLiteral("missing"),
                       {row(QStringLiteral("new"), 1, false, QStringLiteral("ahead"), 0.8),
                        row(QStringLiteral("instant"), 10, false, QStringLiteral("behind"), -1.5)}));
    QTRY_VERIFY_WITH_TIMEOUT(!named(view->rootObject(), QStringLiteral("modelRow-behind-all")), 100);
    QObject *newRow = named(view->rootObject(), QStringLiteral("modelRow-new-all"));
    QVERIFY(newRow);
    QCOMPARE(newRow->property("visualEnterScaleY").toReal(), 1.0);
}

void RelativeFoundationTest::reducedMotionCancelsAnInflightTransition()
{
    RelativeModel model;
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6)}));
    auto view = viewFor(model);
    QTest::qWait(30);
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("behind"), 9, false, QStringLiteral("behind"), -0.6),
                        row(QStringLiteral("animated"), 10, false, QStringLiteral("behind"), -1.0)}));
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-animated-all")), 100);
    QObject *animated = named(view->rootObject(), QStringLiteral("modelRow-animated-all"));
    QTRY_VERIFY_WITH_TIMEOUT(animated->property("visualEnterScaleY").toReal() < 1.0, 100);
    view->rootObject()->setProperty("reducedMotion", true);
    QTRY_COMPARE_WITH_TIMEOUT(animated->property("visualEnterScaleY").toReal(), 1.0, 100);
    QTRY_COMPARE_WITH_TIMEOUT(animated->property("opacity").toReal(), 1.0, 100);

    view->rootObject()->setProperty("reducedMotion", false);
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0),
                        row(QStringLiteral("animated"), 10, false, QStringLiteral("behind"), -1.0)}));
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("modelRow-behind-all"))->property("removalRunning").toBool(), 100);
    view->rootObject()->setProperty("reducedMotion", true);
    QTRY_VERIFY_WITH_TIMEOUT(!named(view->rootObject(), QStringLiteral("modelRow-behind-all")), 100);
}

void RelativeFoundationTest::missingGapDoesNotBecomeImminent()
{
    RelativeModel model;
    model.apply(record(QStringLiteral("ready"),
                       {row(QStringLiteral("ahead"), 7, false, QStringLiteral("ahead")),
                        row(QStringLiteral("player"), 8, true, QStringLiteral("player"), 0.0)}));
    auto view = viewFor(model);
    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("relativeRow-ahead-mirror")), 250);
    QObject *relativeRow = named(view->rootObject(), QStringLiteral("relativeRow-ahead-mirror"));
    QObject *approach = named(relativeRow, QStringLiteral("approachIndicator"));
    QVERIFY(approach);
    QVERIFY(!approach->property("hasGap").toBool());
    QVERIFY(!approach->property("imminent").toBool());
}

void RelativeFoundationTest::crossingBudgetFollowsEventOrderInEveryVariant()
{
    const QStringList variants{QStringLiteral("mirror"), QStringLiteral("proximity"),
                               QStringLiteral("traffic")};
    for (const QString &variant : variants) {
        RelativeModel model;
        model.apply(record(QStringLiteral("ready"),
                           {row(QStringLiteral("player"), 1, true, QStringLiteral("player"), 0.0),
                            row(QStringLiteral("stable-1"), 2, false, QStringLiteral("ahead"), 0.4),
                            row(QStringLiteral("stable-2"), 3, false, QStringLiteral("ahead"), 0.5),
                            row(QStringLiteral("stable-3"), 4, false, QStringLiteral("ahead"), 0.6),
                            row(QStringLiteral("only-cross"), 5, false, QStringLiteral("ahead"), 0.7)}));
        auto view = viewFor(model);
        view->rootObject()->setProperty("variant", variant);
        QTRY_VERIFY_WITH_TIMEOUT(view->rootObject()->property("motionReady").toBool(), 250);
        const QString visualName = variant == QStringLiteral("mirror")
            ? QStringLiteral("relativeRow-only-cross-mirror")
            : QStringLiteral("relativeRow-only-cross");
        QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), visualName), 250);

        model.apply(record(QStringLiteral("ready"),
                           {row(QStringLiteral("player"), 1, true, QStringLiteral("player"), 0.0),
                            row(QStringLiteral("stable-1"), 2, false, QStringLiteral("ahead"), 0.4),
                            row(QStringLiteral("stable-2"), 3, false, QStringLiteral("ahead"), 0.5),
                            row(QStringLiteral("stable-3"), 4, false, QStringLiteral("ahead"), 0.6),
                            row(QStringLiteral("only-cross"), 5, false, QStringLiteral("behind"), -0.7)}));
        QObject *visual = named(view->rootObject(), visualName);
        QObject *wrapper = named(view->rootObject(), QStringLiteral("modelRow-only-cross-all"));
        QVERIFY2(wrapper && wrapper->property("crossSlot").toInt() == 0,
                 qPrintable(QStringLiteral("%1 slot=%2 direction=%3 ready=%4")
                                .arg(variant)
                                .arg(wrapper ? wrapper->property("crossSlot").toInt() : -99)
                                .arg(wrapper ? wrapper->property("crossDirection").toString() : QString())
                                .arg(wrapper ? wrapper->property("modelReady").toBool() : false)));
        QTRY_VERIFY_WITH_TIMEOUT(visual->property("crossRunning").toBool(), 100);
    }

    for (const QString &variant : variants) {
        RelativeModel model;
        model.apply(record(QStringLiteral("ready"),
                           {row(QStringLiteral("player"), 1, true, QStringLiteral("player"), 0.0),
                            row(QStringLiteral("cross-1"), 2, false, QStringLiteral("ahead"), 0.4),
                            row(QStringLiteral("cross-2"), 3, false, QStringLiteral("ahead"), 0.5),
                            row(QStringLiteral("cross-3"), 4, false, QStringLiteral("ahead"), 0.6),
                            row(QStringLiteral("cross-4"), 5, false, QStringLiteral("ahead"), 0.7)}));
        auto view = viewFor(model);
        view->rootObject()->setProperty("variant", variant);
        QTRY_VERIFY_WITH_TIMEOUT(view->rootObject()->property("motionReady").toBool(), 250);

        const auto visualName = [&variant](const QString &id) {
            return variant == QStringLiteral("mirror")
                ? QStringLiteral("relativeRow-%1-mirror").arg(id)
                : QStringLiteral("relativeRow-%1").arg(id);
        };
        QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), visualName(QStringLiteral("cross-4"))), 250);

        model.apply(record(QStringLiteral("ready"),
                           {row(QStringLiteral("player"), 1, true, QStringLiteral("player"), 0.0),
                            row(QStringLiteral("cross-1"), 2, false, QStringLiteral("behind"), -0.4),
                            row(QStringLiteral("cross-2"), 3, false, QStringLiteral("behind"), -0.5),
                            row(QStringLiteral("cross-3"), 4, false, QStringLiteral("behind"), -0.6),
                            row(QStringLiteral("cross-4"), 5, false, QStringLiteral("behind"), -0.7)}));

        QTest::qWait(20);

        int running = 0;
        for (int index = 1; index <= 4; ++index) {
            QObject *visual = named(view->rootObject(), visualName(QStringLiteral("cross-%1").arg(index)));
            QVERIFY2(visual, qPrintable(variant + QStringLiteral(" missing crossing row")));
            if (visual->property("crossRunning").toBool())
                ++running;
        }
        QCOMPARE(running, 3);
        QVERIFY(named(view->rootObject(), visualName(QStringLiteral("cross-3")))
                    ->property("crossRunning").toBool());
    }
}

void RelativeFoundationTest::trafficThreatFollowsTheFoundation()
{
    RelativeModel model;
    auto player = row(QStringLiteral("player"), 1, true, QStringLiteral("player"), 0.0);
    auto threat = row(QStringLiteral("threat"), 2, false, QStringLiteral("behind"), -0.7);
    threat.insert(QStringLiteral("vehicleClass"), QStringLiteral("HYPERCAR"));
    model.apply(record(QStringLiteral("ready"), {player, threat}));
    auto view = viewFor(model);
    view->rootObject()->setProperty("variant", QStringLiteral("traffic"));

    QTRY_VERIFY_WITH_TIMEOUT(named(view->rootObject(), QStringLiteral("trafficRelative")), 250);
    QObject *traffic = named(view->rootObject(), QStringLiteral("trafficRelative"));
    QTRY_COMPARE_WITH_TIMEOUT(traffic->property("threatId").toString(), QStringLiteral("threat"), 250);
    QVERIFY(named(traffic, QStringLiteral("lapNote")));

    threat.insert(QStringLiteral("gapSeconds"), 0.2);
    model.apply(record(QStringLiteral("ready"), {player, threat}));
    QTRY_COMPARE_WITH_TIMEOUT(traffic->property("threatId").toString(), QString(), 250);
}

int main(int argc, char **argv)
{
    qputenv("QT_QPA_PLATFORM", QByteArrayLiteral("offscreen"));
    qputenv("QT_QUICK_BACKEND", QByteArrayLiteral("software"));
    QGuiApplication application(argc, argv);
    RelativeFoundationTest test;
    return QTest::qExec(&test, argc, argv);
}

#include "test_relative_foundation.moc"
