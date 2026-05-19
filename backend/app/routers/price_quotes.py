from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import PriceQuote
from app.schemas import PriceQuoteCreate, PriceQuoteOut

router = APIRouter(prefix="/api/price-quotes", tags=["price_quotes"])


@router.get("/", response_model=list[PriceQuoteOut])
def list_price_quotes(
    supplier_id: int | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(PriceQuote).options(
        joinedload(PriceQuote.supplier),
        joinedload(PriceQuote.product),
    )
    if supplier_id:
        query = query.filter(PriceQuote.supplier_id == supplier_id)
    if product_id:
        query = query.filter(PriceQuote.product_id == product_id)
    return query.order_by(PriceQuote.valid_from.desc()).all()


@router.post("/", response_model=PriceQuoteOut, status_code=201)
def create_price_quote(data: PriceQuoteCreate, db: Session = Depends(get_db)):
    pq = PriceQuote(**data.model_dump())
    db.add(pq)
    db.commit()
    db.refresh(pq)
    return (
        db.query(PriceQuote)
        .options(joinedload(PriceQuote.supplier), joinedload(PriceQuote.product))
        .filter(PriceQuote.id == pq.id)
        .first()
    )


@router.delete("/{pq_id}", status_code=204)
def delete_price_quote(pq_id: int, db: Session = Depends(get_db)):
    pq = db.query(PriceQuote).filter(PriceQuote.id == pq_id).first()
    if not pq:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    db.delete(pq)
    db.commit()
