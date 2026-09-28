#include "widget_matrix.h"

#include <QApplication>
#include <QComboBox>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QHeaderView>
#include <QLabel>
#include <QLineEdit>
#include <QMainWindow>
#include <QMessageBox>
#include <QPushButton>
#include <QSaveFile>
#include <QTableWidget>
#include <QVBoxLayout>

class WidgetAdminWindow final : public QMainWindow {
public:
    WidgetAdminWindow() {
        setWindowTitle(QStringLiteral("Vantare Admin · Widgets y licencias"));
        resize(960, 680);

        auto *page = new QWidget(this);
        auto *layout = new QVBoxLayout(page);
        auto *title = new QLabel(QStringLiteral("Widgets por licencia"), page);
        QFont titleFont = title->font();
        titleFont.setPointSize(18);
        titleFont.setBold(true);
        title->setFont(titleFont);
        layout->addWidget(title);

        auto *description = new QLabel(
            QStringLiteral("Edita un borrador para la siguiente versión. Los widgets sin acceso se muestran con candado en Studio."), page);
        description->setWordWrap(true);
        layout->addWidget(description);

        auto *controls = new QHBoxLayout();
        auto *openButton = new QPushButton(QStringLiteral("Abrir matriz…"), page);
        controls->addWidget(openButton);
        search_ = new QLineEdit(page);
        search_->setPlaceholderText(QStringLiteral("Buscar widget por ID"));
        controls->addWidget(search_, 1);
        controls->addWidget(new QLabel(QStringLiteral("Vista previa:"), page));
        tier_ = new QComboBox(page);
        tier_->addItems({QStringLiteral("Free"), QStringLiteral("Pro"),
                         QStringLiteral("Pro Plus"), QStringLiteral("Launch Edition")});
        controls->addWidget(tier_);
        layout->addLayout(controls);

        source_ = new QLabel(QStringLiteral("Abre la matriz versionada para empezar."), page);
        source_->setTextInteractionFlags(Qt::TextSelectableByMouse);
        layout->addWidget(source_);

        table_ = new QTableWidget(page);
        table_->setColumnCount(6);
        table_->setHorizontalHeaderLabels({QStringLiteral("Widget"), QStringLiteral("Free"),
            QStringLiteral("Pro"), QStringLiteral("Pro Plus"), QStringLiteral("Launch Edition"),
            QStringLiteral("Vista previa")});
        table_->horizontalHeader()->setSectionResizeMode(0, QHeaderView::Stretch);
        table_->horizontalHeader()->setSectionResizeMode(5, QHeaderView::ResizeToContents);
        table_->verticalHeader()->setVisible(false);
        table_->setAlternatingRowColors(true);
        table_->setSelectionBehavior(QAbstractItemView::SelectRows);
        layout->addWidget(table_, 1);

        summary_ = new QLabel(page);
        layout->addWidget(summary_);
        auto *saveButton = new QPushButton(QStringLiteral("Guardar propuesta…"), page);
        layout->addWidget(saveButton, 0, Qt::AlignRight);
        setCentralWidget(page);

        connect(openButton, &QPushButton::clicked, this, [this] {
            const auto path = QFileDialog::getOpenFileName(this, QStringLiteral("Abrir matriz de widgets"),
                QString(), QStringLiteral("JSON (*.json)"));
            if (!path.isEmpty()) load(path);
        });
        connect(saveButton, &QPushButton::clicked, this, [this] { saveProposal(); });
        connect(search_, &QLineEdit::textChanged, this, [this] { refreshPreview(); });
        connect(tier_, &QComboBox::currentIndexChanged, this, [this] { refreshPreview(); });
        connect(table_, &QTableWidget::itemChanged, this, [this](QTableWidgetItem *item) {
            if (loading_ || item->column() < 1 || item->column() > 4) return;
            auto &row = matrix_.widgets[item->row()];
            const bool allowed = item->checkState() == Qt::Checked;
            switch (item->column()) {
            case 1: row.free = allowed; break;
            case 2: row.pro = allowed; break;
            case 3: row.proPlus = allowed; break;
            case 4: row.launch = allowed; break;
            }
            refreshPreview();
        });
        refreshPreview();
    }

    bool load(const QString &path) {
        QFile file(path);
        if (!file.open(QIODevice::ReadOnly)) {
            QMessageBox::critical(this, QStringLiteral("No se pudo abrir"), file.errorString());
            return false;
        }
        WidgetMatrix next;
        QString error;
        if (!WidgetMatrix::parse(file.readAll(), next, error)) {
            QMessageBox::critical(this, QStringLiteral("Matriz inválida"), error);
            return false;
        }
        sourcePath_ = QFileInfo(path).absoluteFilePath();
        original_ = next.serialize();
        matrix_ = next;
        source_->setText(QStringLiteral("Origen: %1").arg(sourcePath_));
        loading_ = true;
        table_->setRowCount(matrix_.widgets.size());
        for (qsizetype rowIndex = 0; rowIndex < matrix_.widgets.size(); ++rowIndex) {
            const auto &row = matrix_.widgets[rowIndex];
            auto *name = new QTableWidgetItem(row.id);
            name->setFlags(Qt::ItemIsSelectable | Qt::ItemIsEnabled);
            table_->setItem(rowIndex, 0, name);
            const bool values[] = {row.free, row.pro, row.proPlus, row.launch};
            for (int column = 1; column <= 4; ++column) {
                auto *cell = new QTableWidgetItem();
                cell->setFlags(Qt::ItemIsEnabled | Qt::ItemIsUserCheckable | Qt::ItemIsSelectable);
                cell->setCheckState(values[column - 1] ? Qt::Checked : Qt::Unchecked);
                table_->setItem(rowIndex, column, cell);
            }
            auto *preview = new QTableWidgetItem();
            preview->setFlags(Qt::ItemIsSelectable | Qt::ItemIsEnabled);
            table_->setItem(rowIndex, 5, preview);
        }
        loading_ = false;
        refreshPreview();
        return true;
    }

private:
    void refreshPreview() {
        int allowedCount = 0;
        int changedCount = 0;
        for (qsizetype i = 0; i < matrix_.widgets.size(); ++i) {
            const auto &row = matrix_.widgets[i];
            const bool allowed = tier_->currentIndex() == 0 ? row.free :
                tier_->currentIndex() == 1 ? row.pro :
                tier_->currentIndex() == 2 ? row.proPlus : row.launch;
            if (allowed) ++allowedCount;
            table_->item(i, 5)->setText(allowed ? QStringLiteral("Disponible") : QStringLiteral("🔒 Con candado"));
            table_->setRowHidden(i, !row.id.contains(search_->text(), Qt::CaseInsensitive));
        }
        if (!original_.isEmpty()) {
            WidgetMatrix initial;
            QString error;
            if (WidgetMatrix::parse(original_, initial, error)) {
                for (qsizetype i = 0; i < matrix_.widgets.size(); ++i) {
                    const auto &a = matrix_.widgets[i];
                    const auto &b = initial.widgets[i];
                    if (a.free != b.free || a.pro != b.pro ||
                        a.proPlus != b.proPlus || a.launch != b.launch) ++changedCount;
                }
            }
        }
        summary_->setText(QStringLiteral("%1 disponibles · %2 con candado · %3 widgets modificados")
            .arg(allowedCount).arg(matrix_.widgets.size() - allowedCount).arg(changedCount));
    }

    void saveProposal() {
        if (sourcePath_.isEmpty()) {
            QMessageBox::information(this, QStringLiteral("Sin matriz"), QStringLiteral("Abre una matriz primero."));
            return;
        }
        QString error;
        if (!matrix_.validate(error)) {
            QMessageBox::warning(this, QStringLiteral("Propuesta inválida"), error);
            return;
        }
        const auto suggested = sourcePath_ + QStringLiteral(".proposal.json");
        const auto path = QFileDialog::getSaveFileName(this, QStringLiteral("Guardar propuesta"),
            suggested, QStringLiteral("JSON (*.json)"));
        if (path.isEmpty()) return;
        if (QFileInfo(path).absoluteFilePath() == sourcePath_) {
            QMessageBox::warning(this, QStringLiteral("Origen protegido"),
                QStringLiteral("Guarda la propuesta en otro archivo para revisarla antes de integrarla."));
            return;
        }
        QSaveFile file(path);
        const QByteArray proposal = matrix_.serialize();
        if (!file.open(QIODevice::WriteOnly) || file.write(proposal) != proposal.size() || !file.commit()) {
            QMessageBox::critical(this, QStringLiteral("No se pudo guardar"), file.errorString());
            return;
        }
        QMessageBox::information(this, QStringLiteral("Propuesta guardada"),
            QStringLiteral("La propuesta no cambia Vantare hasta incorporarla en una versión revisada."));
    }

    WidgetMatrix matrix_;
    QByteArray original_;
    QString sourcePath_;
    QLineEdit *search_ = nullptr;
    QComboBox *tier_ = nullptr;
    QTableWidget *table_ = nullptr;
    QLabel *source_ = nullptr;
    QLabel *summary_ = nullptr;
    bool loading_ = false;
};

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    WidgetAdminWindow window;
    if (argc > 1) window.load(QString::fromLocal8Bit(argv[1]));
    window.show();
    return app.exec();
}
