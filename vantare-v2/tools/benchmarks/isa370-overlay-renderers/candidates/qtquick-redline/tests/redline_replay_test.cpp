#include "replayloader.h"
#include "replaymodels.h"
#include "redlinefonts.h"
#include "sceneplayback.h"

#include <QCoreApplication>
#include <QCryptographicHash>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>

#include <algorithm>

namespace {
QString packagedPath(const QString &fileName)
{
    return QCoreApplication::applicationDirPath() + QStringLiteral("/replay/") + fileName;
}

ReplayRecord record(qint64 logicalMs, quint64 sequence, const QString &id)
{
    ReplayRecord result;
    result.contractVersion = QStringLiteral("redline-viewmodels-v1");
    result.sequence = sequence;
    result.sceneId = QStringLiteral("test-scene");
    result.widget = QStringLiteral("standings");
    result.logicalMs = logicalMs;
    result.viewModel = QJsonObject{
        {QStringLiteral("type"), QStringLiteral("standings")},
        {QStringLiteral("status"), QStringLiteral("ready")},
        {QStringLiteral("rows"), QJsonArray{QJsonObject{
             {QStringLiteral("id"), id},
             {QStringLiteral("position"), 1},
             {QStringLiteral("driverName"), QStringLiteral("Driver")},
         }}},
    };
    return result;
}

ReplayRecord recordWithRows(quint64 sequence, const QJsonArray &rows)
{
    ReplayRecord result = record(0, sequence, QStringLiteral("placeholder"));
    result.viewModel.insert(QStringLiteral("rows"), rows);
    return result;
}

QString writeMutatedManifest(const QJsonObject &manifestObject, QTemporaryDir *temporary)
{
    const QString path = temporary->filePath(QStringLiteral("manifest.json"));
    QFile output(path);
    if (!output.open(QIODevice::WriteOnly)
        || output.write(QJsonDocument(manifestObject).toJson(QJsonDocument::Indented)) <= 0) {
        return {};
    }
    return path;
}

QString writeMutatedReplay(const QByteArray &bytes, QTemporaryDir *temporary)
{
    const QString path = temporary->filePath(QStringLiteral("replay.jsonl"));
    QFile output(path);
    if (!output.open(QIODevice::WriteOnly) || output.write(bytes) != bytes.size()) {
        return {};
    }
    return path;
}

QJsonObject productiveManifest()
{
    QFile input(packagedPath(QStringLiteral("redline-viewmodels-v1.manifest.json")));
    if (!input.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(input.readAll()).object();
}
} // namespace

class RedlineReplayTest final : public QObject
{
    Q_OBJECT

private slots:
    void loadsEveryProductiveScene_data();
    void loadsEveryProductiveScene();
    void loadsHashPinnedProductiveReplay();
    void rejectsReplayWhenManifestHashDoesNotMatch();
    void rejectsSceneWhenItsCustodyHashDoesNotMatch();
    void rejectsCrLfReplayEvenWithMatchingGlobalHash();
    void rejectsBomReplayEvenWithMatchingGlobalHash();
    void rejectsDuplicateOrMissingSceneInventory();
    void rejectsRecordUpdateHzThatDiffersFromSceneContract();
    void keyedStandingsUpdatePreservesExistingRow();
    void keyedReconciliationEmitsCausalInsertMoveRemoveAndChange();
    void keyedModelsMatchEveryPackagedReplayFrameWithoutReset();
    void typedListModelsExposeWidgetMetadata();
    void standingsVisualClassesDerivePitAndSessionBest();
    void standingsVisualClassesMergeInterleavedClassesAndPutPlayerClassLast();
    void standingsVisualClassesMarkAllExactSessionBestTiesIncludingSubMinute();
    void mainQmlConnectsStandingsVisualToTheProductiveModel();
    void typedScalarModelsApplyTheirOwnWidgetOnly();
    void playbackUsesLogicalTimeAndNeverLoops();
    void playbackEmitsEveryExpiredRecordAcrossHitches();
    void loadsPackagedRedlineFontWeights();
};

void RedlineReplayTest::loadsEveryProductiveScene_data()
{
    QTest::addColumn<QString>("sceneId");
    QTest::addColumn<int>("records");
    const QList<QPair<QString, int>> scenes{
        {QStringLiteral("standings-overtake"), 115}, {QStringLiteral("standings-battle"), 181},
        {QStringLiteral("standings-fastest-lap"), 133}, {QStringLiteral("standings-tire-change"), 169},
        {QStringLiteral("standings-delta-chip"), 109}, {QStringLiteral("standings-car-enters"), 109},
        {QStringLiteral("standings-retirement"), 109}, {QStringLiteral("standings-final-minutes"), 133},
        {QStringLiteral("standings-full"), 250}, {QStringLiteral("relative-cross"), 124},
        {QStringLiteral("relative-enter"), 106}, {QStringLiteral("delta-cross-zero"), 277},
        {QStringLiteral("delta-new-best"), 211}, {QStringLiteral("pedals-lap"), 247},
        {QStringLiteral("pedals-clutch"), 193},
    };
    for (const auto &[sceneId, records] : scenes) {
        QTest::newRow(qPrintable(sceneId)) << sceneId << records;
    }
}

void RedlineReplayTest::loadsEveryProductiveScene()
{
    QFETCH(QString, sceneId);
    QFETCH(int, records);
    const ReplayLoadResult loaded = ReplayLoader::load(
        packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl")),
        packagedPath(QStringLiteral("redline-viewmodels-v1.manifest.json")), sceneId);
    QVERIFY2(loaded.ok(), qPrintable(loaded.error));
    QCOMPARE(loaded.records.size(), records);
}

void RedlineReplayTest::loadsHashPinnedProductiveReplay()
{
    const QString replay = packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl"));
    const QString manifest = packagedPath(QStringLiteral("redline-viewmodels-v1.manifest.json"));

    const ReplayLoadResult loaded = ReplayLoader::load(replay, manifest, QStringLiteral("standings-full"));

    QVERIFY2(loaded.ok(), qPrintable(loaded.error));
    QCOMPARE(loaded.custody.contractVersion, QStringLiteral("redline-viewmodels-v1"));
    QCOMPARE(loaded.custody.replaySha256, QStringLiteral("9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059"));
    QCOMPARE(loaded.custody.totalRecords, 2466);
    QCOMPARE(loaded.records.size(), 250);
    QCOMPARE(loaded.records.first().sequence, quint64(1058));
    QCOMPARE(loaded.records.last().sequence, quint64(1307));
}

void RedlineReplayTest::rejectsReplayWhenManifestHashDoesNotMatch()
{
    QJsonObject manifestObject = productiveManifest();
    QJsonObject replayContract = manifestObject.value(QStringLiteral("replay")).toObject();
    replayContract.insert(QStringLiteral("sha256"),
                          QStringLiteral("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"));
    manifestObject.insert(QStringLiteral("replay"), replayContract);
    QTemporaryDir temporary;
    QVERIFY(temporary.isValid());
    const ReplayLoadResult loaded = ReplayLoader::load(
        packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl")),
        writeMutatedManifest(manifestObject, &temporary), {});

    QVERIFY(!loaded.ok());
    QVERIFY(loaded.error.contains(QStringLiteral("SHA-256")));
}

void RedlineReplayTest::rejectsSceneWhenItsCustodyHashDoesNotMatch()
{
    const QString replayPath = packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl"));
    QFile sourceManifest(packagedPath(QStringLiteral("redline-viewmodels-v1.manifest.json")));
    QVERIFY(sourceManifest.open(QIODevice::ReadOnly));
    QByteArray bytes = sourceManifest.readAll();
    const QByteArray expectedHash("74e0d3d4e03d6719318491ab664915b57c30d639fcb5d7a6792f3c8128e5a910");
    QVERIFY(bytes.contains(expectedHash));
    bytes.replace(expectedHash,
                  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    QVERIFY(!bytes.contains(expectedHash));
    QTemporaryDir temporary;
    QFile manifest(temporary.filePath(QStringLiteral("manifest.json")));
    QVERIFY(manifest.open(QIODevice::WriteOnly));
    QCOMPARE(manifest.write(bytes), bytes.size());
    manifest.close();

    const ReplayLoadResult loaded = ReplayLoader::load(replayPath, manifest.fileName(), QStringLiteral("standings-full"));

    QVERIFY(!loaded.ok());
    QVERIFY(loaded.error.contains(QStringLiteral("scene custody")));
}

void RedlineReplayTest::rejectsCrLfReplayEvenWithMatchingGlobalHash()
{
    QFile source(packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl")));
    QVERIFY(source.open(QIODevice::ReadOnly));
    QByteArray bytes = source.readAll();
    bytes.replace("\n", "\r\n");
    QJsonObject manifest = productiveManifest();
    QJsonObject replay = manifest.value(QStringLiteral("replay")).toObject();
    replay.insert(QStringLiteral("sha256"), QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex()));
    manifest.insert(QStringLiteral("replay"), replay);
    QTemporaryDir temporary;

    const ReplayLoadResult loaded = ReplayLoader::load(writeMutatedReplay(bytes, &temporary),
                                                        writeMutatedManifest(manifest, &temporary),
                                                        QStringLiteral("standings-full"));
    QVERIFY(!loaded.ok());
    QVERIFY(loaded.error.contains(QStringLiteral("LF")));
}

void RedlineReplayTest::rejectsBomReplayEvenWithMatchingGlobalHash()
{
    QFile source(packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl")));
    QVERIFY(source.open(QIODevice::ReadOnly));
    const QByteArray bytes = QByteArray::fromHex("efbbbf") + source.readAll();
    QJsonObject manifest = productiveManifest();
    QJsonObject replay = manifest.value(QStringLiteral("replay")).toObject();
    replay.insert(QStringLiteral("sha256"), QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex()));
    manifest.insert(QStringLiteral("replay"), replay);
    QTemporaryDir temporary;

    const ReplayLoadResult loaded = ReplayLoader::load(writeMutatedReplay(bytes, &temporary),
                                                        writeMutatedManifest(manifest, &temporary),
                                                        QStringLiteral("standings-full"));
    QVERIFY(!loaded.ok());
    QVERIFY(loaded.error.contains(QStringLiteral("BOM")));
}

void RedlineReplayTest::rejectsDuplicateOrMissingSceneInventory()
{
    const QString replayPath = packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl"));
    QJsonObject duplicateManifest = productiveManifest();
    QJsonArray duplicateScenes = duplicateManifest.value(QStringLiteral("scenes")).toArray();
    duplicateScenes[1] = duplicateScenes[0];
    duplicateManifest.insert(QStringLiteral("scenes"), duplicateScenes);
    QTemporaryDir duplicateTemporary;
    const ReplayLoadResult duplicate = ReplayLoader::load(
        replayPath, writeMutatedManifest(duplicateManifest, &duplicateTemporary), QStringLiteral("standings-full"));
    QVERIFY(!duplicate.ok());
    QVERIFY(duplicate.error.contains(QStringLiteral("inventory")));

    QJsonObject missingManifest = productiveManifest();
    QJsonArray missingScenes = missingManifest.value(QStringLiteral("scenes")).toArray();
    missingScenes.removeLast();
    missingManifest.insert(QStringLiteral("scenes"), missingScenes);
    QTemporaryDir missingTemporary;
    const ReplayLoadResult missing = ReplayLoader::load(
        replayPath, writeMutatedManifest(missingManifest, &missingTemporary), QStringLiteral("standings-full"));
    QVERIFY(!missing.ok());
    QVERIFY(missing.error.contains(QStringLiteral("inventory")));
}

void RedlineReplayTest::rejectsRecordUpdateHzThatDiffersFromSceneContract()
{
    QFile source(packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl")));
    QVERIFY(source.open(QIODevice::ReadOnly));
    QByteArray bytes = source.readAll();
    const qsizetype updateHzOffset = bytes.indexOf("\"updateHz\":15");
    QVERIFY(updateHzOffset >= 0);
    bytes.replace(updateHzOffset, qsizetype(13), "\"updateHz\":30");
    QJsonObject manifest = productiveManifest();
    QJsonObject replay = manifest.value(QStringLiteral("replay")).toObject();
    replay.insert(QStringLiteral("sha256"), QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex()));
    manifest.insert(QStringLiteral("replay"), replay);
    QTemporaryDir temporary;

    const ReplayLoadResult loaded = ReplayLoader::load(writeMutatedReplay(bytes, &temporary),
                                                        writeMutatedManifest(manifest, &temporary),
                                                        QStringLiteral("standings-overtake"));
    QVERIFY(!loaded.ok());
    QVERIFY(loaded.error.contains(QStringLiteral("updateHz")));
}

void RedlineReplayTest::keyedStandingsUpdatePreservesExistingRow()
{
    StandingsModel model;
    QSignalSpy resetSpy(&model, &QAbstractItemModel::modelReset);
    QSignalSpy changedSpy(&model, &QAbstractItemModel::dataChanged);
    model.apply(record(0, 1, QStringLiteral("car-51")));

    ReplayRecord update = record(67, 2, QStringLiteral("car-51"));
    QJsonObject viewModel = update.viewModel;
    QJsonArray rows = viewModel.value(QStringLiteral("rows")).toArray();
    QJsonObject row = rows.first().toObject();
    row.insert(QStringLiteral("driverName"), QStringLiteral("Updated Driver"));
    rows[0] = row;
    viewModel.insert(QStringLiteral("rows"), rows);
    update.viewModel = viewModel;
    model.apply(update);

    QCOMPARE(model.rowCount(), 1);
    QCOMPARE(model.data(model.index(0), StandingsModel::IdRole).toString(), QStringLiteral("car-51"));
    QCOMPARE(model.data(model.index(0), StandingsModel::DriverNameRole).toString(), QStringLiteral("Updated Driver"));
    QCOMPARE(resetSpy.count(), 0);
    QVERIFY(changedSpy.count() >= 1);
}

void RedlineReplayTest::keyedReconciliationEmitsCausalInsertMoveRemoveAndChange()
{
    const auto row = [](const QString &id, const QString &name) {
        return QJsonObject{{QStringLiteral("id"), id}, {QStringLiteral("driverName"), name}};
    };
    StandingsModel model;
    model.apply(recordWithRows(1, QJsonArray{row(QStringLiteral("a"), QStringLiteral("A")),
                                              row(QStringLiteral("b"), QStringLiteral("B"))}));
    QSignalSpy inserted(&model, &QAbstractItemModel::rowsInserted);
    QSignalSpy moved(&model, &QAbstractItemModel::rowsMoved);
    QSignalSpy removed(&model, &QAbstractItemModel::rowsRemoved);
    QSignalSpy changed(&model, &QAbstractItemModel::dataChanged);
    QSignalSpy reset(&model, &QAbstractItemModel::modelReset);

    model.apply(recordWithRows(2, QJsonArray{row(QStringLiteral("b"), QStringLiteral("B2")),
                                              row(QStringLiteral("a"), QStringLiteral("A")),
                                              row(QStringLiteral("c"), QStringLiteral("C"))}));
    model.apply(recordWithRows(3, QJsonArray{row(QStringLiteral("b"), QStringLiteral("B2")),
                                              row(QStringLiteral("c"), QStringLiteral("C"))}));

    QCOMPARE(model.rowCount(), 2);
    QCOMPARE(model.data(model.index(0), StandingsModel::IdRole).toString(), QStringLiteral("b"));
    QCOMPARE(model.data(model.index(1), StandingsModel::IdRole).toString(), QStringLiteral("c"));
    QCOMPARE(inserted.count(), 1);
    QCOMPARE(moved.count(), 1);
    QCOMPARE(removed.count(), 1);
    QVERIFY(changed.count() >= 1);
    QCOMPARE(reset.count(), 0);
}

void RedlineReplayTest::keyedModelsMatchEveryPackagedReplayFrameWithoutReset()
{
    const QString replayPath = packagedPath(QStringLiteral("redline-viewmodels-v1.jsonl"));
    const QString manifestPath = packagedPath(QStringLiteral("redline-viewmodels-v1.manifest.json"));
    QFile manifestFile(manifestPath);
    QVERIFY(manifestFile.open(QIODevice::ReadOnly));
    const QJsonArray scenes = QJsonDocument::fromJson(manifestFile.readAll())
                                  .object()
                                  .value(QStringLiteral("scenes"))
                                  .toArray();

    for (const QJsonValue &sceneValue : scenes) {
        const QString sceneId = sceneValue.toObject().value(QStringLiteral("sceneId")).toString();
        const ReplayLoadResult loaded = ReplayLoader::load(replayPath, manifestPath, sceneId);
        QVERIFY2(loaded.ok(), qPrintable(loaded.error));
        StandingsModel standings;
        RelativeModel relative;
        QSignalSpy standingsReset(&standings, &QAbstractItemModel::modelReset);
        QSignalSpy relativeReset(&relative, &QAbstractItemModel::modelReset);
        for (const ReplayRecord &record : loaded.records) {
            KeyedRowsModel *model = nullptr;
            if (record.widget == QStringLiteral("standings")) {
                standings.apply(record);
                model = &standings;
            } else if (record.widget == QStringLiteral("relative")) {
                relative.apply(record);
                model = &relative;
            } else {
                continue;
            }
            const QJsonArray expectedRows = record.viewModel.value(QStringLiteral("rows")).toArray();
            QCOMPARE(model->rowCount(), expectedRows.size());
            for (int index = 0; index < expectedRows.size(); ++index) {
                QCOMPARE(model->data(model->index(index), KeyedRowsModel::IdRole).toString(),
                         expectedRows.at(index).toObject().value(QStringLiteral("id")).toString());
            }
            if (record.widget == QStringLiteral("standings")) {
                int projectedRows = 0;
                int sessionBestRows = 0;
                for (const QVariant &classValue : standings.visualClasses()) {
                    const QVariantList classRows = classValue.toMap().value(QStringLiteral("rows")).toList();
                    projectedRows += classRows.size();
                    for (const QVariant &rowValue : classRows) {
                        const QVariantMap projected = rowValue.toMap();
                        const QString id = projected.value(QStringLiteral("id")).toString();
                        const auto expected = std::find_if(expectedRows.cbegin(), expectedRows.cend(),
                                                           [&](const QJsonValue &row) {
                                                               return row.toObject().value(QStringLiteral("id")).toString() == id;
                                                           });
                        QVERIFY(expected != expectedRows.cend());
                        QCOMPARE(projected.value(QStringLiteral("inPit")).toBool(),
                                 !(*expected).toObject().value(QStringLiteral("pitText")).toString().trimmed().isEmpty());
                        sessionBestRows += projected.value(QStringLiteral("isSessionBest")).toBool() ? 1 : 0;
                    }
                }
                QCOMPARE(projectedRows, expectedRows.size());
                QCOMPARE(sessionBestRows, 1);
            }
        }
        QCOMPARE(standingsReset.count(), 0);
        QCOMPARE(relativeReset.count(), 0);
    }
}

void RedlineReplayTest::typedListModelsExposeWidgetMetadata()
{
    StandingsModel standings;
    ReplayRecord standingsRecord = record(0, 1, QStringLiteral("car-51"));
    standingsRecord.viewModel.insert(QStringLiteral("activeClass"), QStringLiteral("GT3"));
    standingsRecord.viewModel.insert(QStringLiteral("sessionLabel"), QStringLiteral("RACE"));
    standingsRecord.viewModel.insert(QStringLiteral("remainingText"), QStringLiteral("01:40:00"));
    standingsRecord.viewModel.insert(QStringLiteral("lapText"), QStringLiteral("14/14"));
    standings.apply(standingsRecord);

    RelativeModel relative;
    ReplayRecord relativeRecord;
    relativeRecord.widget = QStringLiteral("relative");
    relativeRecord.viewModel = QJsonObject{{QStringLiteral("type"), QStringLiteral("relative")},
                                            {QStringLiteral("status"), QStringLiteral("ready")},
                                            {QStringLiteral("statusMessage"), QStringLiteral("relative ready")},
                                            {QStringLiteral("rowHeightMode"), QStringLiteral("compact")},
                                            {QStringLiteral("rows"), QJsonArray{}}};
    relative.apply(relativeRecord);

    QCOMPARE(standings.activeClass(), QStringLiteral("GT3"));
    QCOMPARE(standings.sessionLabel(), QStringLiteral("RACE"));
    QCOMPARE(standings.remainingText(), QStringLiteral("01:40:00"));
    QCOMPARE(standings.lapText(), QStringLiteral("14/14"));
    QCOMPARE(relative.rowHeightMode(), QStringLiteral("compact"));
    QCOMPARE(relative.statusMessage(), QStringLiteral("relative ready"));
}

void RedlineReplayTest::standingsVisualClassesDerivePitAndSessionBest()
{
    StandingsModel standings;
    ReplayRecord standingsRecord = recordWithRows(1, QJsonArray{
        QJsonObject{{QStringLiteral("id"), QStringLiteral("a")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("LMP2")},
                    {QStringLiteral("bestLapText"), QStringLiteral("1:30.200")},
                    {QStringLiteral("pitText"), QStringLiteral("PIT")}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("b")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("bestLapText"), QStringLiteral("1:29.800")},
                    {QStringLiteral("pitText"), QString()}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("c")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("bestLapText"), QStringLiteral("—")},
                    {QStringLiteral("pitText"), QString()}},
    });
    standings.apply(standingsRecord);

    const QVariantList classes = standings.visualClasses();
    QCOMPARE(classes.size(), 2);
    QCOMPARE(classes.at(0).toMap().value(QStringLiteral("vehicleClass")).toString(),
             QStringLiteral("LMP2"));
    QCOMPARE(classes.at(1).toMap().value(QStringLiteral("vehicleClass")).toString(),
             QStringLiteral("GT3"));
    const QVariantList lmp2 = classes.at(0).toMap().value(QStringLiteral("rows")).toList();
    const QVariantList gt3 = classes.at(1).toMap().value(QStringLiteral("rows")).toList();
    QVERIFY(lmp2.at(0).toMap().value(QStringLiteral("inPit")).toBool());
    QVERIFY(!lmp2.at(0).toMap().value(QStringLiteral("isSessionBest")).toBool());
    QVERIFY(gt3.at(0).toMap().value(QStringLiteral("isSessionBest")).toBool());
    QVERIFY(!gt3.at(1).toMap().value(QStringLiteral("isSessionBest")).toBool());
}

void RedlineReplayTest::standingsVisualClassesMergeInterleavedClassesAndPutPlayerClassLast()
{
    StandingsModel standings;
    standings.apply(recordWithRows(1, QJsonArray{
        QJsonObject{{QStringLiteral("id"), QStringLiteral("gt3-a")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("isPlayer"), false}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("lmp2-player")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("LMP2")},
                    {QStringLiteral("isPlayer"), true}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("hypercar")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("HYPERCAR")},
                    {QStringLiteral("isPlayer"), false}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("gt3-b")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("isPlayer"), false}},
    }));

    const QVariantList classes = standings.visualClasses();
    QCOMPARE(classes.size(), 3);
    QCOMPARE(classes.at(0).toMap().value(QStringLiteral("vehicleClass")).toString(),
             QStringLiteral("HYPERCAR"));
    QCOMPARE(classes.at(1).toMap().value(QStringLiteral("vehicleClass")).toString(),
             QStringLiteral("GT3"));
    QCOMPARE(classes.at(2).toMap().value(QStringLiteral("vehicleClass")).toString(),
             QStringLiteral("LMP2"));

    const QVariantList gt3Rows = classes.at(1).toMap().value(QStringLiteral("rows")).toList();
    QCOMPARE(gt3Rows.size(), 2);
    QCOMPARE(gt3Rows.at(0).toMap().value(QStringLiteral("id")).toString(),
             QStringLiteral("gt3-a"));
    QCOMPARE(gt3Rows.at(1).toMap().value(QStringLiteral("id")).toString(),
             QStringLiteral("gt3-b"));
}

void RedlineReplayTest::standingsVisualClassesMarkAllExactSessionBestTiesIncludingSubMinute()
{
    StandingsModel standings;
    standings.apply(recordWithRows(1, QJsonArray{
        QJsonObject{{QStringLiteral("id"), QStringLiteral("plain-seconds")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("bestLapText"), QStringLiteral("59.800")}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("minute-form")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("bestLapText"), QStringLiteral("0:59.800")}},
        QJsonObject{{QStringLiteral("id"), QStringLiteral("slower")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("bestLapText"), QStringLiteral("1:00.000")}},
    }));

    const QVariantList rows = standings.visualClasses()
                                  .constFirst()
                                  .toMap()
                                  .value(QStringLiteral("rows"))
                                  .toList();
    QVERIFY(rows.at(0).toMap().value(QStringLiteral("isSessionBest")).toBool());
    QVERIFY(rows.at(1).toMap().value(QStringLiteral("isSessionBest")).toBool());
    QVERIFY(!rows.at(2).toMap().value(QStringLiteral("isSessionBest")).toBool());
}

void RedlineReplayTest::mainQmlConnectsStandingsVisualToTheProductiveModel()
{
    StandingsModel standings;
    RelativeModel relative;
    DeltaModel delta;
    PedalsModel pedals;
    QObject playback;

    ReplayRecord standingsRecord = recordWithRows(1, QJsonArray{
        QJsonObject{{QStringLiteral("id"), QStringLiteral("player")},
                    {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
                    {QStringLiteral("isPlayer"), true},
                    {QStringLiteral("bestLapText"), QStringLiteral("1:42.100")}},
    });
    standingsRecord.viewModel.insert(QStringLiteral("sessionLabel"), QStringLiteral("RACE"));
    standingsRecord.viewModel.insert(QStringLiteral("remainingText"), QStringLiteral("04:59"));
    standingsRecord.viewModel.insert(QStringLiteral("lapText"), QStringLiteral("12/14"));
    standingsRecord.viewModel.insert(QStringLiteral("statusMessage"), QStringLiteral("standings ready"));
    standings.apply(standingsRecord);
    ReplayRecord relativeRecord;
    relativeRecord.widget = QStringLiteral("relative");
    relativeRecord.viewModel = QJsonObject{
        {QStringLiteral("status"), QStringLiteral("ready")},
        {QStringLiteral("statusMessage"), QStringLiteral("relative ready")},
        {QStringLiteral("rows"), QJsonArray{QJsonObject{
             {QStringLiteral("id"), QStringLiteral("relative-player")},
             {QStringLiteral("position"), 3},
             {QStringLiteral("vehicleClass"), QStringLiteral("GT3")},
             {QStringLiteral("side"), QStringLiteral("player")},
             {QStringLiteral("isPlayer"), true},
         }}},
    };
    relative.apply(relativeRecord);
    ReplayRecord deltaRecord;
    deltaRecord.widget = QStringLiteral("delta");
    deltaRecord.viewModel = QJsonObject{{QStringLiteral("status"), QStringLiteral("ready")},
                                        {QStringLiteral("tone"), QStringLiteral("gaining")},
                                        {QStringLiteral("deltaText"), QStringLiteral("-0.240")},
                                        {QStringLiteral("bestLapText"), QStringLiteral("1:42.100")},
                                        {QStringLiteral("progress"), -0.12}};
    delta.apply(deltaRecord);
    ReplayRecord pedalsRecord;
    pedalsRecord.widget = QStringLiteral("pedals");
    pedalsRecord.viewModel = QJsonObject{{QStringLiteral("status"), QStringLiteral("ready")},
                                         {QStringLiteral("throttle"), 0.75},
                                         {QStringLiteral("brake"), 0.20},
                                         {QStringLiteral("clutch"), 0.05},
                                         {QStringLiteral("throttleText"), QStringLiteral("75%")},
                                         {QStringLiteral("brakeText"), QStringLiteral("20%")},
                                         {QStringLiteral("clutchText"), QStringLiteral("5%")}};
    pedals.apply(pedalsRecord);

    const QString mainPath = QFileInfo(QString::fromUtf8(__FILE__))
                                 .dir()
                                 .absoluteFilePath(QStringLiteral("../Main.qml"));
    QQmlEngine engine;
    QQmlComponent component(&engine, QUrl::fromLocalFile(mainPath));
    QCOMPARE(component.status(), QQmlComponent::Ready);
    QVERIFY2(component.errors().isEmpty(), qPrintable(component.errorString()));

    const QVariantMap properties{
        {QStringLiteral("activeWidget"), QStringLiteral("standings")},
        {QStringLiteral("activeScene"), QStringLiteral("standings-full")},
        {QStringLiteral("standingsModel"), QVariant::fromValue(&standings)},
        {QStringLiteral("relativeModel"), QVariant::fromValue(&relative)},
        {QStringLiteral("deltaModel"), QVariant::fromValue(&delta)},
        {QStringLiteral("pedalsModel"), QVariant::fromValue(&pedals)},
        {QStringLiteral("playback"), QVariant::fromValue(&playback)},
    };
    std::unique_ptr<QObject> root(component.createWithInitialProperties(properties));
    QVERIFY2(root != nullptr, qPrintable(component.errorString()));

    QObject *visual = root->findChild<QObject *>(QStringLiteral("standingsVisual"));
    QVERIFY(visual != nullptr);
    QCOMPARE(visual->property("sessionLabel").toString(), QStringLiteral("RACE"));
    QCOMPARE(visual->property("remainingText").toString(), QStringLiteral("04:59"));
    QCOMPARE(visual->property("lapText").toString(), QStringLiteral("12/14"));
    QCOMPARE(visual->property("statusMessage").toString(), QStringLiteral("standings ready"));
    QCOMPARE(visual->property("classModel").toList().size(), 1);

    QVERIFY(root->setProperty("relativeVariant", QStringLiteral("traffic")));
    QVERIFY(root->setProperty("activeWidget", QStringLiteral("relative")));
    QCoreApplication::processEvents();
    QObject *relativeVisual = root->findChild<QObject *>(QStringLiteral("relativeVisual"));
    QVERIFY(relativeVisual != nullptr);
    QCOMPARE(relativeVisual->property("variant").toString(), QStringLiteral("traffic"));
    QCOMPARE(relativeVisual->property("statusMessage").toString(), QStringLiteral("relative ready"));

    QVERIFY(root->setProperty("activeWidget", QStringLiteral("delta")));
    QCoreApplication::processEvents();
    QObject *deltaVisual = root->findChild<QObject *>(QStringLiteral("deltaVisual"));
    QVERIFY(deltaVisual != nullptr);
    QCOMPARE(deltaVisual->property("deltaText").toString(), QStringLiteral("-0.240"));
    QCOMPARE(deltaVisual->property("tone").toString(), QStringLiteral("gaining"));
    QCOMPARE(deltaVisual->property("progress").toDouble(), -0.12);

    QVERIFY(root->setProperty("activeWidget", QStringLiteral("pedals")));
    QCoreApplication::processEvents();
    QObject *pedalsVisual = root->findChild<QObject *>(QStringLiteral("pedalsVisual"));
    QVERIFY(pedalsVisual != nullptr);
    QCOMPARE(pedalsVisual->property("throttle").toDouble(), 0.75);
    QCOMPARE(pedalsVisual->property("brakeText").toString(), QStringLiteral("20%"));
    QCOMPARE(pedalsVisual->property("clutchText").toString(), QStringLiteral("5%"));
}

void RedlineReplayTest::typedScalarModelsApplyTheirOwnWidgetOnly()
{
    DeltaModel delta;
    PedalsModel pedals;
    ReplayRecord deltaRecord;
    deltaRecord.widget = QStringLiteral("delta");
    deltaRecord.viewModel = QJsonObject{{QStringLiteral("type"), QStringLiteral("delta")},
                                        {QStringLiteral("status"), QStringLiteral("ready")},
                                        {QStringLiteral("statusMessage"), QStringLiteral("delta ready")},
                                        {QStringLiteral("deltaText"), QStringLiteral("-0.120")},
                                        {QStringLiteral("progress"), 0.75}};
    ReplayRecord pedalsRecord;
    pedalsRecord.widget = QStringLiteral("pedals");
    pedalsRecord.viewModel = QJsonObject{{QStringLiteral("type"), QStringLiteral("pedals")},
                                         {QStringLiteral("status"), QStringLiteral("ready")},
                                         {QStringLiteral("statusMessage"), QStringLiteral("pedals ready")},
                                         {QStringLiteral("throttle"), 0.8},
                                         {QStringLiteral("brake"), 0.2},
                                         {QStringLiteral("clutch"), 0.1}};

    delta.apply(deltaRecord);
    delta.apply(pedalsRecord);
    pedals.apply(pedalsRecord);

    QCOMPARE(delta.deltaText(), QStringLiteral("-0.120"));
    QCOMPARE(delta.progress(), 0.75);
    QCOMPARE(delta.statusMessage(), QStringLiteral("delta ready"));
    QCOMPARE(pedals.throttle(), 0.8);
    QCOMPARE(pedals.brake(), 0.2);
    QCOMPARE(pedals.clutch(), 0.1);
    QCOMPARE(pedals.statusMessage(), QStringLiteral("pedals ready"));
}

void RedlineReplayTest::playbackUsesLogicalTimeAndNeverLoops()
{
    ScenePlayback playback;
    playback.setRecords({record(-2000, 1, QStringLiteral("a")),
                         record(-1000, 2, QStringLiteral("a")),
                         record(0, 3, QStringLiteral("a"))});

    QCOMPARE(playback.advanceToElapsedMs(0)->sequence, quint64(1));
    QCOMPARE(playback.advanceToElapsedMs(999)->sequence, quint64(1));
    QCOMPARE(playback.advanceToElapsedMs(1000)->sequence, quint64(2));
    QCOMPARE(playback.advanceToElapsedMs(2000)->sequence, quint64(3));
    QCOMPARE(playback.advanceToElapsedMs(9000)->sequence, quint64(3));
    QVERIFY(playback.finished());
    QCOMPARE(playback.currentIndex(), 2);
}

void RedlineReplayTest::playbackEmitsEveryExpiredRecordAcrossHitches()
{
    qRegisterMetaType<ReplayRecord>();
    ScenePlayback playback;
    playback.setRecords({record(-2000, 1, QStringLiteral("a")),
                         record(-1970, 2, QStringLiteral("a")),
                         record(-1940, 3, QStringLiteral("a")),
                         record(-1880, 4, QStringLiteral("a"))});
    QSignalSpy advanced(&playback, &ScenePlayback::recordAdvanced);

    (void)playback.advanceToElapsedMs(0);
    (void)playback.advanceToElapsedMs(70);
    (void)playback.advanceToElapsedMs(150);

    QCOMPARE(advanced.count(), 4);
    QCOMPARE(qvariant_cast<ReplayRecord>(advanced.at(0).at(0)).sequence, quint64(1));
    QCOMPARE(qvariant_cast<ReplayRecord>(advanced.at(1).at(0)).sequence, quint64(2));
    QCOMPARE(qvariant_cast<ReplayRecord>(advanced.at(2).at(0)).sequence, quint64(3));
    QCOMPARE(qvariant_cast<ReplayRecord>(advanced.at(3).at(0)).sequence, quint64(4));
}

void RedlineReplayTest::loadsPackagedRedlineFontWeights()
{
    const RedlineFontLoadResult loaded = RedlineFonts::loadPackaged();
    QVERIFY2(loaded.ok(), qPrintable(loaded.error));
    QCOMPARE(loaded.family, QStringLiteral("Barlow Semi Condensed"));
    QCOMPARE(loaded.loadedWeights, 4);
}

QTEST_MAIN(RedlineReplayTest)

#include "redline_replay_test.moc"
