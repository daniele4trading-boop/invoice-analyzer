# Invoice Analyzer

Webapp per la gestione e analisi di fatture e bolle di consegna (DDT) dei fornitori.

## Funzionalità

- **Gestione Fornitori**: CRUD completo con dati anagrafici (P.IVA, contatti, indirizzo)
- **Gestione Prodotti**: Catalogo prodotti con categorie e unità di misura
- **Fatture**: Inserimento fatture con dettaglio righe, filtri per fornitore e periodo
- **Bolle di Consegna (DDT)**: Gestione documenti di trasporto
- **Preventivi/Listino**: Registrazione prezzi preventivati per confronto
- **Confronto Prezzi**: Analisi scostamenti tra prezzo fatturato e preventivato con grafici
- **Report Personalizzati**: 
  - Consumi di periodo (per prodotto, categoria, fornitore)
  - Analisi per fornitore (fatturato, media)
  - Analisi per prodotto (quantità, spesa, prezzo medio)
  - Esportazione Excel (XLSX)

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 19, TypeScript, Vite, Recharts, React Query
- **Export**: openpyxl per generazione file Excel

## Setup

### Backend

```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

L'app frontend sarà disponibile su `http://localhost:5173` e il backend su `http://localhost:8000`.

## API Docs

Con il backend in esecuzione, visita `http://localhost:8000/docs` per la documentazione Swagger interattiva.
