#include "widget_matrix.h"

#include <QTest>

class WidgetMatrixTest final : public QObject {
    Q_OBJECT
private slots:
    void roundTrip() {
        const QByteArray source = R"({"version":1,"widgets":[
            {"id":"standings","free":true,"pro":true,"proPlus":true,"launch":true},
            {"id":"pedals","free":true,"pro":true,"proPlus":true,"launch":true},
            {"id":"delta","free":false,"pro":true,"proPlus":true,"launch":true}
        ]})";
        WidgetMatrix matrix;
        QString error;
        QVERIFY2(WidgetMatrix::parse(source, matrix, error), qPrintable(error));
        QCOMPARE(matrix.widgets.size(), 3);
        WidgetMatrix copy;
        QVERIFY2(WidgetMatrix::parse(matrix.serialize(), copy, error), qPrintable(error));
        QCOMPARE(copy.widgets[2].id, QStringLiteral("delta"));
        QVERIFY(copy.widgets[2].pro);
    }

    void rejectsInvalidRights() {
        WidgetMatrix matrix;
        matrix.widgets = {
            {QStringLiteral("standings"), true, true, true, true},
            {QStringLiteral("pedals"), true, true, true, true},
            {QStringLiteral("delta"), false, true, false, true},
        };
        QString error;
        QVERIFY(!matrix.validate(error));
        QVERIFY(error.contains(QStringLiteral("delta")));
    }

    void protectsFreeContract() {
        WidgetMatrix matrix;
        matrix.widgets = {
            {QStringLiteral("standings"), false, true, true, true},
            {QStringLiteral("pedals"), true, true, true, true},
        };
        QString error;
        QVERIFY(!matrix.validate(error));
    }

    void keepsLaunchIndependentAndRejectsInvalidIds() {
        WidgetMatrix matrix;
        matrix.widgets = {
            {QStringLiteral("standings"), true, true, true, true},
            {QStringLiteral("pedals"), true, true, true, true},
            {QStringLiteral("radar"), false, false, false, true},
        };
        QString error;
        QVERIFY2(matrix.validate(error), qPrintable(error));
        matrix.widgets[2].id = QStringLiteral("../radar");
        QVERIFY(!matrix.validate(error));
    }
};

QTEST_GUILESS_MAIN(WidgetMatrixTest)
#include "widget_matrix_test.moc"
