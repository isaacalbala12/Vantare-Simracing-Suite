#include "replaymodels.h"

#include <QJsonArray>
#include <QRegularExpression>

#include <algorithm>
#include <cmath>
#include <limits>

namespace {
QVariant valueForRole(const QJsonObject &row, const int role)
{
    static const QHash<int, QString> keys{
        {KeyedRowsModel::IdRole, QStringLiteral("id")},
        {KeyedRowsModel::PositionRole, QStringLiteral("position")},
        {KeyedRowsModel::DriverNumberRole, QStringLiteral("driverNumber")},
        {KeyedRowsModel::DriverNameRole, QStringLiteral("driverName")},
        {KeyedRowsModel::VehicleClassRole, QStringLiteral("vehicleClass")},
        {KeyedRowsModel::TeamCodeRole, QStringLiteral("teamCode")},
        {KeyedRowsModel::TeamBrandColorRole, QStringLiteral("teamBrandColor")},
        {KeyedRowsModel::GapTextRole, QStringLiteral("gapText")},
        {KeyedRowsModel::IntervalTextRole, QStringLiteral("intervalText")},
        {KeyedRowsModel::CurrentLapTextRole, QStringLiteral("currentLapText")},
        {KeyedRowsModel::LastLapTextRole, QStringLiteral("lastLapText")},
        {KeyedRowsModel::BestLapTextRole, QStringLiteral("bestLapText")},
        {KeyedRowsModel::PitTextRole, QStringLiteral("pitText")},
        {KeyedRowsModel::TireCompoundRole, QStringLiteral("tireCompound")},
        {KeyedRowsModel::IsPlayerRole, QStringLiteral("isPlayer")},
        {KeyedRowsModel::IsLeaderRole, QStringLiteral("isLeader")},
        {KeyedRowsModel::SideRole, QStringLiteral("side")},
        {KeyedRowsModel::ToneRole, QStringLiteral("tone")},
        {KeyedRowsModel::GapSecondsRole, QStringLiteral("gapSeconds")},
    };
    return row.value(keys.value(role)).toVariant();
}

QString stringValue(const QJsonObject &object, const char *key)
{
    return object.value(QString::fromLatin1(key)).toString();
}

double lapSeconds(const QString &text)
{
    const QStringList parts = text.trimmed().split(QLatin1Char(':'));
    if (parts.size() < 1 || parts.size() > 2) {
        return std::numeric_limits<double>::infinity();
    }
    static const QRegularExpression minutesPattern(QStringLiteral("^\\d+$"));
    static const QRegularExpression secondsPattern(QStringLiteral("^\\d{1,2}\\.\\d{1,3}$"));
    const QString minutesText = parts.size() == 2 ? parts.at(0) : QStringLiteral("0");
    const QString secondsText = parts.constLast();
    if (!minutesPattern.match(minutesText).hasMatch()
        || !secondsPattern.match(secondsText).hasMatch()) {
        return std::numeric_limits<double>::infinity();
    }
    bool minutesOk = false;
    bool secondsOk = false;
    const double minutes = minutesText.toDouble(&minutesOk);
    const double seconds = secondsText.toDouble(&secondsOk);
    if (!minutesOk || !secondsOk || minutes < 0.0 || seconds < 0.0 || seconds >= 60.0) {
        return std::numeric_limits<double>::infinity();
    }
    return minutes * 60.0 + seconds;
}
} // namespace

KeyedRowsModel::KeyedRowsModel(QString widget, QObject *parent)
    : QAbstractListModel(parent)
    , m_widget(std::move(widget))
{
}

int KeyedRowsModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_rows.size();
}

QVariant KeyedRowsModel::data(const QModelIndex &index, const int role) const
{
    if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size()) {
        return {};
    }
    return valueForRole(m_rows.at(index.row()), role);
}

QHash<int, QByteArray> KeyedRowsModel::roleNames() const
{
    return {
        {IdRole, "rowId"}, {PositionRole, "position"},
        {DriverNumberRole, "driverNumber"}, {DriverNameRole, "driverName"},
        {VehicleClassRole, "vehicleClass"}, {TeamCodeRole, "teamCode"},
        {TeamBrandColorRole, "teamBrandColor"}, {GapTextRole, "gapText"},
        {IntervalTextRole, "intervalText"}, {CurrentLapTextRole, "currentLapText"},
        {LastLapTextRole, "lastLapText"}, {BestLapTextRole, "bestLapText"},
        {PitTextRole, "pitText"}, {TireCompoundRole, "tireCompound"},
        {IsPlayerRole, "isPlayer"}, {IsLeaderRole, "isLeader"},
        {SideRole, "side"}, {ToneRole, "tone"}, {GapSecondsRole, "gapSeconds"},
    };
}

int KeyedRowsModel::indexOfId(const QString &id, const int start) const
{
    for (int index = start; index < m_rows.size(); ++index) {
        if (m_rows.at(index).value(QStringLiteral("id")).toString() == id) {
            return index;
        }
    }
    return -1;
}

void KeyedRowsModel::applyRows(const ReplayRecord &record)
{
    if (record.widget != m_widget) {
        return;
    }
    const QString nextStatus = record.viewModel.value(QStringLiteral("status")).toString();
    const QString nextStatusMessage = record.viewModel.value(QStringLiteral("statusMessage")).toString();
    if (m_status != nextStatus || m_statusMessage != nextStatusMessage) {
        m_status = nextStatus;
        m_statusMessage = nextStatusMessage;
        emit statusChanged();
    }

    QVector<QJsonObject> desired;
    const QJsonArray sourceRows = record.viewModel.value(QStringLiteral("rows")).toArray();
    desired.reserve(sourceRows.size());
    QSet<QString> desiredIds;
    for (const QJsonValue &value : sourceRows) {
        const QJsonObject row = value.toObject();
        const QString id = row.value(QStringLiteral("id")).toString();
        if (id.isEmpty() || desiredIds.contains(id)) {
            return;
        }
        desiredIds.insert(id);
        desired.push_back(row);
    }

    for (int index = m_rows.size() - 1; index >= 0; --index) {
        const QString id = m_rows.at(index).value(QStringLiteral("id")).toString();
        if (!desiredIds.contains(id)) {
            beginRemoveRows({}, index, index);
            m_rows.removeAt(index);
            endRemoveRows();
        }
    }
    for (int target = 0; target < desired.size(); ++target) {
        const QString id = desired.at(target).value(QStringLiteral("id")).toString();
        int current = indexOfId(id, target);
        if (current < 0) {
            beginInsertRows({}, target, target);
            m_rows.insert(target, desired.at(target));
            endInsertRows();
            continue;
        }
        if (current != target) {
            beginMoveRows({}, current, current, {}, target);
            m_rows.move(current, target);
            endMoveRows();
        }
        if (m_rows.at(target) != desired.at(target)) {
            m_rows[target] = desired.at(target);
            emit dataChanged(index(target), index(target));
        }
    }
}

StandingsModel::StandingsModel(QObject *parent)
    : KeyedRowsModel(QStringLiteral("standings"), parent)
{
}

void StandingsModel::apply(const ReplayRecord &record)
{
    if (record.widget != QStringLiteral("standings")) {
        return;
    }
    applyRows(record);
    const QJsonObject &value = record.viewModel;
    const QString activeClass = stringValue(value, "activeClass");
    const QString sessionLabel = stringValue(value, "sessionLabel");
    const QString remainingText = stringValue(value, "remainingText");
    const QString lapText = stringValue(value, "lapText");
    const QVariantList columns = value.value(QStringLiteral("columns")).toArray().toVariantList();
    if (m_activeClass != activeClass || m_sessionLabel != sessionLabel
        || m_remainingText != remainingText || m_lapText != lapText
        || m_columns != columns) {
        m_activeClass = activeClass;
        m_sessionLabel = sessionLabel;
        m_remainingText = remainingText;
        m_lapText = lapText;
        m_columns = columns;
        emit metadataChanged();
    }
    emit visualClassesChanged();
}

QVariantList StandingsModel::visualClasses() const
{
    double fastestSeconds = std::numeric_limits<double>::infinity();
    for (const QJsonObject &row : rows()) {
        const double candidate = lapSeconds(row.value(QStringLiteral("bestLapText")).toString());
        if (candidate < fastestSeconds) {
            fastestSeconds = candidate;
        }
    }

    struct VisualClass {
        QString vehicleClass;
        QJsonArray rows;
        bool containsPlayer = false;
        int insertionOrder = 0;
    };
    QVector<VisualClass> groups;
    QHash<QString, qsizetype> groupIndexes;
    for (const QJsonObject &sourceRow : rows()) {
        QString vehicleClass = sourceRow.value(QStringLiteral("vehicleClass")).toString();
        if (vehicleClass.isEmpty()) {
            vehicleClass = QStringLiteral("—");
        }
        auto groupIndex = groupIndexes.constFind(vehicleClass);
        if (groupIndex == groupIndexes.cend()) {
            const qsizetype newIndex = groups.size();
            groups.append(VisualClass{vehicleClass, {}, false, static_cast<int>(newIndex)});
            groupIndexes.insert(vehicleClass, newIndex);
            groupIndex = groupIndexes.constFind(vehicleClass);
        }
        QJsonObject visualRow = sourceRow;
        visualRow.insert(QStringLiteral("inPit"),
                         !sourceRow.value(QStringLiteral("pitText")).toString().trimmed().isEmpty());
        const double candidate = lapSeconds(sourceRow.value(QStringLiteral("bestLapText")).toString());
        visualRow.insert(QStringLiteral("isSessionBest"),
                         std::isfinite(candidate) && candidate == fastestSeconds);
        VisualClass &group = groups[*groupIndex];
        group.rows.append(visualRow);
        group.containsPlayer = group.containsPlayer
            || sourceRow.value(QStringLiteral("isPlayer")).toBool();
    }

    const auto hierarchyIndex = [](const QString &vehicleClass) {
        static const QStringList hierarchy{QStringLiteral("HYPERCAR"), QStringLiteral("LMP2"),
                                           QStringLiteral("LMP3"), QStringLiteral("GT3")};
        const int index = hierarchy.indexOf(vehicleClass.toUpper());
        return index < 0 ? hierarchy.size() : index;
    };
    std::stable_sort(groups.begin(), groups.end(), [&](const VisualClass &left,
                                                       const VisualClass &right) {
        if (left.containsPlayer != right.containsPlayer) {
            return !left.containsPlayer;
        }
        const int leftHierarchy = hierarchyIndex(left.vehicleClass);
        const int rightHierarchy = hierarchyIndex(right.vehicleClass);
        if (leftHierarchy != rightHierarchy) {
            return leftHierarchy < rightHierarchy;
        }
        return left.insertionOrder < right.insertionOrder;
    });

    QJsonArray classes;
    for (const VisualClass &group : groups) {
        classes.append(QJsonObject{{QStringLiteral("vehicleClass"), group.vehicleClass},
                                   {QStringLiteral("rows"), group.rows}});
    }
    return classes.toVariantList();
}

RelativeModel::RelativeModel(QObject *parent)
    : KeyedRowsModel(QStringLiteral("relative"), parent)
{
}

void RelativeModel::apply(const ReplayRecord &record)
{
    if (record.widget != QStringLiteral("relative")) {
        return;
    }
    applyRows(record);
    const QString rowHeightMode = stringValue(record.viewModel, "rowHeightMode");
    const QVariantList columns = record.viewModel.value(QStringLiteral("columns")).toArray().toVariantList();
    if (m_rowHeightMode != rowHeightMode || m_columns != columns) {
        m_rowHeightMode = rowHeightMode;
        m_columns = columns;
        emit metadataChanged();
    }
}

DeltaModel::DeltaModel(QObject *parent)
    : QObject(parent)
{
}

void DeltaModel::apply(const ReplayRecord &record)
{
    if (record.widget != QStringLiteral("delta")) {
        return;
    }
    const QJsonObject &value = record.viewModel;
    m_status = stringValue(value, "status");
    m_statusMessage = stringValue(value, "statusMessage");
    m_tone = stringValue(value, "tone");
    m_deltaText = stringValue(value, "deltaText");
    m_lastLapText = stringValue(value, "lastLapText");
    m_bestLapText = stringValue(value, "bestLapText");
    m_progress = value.value(QStringLiteral("progress")).toDouble();
    m_lapText = stringValue(value, "lapText");
    m_predictedLapText = stringValue(value, "predictedLapText");
    m_splitText = stringValue(value, "splitText");
    emit changed();
}

PedalsModel::PedalsModel(QObject *parent)
    : QObject(parent)
{
}

void PedalsModel::apply(const ReplayRecord &record)
{
    if (record.widget != QStringLiteral("pedals")) {
        return;
    }
    const QJsonObject &value = record.viewModel;
    m_status = stringValue(value, "status");
    m_statusMessage = stringValue(value, "statusMessage");
    m_throttle = value.value(QStringLiteral("throttle")).toDouble();
    m_brake = value.value(QStringLiteral("brake")).toDouble();
    m_clutch = value.value(QStringLiteral("clutch")).toDouble();
    m_throttleText = stringValue(value, "throttleText");
    m_brakeText = stringValue(value, "brakeText");
    m_clutchText = stringValue(value, "clutchText");
    emit changed();
}
