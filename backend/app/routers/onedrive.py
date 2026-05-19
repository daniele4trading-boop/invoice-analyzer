from __future__ import annotations

import os
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceItem, Supplier, User
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


class OneDriveConfig(BaseModel):
    access_token: str
    folder_path: str = "/Fatture"
    archive_subfolder: str = "archivio"


class OneDriveImportResult(BaseModel):
    total_files: int = 0
    imported: int = 0
    skipped_duplicate: int = 0
    errors: list[str] = []
    imported_invoices: list[dict] = []


def _graph_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _list_files(token: str, folder_path: str) -> list[dict]:
    encoded = folder_path.replace(" ", "%20")
    url = f"{GRAPH_BASE}/me/drive/root:{encoded}:/children"
    r = httpx.get(url, headers=_graph_headers(token), timeout=30)
    if r.status_code == 404:
        return []
    if r.status_code != 200:
        raise HTTPException(502, f"Errore OneDrive: {r.status_code} - {r.text[:200]}")
    data = r.json()
    return [f for f in data.get("value", []) if not f.get("folder")]


def _download_file(token: str, item_id: str, dest_path: str) -> None:
    url = f"{GRAPH_BASE}/me/drive/items/{item_id}/content"
    r = httpx.get(url, headers=_graph_headers(token), follow_redirects=True, timeout=60)
    if r.status_code != 200:
        raise HTTPException(502, f"Errore download OneDrive: {r.status_code}")
    with open(dest_path, "wb") as f:
        f.write(r.content)


def _move_to_archive(token: str, item_id: str, folder_path: str, archive_subfolder: str) -> None:
    archive_path = f"{folder_path}/{archive_subfolder}"
    search_url = f"{GRAPH_BASE}/me/drive/root:{archive_path.replace(' ', '%20')}"
    r = httpx.get(search_url, headers=_graph_headers(token), timeout=15)
    if r.status_code == 404:
        parent_path = folder_path.replace(" ", "%20")
        create_url = f"{GRAPH_BASE}/me/drive/root:{parent_path}:/children"
        r2 = httpx.post(
            create_url,
            headers={**_graph_headers(token), "Content-Type": "application/json"},
            json={"name": archive_subfolder, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"},
            timeout=15,
        )
        if r2.status_code not in (200, 201, 409):
            return
        r = httpx.get(search_url, headers=_graph_headers(token), timeout=15)
    if r.status_code != 200:
        return
    archive_id = r.json()["id"]
    move_url = f"{GRAPH_BASE}/me/drive/items/{item_id}"
    httpx.patch(
        move_url,
        headers={**_graph_headers(token), "Content-Type": "application/json"},
        json={"parentReference": {"id": archive_id}},
        timeout=15,
    )


@router.post("/import", response_model=OneDriveImportResult)
def import_from_onedrive(
    config: OneDriveConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    files = _list_files(config.access_token, config.folder_path)
    result = OneDriveImportResult(total_files=len(files))

    for file_info in files:
        name: str = file_info.get("name", "")
        ext = os.path.splitext(name)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        item_id = file_info["id"]
        local_path = os.path.join(UPLOAD_DIR, f"onedrive_{item_id}{ext}")

        try:
            _download_file(config.access_token, item_id, local_path)

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
                    _move_to_archive(config.access_token, item_id, config.folder_path, config.archive_subfolder)
                    continue

            inv_date = None
            if inv_date_str:
                try:
                    inv_date = date.fromisoformat(inv_date_str)
                except ValueError:
                    pass

            biz_id = current_user.business_id
            biz_filter = get_business_filter(current_user)

            invoice = Invoice(
                number=inv_number,
                date=inv_date or date.today(),
                supplier_id=supplier_id,
                business_id=biz_id if biz_filter is not None else biz_id,
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

            _move_to_archive(config.access_token, item_id, config.folder_path, config.archive_subfolder)

        except Exception as e:
            result.errors.append(f"{name}: {str(e)}")

    return result
