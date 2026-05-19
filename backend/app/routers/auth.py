from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, Business, UserRole
from app.schemas import (
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserOut,
    UserUpdate,
    UserMeOut,
    BusinessCreate,
    BusinessOut,
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_master,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o password non validi",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disattivato")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMeOut)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).options(joinedload(User.business)).filter(User.id == current_user.id).first()
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    return db.query(User).options(joinedload(User.business)).order_by(User.created_at).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    data: UserCreate,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email già registrata")
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        business_id=data.business_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return db.query(User).options(joinedload(User.business)).filter(User.id == user.id).first()


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.business_id is not None:
        user.business_id = data.business_id
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password is not None:
        user.hashed_password = hash_password(data.password)
    db.commit()
    db.refresh(user)
    return db.query(User).options(joinedload(User.business)).filter(User.id == user.id).first()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(400, "Non puoi eliminare il tuo account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utente non trovato")
    db.delete(user)
    db.commit()


# --- Business management (master only) ---

@router.get("/businesses", response_model=list[BusinessOut])
def list_businesses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.MASTER.value:
        return db.query(Business).order_by(Business.name).all()
    if current_user.business_id:
        b = db.query(Business).filter(Business.id == current_user.business_id).first()
        return [b] if b else []
    return []


@router.post("/businesses", response_model=BusinessOut, status_code=201)
def create_business(
    data: BusinessCreate,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    business = Business(**data.model_dump())
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@router.put("/businesses/{biz_id}", response_model=BusinessOut)
def update_business(
    biz_id: int,
    data: BusinessCreate,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    business = db.query(Business).filter(Business.id == biz_id).first()
    if not business:
        raise HTTPException(404, "Attività non trovata")
    for key, val in data.model_dump().items():
        setattr(business, key, val)
    db.commit()
    db.refresh(business)
    return business


@router.delete("/businesses/{biz_id}", status_code=204)
def delete_business(
    biz_id: int,
    current_user: User = Depends(require_master),
    db: Session = Depends(get_db),
):
    business = db.query(Business).filter(Business.id == biz_id).first()
    if not business:
        raise HTTPException(404, "Attività non trovata")
    db.delete(business)
    db.commit()
