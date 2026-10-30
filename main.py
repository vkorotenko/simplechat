import hashlib
import hmac
import os
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "upload"
for directory in (BASE_DIR / "css", BASE_DIR / "js", BASE_DIR / "img", UPLOAD_DIR):
    directory.mkdir(exist_ok=True)
SESSION_SECRET = (os.getenv("SESSION_SECRET") or secrets.token_hex(32)).encode()
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./simplechat.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("mysql://"):
    DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://", 1)

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(240), default="")
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


Base.metadata.create_all(engine)
app = FastAPI(title="SimpleChat")
app.mount("/css", StaticFiles(directory=BASE_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")
app.mount("/img", StaticFiles(directory=BASE_DIR / "img"), name="img")
app.mount("/upload", StaticFiles(directory=UPLOAD_DIR), name="upload")


def sign(value: str) -> str:
    return hmac.new(SESSION_SECRET, value.encode(), hashlib.sha256).hexdigest()


def make_session(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time())}"
    return f"{payload}.{sign('session:' + payload)}"


def db_session():
    with SessionLocal() as db:
        yield db


def authenticated_user(request: Request, db: Session = Depends(db_session)) -> User:
    token = request.cookies.get("simplechat_session", "")
    try:
        payload, signature = token.rsplit(".", 1)
        user_id, issued = map(int, payload.split(":"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Войдите в чат")
    if not hmac.compare_digest(signature, sign("session:" + payload)) or time.time() - issued > 30 * 24 * 60 * 60:
        raise HTTPException(status_code=401, detail="Сессия истекла")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


def issue_room_token(user_id: int, room_id: int) -> str:
    payload = f"{user_id}:{room_id}:{int(time.time()) + 12 * 60 * 60}"
    return f"{payload}.{sign('room:' + payload)}"


def check_room_token(token: str, user_id: int, room_id: int) -> None:
    try:
        payload, signature = token.rsplit(".", 1)
        token_user, token_room, expires = map(int, payload.split(":"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=403, detail="Сначала войдите в комнату")
    if (token_user != user_id or token_room != room_id or expires < time.time()
            or not hmac.compare_digest(signature, sign("room:" + payload))):
        raise HTTPException(status_code=403, detail="Нет доступа к комнате")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"{salt.hex()}:{digest.hex()}"


def password_matches(password: str, stored_hash: str) -> bool:
    salt_hex, digest_hex = stored_hash.split(":", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


class LoginRequest(BaseModel):
    login: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Zа-яА-ЯёЁ0-9_.-]+$")


class JoinRequest(BaseModel):
    password: str = Field(default="", max_length=128)


class RoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)
    password: str = Field(default="", max_length=128)


def require_admin(token: str | None) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Укажите ADMIN_TOKEN в настройках сервера")
    if not token or not hmac.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(status_code=403, detail="Недействительный ключ администратора")


@app.get("/")
def index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/admin")
def admin_page():
    return FileResponse(BASE_DIR / "admin.html")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(BASE_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(BASE_DIR / "sw.js", media_type="application/javascript")


@app.get("/api/me")
def who_am_i(user: User = Depends(authenticated_user)):
    return {"login": user.login}


@app.post("/api/login")
def login(data: LoginRequest, response: Response, db: Session = Depends(db_session)):
    login_name = data.login.strip().lower()
    if not re.fullmatch(r"[a-zа-яё0-9_.-]{2,32}", login_name):
        raise HTTPException(status_code=422, detail="Логин: 2–32 символа, латиница или кириллица, цифры, точка, дефис или _")
    user = db.scalar(select(User).where(User.login == login_name))
    if user is None:
        user = User(login=login_name)
        db.add(user)
        db.commit()
        db.refresh(user)
    response.set_cookie(
        "simplechat_session", make_session(user.id),
        httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE") == "1", max_age=30 * 24 * 60 * 60,
    )
    return {"login": user.login}


@app.post("/api/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie("simplechat_session")


@app.get("/api/rooms")
def list_rooms(db: Session = Depends(db_session), _user: User = Depends(authenticated_user)):
    rooms = db.scalars(select(Room).order_by(Room.id.desc())).all()
    return [{"id": room.id, "name": room.name, "description": room.description,
             "has_password": room.password_hash is not None} for room in rooms]


@app.post("/api/rooms/{room_id}/join")
def join_room(room_id: int, data: JoinRequest, db: Session = Depends(db_session),
              user: User = Depends(authenticated_user)):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.password_hash and not password_matches(data.password, room.password_hash):
        raise HTTPException(status_code=403, detail="Неверный пароль комнаты")
    return {"room_token": issue_room_token(user.id, room.id)}


@app.get("/api/rooms/{room_id}/messages")
def get_messages(room_id: int, after: int = 0, room_token: str = Header(alias="X-Room-Token"),
                 db: Session = Depends(db_session), user: User = Depends(authenticated_user)):
    if db.get(Room, room_id) is None:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    check_room_token(room_token, user.id, room_id)
    messages = db.scalars(
        select(Message).where(Message.room_id == room_id, Message.id > after)
        .order_by(Message.id.asc()).limit(100)
    ).all()
    users = {item.id: item.login for item in db.scalars(select(User)).all()}
    return [{"id": item.id, "login": users.get(item.user_id, "?"), "content": item.content,
             "image_url": item.image_url, "created_at": item.created_at.isoformat()} for item in messages]


@app.post("/api/rooms/{room_id}/messages", status_code=201)
async def send_message(room_id: int, content: str = Form(default=""), image: UploadFile | None = File(default=None),
                       room_token: str = Header(alias="X-Room-Token"), db: Session = Depends(db_session),
                       user: User = Depends(authenticated_user)):
    if db.get(Room, room_id) is None:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    check_room_token(room_token, user.id, room_id)
    content = content.strip()
    if len(content) > 4000:
        raise HTTPException(status_code=413, detail="Сообщение длиннее 4000 символов")
    image_url = None
    if image and image.filename:
        extensions = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
        extension = extensions.get(image.content_type or "")
        if not extension:
            raise HTTPException(status_code=415, detail="Поддерживаются JPG, PNG, WebP и GIF")
        image_data = await image.read(5 * 1024 * 1024 + 1)
        if len(image_data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Максимальный размер изображения: 5 МБ")
        filename = f"{uuid4().hex}{extension}"
        (UPLOAD_DIR / filename).write_bytes(image_data)
        image_url = f"/upload/{filename}"
    if not content and not image_url:
        raise HTTPException(status_code=422, detail="Добавьте текст или изображение")
    message = Message(room_id=room_id, user_id=user.id, content=content, image_url=image_url)
    db.add(message)
    db.commit()
    db.refresh(message)
    return {"id": message.id, "login": user.login, "content": message.content,
            "image_url": message.image_url, "created_at": message.created_at.isoformat()}


@app.post("/api/admin/rooms", status_code=201)
def create_room(data: RoomRequest, x_admin_token: str | None = Header(default=None), db: Session = Depends(db_session)):
    require_admin(x_admin_token)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Укажите название комнаты")
    room = Room(name=name, description=data.description.strip(),
                password_hash=hash_password(data.password) if data.password else None)
    db.add(room)
    db.commit()
    db.refresh(room)
    return {"id": room.id, "name": room.name, "description": room.description,
            "has_password": room.password_hash is not None}