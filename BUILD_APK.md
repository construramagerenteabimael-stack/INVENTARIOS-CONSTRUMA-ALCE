# Cómo generar el archivo `.apk` (Sin Play Store)

El proyecto ya incluye la configuración nativa de **Capacitor Android** (`capacitor.config.ts` y carpeta `android/`) lista para compilar un archivo `.apk` instalable por WhatsApp o cable USB en cualquier teléfono o terminal Android.

---

## Opción A: Generar el APK en la nube con GitHub (Sin instalar Android Studio)

1. Exporta o sube este proyecto a un repositorio en **GitHub** (puede ser privado).
2. En tu repositorio de GitHub, abre la pestaña **Actions**.
3. Selecciona el flujo **"Generar APK Android (Sin Play Store)"** y haz clic en **Run workflow**.
4. Espera ~2 minutos y descarga el archivo **`Inventarios-Construrama-Alce-APK`** desde la sección **Artifacts**.
5. Descomprime el ZIP para obtener `Inventarios-Construrama-Alce.apk` y compártelo por WhatsApp o USB a tus dispositivos.

---

## Opción B: Generar el APK desde tu computadora

Requisitos en tu PC: **Node.js 20+** y **Android Studio** (o JDK 21 + Android SDK).

```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

En Windows (PowerShell / CMD):
```bat
npm install
npm run build
npx cap sync android
cd android
gradlew.bat assembleDebug
```

El archivo instalable quedará en:
`android/app/build/outputs/apk/debug/app-debug.apk`

> **Nota al instalar en teléfonos nuevos:** Android pedirá confirmar **"Instalar apps de orígenes desconocidos"** una sola vez para el navegador o WhatsApp desde donde abras el `.apk`.
