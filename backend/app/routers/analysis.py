from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Invoice,
    InvoiceItem,
    DeliveryNote,
    Product,
    ProductCategory,
    Supplier,
    PriceQuote,
    User,
)
from app.schemas import (
    DashboardSummary,
    SupplierAnalysisItem,
    ProductAnalysisItem,
    PriceComparisonItem,
    ConsumptionReportItem,
)
from app.auth import get_current_user, get_business_filter

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _apply_biz_filter(query, current_user: User, business_id: int | None = None):
    biz = get_business_filter(current_user)
    if biz is not None:
        return query.filter(Invoice.business_id == biz)
    if business_id:
        return query.filter(Invoice.business_id == business_id)
    return query


@router.get("/dashboard", response_model=DashboardSummary)
def get_dashboard(
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    biz = get_business_filter(current_user)

    total_suppliers = db.query(func.count(Supplier.id)).scalar() or 0
    total_products = db.query(func.count(Product.id)).scalar() or 0

    inv_q = db.query(Invoice)
    dn_q = db.query(DeliveryNote)
    if biz is not None:
        inv_q = inv_q.filter(Invoice.business_id == biz)
        dn_q = dn_q.filter(DeliveryNote.business_id == biz)
    elif business_id:
        inv_q = inv_q.filter(Invoice.business_id == business_id)
        dn_q = dn_q.filter(DeliveryNote.business_id == business_id)

    total_invoices = inv_q.count()
    total_dn = dn_q.count()
    total_amount = inv_q.with_entities(func.coalesce(func.sum(Invoice.total_amount), 0.0)).scalar()

    recent_q = (
        db.query(Invoice)
        .options(joinedload(Invoice.supplier), joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .order_by(Invoice.date.desc())
    )
    if biz is not None:
        recent_q = recent_q.filter(Invoice.business_id == biz)
    elif business_id:
        recent_q = recent_q.filter(Invoice.business_id == business_id)
    recent_invoices = recent_q.limit(5).all()
    seen_ids: set[int] = set()
    unique_invoices = []
    for inv in recent_invoices:
        if inv.id not in seen_ids:
            seen_ids.add(inv.id)
            unique_invoices.append(inv)
    recent_invoices = unique_invoices

    top_sup_q = (
        db.query(
            Supplier.name, Supplier.id,
            func.count(Invoice.id).label("total_invoices"),
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("total_amount"),
        )
        .join(Invoice, Invoice.supplier_id == Supplier.id)
    )
    if biz is not None:
        top_sup_q = top_sup_q.filter(Invoice.business_id == biz)
    elif business_id:
        top_sup_q = top_sup_q.filter(Invoice.business_id == business_id)
    top_suppliers_rows = (
        top_sup_q.group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(Invoice.total_amount).desc())
        .limit(5).all()
    )
    top_suppliers = [
        SupplierAnalysisItem(
            supplier_name=r[0], supplier_id=r[1], total_invoices=r[2],
            total_amount=r[3], avg_invoice_amount=r[3] / r[2] if r[2] > 0 else 0,
        )
        for r in top_suppliers_rows
    ]

    top_prod_q = (
        db.query(
            Product.name, Product.id, ProductCategory.name,
            func.sum(InvoiceItem.quantity).label("total_qty"),
            func.sum(InvoiceItem.total_price).label("total_amt"),
            func.count(func.distinct(Invoice.supplier_id)).label("supplier_count"),
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
    )
    if biz is not None:
        top_prod_q = top_prod_q.filter(Invoice.business_id == biz)
    elif business_id:
        top_prod_q = top_prod_q.filter(Invoice.business_id == business_id)
    top_products_rows = (
        top_prod_q.group_by(Product.id, Product.name, ProductCategory.name)
        .order_by(func.sum(InvoiceItem.total_price).desc())
        .limit(5).all()
    )
    top_products = [
        ProductAnalysisItem(
            product_name=r[0], product_id=r[1], category_name=r[2],
            total_quantity=r[3] or 0, total_amount=r[4] or 0,
            avg_unit_price=(r[4] / r[3]) if r[3] and r[3] > 0 else 0,
            supplier_count=r[5] or 0,
        )
        for r in top_products_rows
    ]

    return DashboardSummary(
        total_suppliers=total_suppliers, total_products=total_products,
        total_invoices=total_invoices, total_delivery_notes=total_dn,
        total_invoiced_amount=total_amount, recent_invoices=recent_invoices,
        top_suppliers=top_suppliers, top_products=top_products,
    )


@router.get("/by-supplier", response_model=list[SupplierAnalysisItem])
def analysis_by_supplier(
    date_from: str | None = None,
    date_to: str | None = None,
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            Supplier.name, Supplier.id,
            func.count(Invoice.id).label("total_invoices"),
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("total_amount"),
        )
        .join(Invoice, Invoice.supplier_id == Supplier.id)
    )
    query = _apply_biz_filter(query, current_user, business_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)
    rows = query.group_by(Supplier.id, Supplier.name).order_by(func.sum(Invoice.total_amount).desc()).all()
    return [
        SupplierAnalysisItem(
            supplier_name=r[0], supplier_id=r[1], total_invoices=r[2],
            total_amount=r[3], avg_invoice_amount=r[3] / r[2] if r[2] > 0 else 0,
        )
        for r in rows
    ]


@router.get("/by-product", response_model=list[ProductAnalysisItem])
def analysis_by_product(
    date_from: str | None = None,
    date_to: str | None = None,
    category_id: int | None = None,
    business_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            Product.name, Product.id, ProductCategory.name,
            func.sum(InvoiceItem.quantity).label("total_qty"),
            func.sum(InvoiceItem.total_price).label("total_amt"),
            func.count(func.distinct(Invoice.supplier_id)).label("supplier_count"),
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
    )
    query = _apply_biz_filter(query, current_user, business_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    rows = (
        query.group_by(Product.id, Product.name, ProductCategory.name)
        .order_by(func.sum(InvoiceItem.total_price).desc()).all()
    )
    return [
        ProductAnalysisItem(
            product_name=r[0], product_id=r[1], category_name=r[2],
            total_quantity=r[3] or 0, total_amount=r[4] or 0,
            avg_unit_price=(r[4] / r[3]) if r[3] and r[3] > 0 else 0,
            supplier_count=r[5] or 0,
        )
        for r in rows
    ]


@router.get("/price-comparison", response_model=list[PriceComparisonItem])
def price_comparison(
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
            Product.name, Product.id,
            Supplier.name, Supplier.id,
            Invoice.date, InvoiceItem.unit_price,
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .join(Supplier, Supplier.id == Invoice.supplier_id)
    )
    query = _apply_biz_filter(query, current_user, business_id)
    if supplier_id:
        query = query.filter(Invoice.supplier_id == supplier_id)
    if product_id:
        query = query.filter(InvoiceItem.product_id == product_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)

    rows = query.order_by(Invoice.date.desc()).all()
    results = []
    for r in rows:
        product_name, prod_id, supplier_name, sup_id, inv_date, invoiced_price = r
        quoted = (
            db.query(PriceQuote.quoted_price)
            .filter(
                PriceQuote.supplier_id == sup_id,
                PriceQuote.product_id == prod_id,
                PriceQuote.valid_from <= inv_date,
            )
            .filter((PriceQuote.valid_to >= inv_date) | (PriceQuote.valid_to.is_(None)))
            .order_by(PriceQuote.valid_from.desc())
            .first()
        )
        quoted_price = quoted[0] if quoted else None
        diff = (invoiced_price - quoted_price) if quoted_price is not None else None
        diff_pct = (diff / quoted_price * 100) if quoted_price and quoted_price > 0 else None
        results.append(
            PriceComparisonItem(
                product_name=product_name, product_id=prod_id,
                supplier_name=supplier_name, supplier_id=sup_id,
                invoice_date=inv_date, invoiced_price=invoiced_price,
                quoted_price=quoted_price, difference=diff, difference_pct=diff_pct,
            )
        )
    return results


@router.get("/consumption", response_model=list[ConsumptionReportItem])
def consumption_report(
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
            Product.name, Product.id, ProductCategory.name,
            func.sum(InvoiceItem.quantity).label("total_qty"),
            func.sum(InvoiceItem.total_price).label("total_amt"),
            Product.unit,
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
    )
    query = _apply_biz_filter(query, current_user, business_id)
    if date_from:
        query = query.filter(Invoice.date >= date_from)
    if date_to:
        query = query.filter(Invoice.date <= date_to)
    if supplier_id:
        query = query.filter(Invoice.supplier_id == supplier_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)

    rows = (
        query.group_by(Product.id, Product.name, ProductCategory.name, Product.unit)
        .order_by(func.sum(InvoiceItem.total_price).desc()).all()
    )
    return [
        ConsumptionReportItem(
            product_name=r[0], product_id=r[1], category_name=r[2],
            total_quantity=r[3] or 0, total_amount=r[4] or 0,
            avg_unit_price=(r[4] / r[3]) if r[3] and r[3] > 0 else 0,
            unit=r[5],
        )
        for r in rows
    ]
