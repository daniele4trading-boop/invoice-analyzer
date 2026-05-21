from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import PriceQuote, User
from app.schemas import PriceQuoteCreate, PriceQuoteOut
from app.auth import get_current_user, get_business_filter

router = APIRouter(prefix="/api/price-quotes", tags=["price_quotes"])


@router.get("/", response_model=list[PriceQuoteOut])
def list_price_quotes(
    supplier_id: int | None = None,
    product_id: int | None = None,
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(PriceQuote).options(
        joinedload(PriceQuote.supplier),
        joinedload(PriceQuote.product),
        joinedload(PriceQuote.business),
    )
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None:
        query = query.filter(PriceQuote.business_id == biz_filter)
    elif business_id:
        query = query.filter(PriceQuote.business_id == business_id)
    if supplier_id:
        query = query.filter(PriceQuote.supplier_id == supplier_id)
    if product_id:
        query = query.filter(PriceQuote.product_id == product_id)
    return query.order_by(PriceQuote.valid_from.desc()).all()


@router.post("/", response_model=PriceQuoteOut, status_code=201)
def create_price_quote(
    data: PriceQuoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pq_dict = data.model_dump()
    if not pq_dict.get("business_id") and current_user.business_id:
        pq_dict["business_id"] = current_user.business_id
    pq = PriceQuote(**pq_dict)
    db.add(pq)
    db.commit()
    db.refresh(pq)
    return (
        db.query(PriceQuote)
        .options(
            joinedload(PriceQuote.supplier),
            joinedload(PriceQuote.product),
            joinedload(PriceQuote.business),
        )
        .filter(PriceQuote.id == pq.id)
        .first()
    )


@router.delete("/{pq_id}", status_code=204)
def delete_price_quote(
    pq_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pq = db.query(PriceQuote).filter(PriceQuote.id == pq_id).first()
    if not pq:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    biz_filter = get_business_filter(current_user)
    if biz_filter is not None and pq.business_id != biz_filter:
        raise HTTPException(status_code=403, detail="Accesso negato")
    db.delete(pq)
    db.commit()
