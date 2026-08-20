#include "replayloader.h"

#include <QCryptographicHash>
#include <QFile>
#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QStringDecoder>

#include <array>
#include <cmath>
#include <limits>

namespace {
constexpr qint64 kMaximumManifestBytes = 1024 * 1024;
constexpr qint64 kMaximumReplayBytes = 128 * 1024 * 1024;
constexpr qsizetype kMaximumLineBytes = 2 * 1024 * 1024;
constexpr double kLogicalToleranceMs = 0.0015;

struct ExpectedScene { const char *id; const char *widget; int updateHz; quint64 records; };
constexpr std::array<ExpectedScene, 15> kExpectedScenes{{
    {"standings-overtake", "standings", 15, 115}, {"standings-battle", "standings", 15, 181},
    {"standings-fastest-lap", "standings", 15, 133}, {"standings-tire-change", "standings", 15, 169},
    {"standings-delta-chip", "standings", 15, 109}, {"standings-car-enters", "standings", 15, 109},
    {"standings-retirement", "standings", 15, 109}, {"standings-final-minutes", "standings", 15, 133},
    {"standings-full", "standings", 15, 250}, {"relative-cross", "relative", 15, 124},
    {"relative-enter", "relative", 15, 106}, {"delta-cross-zero", "delta", 30, 277},
    {"delta-new-best", "delta", 30, 211}, {"pedals-lap", "pedals", 30, 247},
    {"pedals-clutch", "pedals", 30, 193},
}};

struct SceneContract {
    QString id;
    QString widget;
    int updateHz = 0;
    quint64 records = 0;
    quint64 firstSequence = 0;
    quint64 lastSequence = 0;
    QString sha256;
};

struct ObservedScene {
    quint64 records = 0;
    quint64 firstSequence = 0;
    quint64 lastSequence = 0;
    QByteArray bytes;
};

QString sha256File(QFile &file)
{
    QCryptographicHash hash(QCryptographicHash::Sha256);
    return hash.addData(&file) ? QString::fromLatin1(hash.result().toHex()) : QString();
}

bool exactUnsigned(const QJsonValue &value, quint64 *result)
{
    if (!value.isDouble()) return false;
    const double number = value.toDouble();
    if (!std::isfinite(number) || number < 0.0 || std::floor(number) != number) return false;
    *result = static_cast<quint64>(number);
    return static_cast<double>(*result) == number;
}

bool exactInt(const QJsonValue &value, int *result)
{
    if (!value.isDouble()) return false;
    const double number = value.toDouble();
    if (!std::isfinite(number) || std::floor(number) != number
        || number < static_cast<double>(std::numeric_limits<int>::min())
        || number > static_cast<double>(std::numeric_limits<int>::max())) return false;
    *result = static_cast<int>(number);
    return true;
}

QString parseRecord(const QByteArray &line, ReplayRecord *record)
{
    QStringDecoder decoder(QStringDecoder::Utf8);
    (void)decoder.decode(line);
    if (decoder.hasError()) return QStringLiteral("record is not valid UTF-8");
    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(line, &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject())
        return QStringLiteral("invalid JSONL record: %1").arg(parseError.errorString());
    const QJsonObject object = document.object();
    record->contractVersion = object.value(QStringLiteral("contractVersion")).toString();
    record->sceneId = object.value(QStringLiteral("sceneId")).toString();
    record->widget = object.value(QStringLiteral("widget")).toString();
    if (record->contractVersion != QStringLiteral("redline-viewmodels-v1") || record->sceneId.isEmpty()
        || !exactUnsigned(object.value(QStringLiteral("sequence")), &record->sequence)
        || !exactInt(object.value(QStringLiteral("updateHz")), &record->updateHz)
        || !object.value(QStringLiteral("logicalMs")).isDouble()
        || !std::isfinite(object.value(QStringLiteral("logicalMs")).toDouble())
        || !object.value(QStringLiteral("viewModel")).isObject())
        return QStringLiteral("record violates redline-viewmodels-v1");
    record->logicalMs = object.value(QStringLiteral("logicalMs")).toDouble();
    record->viewModel = object.value(QStringLiteral("viewModel")).toObject();
    return record->viewModel.value(QStringLiteral("type")).toString() == record->widget
        ? QString() : QStringLiteral("record widget and ViewModel type differ");
}

QString parseSceneInventory(const QJsonObject &manifest, QHash<QString, SceneContract> *contracts)
{
    const QJsonArray scenes = manifest.value(QStringLiteral("scenes")).toArray();
    if (scenes.size() != static_cast<qsizetype>(kExpectedScenes.size()))
        return QStringLiteral("manifest scene inventory must contain exactly 15 scenes");
    quint64 expectedFirst = 0;
    for (qsizetype index = 0; index < scenes.size(); ++index) {
        const QJsonObject object = scenes.at(index).toObject();
        const ExpectedScene &expected = kExpectedScenes.at(static_cast<size_t>(index));
        SceneContract contract;
        contract.id = object.value(QStringLiteral("id")).toString();
        contract.widget = object.value(QStringLiteral("widget")).toString();
        contract.sha256 = object.value(QStringLiteral("sha256")).toString().toLower();
        if (!exactInt(object.value(QStringLiteral("updateHz")), &contract.updateHz)
            || !exactUnsigned(object.value(QStringLiteral("records")), &contract.records)
            || !exactUnsigned(object.value(QStringLiteral("firstSequence")), &contract.firstSequence)
            || !exactUnsigned(object.value(QStringLiteral("lastSequence")), &contract.lastSequence)
            || contract.id != QString::fromLatin1(expected.id)
            || contract.widget != QString::fromLatin1(expected.widget)
            || contract.updateHz != expected.updateHz || contract.records != expected.records
            || contract.firstSequence != expectedFirst
            || contract.lastSequence != expectedFirst + expected.records - 1
            || contract.sha256.size() != 64 || contracts->contains(contract.id))
            return QStringLiteral("manifest scene inventory differs from the 15-scene corpus");
        contracts->insert(contract.id, contract);
        expectedFirst += expected.records;
    }
    return expectedFirst == 2466 ? QString()
                                 : QStringLiteral("manifest scene inventory has invalid global coverage");
}
} // namespace

ReplayLoadResult ReplayLoader::load(const QString &replayPath, const QString &manifestPath,
                                    const QString &sceneId)
{
    ReplayLoadResult result;
    QFile manifestFile(manifestPath);
    if (!manifestFile.open(QIODevice::ReadOnly) || manifestFile.size() <= 0
        || manifestFile.size() > kMaximumManifestBytes) {
        result.error = QStringLiteral("cannot read bounded replay manifest"); return result;
    }
    const QByteArray manifestBytes = manifestFile.readAll();
    QStringDecoder manifestDecoder(QStringDecoder::Utf8);
    (void)manifestDecoder.decode(manifestBytes);
    if (manifestBytes.startsWith(QByteArray::fromHex("efbbbf")) || manifestDecoder.hasError()) {
        result.error = QStringLiteral("manifest must be BOM-free UTF-8"); return result;
    }
    QJsonParseError manifestError;
    const QJsonDocument manifestDocument = QJsonDocument::fromJson(manifestBytes, &manifestError);
    if (manifestError.error != QJsonParseError::NoError || !manifestDocument.isObject()) {
        result.error = QStringLiteral("invalid replay manifest JSON"); return result;
    }
    const QJsonObject manifest = manifestDocument.object();
    const QJsonObject replayContract = manifest.value(QStringLiteral("replay")).toObject();
    result.custody.manifestVersion = manifest.value(QStringLiteral("manifestVersion")).toString();
    result.custody.contractVersion = manifest.value(QStringLiteral("contractVersion")).toString();
    result.custody.replaySha256 = replayContract.value(QStringLiteral("sha256")).toString().toLower();
    quint64 declaredRecords = 0;
    if (result.custody.manifestVersion != QStringLiteral("redline-viewmodels-manifest-v1")
        || result.custody.contractVersion != QStringLiteral("redline-viewmodels-v1")
        || manifest.value(QStringLiteral("encoding")).toString() != QStringLiteral("UTF-8")
        || manifest.value(QStringLiteral("lineEnding")).toString() != QStringLiteral("LF")
        || !manifest.value(QStringLiteral("bom")).isBool() || manifest.value(QStringLiteral("bom")).toBool()
        || result.custody.replaySha256.size() != 64
        || !exactUnsigned(replayContract.value(QStringLiteral("records")), &declaredRecords)
        || declaredRecords != 2466) {
        result.error = QStringLiteral("manifest violates redline-viewmodels-v1 encoding or corpus contract");
        return result;
    }
    result.custody.totalRecords = static_cast<qsizetype>(declaredRecords);

    QHash<QString, SceneContract> contracts;
    result.error = parseSceneInventory(manifest, &contracts);
    if (!result.error.isEmpty()) return result;
    if (!sceneId.isEmpty() && !contracts.contains(sceneId)) {
        result.error = QStringLiteral("scene is absent from exact replay inventory"); return result;
    }
    if (!sceneId.isEmpty()) {
        result.custody.sceneId = sceneId;
        result.custody.sceneSha256 = contracts.value(sceneId).sha256;
    }

    QFile replayFile(replayPath);
    if (!replayFile.open(QIODevice::ReadOnly) || replayFile.size() <= 0
        || replayFile.size() > kMaximumReplayBytes) {
        result.error = QStringLiteral("cannot read bounded replay JSONL"); return result;
    }
    if (replayFile.peek(3) == QByteArray::fromHex("efbbbf")) {
        result.error = QStringLiteral("replay must be BOM-free UTF-8"); return result;
    }
    if (sha256File(replayFile) != result.custody.replaySha256) {
        result.error = QStringLiteral("replay SHA-256 does not match manifest"); return result;
    }
    if (!replayFile.seek(0)) { result.error = QStringLiteral("cannot rewind replay JSONL"); return result; }

    QHash<QString, ObservedScene> observed;
    quint64 previousSequence = 0;
    bool hasPrevious = false;
    while (!replayFile.atEnd()) {
        QByteArray line = replayFile.readLine(kMaximumLineBytes + 1);
        if (line.size() > kMaximumLineBytes) { result.error = QStringLiteral("replay JSONL line exceeds limit"); return result; }
        if (!line.endsWith('\n')) { result.error = QStringLiteral("replay JSONL records must end with LF"); return result; }
        const QByteArray hashLine = line;
        line.chop(1);
        if (line.endsWith('\r') || line.isEmpty()) { result.error = QStringLiteral("replay JSONL must use non-empty LF records"); return result; }
        ReplayRecord record;
        const QString recordError = parseRecord(line, &record);
        if (!recordError.isEmpty()) {
            result.error = QStringLiteral("record %1: %2").arg(hasPrevious ? previousSequence + 1 : 0).arg(recordError); return result;
        }
        if ((!hasPrevious && record.sequence != 0) || (hasPrevious && record.sequence != previousSequence + 1)) {
            result.error = QStringLiteral("replay sequence is not contiguous from zero"); return result;
        }
        previousSequence = record.sequence; hasPrevious = true;
        if (!contracts.contains(record.sceneId)) { result.error = QStringLiteral("record references scene outside exact inventory"); return result; }
        const SceneContract contract = contracts.value(record.sceneId);
        ObservedScene &scene = observed[record.sceneId];
        const double expectedLogicalMs = -2000.0 + static_cast<double>(scene.records)
            * (1000.0 / static_cast<double>(contract.updateHz));
        if (record.widget != contract.widget || record.updateHz != contract.updateHz) {
            result.error = QStringLiteral("record widget/updateHz differs from scene contract"); return result;
        }
        if (std::abs(record.logicalMs - expectedLogicalMs) > kLogicalToleranceMs) {
            result.error = QStringLiteral("record logicalMs differs from scene updateHz cadence"); return result;
        }
        if (scene.records == 0) scene.firstSequence = record.sequence;
        scene.lastSequence = record.sequence; ++scene.records; scene.bytes.append(hashLine);
        if (sceneId.isEmpty() || record.sceneId == sceneId) result.records.push_back(std::move(record));
    }
    if (!hasPrevious || previousSequence + 1 != declaredRecords) {
        result.error = QStringLiteral("replay global sequence coverage does not match manifest"); result.records.clear(); return result;
    }
    for (const ExpectedScene &expected : kExpectedScenes) {
        const QString id = QString::fromLatin1(expected.id);
        const SceneContract contract = contracts.value(id);
        const ObservedScene scene = observed.value(id);
        const QString hash = QString::fromLatin1(QCryptographicHash::hash(scene.bytes, QCryptographicHash::Sha256).toHex());
        if (scene.records != contract.records || scene.firstSequence != contract.firstSequence
            || scene.lastSequence != contract.lastSequence || hash != contract.sha256) {
            result.error = QStringLiteral("scene custody does not match replay records"); result.records.clear(); return result;
        }
    }
    return result;
}
