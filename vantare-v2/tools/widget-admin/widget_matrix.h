#pragma once

#include <QByteArray>
#include <QString>
#include <QVector>

struct WidgetAccessRow {
    QString id;
    bool free = false;
    bool pro = false;
    bool proPlus = false;
    bool launch = false;
    QString visibility = QStringLiteral("public");
};

class WidgetMatrix {
public:
    QVector<WidgetAccessRow> widgets;

    static bool parse(const QByteArray &json, WidgetMatrix &out, QString &error);
    bool validate(QString &error) const;
    QByteArray serialize() const;
};
