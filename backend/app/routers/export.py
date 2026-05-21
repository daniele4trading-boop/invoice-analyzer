import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from openpyxl import Workbook

from app.database import get_db
from app.models import Invoice, InvoiceItem, Product, ProductCategory, Supplier, PriceQuote, User
from app.auth import get_current_user, get_business_filter

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/consumption")
def export_consumption(
    date_from: str | None = None,
    date_to: str | None = None,
    supplier_id: int | None = None,
    category_id: int | None = None,
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            Product.name, ProductCategory.name,
            func.sum(InvoiceItem.quantity), func.sum(InvoiceItem.total_price),
            Product.unit,
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
    )
    biz = get_business_filter(current_user)
    if biz is not None:
        query = query.filter(Invoice.business_id == biz)
    elif business_id:
        query = query.filter(Invoice.business_id == business_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)
    if supplier_id:
        query = query.filter(Invoice.supplier_id == supplier_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)

    rows = query.group_by(Product.id, Product.name, ProductCategory.name, Product.unit).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Report Consumi"
    ws.append(["Prodotto", "Categoria", "Quantità", "Importo Totale", "Prezzo Medio", "Unità"])
    for r in rows:
        avg_price = (r[3] / r[2]) if r[2] and r[2] > 0 else 0
        ws.append([r[0], r[1] or "", r[2] or 0, round(r[3] or 0, 2), round(avg_price, 2), r[4] or ""])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=report_consumi.xlsx"},
    )


@router.get("/price-comparison")
def export_price_comparison(
    supplier_id: int | None = None,
    product_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            Product.name, Supplier.name, Invoice.date,
            InvoiceItem.unit_price, InvoiceItem.quantity, InvoiceItem.total_price,
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .join(Supplier, Supplier.id == Invoice.supplier_id)
    )
    biz = get_business_filter(current_user)
    if biz is not None:
        query = query.filter(Invoice.business_id == biz)
    elif business_id:
        query = query.filter(Invoice.business_id == business_id)
    if supplier_id:
        query = query.filter(Invoice.supplier_id == supplier_id)
    if product_id:
        query = query.filter(InvoiceItem.product_id == product_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)

    rows = query.order_by(Invoice.date.desc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Confronto Prezzi"
    ws.append(["Prodotto", "Fornitore", "Data", "Prezzo Fatturato", "Quantità", "Totale", "Prezzo Preventivato", "Differenza", "Diff %"])

    for r in rows:
        product_name, supplier_name, inv_date, invoiced_price, qty, total = r
        quoted = (
            db.query(PriceQuote.quoted_price)
            .join(Supplier, Supplier.id == PriceQuote.supplier_id)
            .join(Product, Product.id == PriceQuote.product_id)
            .filter(Supplier.name == supplier_name, Product.name == product_name, PriceQuote.valid_from <= inv_date)
            .filter((PriceQuote.valid_to >= inv_date) | (PriceQuote.valid_to.is_(None)))
            .order_by(PriceQuote.valid_from.desc())
            .first()
        )
        quoted_price = quoted[0] if quoted else None
        diff = (invoiced_price - quoted_price) if quoted_price is not None else None
        diff_pct = (diff / quoted_price * 100) if quoted_price and quoted_price > 0 else None

        ws.append([
            product_name, supplier_name, str(inv_date),
            round(invoiced_price, 2), round(qty, 2), round(total, 2),
            round(quoted_price, 2) if quoted_price else "",
            round(diff, 2) if diff is not None else "",
            round(diff_pct, 1) if diff_pct is not None else "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=confronto_prezzi.xlsx"},
    )
