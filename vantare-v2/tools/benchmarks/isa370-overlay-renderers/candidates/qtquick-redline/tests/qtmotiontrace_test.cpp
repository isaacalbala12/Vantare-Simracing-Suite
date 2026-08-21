#include "qtmotiontrace.h"

#include <QCryptographicHash>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QtTest>

namespace {
ReplayRecord record(const quint64 sequence, const double logicalMs)
{
    ReplayRecord value;
    value.contractVersion = QStringLiteral("redline-viewmodels-v1");
    value.sequence = sequence;
    value.sceneId = QStringLiteral("standings-overtake");
    value.widget = QStringLiteral("standings");
    value.updateHz = 15;
    value.logicalMs = logicalMs;
    return value;
}

QByteArray rehash(QJsonObject document)
{
    document.remove(QStringLiteral("payloadSha256"));
    const QByteArray payload = QJsonDocument(document).toJson(QJsonDocument::Compact);
    document.insert(QStringLiteral("payloadSha256"),
                    QString::fromLatin1(QCryptographicHash::hash(payload, QCryptographicHash::Sha256).toHex()));
    return QJsonDocument(document).toJson(QJsonDocument::Indented);
}

QJsonObject validSingleRecordDocument()
{
    return QJsonObject{
        {QStringLiteral("schema"), QStringLiteral("vantare.qt-redline.motion-trace.v1")},
        {QStringLiteral("qpcFrequency"), 10'000'000},
        {QStringLiteral("replaySha256"), QString(64, QLatin1Char('a'))},
        {QStringLiteral("expectedRecords"), 1},
        {QStringLiteral("complete"), true},
        {QStringLiteral("events"), QJsonArray{
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), -2000.0}, {QStringLiteral("qpc"), 100}, {QStringLiteral("event"), QStringLiteral("model-apply-start")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), -2000.0}, {QStringLiteral("qpc"), 110}, {QStringLiteral("event"), QStringLiteral("model-apply-end")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), -2000.0}, {QStringLiteral("qpc"), 120}, {QStringLiteral("event"), QStringLiteral("qml-sync")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), -2000.0}, {QStringLiteral("qpc"), 130}, {QStringLiteral("event"), QStringLiteral("present")}},
         }},
    };
}
} // namespace

class QtMotionTraceTest final : public QObject
{
    Q_OBJECT

private slots:
    void writesCompleteHashPinnedTrace();
    void coalescesLogicalRecordsBeforePresentationWithoutLosingModelEvents();
    void rejectsInvalidBoundsAndPayloadHash();
    void rejectsOmittedEventEvenWhenRehashed();
    void rejectsNonMonotonicQpcEvenWhenRehashed();
};

void QtMotionTraceTest::writesCompleteHashPinnedTrace()
{
    QTemporaryDir temporary;
    QVERIFY(temporary.isValid());
    QList<qint64> ticks{100, 110, 120, 130, 200, 210, 220, 230};
    QtMotionTrace trace(temporary.filePath(QStringLiteral("trace.json")),
                        QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                        2, 10'000'000, [&ticks] { return ticks.takeFirst(); });

    trace.beginRecord(record(42, 0.0), 0);
    trace.endRecord(record(42, 0.0), 0);
    trace.qmlSync();
    QVERIFY(!trace.present());
    trace.beginRecord(record(43, 66.6667), 1);
    trace.endRecord(record(43, 66.6667), 1);
    trace.qmlSync();
    QVERIFY(trace.present());
    trace.qmlSync();
    QVERIFY(trace.present());
    QCOMPARE(trace.error(), QString());

    QFile output(temporary.filePath(QStringLiteral("trace.json")));
    QVERIFY(output.open(QIODevice::ReadOnly));
    const QByteArray bytes = output.readAll();
    QCOMPARE(QtMotionTrace::validate(bytes), QString());
    const QJsonObject document = QJsonDocument::fromJson(bytes).object();
    QCOMPARE(document.value(QStringLiteral("complete")).toBool(), true);
    QCOMPARE(document.value(QStringLiteral("events")).toArray().size(), 8);
}

void QtMotionTraceTest::rejectsInvalidBoundsAndPayloadHash()
{
    QJsonObject document = validSingleRecordDocument();
    QCOMPARE(QtMotionTrace::validate(rehash(document)), QString());

    document.insert(QStringLiteral("expectedRecords"), 0);
    QVERIFY(QtMotionTrace::validate(rehash(document)).contains(QStringLiteral("expectedRecords")));

    document = validSingleRecordDocument();
    QByteArray bytes = rehash(document);
    document = QJsonDocument::fromJson(bytes).object();
    document.insert(QStringLiteral("payloadSha256"), QString(64, QLatin1Char('b')));
    bytes = QJsonDocument(document).toJson(QJsonDocument::Indented);
    QVERIFY(QtMotionTrace::validate(bytes).contains(QStringLiteral("payload SHA-256")));
}

void QtMotionTraceTest::coalescesLogicalRecordsBeforePresentationWithoutLosingModelEvents()
{
    QTemporaryDir temporary;
    QVERIFY(temporary.isValid());
    QList<qint64> ticks{100, 110, 200, 210, 220, 230};
    QtMotionTrace trace(temporary.filePath(QStringLiteral("trace.json")),
                        QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                        2, 10'000'000, [&ticks] { return ticks.takeFirst(); });

    trace.beginRecord(record(42, -2000.0), 0);
    trace.endRecord(record(42, -2000.0), 0);
    trace.beginRecord(record(43, -1933.3333), 1);
    trace.endRecord(record(43, -1933.3333), 1);
    trace.qmlSync();
    QVERIFY(trace.present());

    QFile output(temporary.filePath(QStringLiteral("trace.json")));
    QVERIFY(output.open(QIODevice::ReadOnly));
    const QJsonObject document = QJsonDocument::fromJson(output.readAll()).object();
    QCOMPARE(document.value(QStringLiteral("events")).toArray().size(), 6);
}

void QtMotionTraceTest::rejectsOmittedEventEvenWhenRehashed()
{
    QJsonObject document{
        {QStringLiteral("schema"), QStringLiteral("vantare.qt-redline.motion-trace.v1")},
        {QStringLiteral("qpcFrequency"), 10'000'000},
        {QStringLiteral("replaySha256"), QString(64, QLatin1Char('a'))},
        {QStringLiteral("expectedRecords"), 1},
        {QStringLiteral("complete"), true},
        {QStringLiteral("events"), QJsonArray{
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 100}, {QStringLiteral("event"), QStringLiteral("model-apply-start")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 110}, {QStringLiteral("event"), QStringLiteral("model-apply-end")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 130}, {QStringLiteral("event"), QStringLiteral("present")}},
         }},
    };
    const QString error = QtMotionTrace::validate(rehash(document));
    QVERIFY2(error.contains(QStringLiteral("event completeness")), qPrintable(error));
}

void QtMotionTraceTest::rejectsNonMonotonicQpcEvenWhenRehashed()
{
    QJsonObject document{
        {QStringLiteral("schema"), QStringLiteral("vantare.qt-redline.motion-trace.v1")},
        {QStringLiteral("qpcFrequency"), 10'000'000},
        {QStringLiteral("replaySha256"), QString(64, QLatin1Char('a'))},
        {QStringLiteral("expectedRecords"), 1},
        {QStringLiteral("complete"), true},
        {QStringLiteral("events"), QJsonArray{
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 100}, {QStringLiteral("event"), QStringLiteral("model-apply-start")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 90}, {QStringLiteral("event"), QStringLiteral("model-apply-end")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 120}, {QStringLiteral("event"), QStringLiteral("qml-sync")}},
             QJsonObject{{QStringLiteral("sequence"), 42}, {QStringLiteral("sceneId"), QStringLiteral("standings-overtake")}, {QStringLiteral("frame"), 0}, {QStringLiteral("logicalMs"), 0.0}, {QStringLiteral("qpc"), 130}, {QStringLiteral("event"), QStringLiteral("present")}},
         }},
    };
    const QString error = QtMotionTrace::validate(rehash(document));
    QVERIFY2(error.contains(QStringLiteral("QPC monotonicity")), qPrintable(error));
}

QTEST_GUILESS_MAIN(QtMotionTraceTest)
#include "qtmotiontrace_test.moc"
