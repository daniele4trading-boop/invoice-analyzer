from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime
from difflib import SequenceMatcher

import pdfplumber
import pytesseract
from PIL import Image
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, ProductAlias, Supplier, SupplierInvoiceTemplate, User
from app.auth import get_current_user

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp"}

DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"),
    re.compile(r"\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b"),
]

INVOICE_NUMBER_PATTERNS = [
    re.compile(r"(?:fattura|fatt\.?|ft\.?|inv\.?|invoice)\s*(?:n\.?|nr\.?|num\.?|numero)?\s*[:.]?\s*([A-Z0-9/\-]+)", re.IGNORECASE),
    re.compile(r"(?:n\.?|nr\.?|num\.?)\s*(?:fattura|fatt\.?|documento)?\s*[:.]?\s*([A-Z0-9/\-]+)", re.IGNORECASE),
    re.compile(r"\b(FT[/\-]?\d{4}[/\-]?\d+)\b", re.IGNORECASE),
]

AMOUNT_PATTERNS = [
    re.compile(r"(?:totale|tot\.?|importo|total)\s*(?:fattura|documento|complessivo|generale)?\s*[:.]?\s*(?:€|EUR)?\s*([\d.,]+)", re.IGNORECASE),
    re.compile(r"([\d.,]+)\s*(?:€|EUR)\s*$", re.MULTILINE),
]

VAT_PATTERNS = [
    re.compile(r"(?:iva|vat|imposta)\s*[:.]?\s*(?:€|EUR)?\s*([\d.,]+)", re.IGNORECASE),
]

VAT_NUMBER_PATTERNS = [
    re.compile(r"(?:p\.?\s*iva|partita\s*iva|vat\s*(?:number|no\.?|n\.?))\s*[:.]?\s*([A-Z]{0,2}\d{11,13})", re.IGNORECASE),
    re.compile(r"\b(IT\d{11})\b"),
]

# Generic: description qty price total
PRODUCT_LINE_PATTERN = re.compile(
    r"^(.{3,40}?)\s+"
    r"(\d+(?:[.,]\d+)?)\s+"
    r"(\d+(?:[.,]\d+)?)\s+"
    r"(\d+(?:[.,]\d+)?)\s*$",
    re.MULTILINE,
)

# Partesa-style: CODE ZONE DESCRIPTION COLLI QxC UM PRICE [DISCOUNT] TOTAL [IVA]
PARTESA_LINE_PATTERN = re.compile(
    r"^[A-Z0-9]{3,8}\s+"           # codice articolo
    r"[A-Z]\d{1,3}\s+"             # zona fiscale (es. Z38)
    r"(.{5,60}?)\s+"               # descrizione prodotto
    r"(\d+)\s+"                    # colli
    r"(\d+)\s+"                    # QxC (pezzi per collo)
    r"[A-Z]{2,4}\s+"              # UM (unità misura: KAR, PZ, ecc)
    r"(\d+[.,]\d+)\s+"            # prezzo unitario
    r"(?:\d+[.,]?\d*\s+)?"        # sconto (opzionale)
    r"(\d+[.,]\d+)",              # totale netto
    re.MULTILINE,
)

# Common structured: CODE DESCRIPTION QTY PRICE TOTAL (many distributor formats)
STRUCTURED_LINE_PATTERN = re.compile(
    r"^[A-Z0-9]{2,10}\s+"          # codice articolo
    r"(.{5,60}?)\s+"               # descrizione
    r"(\d+(?:[.,]\d+)?)\s+"        # quantità
    r"[A-Z]{1,4}\s+"               # unità misura
    r"(\d+[.,]\d+)\s+"             # prezzo unitario
    r"(?:[\d.,]+\s+)?"             # sconto opzionale
    r"(\d+[.,]\d+)",               # totale
    re.MULTILINE,
)

# Tab/space-separated with clear numeric columns at end
WIDE_TABLE_PATTERN = re.compile(
    r"^(.{5,50}?)\s{2,}"           # descrizione (followed by 2+ spaces)
    r"(\d+(?:[.,]\d+)?)\s+"        # quantità
    r"(?:[A-Z]{1,5}\s+)?"          # UM opzionale
    r"(\d+[.,]\d+)\s+"             # prezzo
    r"(?:[\d.,]+%?\s+)?"           # sconto opzionale
    r"(\d+[.,]\d+)",               # totale
    re.MULTILINE,
)

SKIP_DESCRIPTIONS = {
    "TOTALE", "SUBTOTALE", "SUB TOTALE", "IVA", "IMPONIBILE",
    "SCONTO", "ARROTONDAMENTO", "SPESE", "CONTRIBUTI", "BOLLO",
    "TRASPORTO", "IMBALLO", "ACCONTO", "SALDO", "NETTO",
}


def _parse_italian_number(s: str) -> float:
    s = s.strip().replace(" ", "")
    if "," in s and "." in s:
        if s.rindex(",") > s.rindex("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


def _extract_text_from_pdf(path: str) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    full_text = "\n".join(text_parts)
    if len(full_text.strip()) < 50:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                img = page.to_image(resolution=300).original
                ocr_text = pytesseract.image_to_string(img, lang="ita+eng")
                if ocr_text:
                    text_parts.append(ocr_text)
        full_text = "\n".join(text_parts)
    return full_text


def _extract_text_from_image(path: str) -> str:
    img = Image.open(path)
    return pytesseract.image_to_string(img, lang="ita+eng")


def _find_date(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            groups = match.groups()
            if len(groups[0]) == 4:
                y, m, d = int(groups[0]), int(groups[1]), int(groups[2])
            else:
                d, m, y = int(groups[0]), int(groups[1]), int(groups[2])
            try:
                dt = date(y, m, d)
                if 2000 <= dt.year <= 2100:
                    return dt.isoformat()
            except ValueError:
                continue
    return None


def _find_invoice_number(text: str) -> str | None:
    for pattern in INVOICE_NUMBER_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1).strip()
    return None


def _find_amount(text: str, patterns: list[re.Pattern[str]]) -> float | None:
    candidates: list[float] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            try:
                val = _parse_italian_number(match.group(1))
                if 0.01 <= val <= 10_000_000:
                    candidates.append(val)
            except (ValueError, IndexError):
                continue
    return max(candidates) if candidates else None


def _find_vat_number(text: str) -> str | None:
    for pattern in VAT_NUMBER_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1).strip()
    return None


def _should_skip(desc: str) -> bool:
    d = desc.strip().upper()
    return len(d) < 3 or any(skip in d for skip in SKIP_DESCRIPTIONS)


def _find_line_items(text: str) -> list[dict]:
    items: list[dict] = []

    # Try Partesa-style first (most specific)
    for match in PARTESA_LINE_PATTERN.finditer(text):
        desc = match.group(1).strip()
        if _should_skip(desc):
            continue
        try:
            colli = _parse_italian_number(match.group(2))
            qty_per_collo = _parse_italian_number(match.group(3))
            price = _parse_italian_number(match.group(4))
            total = _parse_italian_number(match.group(5))
            items.append({
                "description": desc,
                "quantity": colli * qty_per_collo,
                "unit_price": price,
                "total_price": total,
            })
        except ValueError:
            continue
    if items:
        return items

    # Try structured format (CODE DESC QTY UM PRICE TOTAL)
    for match in STRUCTURED_LINE_PATTERN.finditer(text):
        desc = match.group(1).strip()
        if _should_skip(desc):
            continue
        try:
            qty = _parse_italian_number(match.group(2))
            price = _parse_italian_number(match.group(3))
            total = _parse_italian_number(match.group(4))
            items.append({
                "description": desc,
                "quantity": qty,
                "unit_price": price,
                "total_price": total,
            })
        except ValueError:
            continue
    if items:
        return items

    # Try wide table format
    for match in WIDE_TABLE_PATTERN.finditer(text):
        desc = match.group(1).strip()
        if _should_skip(desc):
            continue
        try:
            qty = _parse_italian_number(match.group(2))
            price = _parse_italian_number(match.group(3))
            total = _parse_italian_number(match.group(4))
            items.append({
                "description": desc,
                "quantity": qty,
                "unit_price": price,
                "total_price": total,
            })
        except ValueError:
            continue
    if items:
        return items

    # Fallback: generic pattern
    for match in PRODUCT_LINE_PATTERN.finditer(text):
        desc = match.group(1).strip()
        if _should_skip(desc):
            continue
        try:
            qty = _parse_italian_number(match.group(2))
            price = _parse_italian_number(match.group(3))
            total = _parse_italian_number(match.group(4))
            items.append({
                "description": desc,
                "quantity": qty,
                "unit_price": price,
                "total_price": total,
            })
        except ValueError:
            continue
    return items


def _normalize(s: str) -> str:
    """Normalize a string for fuzzy comparison."""
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9àèéìòù\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _match_supplier(vat_number: str | None, text: str, db: Session) -> dict | None:
    # 1. Match by P.IVA (most reliable)
    if vat_number:
        supplier = db.query(Supplier).filter(Supplier.vat_number == vat_number).first()
        if supplier:
            return {"id": supplier.id, "name": supplier.name, "matched_by": "vat_number", "confidence": "high"}

    suppliers = db.query(Supplier).all()
    text_lower = text.lower()

    # 2. Exact name match in text
    for s in suppliers:
        if s.name and len(s.name) >= 3 and s.name.lower() in text_lower:
            return {"id": s.id, "name": s.name, "matched_by": "name", "confidence": "high"}

    # 3. Match by email domain or address fragments (for logo-only names)
    for s in suppliers:
        if s.email:
            domain = s.email.split('@')[-1].split('.')[0].lower()
            if len(domain) >= 4 and domain in text_lower:
                return {"id": s.id, "name": s.name, "matched_by": "email_domain", "confidence": "medium"}
        if s.address and len(s.address) > 10:
            addr_parts = [p.strip().lower() for p in s.address.split(',') if len(p.strip()) > 5]
            if any(part in text_lower for part in addr_parts):
                return {"id": s.id, "name": s.name, "matched_by": "address", "confidence": "medium"}

    # 4. Fuzzy name match against extracted supplier name from text
    supplier_name = _extract_supplier_name(text)
    if supplier_name:
        best_match = None
        best_score = 0.0
        for s in suppliers:
            score = _similarity(supplier_name, s.name)
            if score > best_score:
                best_score = score
                best_match = s
        if best_match and best_score >= 0.75:
            return {
                "id": best_match.id, "name": best_match.name,
                "matched_by": "fuzzy", "confidence": "high" if best_score >= 0.9 else "medium",
                "score": round(best_score, 2),
                "extracted_name": supplier_name,
            }

    # 5. Not found — return extracted info for user to create
    extracted = supplier_name or _extract_supplier_name_fallback(text)
    return {
        "id": None, "name": None,
        "matched_by": "not_found", "confidence": "none",
        "extracted_name": extracted,
        "extracted_vat": vat_number,
    }


def _extract_supplier_name(text: str) -> str | None:
    """Try to extract the supplier/company name from invoice text."""
    patterns = [
        re.compile(r"(?:ragione\s*sociale|denominazione)\s*[:.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:ditta|spett\.?le|emittente)\s*[:.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
    ]
    for p in patterns:
        m = p.search(text)
        if m:
            name = m.group(1).strip()
            if len(name) > 2:
                return name

    # Look for company name patterns (S.R.L., SPA, etc.)
    for line in text.split('\n')[:15]:
        line = line.strip()
        if len(line) < 5 or len(line) > 80:
            continue
        if re.match(r'^\d', line) or re.match(r'(?:fattura|invoice|data|date|n[.°]|nr|documento|pag)', line, re.IGNORECASE):
            continue
        if any(kw in line.lower() for kw in ['s.r.l', 'srl', 's.p.a', 'spa', 's.a.s', 'sas', 's.n.c', 'snc', 'soc.', 'group', 'italia']):
            return line
    return None


def _extract_supplier_name_fallback(text: str) -> str | None:
    """Last-resort extraction: look for a clean text line near the top of the document."""
    lines = text.split('\n')
    for line in lines[:8]:
        line = line.strip()
        if len(line) >= 4 and not re.match(r'^[\d\s.,/\-]+$', line):
            if not re.match(r'(?:fattura|invoice|data|date|n[.°]|nr|pag|cod|tel|fax|email|via|cap)', line, re.IGNORECASE):
                return line
    return None


def _match_products(items: list[dict], db: Session) -> list[dict]:
    """Match extracted item descriptions to existing products using fuzzy matching."""
    products = db.query(Product).all()
    aliases = db.query(ProductAlias).all()

    # Build lookup: normalized alias -> product
    alias_map: dict[str, Product] = {}
    for a in aliases:
        alias_map[_normalize(a.alias)] = next((p for p in products if p.id == a.product_id), None)  # type: ignore
    for p in products:
        alias_map[_normalize(p.name)] = p

    for item in items:
        desc = item.get('description', '') or ''
        if not desc:
            continue
        desc_norm = _normalize(desc)

        # Exact alias/name match
        if desc_norm in alias_map and alias_map[desc_norm]:
            prod = alias_map[desc_norm]
            item['product_match'] = {
                'product_id': prod.id, 'product_name': prod.name,
                'confidence': 'high', 'score': 1.0,
            }
            continue

        # Fuzzy match
        best_prod = None
        best_score = 0.0
        for name_norm, prod in alias_map.items():
            if prod is None:
                continue
            score = _similarity(desc, name_norm)
            if score > best_score:
                best_score = score
                best_prod = prod

        if best_prod and best_score >= 0.6:
            confidence = 'high' if best_score >= 0.85 else ('medium' if best_score >= 0.7 else 'low')
            item['product_match'] = {
                'product_id': best_prod.id, 'product_name': best_prod.name,
                'confidence': confidence, 'score': round(best_score, 2),
            }
        else:
            item['product_match'] = None

    return items


@router.post("/parse")
async def upload_and_parse(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "Nome file mancante")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Formato non supportato: {ext}. Formati accettati: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_id = uuid.uuid4().hex[:12]
    saved_name = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)

    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    try:
        if ext == ".pdf":
            text = _extract_text_from_pdf(saved_path)
        else:
            text = _extract_text_from_image(saved_path)
    except Exception as e:
        raise HTTPException(500, f"Errore durante l'analisi del file: {e}")

    invoice_number = _find_invoice_number(text)
    invoice_date = _find_date(text)
    total_amount = _find_amount(text, AMOUNT_PATTERNS)
    vat_amount = _find_amount(text, VAT_PATTERNS)
    vat_number = _find_vat_number(text)
    supplier_match = _match_supplier(vat_number, text, db)
    line_items = _find_line_items(text)
    line_items = _match_products(line_items, db)

    net_amount = None
    if total_amount and vat_amount:
        net_amount = round(total_amount - vat_amount, 2)

    supplier_confidence = "none"
    if supplier_match:
        supplier_confidence = supplier_match.get("confidence", "none")

    file_url = f"/uploads/{saved_name}"

    return {
        "file_path": saved_path,
        "file_url": file_url,
        "file_name": file.filename,
        "extracted_text": text[:3000],
        "parsed_data": {
            "number": invoice_number,
            "date": invoice_date,
            "total_amount": total_amount,
            "vat_amount": vat_amount,
            "net_amount": net_amount,
            "supplier_vat_number": vat_number,
            "supplier": supplier_match,
            "items": line_items,
        },
        "confidence": {
            "number": "high" if invoice_number else "none",
            "date": "high" if invoice_date else "none",
            "total_amount": "high" if total_amount else "none",
            "supplier": supplier_confidence,
        },
    }


@router.post("/create-supplier")
async def create_supplier_from_upload(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new supplier from data extracted during invoice upload."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Nome fornitore obbligatorio")

    existing = db.query(Supplier).filter(Supplier.name == name).first()
    if existing:
        return {"id": existing.id, "name": existing.name, "created": False}

    supplier = Supplier(
        name=name,
        vat_number=data.get("vat_number"),
        address=data.get("address"),
        email=data.get("email"),
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return {"id": supplier.id, "name": supplier.name, "created": True}


@router.post("/save-product-alias")
async def save_product_alias(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a product alias for better future matching."""
    product_id = data.get("product_id")
    alias = (data.get("alias") or "").strip()
    if not product_id or not alias:
        raise HTTPException(400, "product_id e alias obbligatori")

    existing = db.query(ProductAlias).filter(
        ProductAlias.product_id == product_id,
        ProductAlias.alias == alias,
    ).first()
    if existing:
        return {"id": existing.id, "saved": False}

    pa = ProductAlias(product_id=product_id, alias=alias)
    db.add(pa)
    db.commit()
    db.refresh(pa)
    return {"id": pa.id, "saved": True}


@router.post("/save-template")
async def save_invoice_template(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save/update a per-supplier invoice template for better OCR parsing."""
    supplier_id = data.get("supplier_id")
    if not supplier_id:
        raise HTTPException(400, "supplier_id obbligatorio")

    template = db.query(SupplierInvoiceTemplate).filter(
        SupplierInvoiceTemplate.supplier_id == supplier_id
    ).first()

    config = json.dumps(data.get("config", {}))
    sample = data.get("sample_text", "")

    if template:
        template.template_config = config
        template.sample_text = sample
    else:
        template = SupplierInvoiceTemplate(
            supplier_id=supplier_id,
            template_config=config,
            sample_text=sample,
        )
        db.add(template)

    db.commit()
    return {"saved": True}


@router.post("/create-product")
async def create_product_from_upload(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new product from data extracted during invoice upload."""
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nome prodotto obbligatorio")

    existing = db.query(Product).filter(Product.name == name).first()
    if existing:
        return {"id": existing.id, "name": existing.name, "created": False}

    product = Product(
        name=name,
        unit=data.get("unit"),
        code=data.get("code"),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return {"id": product.id, "name": product.name, "created": True}
