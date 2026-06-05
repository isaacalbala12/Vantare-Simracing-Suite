# Guía de Autenticación y Licencias - Vantare Overlays

## 1. Visión General

Vantare Overlays utiliza **Supabase** como backend para gestionar la autenticación de usuarios, el sistema de licencias y el control de acceso a funcionalidades premium. Esta guía documenta la arquitectura completa del sistema, desde la configuración inicial de Supabase hasta la implementación de feature gating basado en tiers de suscripción.

### Componentes Principales

| Componente | Tecnología | Propósito |
|---|---|---|
| Backend | Supabase (PostgreSQL + Auth) | Autenticación, base de datos, edge functions |
| Cliente Desktop | Electron + React | Aplicación principal |
| Almacenamiento Seguro | electron-safe-storage | JWT tokens y datos sensibles |
| Validación de Licencia | Edge Functions + Local Cache | Validación online/offline |
| HWID Binding | machine-id + hardware info | Vinculación a máquina |

### Flujo de Datos Resumido

```
Usuario → Electron App → Supabase Auth → JWT → License Validation → Feature Gating → UI Habilitada
```

---

## 2. Arquitectura del Sistema de Auth

### Diagrama de Componentes

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Electron   │────▶│   Supabase   │────▶│  PostgreSQL  │
│   Main       │     │   Auth API   │     │   Database   │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│   Renderer   │
│   (React)    │
└──────────────┘
```

### Descripción del Flujo

1. **Electron Main Process**: Gestiona la ventana principal, el almacenamiento seguro y la comunicación con Supabase.
2. **Supabase Auth API**: Maneja el registro, login, recuperación de contraseñas y gestión de sesiones.
3. **PostgreSQL Database**: Almacena datos de usuarios, licencias, suscripciones y metadatos.
4. **Renderer Process (React)**: Interfaz de usuario que consume los servicios de auth y licencia a través de hooks y providers.

### Separación de Responsabilidades

- **Main Process**: Almacena JWT en `electron-safe-storage`, realiza llamadas HTTP autenticadas, valida licencias contra la red.
- **Renderer Process**: Renderiza formularios de login, consume el contexto de auth, aplica feature gating en la UI.
- **Supabase**: Gestiona credenciales, sesiones, RLS policies y edge functions para validación de licencias.

---

## 3. Supabase Setup

### 3.1 Crear el Proyecto Supabase

1. Navega a [https://supabase.com](https://supabase.com) y crea una cuenta.
2. Haz clic en "New Project" y selecciona tu organización.
3. Configura el nombre del proyecto: `vantare-overlays`.
4. Selecciona una contraseña segura para la base de datos.
5. Elige la región más cercana a tus usuarios.
6. Anota la `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde la configuración del proyecto.

### 3.2 Variables de Entorno

El repositorio incluye plantillas **sin valores reales**:

| Archivo | Uso |
|---|---|
| `.env.example` (raíz del monorepo) | Referencia para todo el proyecto |
| `apps/desktop/.env.example` | Referencia específica de la app Electron |

**Configuración local (desarrollo)**

1. Copia la plantilla: `cp .env.example .env` (o en Windows: copia manual del archivo).
2. Rellena los valores desde **Supabase Dashboard → Project Settings → API**:
   - `SUPABASE_URL` — Project URL
   - `SUPABASE_ANON_KEY` — `anon` / public key
   - `SUPABASE_SERVICE_ROLE_KEY` — `service_role` key (solo main process / edge functions)

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Reglas de seguridad**

| Variable | ¿Dónde puede usarse? |
|---|---|
| `SUPABASE_URL` | Main process, edge functions |
| `SUPABASE_ANON_KEY` | Main process (el renderer **nunca** llama a Supabase directamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo** main process de Electron y edge functions |

> **IMPORTANTE**: Nunca expongas `SUPABASE_SERVICE_ROLE_KEY` en el renderer process ni la incluyas en el bundle de Vite. Los archivos `.env` y `.env.local` están en `.gitignore` — no los subas al repositorio.

**Registro de usuarios (Sprint 6)**

El registro usa `supabase.auth.signUp()` desde el main process. Al crear un usuario, un **trigger de PostgreSQL** inserta automáticamente una licencia `free` (no se usa edge function `register-user`).

### 3.3 Instalación de Dependencias

Dependencias ya declaradas en el monorepo (`pnpm`):

```bash
# Desde la raíz del repositorio
pnpm install
```

Paquetes relevantes:

| Paquete | Ubicación | Propósito |
|---|---|---|
| `@supabase/supabase-js` | `packages/auth` | Cliente Supabase |
| `electron-safe-storage` | `packages/auth`, `apps/desktop` | Cifrado de JWT en main process |
| `machine-id` | `packages/auth`, `apps/desktop` | Huella digital del PC (HWID) |

### 3.3.1 Supabase CLI (opcional, Wave 2+)

Para aplicar migraciones y desplegar edge functions localmente:

```bash
# Windows (scoop) o ver https://supabase.com/docs/guides/cli
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Vincular proyecto remoto
supabase login
supabase link --project-ref <tu-project-ref>
```

Las migraciones SQL viven en `supabase/migrations/` (Sprint 6, tarea 7).

### 3.4 Configuración de CORS

En el dashboard de Supabase, ve a **Settings → API → CORS** y agrega tu dominio:

```
http://localhost:3000
https://tu-dominio.com
capacitor://localhost (para builds móviles futuros)
```

---

## 4. Database Schema

### 4.1 Users Table

La tabla de usuarios es gestionada automáticamente por Supabase Auth. No necesitas crear esta tabla manualmente. Supabase crea la tabla `auth.users` con los siguientes campos principales:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único del usuario |
| `email` | TEXT | Correo electrónico |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última actualización |
| `email_confirmed_at` | TIMESTAMPTZ | Fecha de confirmación de email |
| `last_sign_in_at` | TIMESTAMPTZ | Último inicio de sesión |
| `raw_user_meta_data` | JSONB | Metadatos del usuario |

### 4.2 Profiles Table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_sim TEXT DEFAULT 'iracing',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 4.3 Licenses Table

```sql
CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'ultimate')),
  hwid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  last_validated_at TIMESTAMPTZ,
  validation_count INTEGER DEFAULT 0
);

CREATE INDEX idx_licenses_user_id ON licenses(user_id);
CREATE INDEX idx_licenses_hwid ON licenses(hwid);
CREATE INDEX idx_licenses_tier ON licenses(tier);
CREATE INDEX idx_licenses_active ON licenses(is_active) WHERE is_active = TRUE;
```

### 4.4 Subscriptions Table

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'ultimate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  payment_provider TEXT DEFAULT 'stripe',
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### 4.5 License Validation Log

```sql
CREATE TABLE license_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hwid TEXT NOT NULL,
  ip_address INET,
  validated_at TIMESTAMPTZ DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL,
  failure_reason TEXT
);

CREATE INDEX idx_validations_license_id ON license_validations(license_id);
CREATE INDEX idx_validations_user_id ON license_validations(user_id);
```

### 4.6 Rate Limiting Table

```sql
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address INET,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_user_ip ON rate_limits(user_id, ip_address, endpoint);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);
```

---

## 5. Row Level Security (RLS) Policies

### 5.1 Habilitar RLS

```sql
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_validations ENABLE ROW LEVEL SECURITY;
```

### 5.2 Policies para Licenses

```sql
CREATE POLICY "Users can view own licenses"
  ON licenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "No public license creation"
  ON licenses FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "No public license modification"
  ON licenses FOR UPDATE
  USING (FALSE);

CREATE POLICY "No public license deletion"
  ON licenses FOR DELETE
  USING (FALSE);
```

### 5.3 Policies para Profiles

```sql
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

### 5.4 Policies para Subscriptions

```sql
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);
```

### 5.5 Policies para License Validations

```sql
CREATE POLICY "Service role can insert validations"
  ON license_validations FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Users can view own validations"
  ON license_validations FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 6. Edge Functions para Validacion de Licencias

### 6.1 Validar Licencia

Crea una edge function en `supabase/functions/validate-license/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { hwid } = await req.json()

    if (!hwid) {
      return new Response(
        JSON.stringify({ error: 'HWID required', valid: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (licenseError || !license) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          tier: 'free',
          error: 'No active license found' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await supabase
        .from('licenses')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('id', license.id)

      return new Response(
        JSON.stringify({ 
          valid: false, 
          tier: 'free',
          error: 'License expired' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (license.hwid && license.hwid !== hwid) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          tier: 'free',
          error: 'Hardware mismatch - license bound to different machine' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!license.hwid) {
      await supabase
        .from('licenses')
        .update({ 
          hwid: hwid,
          last_validated_at: new Date().toISOString(),
          validation_count: license.validation_count + 1
        })
        .eq('id', license.id)
    } else {
      await supabase
        .from('licenses')
        .update({ 
          last_validated_at: new Date().toISOString(),
          validation_count: license.validation_count + 1
        })
        .eq('id', license.id)
    }

    await supabase
      .from('license_validations')
      .insert({
        license_id: license.id,
        user_id: user.id,
        hwid: hwid,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        is_valid: true
      })

    return new Response(
      JSON.stringify({ 
        valid: true, 
        tier: license.tier,
        expires_at: license.expires_at,
        license_id: license.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', valid: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### 6.2 Registrar Nuevo Usuario

```typescript
// supabase/functions/register-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, password, hwid } = await req.json()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { error: licenseError } = await supabase
      .from('licenses')
      .insert({
        user_id: authData.user.id,
        tier: 'free',
        hwid: hwid,
        is_active: true
      })

    if (licenseError) {
      console.error('License creation error:', licenseError)
    }

    return new Response(
      JSON.stringify({ 
        user_id: authData.user.id,
        message: 'User registered successfully' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## 7. Flujo de Autenticacion

### 7.1 Flujo Paso a Paso

1. **Usuario abre Vantare Overlays**
   - Electron main process verifica si existe un JWT almacenado en `electron-safe-storage`.
   - Si existe, intenta validar el token con Supabase.

2. **Pantalla de Login**
   - Si no hay sesión válida, se muestra la pantalla de login.
   - El usuario ingresa email y contraseña.

3. **Autenticacion con Supabase Auth**
   - Se envia `supabase.auth.signInWithPassword({ email, password })`.
   - Supabase valida las credenciales y retorna un JWT.

4. **Almacenamiento del JWT**
   - El JWT se almacena en `electron-safe-storage` (encriptado con la clave del sistema operativo).
   - **Nunca** se almacena en `localStorage` del renderer process.

5. **Validacion de Licencia**
   - Con el JWT válido, se hace una llamada a la edge function `validate-license`.
   - Se envia el HWID del usuario.
   - La edge function retorna el tier y estado de la licencia.

6. **Configuracion de Feature Flags**
   - Basado en el tier de la licencia, se habilitan/deshabilitan funcionalidades.
   - Los feature flags se almacenan en el contexto de React y se propagan a toda la app.

7. **Refresh Token**
   - Supabase maneja automáticamente el refresh del JWT.
   - Si el refresh falla, se muestra la pantalla de login.

### 7.2 Diagrama de Secuencia

```
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
│  User   │  │ Renderer │  │  Main    │  │  Supabase  │
└────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘
     │            │              │               │
     │  Login    │              │               │
     │───────────>              │               │
     │            │  signIn()   │               │
     │            │─────────────>──────────────>│
     │            │              │   JWT         │
     │            │<─────────────<──────────────│
     │            │              │               │
     │            │  storeJWT() │               │
     │            │─────────────>               │
     │            │              │  save to      │
     │            │              │  safe-storage │
     │            │              │               │
     │            │  validateLicense(hwid)      │
     │            │─────────────>──────────────>│
     │            │              │   tier data   │
     │            │<─────────────<──────────────│
     │            │              │               │
     │  Render   │              │               │
     │<───────────              │               │
```

---

## 8. Feature Gating

### 8.1 Definicion de Features

```typescript
export enum Feature {
  // Overlay features
  STANDINGS = 'standings',
  RELATIVE = 'relative',
  DELTA_BAR = 'delta-bar',
  FUEL_CALCULATOR = 'fuel-calculator',
  FLAGS = 'flags',
  TRACK_MAP = 'track-map',
  STREAM_ALERTS = 'stream-alerts',
  INPUT_TELEMETRY = 'input-telemetry',
  HEAD_TO_HEAD = 'head-to-head',
  BLIND_SPOT = 'blind-spot',
  DATA_BLOCKS = 'data-blocks',
  CUSTOM_THEMES = 'custom-themes',

  // Sim support
  IRACING = 'iracing',
  LMU = 'lmu',
  AC = 'ac',
}
```

### 8.2 Mapping de Tiers a Features

```typescript
export type Tier = 'free' | 'pro' | 'ultimate';

export const tierFeatures: Record<Tier, Feature[]> = {
  free: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.IRACING,
  ],
  pro: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.FUEL_CALCULATOR,
    Feature.FLAGS,
    Feature.TRACK_MAP,
    Feature.STREAM_ALERTS,
    Feature.INPUT_TELEMETRY,
    Feature.HEAD_TO_HEAD,
    Feature.BLIND_SPOT,
    Feature.IRACING,
    Feature.LMU,
    Feature.AC,
  ],
  ultimate: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.FUEL_CALCULATOR,
    Feature.FLAGS,
    Feature.TRACK_MAP,
    Feature.STREAM_ALERTS,
    Feature.INPUT_TELEMETRY,
    Feature.HEAD_TO_HEAD,
    Feature.BLIND_SPOT,
    Feature.DATA_BLOCKS,
    Feature.CUSTOM_THEMES,
    Feature.IRACING,
    Feature.LMU,
    Feature.AC,
  ],
};
```

### 8.3 Uso en Componentes

```typescript
import { useLicense } from './hooks/useLicense';

function TrackMapOverlay() {
  const { hasFeature } = useLicense();

  if (!hasFeature(Feature.TRACK_MAP)) {
    return <UpgradePrompt feature="Track Map" />;
  }

  return <ActualTrackMapComponent />;
}
```

### 8.4 Hook useFeatureGate

```typescript
export function useFeatureGate() {
  const { tier, hasFeature } = useLicense();

  const requireFeature = useCallback(
    (feature: Feature) => {
      if (!hasFeature(feature)) {
        throw new Error(`Feature '${feature}' requires ${getRequiredTier(feature)} tier`);
      }
    },
    [hasFeature]
  );

  const getRequiredTier = (feature: Feature): Tier => {
    for (const [tier, features] of Object.entries(tierFeatures)) {
      if (features.includes(feature)) {
        return tier as Tier;
      }
    }
    return 'ultimate';
  };

  return { tier, hasFeature, requireFeature, getRequiredTier };
}
```

---

## 9. Pricing Tiers

### 9.1 Tabla de Funcionalidades por Tier

| Feature | Free | Pro ($4.99/mo) | Ultimate ($9.99/mo) |
|---|---|---|---|
| **Overlays** | | | |
| Standings | ✅ | ✅ | ✅ |
| Relative | ✅ | ✅ | ✅ |
| Delta Bar | ✅ | ✅ | ✅ |
| Fuel Calculator | ❌ | ✅ | ✅ |
| Flags | ❌ | ✅ | ✅ |
| Track Map | ❌ | ✅ | ✅ |
| Input Telemetry | ❌ | ✅ | ✅ |
| Head to Head | ❌ | ✅ | ✅ |
| Blind Spot | ❌ | ✅ | ✅ |
| Stream Alerts | ❌ | ✅ | ✅ |
| Data Blocks | ❌ | ❌ | ✅ |
| Custom Themes | ❌ | ❌ | ✅ |
| **Simuladores** | | | |
| iRacing | ✅ | ✅ | ✅ |
| LMU | ❌ | ✅ | ✅ |
| AC (Assetto Corsa) | ❌ | ✅ | ✅ |

### 9.2 Descripcion de Features

#### Tier Free
- **Standings**: Clasificacion en tiempo real de la sesion actual.
- **Relative**: Posicion relativa respecto al coche delante y detras.
- **Delta Bar**: Barra de delta temporal vs. mejor vuelta.
- **iRacing Support**: Soporte basico para iRacing.

#### Tier Pro ($4.99/mes)
Todas las features de Free mas:
- **Fuel Calculator**: Calculadora de paradas en boxes y consumo de combustible.
- **Flags**: Indicadores de banderas del marshal virtual.
- **Track Map**: Mapa del circuito con posicion de coches en tiempo real.
- **Input Telemetry**: Visualizacion de inputs del volante, acelerador y freno.
- **Head to Head**: Comparativa directa con otro piloto.
- **Blind Spot**: Alerta de coches en el punto ciego.
- **Stream Alerts**: Alertas personalizadas para streaming.
- **LMU Support**: Soporte para Le Mans Ultimate.
- **AC Support**: Soporte para Assetto Corsa.

#### Tier Ultimate ($9.99/mes)
Todas las features de Pro mas:
- **Data Blocks**: Bloques de datos personalizados con cualquier metrica de telemetry.
- **Custom Themes**: Temas personalizados con colores, fuentes y estilos propios.

### 9.3 Precio Anual (Descuento)

| Plan | Mensual | Anual | Ahorro |
|---|---|---|---|
| Pro | $4.99/mes | $47.88/anual ($3.99/mes) | 20% |
| Ultimate | $9.99/mes | $95.88/anual ($7.99/mes) | 20% |

---

## 10. License Validation

### 10.1 Validacion Online (App Start)

```typescript
async function validateOnStartup(): Promise<LicenseData> {
  const hwid = await getHardwareId();
  const jwt = await secureStorage.get('supabase_jwt');

  if (!jwt) {
    return { tier: 'free', valid: false, requiresLogin: true };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/validate-license`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ hwid }),
    });

    const data = await response.json();

    if (data.valid) {
      await cacheLicense(data);
      return data;
    }

    return { tier: 'free', valid: false, error: data.error };
  } catch (error) {
    const cached = await getCachedLicense();
    if (cached && isValidCache(cached)) {
      return cached;
    }
    return { tier: 'free', valid: false, error: 'Network error' };
  }
}
```

### 10.2 Validacion Periodica

```typescript
const REVALIDATION_INTERVAL = 6 * 60 * 60 * 1000;

setInterval(async () => {
  const result = await validateOnStartup();
  if (!result.valid && currentTier !== 'free') {
    showNotification('Tu licencia ha expirado. Algunas funcionalidades han sido deshabilitadas.');
    updateTier('free');
  }
}, REVALIDATION_INTERVAL);
```

### 10.3 Validacion con Cache

```typescript
interface CachedLicense {
  tier: Tier;
  valid: boolean;
  cached_at: string;
  expires_at: string | null;
  license_id: string;
}

async function cacheLicense(data: LicenseData): Promise<void> {
  const cached: CachedLicense = {
    tier: data.tier,
    valid: data.valid,
    cached_at: new Date().toISOString(),
    expires_at: data.expires_at,
    license_id: data.license_id,
  };
  await secureStorage.set('cached_license', JSON.stringify(cached));
}

async function getCachedLicense(): Promise<CachedLicense | null> {
  const raw = await secureStorage.get('cached_license');
  return raw ? JSON.parse(raw) : null;
}

function isValidCache(cached: CachedLicense): boolean {
  const cacheTime = new Date(cached.cached_at).getTime();
  const now = Date.now();
  const TTL = 24 * 60 * 60 * 1000;
  return now - cacheTime < TTL;
}
```

---

## 11. HWID Binding

### 11.1 Que es HWID?

HWID (Hardware ID) es un identificador unico generado a partir de las caracteristicas hardware del sistema del usuario. Se utiliza para:

- Prevenir el uso compartido de licencias.
- Vincular una licencia a una maquina especifica.
- Detectar intentos de uso no autorizado.

### 11.2 Generacion de HWID

```typescript
import { machineIdSync } from 'machine-id';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

export async function getHardwareId(): Promise<string> {
  const machineId = machineIdSync({ original: true });
  const motherboard = getMotherboardSerial();
  const cpuId = getCpuId();
  
  const combined = `${machineId}-${motherboard}-${cpuId}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function getMotherboardSerial(): string {
  try {
    if (process.platform === 'win32') {
      const output = execSync(
        'wmic baseboard get serialnumber',
        { encoding: 'utf-8' }
      );
      return output.split('\n')[1]?.trim() || 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function getCpuId(): string {
  try {
    if (process.platform === 'win32') {
      const output = execSync(
        'wmic cpu get processorid',
        { encoding: 'utf-8' }
      );
      return output.split('\n')[1]?.trim() || 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
```

### 11.3 Validacion de HWID

```typescript
function validateHwid(storedHwid: string, currentHwid: string): boolean {
  if (storedHwid === currentHwid) return true;
  
  const similarity = calculateSimilarity(storedHwid, currentHwid);
  return similarity > 0.8;
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  
  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(newValue, lastValue, costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  
  return (longer.length - costs[longer.length]) / longer.length;
}
```

### 11.4 Manejo de Cambios de Hardware

Cuando un usuario cambia hardware, el HWID cambiara. Para manejar esto:

1. **Limite de cambios**: Permitir hasta 3 cambios de HWID por licencia.
2. **Notificacion**: Enviar email al usuario cuando se detecta un cambio.
3. **Revalidacion manual**: Permitir al admin resetear el HWID.

```sql
CREATE TABLE hwid_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
  old_hwid TEXT,
  new_hwid TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  auto_approved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_hwid_changes_license ON hwid_changes(license_id);
```

---

## 12. Offline Mode

### 12.1 Estrategia de Cache

Vantare Overlays permite uso offline con las siguientes restricciones:

| Aspecto | Comportamiento |
|---|---|
| TTL de cache | 24 horas |
| Features disponibles | Las del ultimo tier valido |
| Login offline | No disponible |
| Cambios de tier | Requiere conexion |

### 12.2 Implementacion

```typescript
interface OfflineState {
  isOnline: boolean;
  lastOnline: Date;
  cachedTier: Tier;
  offlineHours: number;
}

class OfflineManager {
  private state: OfflineState;
  private readonly MAX_OFFLINE_HOURS = 24;

  constructor() {
    this.state = {
      isOnline: navigator.onLine,
      lastOnline: new Date(),
      cachedTier: 'free',
      offlineHours: 0,
    };

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private handleOffline() {
    this.state.isOnline = false;
    this.state.lastOnline = new Date();
    console.log('App is offline. Using cached license data.');
  }

  private async handleOnline() {
    this.state.isOnline = true;
    const hoursOffline = this.calculateOfflineHours();
    
    if (hoursOffline > this.MAX_OFFLINE_HOURS) {
      console.warn(`Offline for ${hoursOffline}h. Revalidating license.`);
      await this.revalidateLicense();
    } else {
      console.log(`Back online after ${hoursOffline}h. License cache still valid.`);
    }
  }

  private calculateOfflineHours(): number {
    const now = new Date();
    const diff = now.getTime() - this.state.lastOnline.getTime();
    return diff / (1000 * 60 * 60);
  }

  private async revalidateLicense() {
    const result = await validateOnStartup();
    this.state.cachedTier = result.tier;
  }

  get currentTier(): Tier {
    if (!this.state.isOnline) {
      const hoursOffline = this.calculateOfflineHours();
      if (hoursOffline > this.MAX_OFFLINE_HOURS) {
        return 'free';
      }
    }
    return this.state.cachedTier;
  }
}
```

### 12.3 Degradacion Graceful

Cuando la app detecta que esta offline y el cache ha expirado:

1. **Notificacion al usuario**: "Modo offline - Funcionalidades limitadas"
2. **Feature gating estricto**: Solo features de tier Free
3. **Boton de reconexion**: Intento manual de reconexion
4. **Log de eventos**: Registrar el evento para analisis posterior

```typescript
function handleOfflineDegradation(): void {
  showNotification({
    type: 'warning',
    title: 'Modo Offline',
    message: 'Tu licencia no puede validarse. Algunas funcionalidades estan deshabilitadas.',
    actions: [
      { label: 'Reconectar', onClick: () => attemptReconnection() },
      { label: 'Continuar Offline', onClick: () => dismiss() },
    ],
  });
}
```

---

## 13. Error Handling

### 13.1 Tipos de Error

```typescript
export enum AuthError {
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  LICENSE_EXPIRED = 'LICENSE_EXPIRED',
  HWID_MISMATCH = 'HWID_MISMATCH',
  RATE_LIMITED = 'RATE_LIMITED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface AuthErrorResponse {
  error: AuthError;
  message: string;
  retryable: boolean;
  retryAfter?: number;
}
```

### 13.2 Manejo de Errores

```typescript
function handleAuthError(error: AuthErrorResponse): void {
  switch (error.error) {
    case AuthError.NETWORK_ERROR:
      showNotification({
        type: 'warning',
        title: 'Sin conexion',
        message: 'Usando datos en cache. Algunas funcionalidades pueden estar limitadas.',
      });
      break;

    case AuthError.INVALID_CREDENTIALS:
      showNotification({
        type: 'error',
        title: 'Credenciales incorrectas',
        message: 'Email o contrasena incorrectos. Intenta de nuevo.',
      });
      break;

    case AuthError.LICENSE_EXPIRED:
      showNotification({
        type: 'error',
        title: 'Licencia expirada',
        message: 'Tu licencia ha expirado. Renueva para continuar usando todas las funcionalidades.',
        actions: [
          { label: 'Renovar', onClick: () => openUpgradeUrl() },
        ],
      });
      downgradeToFree();
      break;

    case AuthError.HWID_MISMATCH:
      showNotification({
        type: 'error',
        title: 'Hardware no reconocido',
        message: 'Esta licencia esta vinculada a otro equipo. Contacta soporte.',
        actions: [
          { label: 'Contactar Soporte', onClick: () => openSupportUrl() },
        ],
      });
      break;

    case AuthError.RATE_LIMITED:
      showNotification({
        type: 'warning',
        title: 'Demasiados intentos',
        message: `Espera ${error.retryAfter} segundos antes de intentar de nuevo.`,
      });
      break;

    case AuthError.TOKEN_EXPIRED:
      attemptTokenRefresh();
      break;

    default:
      showNotification({
        type: 'error',
        title: 'Error de autenticacion',
        message: 'Ha ocurrido un error inesperado. Intenta de nuevo.',
      });
  }
}
```

### 13.3 Rate Limiting

```typescript
const RATE_LIMIT_CONFIG = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  licenseValidation: { maxAttempts: 20, windowMs: 60 * 60 * 1000 },
  passwordReset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
};

class RateLimiter {
  private attempts: Map<string, number[]> = new Map();

  canAttempt(endpoint: string): boolean {
    const config = RATE_LIMIT_CONFIG[endpoint as keyof typeof RATE_LIMIT_CONFIG];
    if (!config) return true;

    const now = Date.now();
    const attempts = this.attempts.get(endpoint) || [];
    const validAttempts = attempts.filter(t => now - t < config.windowMs);
    this.attempts.set(endpoint, validAttempts);

    return validAttempts.length < config.maxAttempts;
  }

  recordAttempt(endpoint: string): void {
    const attempts = this.attempts.get(endpoint) || [];
    attempts.push(Date.now());
    this.attempts.set(endpoint, attempts);
  }

  getWaitTime(endpoint: string): number {
    const config = RATE_LIMIT_CONFIG[endpoint as keyof typeof RATE_LIMIT_CONFIG];
    if (!config) return 0;

    const attempts = this.attempts.get(endpoint) || [];
    if (attempts.length === 0) return 0;

    const oldestAttempt = Math.min(...attempts);
    const waitTime = config.windowMs - (Date.now() - oldestAttempt);
    return Math.max(0, Math.ceil(waitTime / 1000));
  }
}
```

---

## 14. Implementation Code

### 14.1 supabase-client.ts

```typescript
// src/lib/supabase-client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseInstance;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
```

### 14.2 auth-provider.tsx

```tsx
// src/providers/auth-provider.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase-client';
import { secureStorage } from '../lib/secure-storage';
import { getHardwareId } from '../lib/hwid';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();

  useEffect(() => {
    initializeAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (newSession?.access_token) {
          await secureStorage.set('supabase_jwt', newSession.access_token);
          await secureStorage.set('supabase_refresh_token', newSession.refresh_token || '');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function initializeAuth() {
    try {
      const storedToken = await secureStorage.get('supabase_jwt');
      
      if (storedToken) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
        } else {
          const refreshToken = await secureStorage.get('supabase_refresh_token');
          if (refreshToken) {
            const { data } = await supabase.auth.setSession({
              access_token: storedToken,
              refresh_token: refreshToken,
            });
            
            if (data.session) {
              setSession(data.session);
              setUser(data.session.user);
            }
          }
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      setLoading(false);
    }
  }

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { error: error.message };

    if (data.session) {
      await secureStorage.set('supabase_jwt', data.session.access_token);
      await secureStorage.set('supabase_refresh_token', data.session.refresh_token || '');
    }

    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) return { error: error.message };

    const hwid = await getHardwareId();
    await fetch(`${process.env.SUPABASE_URL}/functions/v1/register-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ email, password, hwid }),
    });

    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await secureStorage.delete('supabase_jwt');
    await secureStorage.delete('supabase_refresh_token');
    await secureStorage.delete('cached_license');
    setUser(null);
    setSession(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error ? { error: error.message } : {};
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### 14.3 license-validator.ts

```typescript
// src/lib/license-validator.ts
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client';
import { secureStorage } from './secure-storage';
import { getHardwareId } from './hwid';
import { Tier } from './feature-gating';

export interface LicenseData {
  valid: boolean;
  tier: Tier;
  license_id?: string;
  expires_at?: string;
  error?: string;
  requiresLogin?: boolean;
}

interface CachedLicense {
  tier: Tier;
  valid: boolean;
  cached_at: string;
  expires_at: string | null;
  license_id: string;
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function validateLicense(): Promise<LicenseData> {
  try {
    const hwid = await getHardwareId();
    const jwt = await secureStorage.get('supabase_jwt');

    if (!jwt) {
      return { tier: 'free', valid: false, requiresLogin: true };
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/validate-license`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ hwid }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.valid) {
      await cacheLicense(data);
    }

    return data;
  } catch (error) {
    console.error('License validation failed:', error);
    
    const cached = await getCachedLicense();
    if (cached && isCacheValid(cached)) {
      return {
        tier: cached.tier,
        valid: cached.valid,
        license_id: cached.license_id,
        expires_at: cached.expires_at || undefined,
      };
    }

    return { tier: 'free', valid: false, error: 'Network error' };
  }
}

async function cacheLicense(data: LicenseData): Promise<void> {
  const cached: CachedLicense = {
    tier: data.tier,
    valid: data.valid,
    cached_at: new Date().toISOString(),
    expires_at: data.expires_at || null,
    license_id: data.license_id || '',
  };
  await secureStorage.set('cached_license', JSON.stringify(cached));
}

async function getCachedLicense(): Promise<CachedLicense | null> {
  const raw = await secureStorage.get('cached_license');
  return raw ? JSON.parse(raw) : null;
}

function isCacheValid(cached: CachedLicense): boolean {
  const cacheTime = new Date(cached.cached_at).getTime();
  return Date.now() - cacheTime < CACHE_TTL;
}

export async function getLicenseTier(): Promise<Tier> {
  const result = await validateLicense();
  return result.tier;
}
```

### 14.4 feature-gating.ts

```typescript
// src/lib/feature-gating.ts
import { Tier } from '../types';

export enum Feature {
  STANDINGS = 'standings',
  RELATIVE = 'relative',
  DELTA_BAR = 'delta-bar',
  FUEL_CALCULATOR = 'fuel-calculator',
  FLAGS = 'flags',
  TRACK_MAP = 'track-map',
  STREAM_ALERTS = 'stream-alerts',
  INPUT_TELEMETRY = 'input-telemetry',
  HEAD_TO_HEAD = 'head-to-head',
  BLIND_SPOT = 'blind-spot',
  DATA_BLOCKS = 'data-blocks',
  CUSTOM_THEMES = 'custom-themes',
  IRACING = 'iracing',
  LMU = 'lmu',
  AC = 'ac',
}

export const tierFeatures: Record<Tier, Feature[]> = {
  free: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.IRACING,
  ],
  pro: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.FUEL_CALCULATOR,
    Feature.FLAGS,
    Feature.TRACK_MAP,
    Feature.STREAM_ALERTS,
    Feature.INPUT_TELEMETRY,
    Feature.HEAD_TO_HEAD,
    Feature.BLIND_SPOT,
    Feature.IRACING,
    Feature.LMU,
    Feature.AC,
  ],
  ultimate: Object.values(Feature),
};

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return tierFeatures[tier]?.includes(feature) ?? false;
}

export function getRequiredTier(feature: Feature): Tier {
  if (tierFeatures.free.includes(feature)) return 'free';
  if (tierFeatures.pro.includes(feature)) return 'pro';
  return 'ultimate';
}

export function getAllEnabledFeatures(tier: Tier): Feature[] {
  return tierFeatures[tier] || [];
}
```

### 14.5 useAuth.ts hook

```typescript
// src/hooks/useAuth.ts
import { useAuth as useAuthProvider } from '../providers/auth-provider';

export { useAuth as useAuthProvider };

export function useAuth() {
  const auth = useAuthProvider();
  
  return {
    ...auth,
    isAuthenticated: !!auth.user,
    isLoading: auth.loading,
    userEmail: auth.user?.email || null,
  };
}
```

### 14.6 useLicense.ts hook

```typescript
// src/hooks/useLicense.ts
import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { validateLicense, LicenseData } from '../lib/license-validator';
import { Feature, hasFeature, getRequiredTier, getAllEnabledFeatures } from '../lib/feature-gating';
import { Tier } from '../types';
import { useAuth } from './useAuth';

interface LicenseContextType {
  tier: Tier;
  valid: boolean;
  loading: boolean;
  licenseId: string | null;
  expiresAt: string | null;
  hasFeature: (feature: Feature) => boolean;
  getRequiredTier: (feature: Feature) => Tier;
  enabledFeatures: Feature[];
  refreshLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [licenseData, setLicenseData] = useState<LicenseData>({
    tier: 'free',
    valid: false,
  });
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      loadLicense();
    } else {
      setLicenseData({ tier: 'free', valid: false });
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      loadLicense();
    }, 6 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function loadLicense() {
    setLoading(true);
    try {
      const data = await validateLicense();
      setLicenseData(data);
    } catch (error) {
      console.error('Failed to load license:', error);
      setLicenseData({ tier: 'free', valid: false, error: 'Failed to load license' });
    } finally {
      setLoading(false);
    }
  }

  const refreshLicense = useCallback(async () => {
    await loadLicense();
  }, []);

  const contextValue: LicenseContextType = {
    tier: licenseData.tier,
    valid: licenseData.valid,
    loading,
    licenseId: licenseData.license_id || null,
    expiresAt: licenseData.expires_at || null,
    hasFeature: (feature: Feature) => hasFeature(licenseData.tier, feature),
    getRequiredTier: (feature: Feature) => getRequiredTier(feature),
    enabledFeatures: getAllEnabledFeatures(licenseData.tier),
    refreshLicense,
  };

  return (
    <LicenseContext.Provider value={contextValue}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}

export function useFeature(feature: Feature) {
  const { hasFeature, tier, getRequiredTier } = useLicense();
  const enabled = hasFeature(feature);
  const requiredTier = getRequiredTier(feature);

  return {
    enabled,
    requiredTier,
    currentTier: tier,
    canUpgrade: tier !== 'ultimate',
    upgradeMessage: enabled
      ? null
      : `Esta funcion requiere tier ${requiredTier}. Actualiza para desbloquearla.`,
  };
}
```

---

## 15. Security Considerations

### 15.1 JWT Storage

- **electron-safe-storage**: Usa el Keychain de macOS, DPAPI de Windows o Secret Service de Linux.
- **Nunca** usar `localStorage` o `sessionStorage` para JWT.
- El JWT se encripta con la clave del sistema operativo antes de almacenarse.

```typescript
// Correcto
import { safeStorage } from 'electron';
const encrypted = safeStorage.encryptString(token);
fs.writeFileSync(tokenPath, encrypted);

// Incorrecto
localStorage.setItem('token', token);
```

### 15.2 Separacion de Procesos

- **Main Process**: Accede a secrets, realiza llamadas autenticadas.
- **Renderer Process**: Solo recibe datos ya procesados, nunca maneja tokens directamente.
- Usa IPC para comunicar datos de autenticacion entre procesos.

```typescript
// main.ts
ipcMain.handle('auth:validate', async (event, hwid) => {
  const token = await getStoredToken();
  return validateLicenseFromMain(token, hwid);
});

// renderer
const license = await ipcRenderer.invoke('auth:validate', hwid);
```

### 15.3 Supabase RLS

Todas las tablas tienen RLS habilitado. Los usuarios solo pueden acceder a sus propios datos.

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### 15.4 Rate Limiting

- Implementado tanto en edge functions como en el cliente.
- El servidor rechaza requests despues del limite.
- El cliente tambien aplica rate limiting local para evitar llamadas innecesarias.

### 15.5 Token Refresh

- Supabase maneja el refresh automaticamente.
- El refresh token se almacena en secure storage.
- Si el refresh falla, se cierra la sesion y se redirige al login.

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  async (event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) {
      await secureStorage.set('supabase_jwt', session.access_token);
    }
    if (event === 'SIGNED_OUT') {
      await secureStorage.clear();
    }
  }
);
```

### 15.6 Proteccion contra Manipulacion

- **Integrity checks**: Verificar que los archivos de la app no han sido modificados.
- **Code signing**: Firmar el ejecutable de Electron.
- **Obfuscation**: Ofuscar codigo sensible en el build de produccion.
- **Source maps**: No incluir source maps en produccion.

### 15.7 Auditoria y Logging

```typescript
interface SecurityEvent {
  type: 'login' | 'logout' | 'license_change' | 'hwid_change' | 'rate_limit';
  userId?: string;
  ip?: string;
  timestamp: string;
  details: Record<string, unknown>;
}

async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('security_logs').insert({
    user_id: event.userId,
    event_type: event.type,
    ip_address: event.ip,
    details: event.details,
    created_at: event.timestamp,
  });
}
```

---

## 16. Deployment Checklist

### 16.1 Antes del Deploy

- [ ] Variables de entorno configuradas en Supabase
- [ ] Edge functions desplegadas
- [ ] RLS policies habilitadas y probadas
- [ ] Triggers de profile creation funcionando
- [ ] electron-safe-storage configurado
- [ ] HWID generation probado en las 3 plataformas (Windows, macOS, Linux)
- [ ] Rate limiting configurado
- [ ] Cache TTL ajustado

### 16.2 Testing

```bash
# Ejecutar tests de auth
npm run test:auth

# Ejecutar tests de license
npm run test:license

# Ejecutar tests de feature gating
npm run test:features

# Ejecutar tests de HWID
npm run test:hwid
```

### 16.3 Monitoreo

- Dashboard de Supabase: Monitorear queries lentas y errores.
- Edge Function Logs: Revisar logs de validacion de licencias.
- Client-side telemetry: Reportar errores de auth al servidor.

---

## 17. Troubleshooting

### Problemas Comunes

| Problema | Causa | Solucion |
|---|---|---|
| Login falla con "Invalid credentials" | Email no confirmado o contrasena incorrecta | Verificar email, usar "Forgot password" |
| Licencia no valida despues de login | HWID mismatch | Rebind HWID desde admin panel |
| App no conecta a Supabase | CORS no configurado | Agregar dominio en CORS settings |
| Token expirado despues de refresh | Refresh token revocado | Cerrar sesion y volver a login |
| Features bloqueadas con tier valido | Cache desactualizado | Forzar refresh de licencia |
| Error "Rate limited" | Demasiados intentos | Esperar el tiempo indicado |
| HWID cambia despues de update Windows | Actualizacion mayor de Windows | Contactar soporte para rebind |

### Logs de Debug

```typescript
if (process.env.NODE_ENV === 'development') {
  window.__SUPABASE_DEBUG__ = true;
}
```

---

## 18. API Reference

### Edge Functions

| Function | Method | Auth Required | Description |
|---|---|---|---|
| `/functions/v1/validate-license` | POST | Yes | Valida licencia y retorna tier |
| `/functions/v1/register-user` | POST | No | Registra nuevo usuario con licencia free |

### Supabase Tables

| Table | RLS | Description |
|---|---|---|
| `profiles` | User can read/update own | Perfiles de usuario |
| `licenses` | User can read own | Licencias |
| `subscriptions` | User can read own | Suscripciones |
| `license_validations` | User can read own | Log de validaciones |
| `hwid_changes` | Admin only | Cambios de hardware ID |

---

*Ultima actualizacion: 2026-06-01*
