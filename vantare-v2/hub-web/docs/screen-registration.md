# API del marco para las pantallas

Crear `src/renderer/screens/<id>/entry.tsx` con una exportación por defecto. `app/ScreenRegistry.tsx` descubre esos módulos con `import.meta.glob`; no hay que editar Shell ni un registro compartido. Los IDs del producto ya están cerrados en `app/sections.ts`: home, launcher, studio, roadmap, testing, calendar, strategy, engineer, settings, notifications, workshop, analysis y account. No se aceptan rutas o módulos arbitrarios.

```tsx
import { useState } from "react";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
export default function Launcher() {
  const [active, setActive] = useState("profiles");
  // Estado y datos del contrato dentro de la pantalla y sus proveedores.
  return (
    <>
      <SectionChrome
        title="Launcher"
        tabs={[{ id: "profiles", etiqueta: "Perfiles", visible: true }]}
        activeTab={active}
        onTabChange={setActive}
        rail={<p>Contexto de la pantalla</p>}
      />
      <SectionPanel activeTab={active}>
        {/* Contenido de la pestaña */}
      </SectionPanel>
    </>
  );
}
```

Firma: `SectionChrome({ title?: string, tabs?: readonly {id:string; etiqueta:string; visible:boolean}[], activeTab?:string, onTabChange?:(id:string)=>void, rail?:ReactNode })`. `SectionPanel({activeTab:string, children:ReactNode})` enlaza ARIA con la pestaña de la barra. La pantalla mantiene su selección válida al filtrar. Las flechas activan la siguiente pestaña visible, con Home/End de Base UI.

Los portales conservan los contextos de la pantalla: sus datos, handlers y borradores siguen en el mismo árbol React aunque se dibujen en cabecera o barra derecha. Al salir se retiran título, pestañas y rail propios. Sin rail se usa el contexto predeterminado del marco. Cada pantalla mantiene su i18n en `screens/<id>/es.ts` o `i18n/<id>.es.ts`; no añade todas sus claves al fichero global. Las extensiones Rust van en módulos/bloques propios por pantalla bajo `protocol/` y sus bindings se regeneran desde Rust; este PR no cambia el protocolo.

Estructura: raíl izquierdo a todo el alto, columna principal con cabecera 52 y cuerpo con contenido y rail derecho 320–400. Izquierda contraída a 76 por debajo de 1500 mientras no haya una elección manual. Solo desplaza el contenido; no hay barras nativas. Los toasts están limitados a la columna de contenido. Ajustes integra ya sus pestañas en cabecera, con buscador y título de pestaña; los cuerpos y el detalle de componentes siguen en los PR siguientes de 00-paridad-visual.md. Los controles nativos de ventana se reemplazan en el PR del contrato autorizado de minimizar/maximizar/cierre. No se declara paridad global terminada.
