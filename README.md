# Voto Seguro · Elecciones escolares

Sistema de votación escolar **online y offline** para PC, laptop, tablet y teléfono, con registro de votos en una **cadena de bloques local verificable** (SHA-256). Originalmente el repositorio de la I.E. La Esmeralda; esta versión lo convierte en una aplicación instalable (PWA) con autenticación de la institución, modo demo y tutorial integrado.

## Características

- **Autenticación institucional.** En el primer arranque se registran los datos del colegio, el proceso electoral y un PIN de administración (guardado con PBKDF2-SHA256). En cada inicio de sesión se pide el PIN.
- **Funciona sin internet.** PWA con service worker: se instala en la pantalla de inicio y abre sin conexión. Los datos se guardan en IndexedDB, en el propio dispositivo.
- **Blockchain local.** Cada voto se sella en un bloque con `index`, `timestamp`, `prevHash`, `type`, `data` y su hash SHA-256. Cualquier alteración rompe la cadena y la app lo detecta.
- **Voto secreto en el registro.** El voto se enlaza mediante un *nullifier* ciego; el padrón no guarda el código del comprobante, solo su hash.
- **Escrutinio en tiempo real.** Resultados por candidatura, blancos, nulos y participación, calculados directamente desde la cadena.
- **Acta exportable e imprimible.** Acta de escrutinio con participación, resultados, número de bloques y hash de cabecera, lista para firmas.
- **Comprobante de voto.** Código único por elector para verificar después que su voto está en la cadena.
- **Modo Demo aislado.** Permite practicar y ver cómo la verificación detecta un voto alterado, sin tocar la elección real.
- **Tutorial integrado.** Guía paso a paso, instalación por dispositivo, roles, cierre y preguntas frecuentes, con checklist persistente.
- **Respaldo y restauración.** Exportación/importación completa en JSON y bitácora de auditoría.

## Inicio rápido

No requiere instalación de dependencias ni build.

```bash
cd voto01
python3 -m http.server 8080
# abre http://localhost:8080
```

> El service worker (instalación y modo offline) solo funciona con `http://localhost` o `https://`. Abrir `index.html` con doble clic también funciona, pero sin PWA/offline completo.

### Publicar en GitHub Pages

1. Sube los cambios a la rama principal del repositorio.
2. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `root`**.
3. La app quedará en `https://<usuario>.github.io/voto01/`.

## Uso

1. **Registrar la institución**: nombre, siglas, código modular, región/UGEL, proceso electoral, año y PIN.
2. **Configurar**:
   - *Candidaturas*: nombre/fórmula, lista, lema y color.
   - *Padrón*: pega `documento, nombre completo` (una persona por línea). Acepta comas, punto y coma, tabulaciones o CSV.
3. **Probar en Demo** (opcional pero recomendado).
4. **Votar**: buscar elector → confirmar entrega de cédula → elegir → emitir. Se muestra el comprobante.
5. **Cerrar la jornada** y **exportar/imprimir el acta**. Exporta también el respaldo completo.

## Estructura

```
index.html            Shell de la app y pantallas de registro/login
manifest.webmanifest  Metadatos PWA (instalación)
sw.js                 Service worker (offline)
css/estilos.css       Diseño responsive, modo claro/oscuro, impresión
js/app.js             Arranque, autenticación, navegación
js/views.js           Panel, votación, resultados, blockchain, config, demo, tutorial
js/store.js           Lógica electoral (padrón, candidaturas, votos, actas, respaldos)
js/db.js              Capa IndexedDB
js/chain.js           Bloques, hash encadenado y verificación
js/crypto.js          SHA-256 y PBKDF2 (WebCrypto + respaldo JS)
js/demo.js            Cadena aislada del modo demostración
js/utils.js           DOM, modales, formato y descargas
assets/               Íconos y logo
```

## Cómo funciona la cadena

Cada bloque se serializa siempre con el mismo orden de campos y se hashea con SHA-256. Un voto no guarda el documento del elector: guarda un `nullifier` derivado de un token aleatorio que se destruye al votar, y el **hash** del comprobante. Así el registro no permite relacionar a la persona con su opción.

La verificación comprueba:

1. que los índices sean consecutivos;
2. que cada `prevHash` coincida con el hash del bloque anterior;
3. que el hash recalculado coincida con el almacenado;
4. que no haya `nullifier` ni comprobantes duplicados.

## Seguridad y alcance

- Los datos **no salen del dispositivo**: no hay servidor, nube ni telemetría.
- Esta versión usa una cadena local de solo agregado; **no** es una red distribuida con nodos ni consenso. Para procesos de mayor escala se recomienda auditoría externa y respaldos en varios medios.
- El PIN no se puede recuperar. Si se olvida, hay que restaurar un respaldo (o reiniciar la configuración).
- El respaldo contiene datos personales del padrón: guárdalo de forma segura.
- La app está pensada para voto asistido en mesa (un equipo por mesa). Respeta el secreto del voto durante la selección en pantalla.

## Desarrollo

- Sin dependencias ni build: módulos ES nativos.
- Para publicar cambios, sube `CACHE_VERSION` en `sw.js` para invalidar la caché anterior.
- Probado en navegadores basados en Chromium, Firefox y Safari (iOS 16+).

## Licencia

Uso educativo e institucional. Agrega una licencia explícita si vas a distribuir el proyecto.
