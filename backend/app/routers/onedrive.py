from __future__ import annotations

import base64
import os
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceItem, User
from app.auth import get_current_user, get_business_filter
from app.routers.upload import (
    _extract_text_from_pdf,
    _extract_text_from_image,
    _find_invoice_number,
    _find_date,
    _find_amount,
    _find_vat_number,
    _match_supplier,
    _find_line_items,
    AMOUNT_PATTERNS,
    VAT_PATTERNS,
    UPLOAD_DIR,
)

router = APIRouter(prefix="/api/onedrive", tags=["onedrive"])

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".bmp"}

ONEDRIVE_SHARE_URL = os.getenv(
    "ONEDRIVE_SHARE_URL",
    "https://1drv.ms/f/c/6c8e1c4e55fae440/IgCdJdwCc888Tqb7O8gPdIsvAaJZZmEOE6A8zDm-Si3QGls",
)
ARCHIVE_SUBFOLDER = os.getenv("ONEDRIVE_ARCHIVE_SUBFOLDER", "archiviate")


class OneDriveImportRequest(BaseModel):
    share_url: str | None = None
    archive_subfolder: str | None = None


class OneDriveImportResult(BaseModel):
    total_files: int = 0
    imported: int = 0
    skipped_duplicate: int = 0
    errors: list[str] = []
    imported_invoices: list[dict] = []


def _encode_sharing_url(url: str) -> str:
    encoded = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    return f"u!{encoded}"


def _list_shared_files(share_url: str) -> tuple[list[dict], str | None]:
    share_id = _encode_sharing_url(share_url)
    url = f"{GRAPH_BASE}/shares/{share_id}/driveItem/children"
    r = httpx.get(url, timeout=30)
    if r.status_code == 404:
        return [], None
    if r.status_code != 200:
        raise HTTPException(502, f"Errore OneDrive: {r.status_code} - {r.text[:300]}")
    data = r.json()
    all_items = data.get("value", [])
    files = []
    archive_folder_id = None
    for item in all_items:
        if item.get("folder"):
            if item.get("name", "").lower() in ("archiviate", "archivio", "archive"):
                archive_folder_id = item["id"]
            continue
        files.append(item)
    return files, archive_folder_id


def _download_shared_file(file_item: dict, dest_path: str) -> None:
    download_url = file_item.get("@microsoft.graph.downloadUrl") or file_item.get(
        "@content.downloadUrl"
    )
    if not download_url:
        item_id = file_item["id"]
        parent = file_item.get("parentReference", {})
        drive_id = parent.get("driveId", "")
        if drive_id:
            meta_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
            r = httpx.get(meta_url, timeout=15)
            if r.status_code == 200:
                download_url = r.json().get("@microsoft.graph.downloadUrl")
    if not download_url:
        raise RuntimeError("URL di download non disponibile")
    r = httpx.get(download_url, follow_redirects=True, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"Errore download: {r.status_code}")
    with open(dest_path, "wb") as f:
        f.write(r.content)


def _move_to_archive_folder(file_item: dict, archive_folder_id: str) -> None:
    parent = file_item.get("parentReference", {})
    drive_id = parent.get("driveId", "")
    item_id = file_item["id"]
    if not drive_id:
        return
    move_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
    try:
        httpx.patch(
            move_url,
            json={"parentReference": {"id": archive_folder_id}},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
    except Exception:
        pass


@router.get("/status")
def onedrive_status():
    return {
        "configured": bool(ONEDRIVE_SHARE_URL),
        "share_url": ONEDRIVE_SHARE_URL or None,
        "archive_subfolder": ARCHIVE_SUBFOLDER,
    }


@router.post("/import", response_model=OneDriveImportResult)
def import_from_onedrive(
    request: OneDriveImportRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share_url = ONEDRIVE_SHARE_URL
    archive_sub = ARCHIVE_SUBFOLDER
    if request:
        if request.share_url:
            share_url = request.share_url
        if request.archive_subfolder:
            archive_sub = request.archive_subfolder

    if not share_url:
        raise HTTPException(400, "Nessun link OneDrive configurato")

    clean_url = share_url.split("?")[0]
    files, archive_folder_id = _list_shared_files(clean_url)
    result = OneDriveImportResult(total_files=len(files))

    for file_info in files:
        name: str = file_info.get("name", "")
        ext = os.path.splitext(name)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        item_id = file_info["id"]
        local_path = os.path.join(UPLOAD_DIR, f"onedrive_{item_id}{ext}")

        try:
            _download_shared_file(file_info, local_path)

            if ext == ".pdf":
                text = _extract_text_from_pdf(local_path)
            else:
                text = _extract_text_from_image(local_path)

            inv_number = _find_invoice_number(text) or name
            inv_date_str = _find_date(text)
            total_amount = _find_amount(text, AMOUNT_PATTERNS) or 0.0
            vat_amount = _find_amount(text, VAT_PATTERNS)
            vat_number = _find_vat_number(text)
            supplier_match = _match_supplier(vat_number, text, db)
            line_items = _find_line_items(text)

            supplier_id = supplier_match["id"] if supplier_match else None

            if supplier_id and inv_number:
                existing = db.query(Invoice).filter(
                    Invoice.number == inv_number,
                    Invoice.supplier_id == supplier_id,
                ).first()
                if existing:
                    result.skipped_duplicate += 1
                    if archive_folder_id:
                        _move_to_archive_folder(file_info, archive_folder_id)
                    continue

            inv_date = None
            if inv_date_str:
                try:
                    inv_date = date.fromisoformat(inv_date_str)
                except ValueError:
                    pass

            biz_id = current_user.business_id

            invoice = Invoice(
                number=inv_number,
                date=inv_date or date.today(),
                supplier_id=supplier_id,
                business_id=biz_id,
                total_amount=total_amount,
                vat_amount=vat_amount or 0.0,
                net_amount=(total_amount - (vat_amount or 0.0)) if total_amount else 0.0,
                file_path=local_path,
            )
            db.add(invoice)
            db.flush()

            for item in line_items:
                db.add(InvoiceItem(
                    invoice_id=invoice.id,
                    description=item["description"],
                    quantity=item["quantity"],
                    unit_price=item["unit_price"],
                    total_price=item["total_price"],
                ))

            db.commit()
            result.imported += 1
            result.imported_invoices.append({
                "id": invoice.id,
                "number": inv_number,
                "file_name": name,
                "supplier": supplier_match["name"] if supplier_match else None,
                "total_amount": total_amount,
            })

            if archive_folder_id:
                _move_to_archive_folder(file_info, archive_folder_id)

        except Exception as e:
            result.errors.append(f"{name}: {str(e)}")

    return result
