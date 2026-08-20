#include "sceneplayback.h"

#include <algorithm>

ScenePlayback::ScenePlayback(QObject *parent)
    : QObject(parent)
{
    m_timer.setTimerType(Qt::PreciseTimer);
    m_timer.setInterval(4);
    connect(&m_timer, &QTimer::timeout, this, &ScenePlayback::tick);
}

void ScenePlayback::setRecords(QVector<ReplayRecord> records)
{
    m_timer.stop();
    m_records = std::move(records);
    m_currentIndex = -1;
    if (m_finished) {
        m_finished = false;
        emit finishedChanged();
    }
}

void ScenePlayback::start()
{
    if (m_records.isEmpty()) {
        if (!m_finished) {
            m_finished = true;
            emit finishedChanged();
        }
        return;
    }
    m_clock.restart();
    (void)advanceToElapsedMs(0);
    if (!m_finished) {
        m_timer.start();
    }
}

const ReplayRecord *ScenePlayback::advanceToElapsedMs(const qint64 elapsedMs)
{
    if (m_records.isEmpty()) {
        return nullptr;
    }
    const double targetLogicalMs = m_records.first().logicalMs
        + static_cast<double>(std::max<qint64>(0, elapsedMs));
    if (m_currentIndex < 0) {
        m_currentIndex = 0;
        emit recordAdvanced(m_records.at(m_currentIndex));
    }
    while (m_currentIndex + 1 < m_records.size()
           && m_records.at(m_currentIndex + 1).logicalMs <= targetLogicalMs) {
        ++m_currentIndex;
        emit recordAdvanced(m_records.at(m_currentIndex));
    }
    const bool nextFinished = m_currentIndex == m_records.size() - 1
        && targetLogicalMs >= m_records.last().logicalMs;
    if (nextFinished != m_finished) {
        m_finished = nextFinished;
        emit finishedChanged();
    }
    if (m_finished) {
        m_timer.stop();
    }
    return &m_records.at(m_currentIndex);
}

void ScenePlayback::tick()
{
    (void)advanceToElapsedMs(m_clock.elapsed());
}
