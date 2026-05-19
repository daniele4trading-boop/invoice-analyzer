from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Invoice, InvoiceItem
from app.schemas import InvoiceCreate, InvoiceOut

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("/", response_model=list[InvoiceOut])
def list_invoices(
    skip: int = 0,
    limit: int = 100,
    supplier_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Invoice).options(
        joinedload(Invoice.supplier),
        joinedload(Invoice.items).joinedload(InvoiceItem.product),
    )
    if supplier_id:
        query = query.filter(Invoice.supplier_id == supplier_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)
    results = query.order_by(Invoice.date.desc()).offset(skip).limit(limit).all()
    seen: set[int] = set()
    unique = []
    for inv in results:
        if inv.id not in seen:
            seen.add(inv.id)
            unique.append(inv)
    return unique


@router.post("/", response_model=InvoiceOut, status_code=201)
def create_invoice(data: InvoiceCreate, db: Session = Depends(get_db)):
    items_data = data.items
    invoice_dict = data.model_dump(exclude={"items"})
    invoice = Invoice(**invoice_dict)
    db.add(invoice)
    db.flush()

    for item_data in items_data:
        item = InvoiceItem(**item_data.model_dump(), invoice_id=invoice.id)
        db.add(item)

    db.commit()
    db.refresh(invoice)
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.supplier),
            joinedload(Invoice.items).joinedload(InvoiceItem.product),
        )
        .filter(Invoice.id == invoice.id)
        .first()
    )


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.supplier),
            joinedload(Invoice.items).joinedload(InvoiceItem.product),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    return invoice


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    db.delete(invoice)
    db.commit()
