# Track the Abundance

Microsite de **mapeo, análisis y tracking** del *abundance funding world* con foco en **Europa**: la red de Coefficient Giving (ex-Open Philanthropy), Good Ventures (Moskovitz/Tuna) y el ecosistema Collison/Stripe, y cómo su dinero y su agenda entran en Europa.

→ **[tracktheabundance.vercel.app](https://tracktheabundance.vercel.app)**

## Tres secciones

1. **Map** (`index.html`) — mapa interactivo (SVG, sin dependencias). Dos modos:
   - *Money flow*: US capital → engine → funds → beachheads europeos → arenas de política de la UE.
   - *Geography*: los grantees europeos situados geográficamente, con el capital estadounidense entrando desde el Atlántico.
   Datos en `data/graph.json`.
2. **Analysis** (`analysis.html`) — síntesis estática: de dónde viene, quién es quién, evolución, estado actual en Europa, tensiones y qué vigilar.
3. **Tracking** (`tracking.html`) — feed de novedades filtrable. Se refresca solo (ver abajo). Datos en `data/tracking.json`.

## Estética

Fondo negro, amarillo (#FFCC00) y azul (#003399) de la bandera de la UE dominantes, rejilla y aurora azul. Tipos: Space Grotesk / Inter / IBM Plex Mono.

## Fuentes

- Tres briefs de research en `research/` (Good Ventures/Open Phil; el ecosistema Collison/Stripe; las actividades europeas de Coefficient).
- Búsqueda web propia (feed de tracking).

Las magnitudes en USD son aproximadas y sirven para escalar la visualización; muchas subvenciones europeas son *advised* y no públicas, así que el mapa es un suelo, no un techo.

## Tracking automático

`scripts/update-tracking.mjs` usa la **API de Anthropic + web search** (`claude-opus-4-8`) para buscar novedades del abundance-funding en Europa y fusionarlas en `data/tracking.json` (dedup por URL). Lo lanza a diario `.github/workflows/update-tracking.yml`; al commitear, la integración Git de Vercel redespliega.

**Requiere** el secret `ANTHROPIC_API_KEY` en el repo de GitHub (Settings → Secrets and variables → Actions). Sin él, el workflow se salta el refresco sin fallar.

Refresco manual en local:

```bash
npm install
ANTHROPIC_API_KEY=sk-... npm run update:tracking
```

## Desarrollo local

```bash
npm run dev   # sirve en http://localhost:5178 (python3 -m http.server)
```

Sitio 100% estático; no hay build. Deploy en Vercel directo desde el repo.
