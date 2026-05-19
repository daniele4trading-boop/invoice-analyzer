from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import DeliveryNote, DeliveryNoteItem, User
from app.schemas import DeliveryNoteCreate, DeliveryNoteOut
from app.auth import get_current_user, get_business_filter

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery_notes"])


@router.get("/", response_model=list[DeliveryNoteOut])
def list_delivery_notes(
    skip: int = 0,
    limit: int = 100,
    supplier_id: int | None = None,
    business_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.supplier),
        joinedload(DeliveryNote.business),
        joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
    )
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None:
        query = query.filter(DeliveryNote.business_id == biz_filter)
    elif business_id:
        query = query.filter(DeliveryNote.business_id == business_id)
    if supplier_id:
        query = query.filter(DeliveryNote.supplier_id == supplier_id)
    if date_from:
        query = query.filter(DeliveryNote.date >= date_from)
    if date_to:
        query = query.filter(DeliveryNote.date <= date_to)
    results = query.order_by(DeliveryNote.date.desc()).offset(skip).limit(limit).all()
    seen: set[int] = set()
    unique = []
    for dn in results:
        if dn.id not in seen:
            seen.add(dn.id)
            unique.append(dn)
    return unique


@router.post("/", response_model=DeliveryNoteOut, status_code=201)
def create_delivery_note(
    data: DeliveryNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items_data = data.items
    dn_dict = data.model_dump(exclude={"items"})
    if not dn_dict.get("business_id") and current_user.business_id:
        dn_dict["business_id"] = current_user.business_id
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
            joinedload(DeliveryNote.business),
            joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
        )
        .filter(DeliveryNote.id == dn.id)
        .first()
    )


@router.get("/{dn_id}", response_model=DeliveryNoteOut)
def get_delivery_note(
    dn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dn = (
        db.query(DeliveryNote)
        .options(
            joinedload(DeliveryNote.supplier),
            joinedload(DeliveryNote.business),
            joinedload(DeliveryNote.items).joinedload(DeliveryNoteItem.product),
        )
        .filter(DeliveryNote.id == dn_id)
        .first()
    )
    if not dn:
        raise HTTPException(status_code=404, detail="DDT non trovato")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and dn.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")
    return dn


@router.delete("/{dn_id}", status_code=204)
def delete_delivery_note(
    dn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="DDT non trovato")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and dn.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")
    db.delete(dn)
    db.commit()
