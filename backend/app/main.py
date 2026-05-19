from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.database import Base, engine
from app.routers import (
    suppliers,
    products,
    invoices,
    delivery_notes,
    price_quotes,
    analysis,
    export,
    upload,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Invoice Analyzer",
    description="Gestione e analisi fatture e bolle di consegna",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(suppliers.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(delivery_notes.router)
app.include_router(price_quotes.router)
app.include_router(analysis.router)
app.include_router(export.router)
app.include_router(upload.router)

# Serve frontend static files in production
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/api/health")
def health():
    return {"status": "ok"}
