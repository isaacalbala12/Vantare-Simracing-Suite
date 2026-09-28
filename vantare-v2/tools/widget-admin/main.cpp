#include "widget_matrix.h"

#include <QApplication>
#include <QComboBox>
#include <QColor>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFrame>
#include <QHash>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QListWidgetItem>
#include <QMainWindow>
#include <QMessageBox>
#include <QPushButton>
#include <QSaveFile>
#include <QTableWidget>
#include <QVBoxLayout>

namespace {
constexpr int tierCount = 4;
const QString tierNames[tierCount] = {
    QStringLiteral("Free"), QStringLiteral("Pro"),
    QStringLiteral("Pro Plus"), QStringLiteral("Launch Edition")
};

bool allowedForTier(const WidgetAccessRow &row, int tier) {
    switch (tier) {
    case 0: return row.free;
    case 1: return row.pro;
    case 2: return row.proPlus;
    default: return row.launch;
    }
}

QString widgetName(const QString &id) {
    static const QHash<QString, QString> names = {
        {QStringLiteral("delta"), QStringLiteral("Delta")},
        {QStringLiteral("standings"), QStringLiteral("Clasificación")},
        {QStringLiteral("relative"), QStringLiteral("Relativos")},
        {QStringLiteral("pedals"), QStringLiteral("Pedales")},
        {QStringLiteral("broadcast-tower"), QStringLiteral("Torre de carrera")},
        {QStringLiteral("fuel-strategy"), QStringLiteral("Estrategia de combustible")},
        {QStringLiteral("pedals-telemetry"), QStringLiteral("Telemetría de pedales")},
        {QStringLiteral("pedals-telemetry-compact"), QStringLiteral("Pedales compactos")},
        {QStringLiteral("racing-flags"), QStringLiteral("Banderas")},
        {QStringLiteral("fastest-lap"), QStringLiteral("Vuelta rápida")},
        {QStringLiteral("delta-trace"), QStringLiteral("Traza delta")},
        {QStringLiteral("race-schedule"), QStringLiteral("Calendario de carrera")},
        {QStringLiteral("head-to-head"), QStringLiteral("Cara a cara")},
        {QStringLiteral("delta-advanced"), QStringLiteral("Delta avanzado")},
        {QStringLiteral("input-telemetry"), QStringLiteral("Telemetría de entrada")},
        {QStringLiteral("multiclass-relative"), QStringLiteral("Relativos multiclase")},
        {QStringLiteral("track-weather"), QStringLiteral("Clima en pista")},
        {QStringLiteral("car-damage-visual"), QStringLiteral("Daños visuales")},
        {QStringLiteral("car-damage-numbers"), QStringLiteral("Daños numéricos")},
        {QStringLiteral("engineer-radio"), QStringLiteral("Radio del ingeniero")},
        {QStringLiteral("track-map"), QStringLiteral("Mapa del circuito")},
        {QStringLiteral("radar"), QStringLiteral("Radar")}
    };
    return names.value(id, id);
}

QLabel *label(const QString &text, const char *styleName, QWidget *parent) {
    auto *result = new QLabel(text, parent);
    result->setObjectName(QLatin1String(styleName));
    return result;
}

const char *theme = R"(
QWidget { background: #0d0e11; color: #f5f3f2; font-family: "Inter", "Segoe UI"; font-size: 13px; }
QFrame#rail { background: #0a0b0e; border-right: 1px solid #24252a; }
QFrame#panel { background: #121316; border: 1px solid #292a30; border-radius: 14px; }
QFrame#footer { background: #101114; border-top: 1px solid #292a30; }
QLabel { background: transparent; }
QLabel#mark { background: #39161d; color: #fff; border: 1px solid #a33549; border-radius: 12px; font-size: 23px; font-weight: 800; }
QLabel#brand { color: #f5f3f2; font-size: 16px; font-weight: 800; letter-spacing: 2px; }
QLabel#eyebrow { color: #8f9099; font-size: 10px; font-weight: 700; letter-spacing: 2px; }
QLabel#title { color: #f5f3f2; font-size: 29px; font-weight: 750; }
QLabel#sectionTitle { color: #f5f3f2; font-size: 16px; font-weight: 700; }
QLabel#muted { color: #9798a1; }
QLabel#status { color: #82d49e; font-size: 11px; font-weight: 700; }
QLabel#validation { color: #ff8c86; }
QLabel#metric { color: #f5f3f2; font-size: 30px; font-weight: 750; }
QLabel#previewTier { color: #f5f3f2; font-size: 20px; font-weight: 700; }
QPushButton { background: #1b1c21; color: #f5f3f2; border: 1px solid #34353d; border-radius: 8px; padding: 9px 14px; font-weight: 600; }
QPushButton:hover { background: #292a30; border-color: #5e4650; }
QPushButton:disabled { color: #6c6c74; background: #191a1d; border-color: #292a30; }
QPushButton#primary { background: #cf344b; border-color: #e45368; color: white; padding: 11px 18px; }
QPushButton#primary:hover { background: #e0445c; }
QPushButton#primary:disabled { background: #4a2b32; border-color: #5b3039; color: #9c8589; }
QPushButton#railButton { background: transparent; border: none; color: #a9aab2; text-align: left; padding: 12px 15px; }
QPushButton#railButton:hover { background: #1a1b20; color: white; }
QPushButton#railButton:checked { background: #32141c; color: white; border-left: 3px solid #e1465d; border-radius: 0; }
QPushButton#tierCard { background: #15161a; border: 1px solid #303137; border-radius: 12px; padding: 14px; text-align: left; font-size: 14px; }
QPushButton#tierCard:hover { border-color: #98505d; }
QPushButton#tierCard:checked { background: #25171d; border: 1px solid #c34459; }
QLineEdit, QComboBox { background: #1a1b20; color: #f5f3f2; border: 1px solid #34353d; border-radius: 8px; padding: 8px 11px; selection-background-color: #a9354a; }
QLineEdit:focus, QComboBox:focus { border-color: #d64b61; }
QComboBox QAbstractItemView { background: #1a1b20; color: #f5f3f2; selection-background-color: #5c2430; }
QTableWidget, QListWidget { background: #121316; color: #f5f3f2; border: none; outline: none; alternate-background-color: #15161a; gridline-color: #292a30; selection-background-color: #382029; }
QTableWidget::item { padding: 5px 9px; }
QTableWidget::item:selected { background: #382029; }
QHeaderView::section { background: #1a1b20; color: #a9aab2; border: none; border-bottom: 1px solid #303137; padding: 11px; font-size: 11px; font-weight: 700; }
QListWidget::item { padding: 7px 3px; border-bottom: 1px solid #26272b; }
QScrollBar:vertical { background: #121316; width: 9px; }
QScrollBar::handle:vertical { background: #42434a; border-radius: 4px; min-height: 24px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
)";
}

class WidgetAdminWindow final : public QMainWindow {
public:
    WidgetAdminWindow() {
        setWindowTitle(QStringLiteral("Vantare Admin · Widgets y licencias"));
        setMinimumSize(1060, 680);
        resize(1390, 830);

        auto *page = new QWidget(this);
        auto *shell = new QHBoxLayout(page);
        shell->setContentsMargins(0, 0, 0, 0);
        shell->setSpacing(0);

        auto *rail = new QFrame(page);
        rail->setObjectName(QStringLiteral("rail"));
        rail->setFixedWidth(216);
        auto *railLayout = new QVBoxLayout(rail);
        railLayout->setContentsMargins(16, 22, 16, 18);
        railLayout->setSpacing(8);
        auto *brandRow = new QHBoxLayout();
        auto *mark = label(QStringLiteral("V"), "mark", rail);
        mark->setAlignment(Qt::AlignCenter);
        mark->setFixedSize(46, 46);
        brandRow->addWidget(mark);
        brandRow->addSpacing(8);
        brandRow->addWidget(label(QStringLiteral("VANTARE"), "brand", rail));
        railLayout->addLayout(brandRow);
        railLayout->addSpacing(35);
        railLayout->addWidget(label(QStringLiteral("ADMINISTRACIÓN"), "eyebrow", rail));
        auto *matrixButton = new QPushButton(QStringLiteral("▦    Matriz de widgets"), rail);
        matrixButton->setObjectName(QStringLiteral("railButton"));
        matrixButton->setCheckable(true);
        matrixButton->setChecked(true);
        railLayout->addWidget(matrixButton);
        railLayout->addSpacing(16);
        railLayout->addWidget(label(QStringLiteral("VISTA POR LICENCIA"), "eyebrow", rail));
        for (int i = 0; i < tierCount; ++i) {
            auto *button = new QPushButton(tierNames[i], rail);
            button->setObjectName(QStringLiteral("railButton"));
            button->setCheckable(true);
            tierButtons_[i] = button;
            railLayout->addWidget(button);
            connect(button, &QPushButton::clicked, this, [this, i] { chooseTier(i); });
        }
        railLayout->addStretch();
        railLayout->addWidget(label(QStringLiteral("VANTARE ADMIN  /  LOCAL"), "eyebrow", rail));
        shell->addWidget(rail);

        auto *main = new QWidget(page);
        auto *mainLayout = new QVBoxLayout(main);
        mainLayout->setContentsMargins(28, 0, 28, 0);
        mainLayout->setSpacing(0);

        auto *topbar = new QHBoxLayout();
        topbar->setContentsMargins(0, 18, 0, 18);
        topbar->addWidget(label(QStringLiteral("ADMIN   /   WIDGETS Y LICENCIAS"), "eyebrow", main));
        topbar->addStretch();
        topbar->addWidget(label(QStringLiteral("●  BORRADOR LOCAL"), "status", main));
        mainLayout->addLayout(topbar);
        auto *divider = new QFrame(main);
        divider->setFixedHeight(1);
        divider->setStyleSheet(QStringLiteral("background:#292a30;"));
        mainLayout->addWidget(divider);
        mainLayout->addSpacing(24);
        mainLayout->addWidget(label(QStringLiteral("Widgets y licencias"), "title", main));
        mainLayout->addSpacing(5);
        auto *intro = label(QStringLiteral("Define licencias y visibilidad. Los widgets solo para testers se ocultan al público; los demás muestran candado si la licencia no los incluye."), "muted", main);
        intro->setWordWrap(true);
        mainLayout->addWidget(intro);
        mainLayout->addSpacing(23);

        auto *cards = new QHBoxLayout();
        cards->setSpacing(10);
        for (int i = 0; i < tierCount; ++i) {
            auto *card = new QPushButton(main);
            card->setObjectName(QStringLiteral("tierCard"));
            card->setCheckable(true);
            card->setMinimumHeight(82);
            tierCards_[i] = card;
            cards->addWidget(card, 1);
            connect(card, &QPushButton::clicked, this, [this, i] { chooseTier(i); });
        }
        mainLayout->addLayout(cards);
        mainLayout->addSpacing(22);

        auto *body = new QHBoxLayout();
        body->setSpacing(14);
        auto *matrixPanel = new QFrame(main);
        matrixPanel->setObjectName(QStringLiteral("panel"));
        auto *matrixLayout = new QVBoxLayout(matrixPanel);
        matrixLayout->setContentsMargins(18, 17, 18, 15);
        matrixLayout->setSpacing(13);
        auto *matrixTop = new QHBoxLayout();
        matrixTop->addWidget(label(QStringLiteral("Matriz de acceso"), "sectionTitle", matrixPanel));
        matrixTop->addStretch();
        auto *openButton = new QPushButton(QStringLiteral("Abrir matriz…"), matrixPanel);
        matrixTop->addWidget(openButton);
        matrixLayout->addLayout(matrixTop);
        source_ = label(QStringLiteral("Abre la matriz versionada para empezar."), "muted", matrixPanel);
        source_->setTextInteractionFlags(Qt::TextSelectableByMouse);
        matrixLayout->addWidget(source_);

        auto *toolbar = new QHBoxLayout();
        search_ = new QLineEdit(matrixPanel);
        search_->setPlaceholderText(QStringLiteral("Buscar widget por nombre o ID"));
        toolbar->addWidget(search_, 1);
        filter_ = new QComboBox(matrixPanel);
        filter_->addItems({QStringLiteral("Todos"), QStringLiteral("Disponibles"), QStringLiteral("Con candado")});
        filter_->setMinimumWidth(150);
        toolbar->addWidget(filter_);
        matrixLayout->addLayout(toolbar);

        table_ = new QTableWidget(matrixPanel);
        table_->setColumnCount(7);
        table_->setHorizontalHeaderLabels({QStringLiteral("WIDGET"), QStringLiteral("FREE"),
            QStringLiteral("PRO"), QStringLiteral("PRO PLUS"), QStringLiteral("LAUNCH"),
            QStringLiteral("PÚBLICO"), QStringLiteral("VISTA")});
        table_->horizontalHeader()->setSectionResizeMode(0, QHeaderView::Stretch);
        for (int column = 1; column <= 4; ++column)
            table_->horizontalHeader()->setSectionResizeMode(column, QHeaderView::Fixed);
        table_->setColumnWidth(1, 68);
        table_->setColumnWidth(2, 68);
        table_->setColumnWidth(3, 94);
        table_->setColumnWidth(4, 85);
        table_->horizontalHeader()->setSectionResizeMode(5, QHeaderView::Fixed);
        table_->setColumnWidth(5, 94);
        table_->horizontalHeader()->setSectionResizeMode(6, QHeaderView::Fixed);
        table_->setColumnWidth(6, 105);
        table_->verticalHeader()->setVisible(false);
        table_->setAlternatingRowColors(true);
        table_->setSelectionBehavior(QAbstractItemView::SelectRows);
        table_->setEditTriggers(QAbstractItemView::NoEditTriggers);
        matrixLayout->addWidget(table_, 1);
        validation_ = label(QString(), "validation", matrixPanel);
        validation_->setWordWrap(true);
        matrixLayout->addWidget(validation_);
        body->addWidget(matrixPanel, 1);

        auto *previewPanel = new QFrame(main);
        previewPanel->setObjectName(QStringLiteral("panel"));
        previewPanel->setFixedWidth(278);
        auto *previewLayout = new QVBoxLayout(previewPanel);
        previewLayout->setContentsMargins(18, 20, 18, 16);
        previewLayout->setSpacing(10);
        previewLayout->addWidget(label(QStringLiteral("VISTA PREVIA"), "eyebrow", previewPanel));
        previewTier_ = label(QString(), "previewTier", previewPanel);
        previewLayout->addWidget(previewTier_);
        audience_ = new QComboBox(previewPanel);
        audience_->addItems({QStringLiteral("Usuario normal"), QStringLiteral("Tester / Owner")});
        previewLayout->addWidget(audience_);
        previewCount_ = label(QString(), "metric", previewPanel);
        previewLayout->addWidget(previewCount_);
        previewLayout->addWidget(label(QStringLiteral("widgets disponibles"), "muted", previewPanel));
        previewLayout->addSpacing(7);
        auto *previewHint = label(QStringLiteral("Los widgets públicos sin licencia muestran candado. Los de prueba desaparecen para usuarios normales."), "muted", previewPanel);
        previewHint->setWordWrap(true);
        previewLayout->addWidget(previewHint);
        previewLayout->addSpacing(6);
        previewLayout->addWidget(label(QStringLiteral("CATÁLOGO"), "eyebrow", previewPanel));
        previewList_ = new QListWidget(previewPanel);
        previewList_->setFocusPolicy(Qt::NoFocus);
        previewList_->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
        previewLayout->addWidget(previewList_, 1);
        body->addWidget(previewPanel);
        mainLayout->addLayout(body, 1);
        mainLayout->addSpacing(17);

        auto *footer = new QFrame(main);
        footer->setObjectName(QStringLiteral("footer"));
        auto *footerLayout = new QHBoxLayout(footer);
        footerLayout->setContentsMargins(0, 15, 0, 17);
        auto *footerText = new QVBoxLayout();
        summary_ = label(QString(), "sectionTitle", footer);
        footerText->addWidget(summary_);
        footerText->addWidget(label(QStringLiteral("La propuesta se revisa antes de incluirla en una versión de Vantare."), "muted", footer));
        footerLayout->addLayout(footerText);
        footerLayout->addStretch();
        saveButton_ = new QPushButton(QStringLiteral("Guardar propuesta…"), footer);
        saveButton_->setObjectName(QStringLiteral("primary"));
        footerLayout->addWidget(saveButton_);
        mainLayout->addWidget(footer);
        shell->addWidget(main, 1);
        setCentralWidget(page);
        setStyleSheet(QLatin1String(theme));

        connect(openButton, &QPushButton::clicked, this, [this] {
            const auto path = QFileDialog::getOpenFileName(this, QStringLiteral("Abrir matriz de widgets"),
                QString(), QStringLiteral("JSON (*.json)"));
            if (!path.isEmpty()) load(path);
        });
        connect(saveButton_, &QPushButton::clicked, this, [this] { saveProposal(); });
        connect(search_, &QLineEdit::textChanged, this, [this] { refreshPreview(); });
        connect(filter_, &QComboBox::currentIndexChanged, this, [this] { refreshPreview(); });
        connect(audience_, &QComboBox::currentIndexChanged, this, [this] { refreshPreview(); });
        connect(table_, &QTableWidget::itemChanged, this, [this](QTableWidgetItem *item) {
            if (loading_ || item->column() < 1 || item->column() > 5) return;
            auto &row = matrix_.widgets[item->row()];
            const bool allowed = item->checkState() == Qt::Checked;
            switch (item->column()) {
            case 1: row.free = allowed; break;
            case 2: row.pro = allowed; break;
            case 3: row.proPlus = allowed; break;
            case 4: row.launch = allowed; break;
            case 5: row.visibility = allowed ? QStringLiteral("public") : QStringLiteral("testers"); break;
            }
            refreshPreview();
        });
        chooseTier(0);
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
        source_->setText(QStringLiteral("Origen  ·  %1").arg(QFileInfo(path).fileName()));
        source_->setToolTip(sourcePath_);
        loading_ = true;
        table_->setRowCount(matrix_.widgets.size());
        for (qsizetype rowIndex = 0; rowIndex < matrix_.widgets.size(); ++rowIndex) {
            const auto &row = matrix_.widgets[rowIndex];
            auto *name = new QTableWidgetItem(widgetName(row.id) + QStringLiteral("\n") + row.id);
            name->setFlags(Qt::ItemIsSelectable | Qt::ItemIsEnabled);
            table_->setItem(rowIndex, 0, name);
            const bool values[] = {row.free, row.pro, row.proPlus, row.launch};
            for (int column = 1; column <= 4; ++column) {
                auto *cell = new QTableWidgetItem();
                cell->setFlags(Qt::ItemIsEnabled | Qt::ItemIsUserCheckable | Qt::ItemIsSelectable);
                cell->setCheckState(values[column - 1] ? Qt::Checked : Qt::Unchecked);
                cell->setTextAlignment(Qt::AlignCenter);
                table_->setItem(rowIndex, column, cell);
            }
            auto *visibility = new QTableWidgetItem();
            visibility->setFlags(Qt::ItemIsEnabled | Qt::ItemIsUserCheckable | Qt::ItemIsSelectable);
            visibility->setCheckState(row.visibility == QStringLiteral("public") ? Qt::Checked : Qt::Unchecked);
            visibility->setToolTip(QStringLiteral("Desmarca para mostrar este widget solo a testers y Owner."));
            table_->setItem(rowIndex, 5, visibility);
            auto *preview = new QTableWidgetItem();
            preview->setFlags(Qt::ItemIsSelectable | Qt::ItemIsEnabled);
            table_->setItem(rowIndex, 6, preview);
            table_->setRowHeight(rowIndex, 48);
        }
        loading_ = false;
        refreshPreview();
        return true;
    }

private:
    void chooseTier(int tier) {
        selectedTier_ = tier;
        for (int i = 0; i < tierCount; ++i) {
            tierButtons_[i]->setChecked(i == tier);
            tierCards_[i]->setChecked(i == tier);
        }
        refreshPreview();
    }

    void refreshPreview() {
        int counts[tierCount] = {};
        int visibleCount = 0;
        int changedCount = 0;
        previewList_->clear();
        WidgetMatrix initial;
        QString error;
        const bool hasOriginal = !original_.isEmpty() && WidgetMatrix::parse(original_, initial, error);
        for (qsizetype i = 0; i < matrix_.widgets.size(); ++i) {
            const auto &row = matrix_.widgets[i];
            const bool visible = row.visibility == QStringLiteral("public") || audience_->currentIndex() == 1;
            if (visible) ++visibleCount;
            for (int tier = 0; tier < tierCount; ++tier)
                if (visible && (audience_->currentIndex() == 1 || allowedForTier(row, tier))) ++counts[tier];
            const bool allowed = audience_->currentIndex() == 1 || allowedForTier(row, selectedTier_);
            auto *previewCell = table_->item(i, 6);
            previewCell->setText(!visible ? QStringLiteral("Oculto") : allowed ? QStringLiteral("Disponible") : QStringLiteral("Candado"));
            previewCell->setForeground(visible && allowed ? QColor(QStringLiteral("#82d49e")) : QColor(QStringLiteral("#f0a0ab")));
            const bool matchesSearch = row.id.contains(search_->text(), Qt::CaseInsensitive) ||
                widgetName(row.id).contains(search_->text(), Qt::CaseInsensitive);
            const bool matchesFilter = filter_->currentIndex() == 0 ||
                (filter_->currentIndex() == 1 && visible && allowed) ||
                (filter_->currentIndex() == 2 && visible && !allowed);
            table_->setRowHidden(i, !matchesSearch || !matchesFilter);
            if (visible) {
                auto *entry = new QListWidgetItem(
                    QStringLiteral("%1  %2").arg(allowed ? QStringLiteral("●") : QStringLiteral("◇"), widgetName(row.id)),
                    previewList_);
                entry->setForeground(QColor(allowed ? QStringLiteral("#bde8cb") : QStringLiteral("#a6a6ae")));
            }
            if (hasOriginal) {
                const auto &before = initial.widgets[i];
                if (row.free != before.free || row.pro != before.pro ||
                    row.proPlus != before.proPlus || row.launch != before.launch ||
                    row.visibility != before.visibility) ++changedCount;
            }
        }
        for (int tier = 0; tier < tierCount; ++tier) {
            tierCards_[tier]->setText(QStringLiteral("%1\n%2 de %3 disponibles")
                .arg(tierNames[tier]).arg(counts[tier]).arg(visibleCount));
        }
        previewTier_->setText(tierNames[selectedTier_]);
        previewCount_->setText(QStringLiteral("%1 / %2").arg(counts[selectedTier_]).arg(visibleCount));
        summary_->setText(QStringLiteral("%1 widget%2 modificado%3")
            .arg(changedCount).arg(changedCount == 1 ? QString() : QStringLiteral("s"))
            .arg(changedCount == 1 ? QString() : QStringLiteral("s")));
        QString validationError;
        const bool valid = sourcePath_.isEmpty() || matrix_.validate(validationError);
        validation_->setText(valid ? QString() : validationError);
        saveButton_->setEnabled(!sourcePath_.isEmpty() && valid && changedCount > 0);
    }

    void saveProposal() {
        QString error;
        if (!matrix_.validate(error)) {
            QMessageBox::warning(this, QStringLiteral("Propuesta inválida"), error);
            return;
        }
        const auto path = QFileDialog::getSaveFileName(this, QStringLiteral("Guardar propuesta"),
            sourcePath_ + QStringLiteral(".proposal.json"), QStringLiteral("JSON (*.json)"));
        if (path.isEmpty()) return;
        if (QFileInfo(path).absoluteFilePath().compare(sourcePath_, Qt::CaseInsensitive) == 0) {
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
    QComboBox *filter_ = nullptr;
    QComboBox *audience_ = nullptr;
    QTableWidget *table_ = nullptr;
    QListWidget *previewList_ = nullptr;
    QLabel *source_ = nullptr;
    QLabel *validation_ = nullptr;
    QLabel *previewTier_ = nullptr;
    QLabel *previewCount_ = nullptr;
    QLabel *summary_ = nullptr;
    QPushButton *saveButton_ = nullptr;
    QPushButton *tierButtons_[tierCount] = {};
    QPushButton *tierCards_[tierCount] = {};
    int selectedTier_ = 0;
    bool loading_ = false;
};

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setStyle(QStringLiteral("Fusion"));
    WidgetAdminWindow window;
    if (argc > 1) window.load(QString::fromLocal8Bit(argv[1]));
    window.show();
    return app.exec();
}
