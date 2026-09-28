#include <QApplication>
#include <QCheckBox>
#include <QLabel>
#include <QVBoxLayout>
#include <QWidget>
#include <QPainter>

#ifdef _WIN32
#include <windows.h>
#endif

class Overlay final : public QWidget {
 public:
  Overlay() {
    setWindowTitle("Vantare Qt Widgets Smoke Overlay");
    setWindowFlags(Qt::Window | Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint);
    setAttribute(Qt::WA_TranslucentBackground);
    setFixedSize(360, 120);
    move(800, 80);
  }

 protected:
  void paintEvent(QPaintEvent*) override {
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setBrush(QColor(12, 20, 34, 225));
    painter.setPen(Qt::NoPen);
    painter.drawRoundedRect(rect().adjusted(2, 2, -2, -2), 12, 12);
    painter.setPen(QColor(235, 246, 255));
    painter.drawText(QRect(18, 16, 324, 32), "VANTARE  /  STANDINGS");
    painter.drawText(QRect(18, 57, 324, 36), "P09  PLAYER       +0.000");
  }
};

int main(int argc, char* argv[]) {
  QApplication app(argc, argv);
  QWidget control;
  control.setWindowTitle("Vantare Qt Widgets Smoke Control");
  auto* layout = new QVBoxLayout(&control);
  layout->addWidget(new QLabel("Vantare native UI · Qt Widgets"));
  auto* toggle = new QCheckBox("Mostrar overlay");
  layout->addWidget(toggle);
  control.resize(420, 170);
  Overlay overlay;
  QObject::connect(toggle, &QCheckBox::toggled, &overlay, &QWidget::setVisible);
  control.show();
  toggle->setChecked(true);
#ifdef _WIN32
  HWND hwnd = reinterpret_cast<HWND>(overlay.winId());
  LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE,
                    style | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_APPWINDOW);
  SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
#endif
  return app.exec();
}
