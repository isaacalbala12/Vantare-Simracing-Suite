#include <QCoreApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QUrl>

#include <memory>

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    if (argc != 3)
        return 2;

    QQmlEngine engine;
    QQmlComponent standings(&engine, QUrl::fromLocalFile(QString::fromLocal8Bit(argv[1])));
    if (standings.status() != QQmlComponent::Ready || !standings.errors().isEmpty())
        return 3;

    QQmlComponent tokens(&engine, QUrl::fromLocalFile(QString::fromLocal8Bit(argv[2])));
    if (tokens.status() != QQmlComponent::Ready || !tokens.errors().isEmpty())
        return 4;
    std::unique_ptr<QObject> instance(tokens.create());
    if (!instance)
        return 5;
    return instance->property("panelWidth").toInt() == 420 ? 0 : 6;
}
