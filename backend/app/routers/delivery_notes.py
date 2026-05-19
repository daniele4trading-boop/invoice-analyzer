from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import DeliveryNote, DeliveryNoteItem
from app.schemas import DeliveryNoteCreate, DeliveryNoteOut

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery_notes"])


@router.get("/", response_model=list[DeliveryNoteOut])
def list_delivery_notes(
    skip: int = 0,
    limit: int = 100,
    supplier_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.supplier),
        joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
    )
    if supplier_id:
        query = query.filter(DeliveryNote.supplier_id == supplier_id)
    if date_from:
        query = query.filter(DeliveryNote.date >= date_from)
    if date_to:
        query = query.filter(DeliveryNote.date <= date_to)
    return query.order_by(DeliveryNote.date.desc()).offset(skip).limit(limit).unique().all()


@router.post("/", response_model=DeliveryNoteOut, status_code=201)
def create_delivery_note(data: DeliveryNoteCreate, db: Session = Depends(get_db)):
    items_data = data.items
    dn_dict = data.model_dump(exclude={"items"})
    dn = DeliveryNote(**dn_dict)
    db.add(dn)
    db.flush()

    for item_data in items_data:
        item = DeliveryNoteItem(**item_data.model_dump(), delivery_note_id=dn.id)
        db.add(item)

    db.commit()
    db.refresh(dn)
    return (
        db.query(DeliveryNote)
        .options(
            joinedload(DeliveryNote.supplier),
            joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
        )
        .filter(DeliveryNote.id == dn.id)
        .first()
    )


@router.get("/{dn_id}", response_model=DeliveryNoteOut)
def get_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = (
        db.query(DeliveryNote)
        .options(
            joinedload(DeliveryNote.supplier),
            joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
        )
        .filter(DeliveryNote.id == dn_id)
        .first()
    )
    if not dn:
        raise HTTPException(status_code=404, detail="DDT non trovato")
    return dn


@router.delete("/{dn_id}", status_code=204)
def delete_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="DDT non trovato")
    db.delete(dn)
    db.commit()
