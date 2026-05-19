import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine, SessionLocal
from app.models import User, UserRole
from app.auth import hash_password
from app.routers import (
    auth,
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
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(suppliers.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(delivery_notes.router)
app.include_router(price_quotes.router)
app.include_router(analysis.router)
app.include_router(export.router)
app.include_router(upload.router)

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def create_default_admin():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == UserRole.MASTER.value).first()
        if not admin:
            admin_email = os.getenv("ADMIN_EMAIL", "admin@fatture.local")
            admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
            user = User(
                email=admin_email,
                full_name="Amministratore",
                hashed_password=hash_password(admin_password),
                role=UserRole.MASTER.value,
                business_id=None,
            )
            db.add(user)
            db.commit()
    finally:
        db.close()
