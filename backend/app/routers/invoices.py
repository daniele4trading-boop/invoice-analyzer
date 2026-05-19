from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Invoice, InvoiceItem, User
from app.schemas import InvoiceCreate, InvoiceOut, InvoiceUpdate, DuplicateCheckOut
from app.auth import get_current_user, get_business_filter

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _load_invoice(db: Session, invoice_id: int):
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.supplier),
            joinedload(Invoice.business),
            joinedload(Invoice.items).joinedload(InvoiceItem.product),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )


@router.get("/", response_model=list[InvoiceOut])
def list_invoices(
    skip: int = 0,
    limit: int = 100,
    supplier_id: int | None = None,
    business_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice).options(
        joinedload(Invoice.supplier),
        joinedload(Invoice.business),
        joinedload(Invoice.items).joinedload(InvoiceItem.product),
    )
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None:
        query = query.filter(Invoice.business_id == biz_filter)
    elif business_id:
        query = query.filter(Invoice.business_id == business_id)
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


@router.post("/check-duplicate", response_model=DuplicateCheckOut)
def check_duplicate(
    number: str,
    supplier_id: int,
    date: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice).filter(
        Invoice.number == number,
        Invoice.supplier_id == supplier_id,
    )
    if date:
        query = query.filter(Invoice.date == date)
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None:
        query = query.filter(Invoice.business_id == biz_filter)
    existing = query.first()
    if existing:
        return DuplicateCheckOut(
            is_duplicate=True,
            existing_invoice_id=existing.id,
            message=f"Fattura {number} del fornitore già presente (ID: {existing.id})",
        )
    return DuplicateCheckOut(is_duplicate=False)


@router.post("/", response_model=InvoiceOut, status_code=201)
def create_invoice(
    data: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items_data = data.items
    invoice_dict = data.model_dump(exclude={"items"})
    if not invoice_dict.get("business_id") and current_user.business_id:
        invoice_dict["business_id"] = current_user.business_id
    invoice = Invoice(**invoice_dict)
    db.add(invoice)
    db.flush()

    for item_data in items_data:
        item = InvoiceItem(**item_data.model_dump(), invoice_id=invoice.id)
        db.add(item)

    db.commit()
    db.refresh(invoice)
    return _load_invoice(db, invoice.id)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invoice = _load_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and invoice.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and invoice.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")

    update_data = data.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(invoice, key, value)

    if data.items is not None:
        db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).delete()
        for item_data in data.items:
            item = InvoiceItem(**item_data.model_dump(), invoice_id=invoice_id)
            db.add(item)

    db.commit()
    return _load_invoice(db, invoice_id)


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and invoice.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")
    db.delete(invoice)
    db.commit()
