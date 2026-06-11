# AI Interview Coach

AI Interview Coach este o platformă web completă care ajută studenții să se pregătească pentru interviuri prin simulări voice-first, analiză non-verbală și evaluări tehnice sigure.

## Ce vreau să livrez
- Autentificare cu profiluri (experiență, rol țintă, tehnologii).
- Două moduri de interviu: **comportamental** (întrebări situaționale cu analiză emoțională) și **tehnic** (probleme de programare cu execuție și review AI).
- Conversație vocală bidirecțională în timp real via **Google Gemini Live API** (WebSocket direct browser↔Gemini, fără pipeline STT/LLM/TTS).
- Analiză emoțională în timp real (DeepFace/OpenCV) cu mapare la patru categorii relevante pentru interviu.
- Sandbox Docker izolat pentru execuția codului din Monaco Editor (--network none, --read-only, limite CPU/RAM/PID).
- Raport JSON final cu secțiuni tehnice, comunicaționale și non-verbale, generat automat de Gemini.

## Cum rulezi local
1. **Setup inițial**
   - Copiază `.env.example` în `backend/.env` și `frontend/.env` sau folosește `./scripts/dev_up.sh` (creează fișierele și pornește Docker Compose).
   - Completează variabilele (JWT secret, `GEMINI_API_KEY`, `DATABASE_URL` sau folosești fallback sqlite).
2. **Rulează infrastructura**
- `./scripts/dev_up.sh` (pornește Postgres, backend, frontend, sandbox; recreează `.env` dacă lipsesc; nu reconstruiește imaginile).
- Pentru rebuild: `DEV_UP_BUILD=1 ./scripts/dev_up.sh` sau `./scripts/dev_up.sh --build` (necesar după schimbări de Dockerfile/requirements).
- Migrations rulează automat la start prin entrypoint-ul backend-ului.
3. **Migrații**
   - `docker compose -f infrastructure/docker-compose.yml run --rm backend alembic upgrade head` sau `python backend/scripts/init_db.py`.
4. **Verificare**
   - Frontend: `http://localhost:5173`
   - API health: `http://localhost:8000/api/v1/health`

## Alternativ fără Docker
1. Instalează cerințele  (Node 20+, Python 3.11+, PostgreSQL 15+).
2. `cd backend`
   - `python -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `alembic upgrade head`
   - `uvicorn app.main:app --reload`
3. `cd frontend`
   - `npm install`
   - `npm run dev`

## Documentația cheie
- `docs/00-project-charter.md`: scop și asumpții.
- `docs/01-requirements.md`, `docs/02-architecture.md`, `docs/03-data-model.md`: viziune tehnică și modele.
- `docs/05-dev-setup.md`: pași detaliați de setup/rulare.
- `docs/08-integration-steps.md`: secvența de integrare completă.
- `docs/12-migrations-and-db.md`: alembic + fallback sqlite.
- `docs/13-ai-pipeline.md`: integrare Gemini Live + analiză emoțională.
- `docs/15-frontend-ui.md`: decizii UI.

## Notă de securitate
- Cheile (Gemini, JWT) sunt gestionate prin variabile de mediu.
- Fără log-uri de audio/video raw.
- Sandbox-ul Docker este izolat (no network, read-only, limite CPU/RAM/PID).

## Next steps
- Integrarea emoțiilor în raportul final.
- Extinderea sandboxului cu Python/JS mai complexe.
- Completarea testelor end-to-end (voice + code).
