#pragma once

#include "replayloader.h"

#include <QAbstractListModel>
#include <QObject>

class KeyedRowsModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusChanged)

public:
    enum Role {
        IdRole = Qt::UserRole + 1,
        PositionRole,
        DriverNumberRole,
        DriverNameRole,
        VehicleClassRole,
        TeamCodeRole,
        TeamBrandColorRole,
        GapTextRole,
        IntervalTextRole,
        CurrentLapTextRole,
        LastLapTextRole,
        BestLapTextRole,
        PitTextRole,
        TireCompoundRole,
        IsPlayerRole,
        IsLeaderRole,
        SideRole,
        ToneRole,
        GapSecondsRole,
    };
    Q_ENUM(Role)

    [[nodiscard]] int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    [[nodiscard]] QVariant data(const QModelIndex &index, int role) const override;
    [[nodiscard]] QHash<int, QByteArray> roleNames() const override;
    [[nodiscard]] QString status() const { return m_status; }
    [[nodiscard]] QString statusMessage() const { return m_statusMessage; }

signals:
    void statusChanged();

protected:
    explicit KeyedRowsModel(QString widget, QObject *parent = nullptr);
    void applyRows(const ReplayRecord &record);
    [[nodiscard]] const QVector<QJsonObject> &rows() const { return m_rows; }

private:
    [[nodiscard]] int indexOfId(const QString &id, int start = 0) const;

    QString m_widget;
    QString m_status = QStringLiteral("missing");
    QString m_statusMessage;
    QVector<QJsonObject> m_rows;
};

class StandingsModel final : public KeyedRowsModel
{
    Q_OBJECT
    Q_PROPERTY(QString activeClass READ activeClass NOTIFY metadataChanged)
    Q_PROPERTY(QString sessionLabel READ sessionLabel NOTIFY metadataChanged)
    Q_PROPERTY(QString remainingText READ remainingText NOTIFY metadataChanged)
    Q_PROPERTY(QString lapText READ lapText NOTIFY metadataChanged)
    Q_PROPERTY(QVariantList columns READ columns NOTIFY metadataChanged)
    Q_PROPERTY(QVariantList visualClasses READ visualClasses NOTIFY visualClassesChanged)
public:
    explicit StandingsModel(QObject *parent = nullptr);
    void apply(const ReplayRecord &record);
    [[nodiscard]] QString activeClass() const { return m_activeClass; }
    [[nodiscard]] QString sessionLabel() const { return m_sessionLabel; }
    [[nodiscard]] QString remainingText() const { return m_remainingText; }
    [[nodiscard]] QString lapText() const { return m_lapText; }
    [[nodiscard]] QVariantList columns() const { return m_columns; }
    [[nodiscard]] QVariantList visualClasses() const;

signals:
    void metadataChanged();
    void visualClassesChanged();

private:
    QString m_activeClass;
    QString m_sessionLabel;
    QString m_remainingText;
    QString m_lapText;
    QVariantList m_columns;
};

class RelativeModel final : public KeyedRowsModel
{
    Q_OBJECT
    Q_PROPERTY(QString rowHeightMode READ rowHeightMode NOTIFY metadataChanged)
    Q_PROPERTY(QVariantList columns READ columns NOTIFY metadataChanged)
public:
    explicit RelativeModel(QObject *parent = nullptr);
    void apply(const ReplayRecord &record);
    [[nodiscard]] QString rowHeightMode() const { return m_rowHeightMode; }
    [[nodiscard]] QVariantList columns() const { return m_columns; }

signals:
    void metadataChanged();

private:
    QString m_rowHeightMode;
    QVariantList m_columns;
};

class DeltaModel final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY changed)
    Q_PROPERTY(QString tone READ tone NOTIFY changed)
    Q_PROPERTY(QString deltaText READ deltaText NOTIFY changed)
    Q_PROPERTY(QString lastLapText READ lastLapText NOTIFY changed)
    Q_PROPERTY(QString bestLapText READ bestLapText NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY changed)
    Q_PROPERTY(QString lapText READ lapText NOTIFY changed)
    Q_PROPERTY(QString predictedLapText READ predictedLapText NOTIFY changed)
    Q_PROPERTY(QString splitText READ splitText NOTIFY changed)

public:
    explicit DeltaModel(QObject *parent = nullptr);
    void apply(const ReplayRecord &record);
    [[nodiscard]] QString status() const { return m_status; }
    [[nodiscard]] QString statusMessage() const { return m_statusMessage; }
    [[nodiscard]] QString tone() const { return m_tone; }
    [[nodiscard]] QString deltaText() const { return m_deltaText; }
    [[nodiscard]] QString lastLapText() const { return m_lastLapText; }
    [[nodiscard]] QString bestLapText() const { return m_bestLapText; }
    [[nodiscard]] double progress() const { return m_progress; }
    [[nodiscard]] QString lapText() const { return m_lapText; }
    [[nodiscard]] QString predictedLapText() const { return m_predictedLapText; }
    [[nodiscard]] QString splitText() const { return m_splitText; }

signals:
    void changed();

private:
    QString m_status = QStringLiteral("missing");
    QString m_statusMessage;
    QString m_tone;
    QString m_deltaText;
    QString m_lastLapText;
    QString m_bestLapText;
    double m_progress = 0.0;
    QString m_lapText;
    QString m_predictedLapText;
    QString m_splitText;
};

class PedalsModel final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY changed)
    Q_PROPERTY(double throttle READ throttle NOTIFY changed)
    Q_PROPERTY(double brake READ brake NOTIFY changed)
    Q_PROPERTY(double clutch READ clutch NOTIFY changed)
    Q_PROPERTY(QString throttleText READ throttleText NOTIFY changed)
    Q_PROPERTY(QString brakeText READ brakeText NOTIFY changed)
    Q_PROPERTY(QString clutchText READ clutchText NOTIFY changed)

public:
    explicit PedalsModel(QObject *parent = nullptr);
    void apply(const ReplayRecord &record);
    [[nodiscard]] QString status() const { return m_status; }
    [[nodiscard]] QString statusMessage() const { return m_statusMessage; }
    [[nodiscard]] double throttle() const { return m_throttle; }
    [[nodiscard]] double brake() const { return m_brake; }
    [[nodiscard]] double clutch() const { return m_clutch; }
    [[nodiscard]] QString throttleText() const { return m_throttleText; }
    [[nodiscard]] QString brakeText() const { return m_brakeText; }
    [[nodiscard]] QString clutchText() const { return m_clutchText; }

signals:
    void changed();

private:
    QString m_status = QStringLiteral("missing");
    QString m_statusMessage;
    double m_throttle = 0.0;
    double m_brake = 0.0;
    double m_clutch = 0.0;
    QString m_throttleText;
    QString m_brakeText;
    QString m_clutchText;
};
