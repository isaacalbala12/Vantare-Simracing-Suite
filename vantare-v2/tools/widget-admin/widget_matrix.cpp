#include "widget_matrix.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QRegularExpression>

namespace {
bool readBool(const QJsonObject &object, const char *key, bool &value) {
    const auto item = object.value(QLatin1String(key));
    if (!item.isBool()) return false;
    value = item.toBool();
    return true;
}
}

bool WidgetMatrix::parse(const QByteArray &json, WidgetMatrix &out, QString &error) {
    QJsonParseError parseError;
    const auto document = QJsonDocument::fromJson(json, &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        error = QStringLiteral("JSON inválido: %1").arg(parseError.errorString());
        return false;
    }
    const auto root = document.object();
    if (root.value(QStringLiteral("version")) != 1 || !root.value(QStringLiteral("widgets")).isArray()) {
        error = QStringLiteral("Se espera version=1 y una lista widgets.");
        return false;
    }
    WidgetMatrix candidate;
    for (const auto &item : root.value(QStringLiteral("widgets")).toArray()) {
        if (!item.isObject()) {
            error = QStringLiteral("Cada widget debe ser un objeto.");
            return false;
        }
        const auto object = item.toObject();
        WidgetAccessRow row;
        if (!object.value(QStringLiteral("id")).isString() ||
            !readBool(object, "free", row.free) ||
            !readBool(object, "pro", row.pro) ||
            !readBool(object, "proPlus", row.proPlus) ||
            !readBool(object, "launch", row.launch)) {
            error = QStringLiteral("ID o permisos inválidos en un widget.");
            return false;
        }
        row.id = object.value(QStringLiteral("id")).toString();
        candidate.widgets.append(row);
    }
    if (!candidate.validate(error)) return false;
    out = candidate;
    return true;
}

bool WidgetMatrix::validate(QString &error) const {
    if (widgets.isEmpty()) {
        error = QStringLiteral("La matriz no puede estar vacía.");
        return false;
    }
    QSet<QString> seen;
    const QRegularExpression idPattern(QStringLiteral("^[a-z0-9]+(?:-[a-z0-9]+)*$"));
    for (const auto &row : widgets) {
	    if (!idPattern.match(row.id).hasMatch() || seen.contains(row.id)) {
            error = QStringLiteral("ID vacío o repetido: %1").arg(row.id);
            return false;
        }
        seen.insert(row.id);
        if ((row.free && (!row.pro || !row.proPlus || !row.launch)) ||
            (row.pro && !row.proPlus)) {
            error = QStringLiteral("La jerarquía de licencias no es válida para %1.").arg(row.id);
            return false;
        }
        if ((row.id == QStringLiteral("standings") || row.id == QStringLiteral("pedals")) && !row.free) {
            error = QStringLiteral("Standings y Pedals deben seguir disponibles en Free.");
            return false;
        }
    }
    if (!seen.contains(QStringLiteral("standings")) || !seen.contains(QStringLiteral("pedals"))) {
        error = QStringLiteral("Faltan widgets gratuitos del contrato.");
        return false;
    }
    return true;
}

QByteArray WidgetMatrix::serialize() const {
    QJsonArray rows;
    for (const auto &row : widgets) {
        QJsonObject object;
        object.insert(QStringLiteral("id"), row.id);
        object.insert(QStringLiteral("free"), row.free);
        object.insert(QStringLiteral("pro"), row.pro);
        object.insert(QStringLiteral("proPlus"), row.proPlus);
        object.insert(QStringLiteral("launch"), row.launch);
        rows.append(object);
    }
    QJsonObject root;
    root.insert(QStringLiteral("version"), 1);
    root.insert(QStringLiteral("widgets"), rows);
    return QJsonDocument(root).toJson(QJsonDocument::Indented);
}
