#pragma once

#include <QJsonObject>
#include <QString>
#include <QVector>

struct ReplayRecord {
    QString contractVersion;
    quint64 sequence = 0;
    QString sceneId;
    QString widget;
    int updateHz = 0;
    double logicalMs = 0.0;
    QJsonObject viewModel;
};

struct ReplayCustody {
    QString manifestVersion;
    QString contractVersion;
    QString replaySha256;
    qsizetype totalRecords = 0;
    QString sceneId;
    QString sceneSha256;
};

struct ReplayLoadResult {
    QVector<ReplayRecord> records;
    ReplayCustody custody;
    QString error;

    [[nodiscard]] bool ok() const { return error.isEmpty(); }
};

class ReplayLoader final
{
public:
    [[nodiscard]] static ReplayLoadResult load(const QString &replayPath,
                                               const QString &manifestPath,
                                               const QString &sceneId);
};
