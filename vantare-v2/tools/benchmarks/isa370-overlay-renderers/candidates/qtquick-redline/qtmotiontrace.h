#pragma once

#include "replayloader.h"

#include <QJsonArray>
#include <QMutex>
#include <QString>

#include <functional>

class QtMotionTrace final
{
public:
    using Clock = std::function<qint64()>;

    QtMotionTrace(QString outputPath, QString replaySha256, int expectedRecords);
    QtMotionTrace(QString outputPath, QString replaySha256, int expectedRecords,
                  qint64 qpcFrequency, Clock clock);

    void beginRecord(const ReplayRecord &record, int frame);
    void endRecord(const ReplayRecord &record, int frame);
    void qmlSync();
    [[nodiscard]] bool present();
    [[nodiscard]] bool enabled() const { return m_enabled; }
    [[nodiscard]] QString error() const;

    [[nodiscard]] static QString validate(const QByteArray &bytes);

private:
    void appendLocked(const ReplayRecord &record, int frame, const QString &event);
    [[nodiscard]] bool finalizeLocked();

    mutable QMutex m_mutex;
    QString m_outputPath;
    QString m_replaySha256;
    int m_expectedRecords = 0;
    qint64 m_qpcFrequency = 0;
    Clock m_clock;
    QJsonArray m_events;
    ReplayRecord m_latestRecord;
    int m_latestFrame = -1;
    bool m_modelOpen = false;
    ReplayRecord m_syncedRecord;
    int m_syncedFrame = -1;
    bool m_syncPending = false;
    bool m_enabled = false;
    bool m_finalized = false;
    QString m_error;
};
