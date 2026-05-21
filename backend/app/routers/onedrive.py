from __future__ import annotations

import json
import os
from datetime import date, datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import AppSetting, Invoice, InvoiceItem, User
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
MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0"
SCOPES = "Files.ReadWrite.All offline_access"

MS_CLIENT_ID = os.getenv("MS_CLIENT_ID", "")
MS_CLIENT_SECRET = os.getenv("MS_CLIENT_SECRET", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://fatture.doppiozero.pizza")

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".bmp"}

ONEDRIVE_FOLDER_PATH = os.getenv("ONEDRIVE_FOLDER_PATH", "/Fatture")
ARCHIVE_SUBFOLDER = os.getenv("ONEDRIVE_ARCHIVE_SUBFOLDER", "archiviate")


class OneDriveImportResult(BaseModel):
    total_files: int = 0
    imported: int = 0
    skipped_duplicate: int = 0
    errors: list[str] = []
    imported_invoices: list[dict] = []


def _get_setting(db: Session, key: str) -> str | None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def _get_valid_token(db: Session) -> str | None:
    token_data_str = _get_setting(db, "onedrive_tokens")
    if not token_data_str:
        return None
    token_data = json.loads(token_data_str)
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_at = token_data.get("expires_at", 0)

    if datetime.utcnow().timestamp() < expires_at - 300:
        return access_token

    if not refresh_token:
        return None
    new_tokens = _refresh_access_token(refresh_token)
    if not new_tokens:
        return None
    _store_tokens(db, new_tokens)
    return new_tokens.get("access_token")


def _refresh_access_token(refresh_token: str) -> dict | None:
    if not MS_CLIENT_ID or not MS_CLIENT_SECRET:
        return None
    r = httpx.post(
        f"{MS_AUTH_URL}/token",
        data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": SCOPES,
        },
        timeout=15,
    )
    if r.status_code != 200:
        return None
    return r.json()


def _store_tokens(db: Session, token_response: dict) -> None:
    expires_in = token_response.get("expires_in", 3600)
    data = {
        "access_token": token_response["access_token"],
        "refresh_token": token_response.get("refresh_token", ""),
        "expires_at": datetime.utcnow().timestamp() + expires_in,
    }
    _set_setting(db, "onedrive_tokens", json.dumps(data))


def _graph_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _list_files(token: str, folder_path: str) -> tuple[list[dict], str | None]:
    encoded = folder_path.strip("/").replace(" ", "%20")
    url = f"{GRAPH_BASE}/me/drive/root:/{encoded}:/children?$top=200"
    r = httpx.get(url, headers=_graph_headers(token), timeout=30)
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


def _download_file(token: str, item_id: str, dest_path: str) -> None:
    url = f"{GRAPH_BASE}/me/drive/items/{item_id}/content"
    r = httpx.get(url, headers=_graph_headers(token), follow_redirects=True, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"Errore download: {r.status_code}")
    with open(dest_path, "wb") as f:
        f.write(r.content)


def _move_to_archive(token: str, item_id: str, archive_folder_id: str) -> None:
    url = f"{GRAPH_BASE}/me/drive/items/{item_id}"
    try:
        httpx.patch(
            url,
            headers={**_graph_headers(token), "Content-Type": "application/json"},
            json={"parentReference": {"id": archive_folder_id}},
            timeout=15,
        )
    except Exception:
        pass


# --- OAuth2 endpoints ---

@router.get("/auth")
def onedrive_auth_redirect():
    if not MS_CLIENT_ID:
        raise HTTPException(400, "MS_CLIENT_ID non configurato. Vedi istruzioni setup.")
    params = {
        "client_id": MS_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": f"{APP_BASE_URL}/api/onedrive/callback",
        "scope": SCOPES,
        "response_mode": "query",
        "access_type": "offline",
        "prompt": "consent",
    }
    return RedirectResponse(f"{MS_AUTH_URL}/authorize?{urlencode(params)}")


@router.get("/callback")
def onedrive_callback(code: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(f"/onedrive-import?error={error}")
    if not code:
        return RedirectResponse("/onedrive-import?error=no_code")

    r = httpx.post(
        f"{MS_AUTH_URL}/token",
        data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "code": code,
            "redirect_uri": f"{APP_BASE_URL}/api/onedrive/callback",
            "grant_type": "authorization_code",
            "scope": SCOPES,
        },
        timeout=15,
    )
    if r.status_code != 200:
        return RedirectResponse(f"/onedrive-import?error=token_error")

    db = SessionLocal()
    try:
        _store_tokens(db, r.json())
    finally:
        db.close()

    return RedirectResponse("/onedrive-import?connected=true")


@router.get("/status")
def onedrive_status(db: Session = Depends(get_db)):
    token = _get_valid_token(db)
    oauth_configured = bool(MS_CLIENT_ID and MS_CLIENT_SECRET)
    return {
        "connected": token is not None,
        "oauth_configured": oauth_configured,
        "folder_path": ONEDRIVE_FOLDER_PATH,
        "archive_subfolder": ARCHIVE_SUBFOLDER,
    }


@router.post("/disconnect")
def onedrive_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(AppSetting).filter(AppSetting.key == "onedrive_tokens").first()
    if row:
        db.delete(row)
        db.commit()
    return {"disconnected": True}


# --- Import endpoint ---

@router.post("/import", response_model=OneDriveImportResult)
def import_from_onedrive(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = _get_valid_token(db)
    if not token:
        raise HTTPException(
            401,
            "OneDrive non collegato. Clicca 'Collega OneDrive' per autorizzare l'accesso.",
        )

    folder_path = ONEDRIVE_FOLDER_PATH
    files, archive_folder_id = _list_files(token, folder_path)
    result = OneDriveImportResult(total_files=len(files))

    for file_info in files:
        name: str = file_info.get("name", "")
        ext = os.path.splitext(name)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        item_id = file_info["id"]
        local_path = os.path.join(UPLOAD_DIR, f"onedrive_{item_id}{ext}")

        try:
            _download_file(token, item_id, local_path)

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
                        _move_to_archive(token, item_id, archive_folder_id)
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
                _move_to_archive(token, item_id, archive_folder_id)

        except Exception as e:
            result.errors.append(f"{name}: {str(e)}")

    return result
