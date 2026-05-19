from __future__ import annotations

import os
import re
import uuid
from datetime import date, datetime

import pdfplumber
import pytesseract
from PIL import Image
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Supplier, User
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

PRODUCT_LINE_PATTERN = re.compile(
    r"^(.{3,40}?)\s+"
    r"(\d+(?:[.,]\d+)?)\s+"
    r"(\d+(?:[.,]\d+)?)\s+"
    r"(\d+(?:[.,]\d+)?)\s*$",
    re.MULTILINE,
)


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


def _find_line_items(text: str) -> list[dict]:
    items: list[dict] = []
    for match in PRODUCT_LINE_PATTERN.finditer(text):
        desc = match.group(1).strip()
        if len(desc) < 3 or desc.upper() in ("TOTALE", "SUBTOTALE", "IVA", "IMPONIBILE"):
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


def _match_supplier(vat_number: str | None, text: str, db: Session) -> dict | None:
    if vat_number:
        supplier = db.query(Supplier).filter(Supplier.vat_number == vat_number).first()
        if supplier:
            return {"id": supplier.id, "name": supplier.name, "matched_by": "vat_number"}

    suppliers = db.query(Supplier).all()
    text_lower = text.lower()
    for s in suppliers:
        if s.name and s.name.lower() in text_lower:
            return {"id": s.id, "name": s.name, "matched_by": "name"}
    return None


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

    net_amount = None
    if total_amount and vat_amount:
        net_amount = round(total_amount - vat_amount, 2)

    return {
        "file_path": saved_path,
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
            "supplier": "high" if supplier_match and supplier_match["matched_by"] == "vat_number" else ("medium" if supplier_match else "none"),
        },
    }
