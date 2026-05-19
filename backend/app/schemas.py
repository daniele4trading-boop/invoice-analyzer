from datetime import date, datetime
from pydantic import BaseModel
from typing import Optional


# --- Supplier ---
class SupplierBase(BaseModel):
    name: str
    vat_number: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    vat_number: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class SupplierOut(SupplierBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Product Category ---
class ProductCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProductCategoryCreate(ProductCategoryBase):
    pass


class ProductCategoryOut(ProductCategoryBase):
    id: int

    model_config = {"from_attributes": True}


# --- Product ---
class ProductBase(BaseModel):
    name: str
    code: Optional[str] = None
    unit: Optional[str] = None
    category_id: Optional[int] = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    unit: Optional[str] = None
    category_id: Optional[int] = None


class ProductOut(ProductBase):
    id: int
    created_at: datetime
    category: Optional[ProductCategoryOut] = None

    model_config = {"from_attributes": True}


# --- Invoice Item ---
class InvoiceItemBase(BaseModel):
    product_id: int
    description: Optional[str] = None
    quantity: float
    unit_price: float
    total_price: float
    vat_rate: Optional[float] = 0.0


class InvoiceItemCreate(InvoiceItemBase):
    pass


class InvoiceItemOut(InvoiceItemBase):
    id: int
    product: Optional[ProductOut] = None

    model_config = {"from_attributes": True}


# --- Invoice ---
class InvoiceBase(BaseModel):
    number: str
    date: date
    supplier_id: int
    total_amount: float
    vat_amount: Optional[float] = 0.0
    net_amount: Optional[float] = 0.0
    notes: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    items: list[InvoiceItemCreate] = []


class InvoiceOut(InvoiceBase):
    id: int
    file_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    supplier: Optional[SupplierOut] = None
    items: list[InvoiceItemOut] = []

    model_config = {"from_attributes": True}


# --- Delivery Note Item ---
class DeliveryNoteItemBase(BaseModel):
    product_id: int
    description: Optional[str] = None
    quantity: float
    unit: Optional[str] = None


class DeliveryNoteItemCreate(DeliveryNoteItemBase):
    pass


class DeliveryNoteItemOut(DeliveryNoteItemBase):
    id: int
    product: Optional[ProductOut] = None

    model_config = {"from_attributes": True}


# --- Delivery Note ---
class DeliveryNoteBase(BaseModel):
    number: str
    date: date
    supplier_id: int
    notes: Optional[str] = None


class DeliveryNoteCreate(DeliveryNoteBase):
    items: list[DeliveryNoteItemCreate] = []


class DeliveryNoteOut(DeliveryNoteBase):
    id: int
    file_path: Optional[str] = None
    created_at: datetime
    supplier: Optional[SupplierOut] = None
    items: list[DeliveryNoteItemOut] = []

    model_config = {"from_attributes": True}


# --- Price Quote ---
class PriceQuoteBase(BaseModel):
    supplier_id: int
    product_id: int
    quoted_price: float
    valid_from: date
    valid_to: Optional[date] = None
    notes: Optional[str] = None


class PriceQuoteCreate(PriceQuoteBase):
    pass


class PriceQuoteOut(PriceQuoteBase):
    id: int
    created_at: datetime
    supplier: Optional[SupplierOut] = None
    product: Optional[ProductOut] = None

    model_config = {"from_attributes": True}


# --- Analysis / Report schemas ---
class PriceComparisonItem(BaseModel):
    product_name: str
    product_id: int
    supplier_name: str
    supplier_id: int
    invoice_date: date
    invoiced_price: float
    quoted_price: Optional[float] = None
    difference: Optional[float] = None
    difference_pct: Optional[float] = None


class ConsumptionReportItem(BaseModel):
    product_name: str
    product_id: int
    category_name: Optional[str] = None
    total_quantity: float
    total_amount: float
    avg_unit_price: float
    unit: Optional[str] = None


class SupplierAnalysisItem(BaseModel):
    supplier_name: str
    supplier_id: int
    total_invoices: int
    total_amount: float
    avg_invoice_amount: float


class ProductAnalysisItem(BaseModel):
    product_name: str
    product_id: int
    category_name: Optional[str] = None
    total_quantity: float
    total_amount: float
    avg_unit_price: float
    supplier_count: int


class DashboardSummary(BaseModel):
    total_suppliers: int
    total_products: int
    total_invoices: int
    total_delivery_notes: int
    total_invoiced_amount: float
    recent_invoices: list[InvoiceOut]
    top_suppliers: list[SupplierAnalysisItem]
    top_products: list[ProductAnalysisItem]
