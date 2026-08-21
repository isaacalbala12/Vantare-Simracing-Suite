#include "qtmotiontrace.h"

#include <QCryptographicHash>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QMutexLocker>
#include <QRegularExpression>

#include <chrono>
#include <cmath>

#ifdef Q_OS_WIN
#define NOMINMAX
#include <windows.h>
#endif

namespace {
constexpr auto schema = "vantare.qt-redline.motion-trace.v1";
constexpr int maximumRecords = 4096;
constexpr int maximumEvents = 65536;

qint64 productionFrequency()
{
#ifdef Q_OS_WIN
    LARGE_INTEGER value{};
    if (!QueryPerformanceFrequency(&value) || value.QuadPart <= 0) {
        return 0;
    }
    return value.QuadPart;
#else
    return 1'000'000'000;
#endif
}

qint64 productionNow()
{
#ifdef Q_OS_WIN
    LARGE_INTEGER value{};
    return QueryPerformanceCounter(&value) ? value.QuadPart : 0;
#else
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
#endif
}

bool isInteger(const QJsonValue &value)
{
    return value.isDouble() && std::isfinite(value.toDouble())
        && std::floor(value.toDouble()) == value.toDouble();
}

QString hashPayload(QJsonObject document)
{
    document.remove(QStringLiteral("payloadSha256"));
    const QByteArray payload = QJsonDocument(document).toJson(QJsonDocument::Compact);
    return QString::fromLatin1(QCryptographicHash::hash(payload, QCryptographicHash::Sha256).toHex());
}
} // namespace

QtMotionTrace::QtMotionTrace(QString outputPath, QString replaySha256, const int expectedRecords)
    : QtMotionTrace(std::move(outputPath), std::move(replaySha256), expectedRecords,
                    productionFrequency(), [] { return productionNow(); })
{
}

QtMotionTrace::QtMotionTrace(QString outputPath, QString replaySha256, const int expectedRecords,
                             const qint64 qpcFrequency, Clock clock)
    : m_outputPath(std::move(outputPath))
    , m_replaySha256(std::move(replaySha256))
    , m_expectedRecords(expectedRecords)
    , m_qpcFrequency(qpcFrequency)
    , m_clock(std::move(clock))
    , m_enabled(!m_outputPath.trimmed().isEmpty())
{
    if (!m_enabled) {
        return;
    }
    if (m_expectedRecords <= 0 || m_expectedRecords > maximumRecords) {
        m_error = QStringLiteral("motion trace expectedRecords is outside 1..4096");
    } else if (m_qpcFrequency <= 0 || !m_clock) {
        m_error = QStringLiteral("motion trace QPC clock is invalid");
    } else if (!QRegularExpression(QStringLiteral("^[0-9a-f]{64}$")).match(m_replaySha256).hasMatch()) {
        m_error = QStringLiteral("motion trace replay SHA-256 is invalid");
    } else if (QFileInfo::exists(m_outputPath)) {
        m_error = QStringLiteral("motion trace output already exists");
    }
}

void QtMotionTrace::appendLocked(const ReplayRecord &record, const int frame, const QString &event)
{
    if (!m_error.isEmpty() || m_finalized) {
        return;
    }
    const qint64 qpc = m_clock();
    m_events.append(QJsonObject{
        {QStringLiteral("sequence"), static_cast<qint64>(record.sequence)},
        {QStringLiteral("sceneId"), record.sceneId},
        {QStringLiteral("frame"), frame},
        {QStringLiteral("logicalMs"), record.logicalMs},
        {QStringLiteral("qpc"), qpc},
        {QStringLiteral("event"), event},
    });
}

void QtMotionTrace::beginRecord(const ReplayRecord &record, const int frame)
{
    if (!m_enabled) {
        return;
    }
    QMutexLocker lock(&m_mutex);
    if (!m_error.isEmpty()) {
        return;
    }
    if (frame < 0 || frame >= m_expectedRecords) {
        m_error = QStringLiteral("motion trace frame is outside the expected range");
        return;
    }
    if (m_modelOpen || frame != m_latestFrame + 1) {
        m_error = QStringLiteral("motion trace model apply boundary is invalid");
        return;
    }
    m_latestRecord = record;
    m_latestFrame = frame;
    m_modelOpen = true;
    appendLocked(record, frame, QStringLiteral("model-apply-start"));
}

void QtMotionTrace::endRecord(const ReplayRecord &record, const int frame)
{
    if (!m_enabled) {
        return;
    }
    QMutexLocker lock(&m_mutex);
    if (!m_error.isEmpty()) {
        return;
    }
    if (!m_modelOpen || frame != m_latestFrame || record.sequence != m_latestRecord.sequence) {
        m_error = QStringLiteral("motion trace model apply boundary is invalid");
        return;
    }
    appendLocked(record, frame, QStringLiteral("model-apply-end"));
    m_modelOpen = false;
}

void QtMotionTrace::qmlSync()
{
    if (!m_enabled) {
        return;
    }
    QMutexLocker lock(&m_mutex);
    if (!m_error.isEmpty() || m_finalized || m_latestFrame < 0 || m_modelOpen || m_syncPending) {
        return;
    }
    m_syncedRecord = m_latestRecord;
    m_syncedFrame = m_latestFrame;
    appendLocked(m_syncedRecord, m_syncedFrame, QStringLiteral("qml-sync"));
    m_syncPending = true;
}

bool QtMotionTrace::present()
{
    if (!m_enabled) {
        return false;
    }
    QMutexLocker lock(&m_mutex);
    if (m_finalized) {
        return true;
    }
    if (!m_error.isEmpty() || !m_syncPending) {
        return false;
    }
    appendLocked(m_syncedRecord, m_syncedFrame, QStringLiteral("present"));
    m_syncPending = false;
    return m_syncedFrame == m_expectedRecords - 1 && finalizeLocked();
}

bool QtMotionTrace::finalizeLocked()
{
    QJsonObject document{
        {QStringLiteral("schema"), QString::fromLatin1(schema)},
        {QStringLiteral("qpcFrequency"), m_qpcFrequency},
        {QStringLiteral("replaySha256"), m_replaySha256},
        {QStringLiteral("expectedRecords"), m_expectedRecords},
        {QStringLiteral("complete"), true},
        {QStringLiteral("events"), m_events},
    };
    document.insert(QStringLiteral("payloadSha256"), hashPayload(document));
    const QByteArray bytes = QJsonDocument(document).toJson(QJsonDocument::Indented);
    m_error = validate(bytes);
    if (!m_error.isEmpty()) {
        return false;
    }
    QFile output(m_outputPath);
    if (!output.open(QIODevice::WriteOnly | QIODevice::NewOnly)) {
        m_error = QStringLiteral("motion trace output cannot be created");
        return false;
    }
    if (output.write(bytes) != bytes.size() || !output.flush()) {
        m_error = QStringLiteral("motion trace output write failed");
        output.close();
        return false;
    }
    output.close();
    m_finalized = true;
    return true;
}

QString QtMotionTrace::error() const
{
    QMutexLocker lock(&m_mutex);
    return m_error;
}

QString QtMotionTrace::validate(const QByteArray &bytes)
{
    if (bytes.isEmpty() || bytes.size() > 8 * 1024 * 1024) {
        return QStringLiteral("motion trace byte size is invalid");
    }
    QJsonParseError parseError{};
    const QJsonDocument parsed = QJsonDocument::fromJson(bytes, &parseError);
    if (parseError.error != QJsonParseError::NoError || !parsed.isObject()) {
        return QStringLiteral("motion trace JSON is invalid");
    }
    QJsonObject document = parsed.object();
    if (document.value(QStringLiteral("schema")).toString() != QString::fromLatin1(schema)) {
        return QStringLiteral("motion trace schema is invalid");
    }
    const QString declaredHash = document.value(QStringLiteral("payloadSha256")).toString();
    if (!QRegularExpression(QStringLiteral("^[0-9a-f]{64}$")).match(declaredHash).hasMatch()
        || declaredHash != hashPayload(document)) {
        return QStringLiteral("motion trace payload SHA-256 is invalid");
    }
    const QJsonValue frequencyValue = document.value(QStringLiteral("qpcFrequency"));
    const QJsonValue expectedValue = document.value(QStringLiteral("expectedRecords"));
    if (!isInteger(frequencyValue) || frequencyValue.toInteger() <= 0) {
        return QStringLiteral("motion trace QPC frequency is invalid");
    }
    if (!isInteger(expectedValue) || expectedValue.toInteger() <= 0
        || expectedValue.toInteger() > maximumRecords) {
        return QStringLiteral("motion trace expectedRecords is invalid");
    }
    if (!document.value(QStringLiteral("complete")).isBool()
        || !document.value(QStringLiteral("complete")).toBool()) {
        return QStringLiteral("motion trace completeness flag is invalid");
    }
    const QString replayHash = document.value(QStringLiteral("replaySha256")).toString();
    if (!QRegularExpression(QStringLiteral("^[0-9a-f]{64}$")).match(replayHash).hasMatch()) {
        return QStringLiteral("motion trace replay SHA-256 is invalid");
    }
    const int expectedRecords = static_cast<int>(expectedValue.toInteger());
    const QJsonArray events = document.value(QStringLiteral("events")).toArray();
    if (events.size() < expectedRecords * 2 + 2 || events.size() > maximumEvents) {
        return QStringLiteral("motion trace event completeness is invalid");
    }
    qint64 lastQpc = 0;
    qint64 firstSequence = -1;
    double lastLogicalMs = -1.0;
    QString sceneId;
    bool modelOpen = false;
    qint64 openModelSequence = -1;
    int openModelFrame = -1;
    double openModelLogicalMs = -1.0;
    bool renderOpen = false;
    qint64 openRenderSequence = -1;
    int openRenderFrame = -1;
    double openRenderLogicalMs = -1.0;
    int completedModels = 0;
    int lastPresentedFrame = -1;
    int renderPairs = 0;
    QList<double> modelLogicalMs;
    modelLogicalMs.reserve(expectedRecords);
    for (const QJsonValue &value : events) {
        if (!value.isObject()) {
            return QStringLiteral("motion trace event contract is invalid");
        }
        const QJsonObject event = value.toObject();
        const QJsonValue sequenceValue = event.value(QStringLiteral("sequence"));
        const QJsonValue frameValue = event.value(QStringLiteral("frame"));
        const QJsonValue qpcValue = event.value(QStringLiteral("qpc"));
        const QJsonValue logicalValue = event.value(QStringLiteral("logicalMs"));
        if (!isInteger(sequenceValue) || !isInteger(frameValue) || !isInteger(qpcValue)
            || !logicalValue.isDouble() || !std::isfinite(logicalValue.toDouble())) {
            return QStringLiteral("motion trace event numeric contract is invalid");
        }
        const qint64 sequence = sequenceValue.toInteger();
        const int frame = static_cast<int>(frameValue.toInteger());
        const qint64 qpc = qpcValue.toInteger();
        const double logicalMs = logicalValue.toDouble();
        const QString eventName = event.value(QStringLiteral("event")).toString();
        const QString eventScene = event.value(QStringLiteral("sceneId")).toString();
        if (qpc <= lastQpc) {
            return QStringLiteral("motion trace QPC monotonicity is invalid");
        }
        if (frame < 0 || frame >= expectedRecords || eventScene.isEmpty()
            || (!sceneId.isEmpty() && eventScene != sceneId)) {
            return QStringLiteral("motion trace event identity is invalid");
        }
        if (eventName == QStringLiteral("model-apply-start")) {
            if (modelOpen || frame != completedModels) {
                return QStringLiteral("motion trace model event order is invalid");
            }
            if (completedModels == 0) {
                firstSequence = sequence;
                sceneId = eventScene;
            }
            if (sequence != firstSequence + frame
                || (completedModels > 0 && logicalMs < lastLogicalMs)) {
                return QStringLiteral("motion trace record identity order is invalid");
            }
            modelOpen = true;
            openModelSequence = sequence;
            openModelFrame = frame;
            openModelLogicalMs = logicalMs;
        } else if (eventName == QStringLiteral("model-apply-end")) {
            if (!modelOpen || sequence != openModelSequence || frame != openModelFrame
                || logicalMs != openModelLogicalMs) {
                return QStringLiteral("motion trace model apply boundary is invalid");
            }
            modelOpen = false;
            ++completedModels;
            lastLogicalMs = logicalMs;
            modelLogicalMs.append(logicalMs);
        } else if (eventName == QStringLiteral("qml-sync")) {
            if (renderOpen || modelOpen || frame >= completedModels
                || sequence != firstSequence + frame || logicalMs != modelLogicalMs.at(frame)
                || frame < lastPresentedFrame) {
                return QStringLiteral("motion trace event completeness is invalid");
            }
            renderOpen = true;
            openRenderSequence = sequence;
            openRenderFrame = frame;
            openRenderLogicalMs = logicalMs;
        } else if (eventName == QStringLiteral("present")) {
            if (!renderOpen || sequence != openRenderSequence || frame != openRenderFrame
                || logicalMs != openRenderLogicalMs) {
                return QStringLiteral("motion trace event completeness is invalid");
            }
            renderOpen = false;
            lastPresentedFrame = frame;
            ++renderPairs;
        } else {
            return QStringLiteral("motion trace event completeness is invalid");
        }
        lastQpc = qpc;
    }
    if (modelOpen || renderOpen || completedModels != expectedRecords || renderPairs == 0
        || lastPresentedFrame != expectedRecords - 1) {
        return QStringLiteral("motion trace event completeness is invalid");
    }
    return {};
}
