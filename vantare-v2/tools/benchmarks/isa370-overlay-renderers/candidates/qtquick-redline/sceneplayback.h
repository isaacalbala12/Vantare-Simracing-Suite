#pragma once

#include "replayloader.h"

#include <QElapsedTimer>
#include <QObject>
#include <QTimer>

class ScenePlayback final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool finished READ finished NOTIFY finishedChanged)
    Q_PROPERTY(int currentIndex READ currentIndex NOTIFY recordAdvanced)

public:
    explicit ScenePlayback(QObject *parent = nullptr);

    void setRecords(QVector<ReplayRecord> records);
    void start();
    [[nodiscard]] const ReplayRecord *advanceToElapsedMs(qint64 elapsedMs);
    [[nodiscard]] bool finished() const { return m_finished; }
    [[nodiscard]] int currentIndex() const { return m_currentIndex; }

signals:
    void recordAdvanced(const ReplayRecord &record);
    void finishedChanged();

private:
    void tick();

    QVector<ReplayRecord> m_records;
    QTimer m_timer;
    QElapsedTimer m_clock;
    int m_currentIndex = -1;
    bool m_finished = false;
};

Q_DECLARE_METATYPE(ReplayRecord)
