"""
AI-based Complaint Resolution System backend.

How to run:
pip install flask flask-cors python-dotenv requests
python app.py
"""

import json
import os
import random
import re
import sqlite3
import time
import base64
from functools import wraps
from io import BytesIO
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash


# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
configured_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
CORS(app, origins=configured_origins)

DATABASE_PATH = os.path.join(os.path.dirname(__file__), "complaints.db")
ALLOWED_STATUSES = {"Pending", "In Process", "Completed", "Rejected"}
ALLOWED_AUTHORITY_DEPARTMENTS = {"fire", "water", "electricity", "road", "garbage"}
TOKEN_MAX_AGE = int(os.getenv("SESSION_TOKEN_MAX_AGE", "86400"))
TOKEN_SECRET = os.getenv("SESSION_TOKEN_SECRET") or os.getenv("FLASK_SECRET_KEY")
if not TOKEN_SECRET:
    TOKEN_SECRET = "development-only-change-me"
token_serializer = URLSafeTimedSerializer(TOKEN_SECRET, salt="complaint-session")
USERNAME_PATTERN = re.compile(r"^[a-zA-Z]{3,30}$")
PHONE_PATTERN = re.compile(r"^\d{10}$")

# Bengaluru locality reference points used for the geographic heatmap.
LOCATION_POINTS = {
    "Majestic": (12.9762, 77.5710),
    "Malleswaram": (13.0030, 77.5696),
    "Rajajinagar": (12.9912, 77.5523),
    "Yeshwanthpur": (13.0210, 77.5531),
    "Hebbal": (13.0358, 77.5910),
    "Indiranagar": (12.9784, 77.6408),
    "Koramangala": (12.9352, 77.6245),
    "HSR Layout": (12.9116, 77.6474),
    "Jayanagar": (12.9250, 77.5938),
    "BTM Layout": (12.9166, 77.6101),
    "Electronic City": (12.8459, 77.6600),
    "Marathahalli": (12.9592, 77.6974),
    "Bellandur": (12.9295, 77.6787),
    "Whitefield": (12.9698, 77.7500),
    "Banashankari": (12.9250, 77.5466),
    "Basavanagudi": (12.9415, 77.5757),
    "MG Road": (12.9755, 77.6050),
}


# -----------------------------------------------------------------------------
# Database helpers
# -----------------------------------------------------------------------------
def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    connection = get_db_connection()
    cursor = connection.cursor()

    # Users table: citizen accounts
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
        """
    )

    # Authorities table: government department accounts
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS authorities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            department TEXT NOT NULL,
            password TEXT NOT NULL
        )
        """
    )

    # Complaints table: complaint records and AI output
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            location TEXT,
            image TEXT,
            category TEXT NOT NULL,
            department TEXT NOT NULL,
            priority TEXT NOT NULL,
            response TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            area TEXT,
            latitude REAL,
            longitude REAL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )

    # Lightweight migration for existing databases.
    existing_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(complaints)").fetchall()
    }
    if "area" not in existing_columns:
        cursor.execute("ALTER TABLE complaints ADD COLUMN area TEXT")
    if "latitude" not in existing_columns:
        cursor.execute("ALTER TABLE complaints ADD COLUMN latitude REAL")
    if "longitude" not in existing_columns:
        cursor.execute("ALTER TABLE complaints ADD COLUMN longitude REAL")
    new_columns = {
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "detected_language": "TEXT",
        "altitude": "REAL",
        "projected_x": "REAL",
        "projected_y": "REAL",
        "projected_z": "REAL",
        "coordinate_reference_system": "TEXT",
        "accuracy": "REAL",
        "capture_timestamp": "TEXT",
        "image_geo_tag": "TEXT",
        "remarks": "TEXT",
    }
    for column, definition in new_columns.items():
        if column not in existing_columns:
            cursor.execute(f"ALTER TABLE complaints ADD COLUMN {column} {definition}")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            changed_by_role TEXT,
            changed_by_id INTEGER,
            remarks TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (complaint_id) REFERENCES complaints (id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_role TEXT,
            actor_id INTEGER,
            event TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at TEXT NOT NULL
        )
        """
    )
    admin_phone = os.getenv("ADMIN_PHONE", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "")
    if admin_phone and admin_password:
        cursor.execute(
            "INSERT OR IGNORE INTO admin_users (name, phone, password, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
            (os.getenv("ADMIN_NAME", "Administrator"), admin_phone, generate_password_hash(admin_password), utc_now()),
        )

    now = utc_now()
    cursor.execute("UPDATE complaints SET created_at = COALESCE(created_at, ?), updated_at = COALESCE(updated_at, created_at, ?)" , (now, now))
    cursor.execute(
        """
        INSERT INTO status_history (complaint_id, old_status, new_status, changed_by_role, changed_by_id, remarks, created_at)
        SELECT c.id, NULL, c.status, 'system', NULL, 'Initial history record created during migration', COALESCE(c.created_at, ?)
        FROM complaints c
        WHERE NOT EXISTS (
            SELECT 1 FROM status_history h WHERE h.complaint_id = c.id
        )
        """,
        (now,),
    )

    connection.commit()
    connection.close()


# -----------------------------------------------------------------------------
# Utility helpers
# -----------------------------------------------------------------------------
def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return dict(row)


def json_error(message: str, status_code: int = 400):
    return jsonify({"error": message}), status_code


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def request_json() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def audit_event(connection: sqlite3.Connection, event: str, actor_role: Optional[str] = None,
                actor_id: Optional[int] = None, entity_type: Optional[str] = None,
                entity_id: Optional[int] = None, details: Optional[Dict[str, Any]] = None) -> None:
    connection.execute(
        "INSERT INTO audit_logs (actor_role, actor_id, event, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (actor_role, actor_id, event, entity_type, entity_id, json.dumps(details or {}), utc_now()),
    )


def build_geo_tag_image(image: Any, latitude: Optional[float], longitude: Optional[float], altitude: Optional[float], timestamp: str) -> Optional[str]:
    if not isinstance(image, str) or not image.startswith("data:image/") or latitude is None or longitude is None:
        return None
    try:
        from PIL import Image, ImageDraw

        header, encoded = image.split(",", 1)
        source = Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")
        draw = ImageDraw.Draw(source)
        altitude_text = f", Alt: {altitude}m" if altitude is not None else ""
        stamp = f"Lat: {latitude:.6f}, Lng: {longitude:.6f}{altitude_text} | {timestamp}"
        draw.rectangle((0, max(0, source.height - 34), source.width, source.height), fill="black")
        draw.text((8, max(4, source.height - 26)), stamp, fill="white")
        output = BytesIO()
        source.save(output, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode('ascii')}"
    except Exception:
        return None


def issue_token(role: str, subject_id: int, **claims: Any) -> str:
    return token_serializer.dumps({"role": role, "id": subject_id, **claims})


def require_roles(*roles: str):
    def decorator(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.lower().startswith("bearer "):
                return json_error("Bearer token required", 401)
            try:
                payload = token_serializer.loads(header[7:].strip(), max_age=TOKEN_MAX_AGE)
            except (BadSignature, SignatureExpired):
                return json_error("Invalid or expired session token", 401)
            if payload.get("role") not in roles:
                return json_error("Insufficient permissions", 403)
            g.auth = payload
            return function(*args, **kwargs)
        return wrapped
    return decorator


def validate_required_fields(data: Dict[str, Any], fields: list[str]) -> Optional[str]:
    for field in fields:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            return field
    return None


def validate_identity_fields(data: Dict[str, Any]) -> Optional[str]:
    name = data.get("name")
    phone = data.get("phone")
    password = data.get("password")
    if not isinstance(name, str) or not USERNAME_PATTERN.fullmatch(name.strip()):
        return "name"
    if not isinstance(phone, str) or not PHONE_PATTERN.fullmatch(phone):
        return "phone"
    if not isinstance(password, str) or len(password.strip()) < 6:
        return "password"
    return None


def extract_json_from_text(text: str) -> Dict[str, Any]:
    cleaned = text.strip()

    # Remove fenced markdown if the model wraps JSON in code blocks.
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def normalize_ai_result(data: Dict[str, Any], complaint_text: str) -> Dict[str, str]:
    language = str(data.get("language", "en")).strip().lower() or "en"
    category = str(data.get("category", "")).strip().title()
    department = str(data.get("department", "")).strip().title()
    priority = str(data.get("priority", "")).strip().title()
    response = str(data.get("response", "")).strip()

    category_map = {
        "Electrical": "Electrical",
        "Water": "Water",
        "Garbage": "Garbage",
        "Road": "Road",
        "Fire": "Fire",
        "Other": "Other",
    }

    department_map = {
        "Electrical": "Electricity",
        "Water": "Water",
        "Garbage": "Garbage",
        "Road": "Road",
        "Fire": "Fire",
        "Other": "Other",
    }

    if category not in category_map:
        fallback = fallback_analysis(complaint_text)
        fallback["language"] = language
        return fallback

    if department not in department_map:
        department = department_map[category]

    if priority not in {"Low", "Medium", "High"}:
        priority = "Medium"

    if not response:
        response = "Your complaint has been received and will be reviewed soon."

    return {
        "language": language,
        "category": category,
        "department": department_map.get(category, department),
        "priority": priority,
        "response": response,
    }


def fallback_analysis(text: str) -> Dict[str, str]:
    lower_text = text.lower()

    if "light" in lower_text:
        return {
            "category": "Electrical",
            "department": "Electricity",
            "priority": "Medium",
            "response": "Technician will be assigned and the issue will be checked soon.",
        }

    if "fire" in lower_text or "smoke" in lower_text:
        return {
            "category": "Fire",
            "department": "Fire",
            "priority": "High",
            "response": "Emergency team will be informed immediately and dispatched.",
        }

    if "road" in lower_text or "pothole" in lower_text:
        return {
            "category": "Road",
            "department": "Road",
            "priority": "Medium",
            "response": "Road maintenance team will inspect and schedule a fix.",
        }

    if "water" in lower_text or "leakage" in lower_text:
        return {
            "category": "Water",
            "department": "Water",
            "priority": "Medium",
            "response": "The water department will inspect the issue and respond soon.",
        }

    if "garbage" in lower_text:
        return {
            "category": "Garbage",
            "department": "Garbage",
            "priority": "Medium",
            "response": "Cleaning staff will be assigned to resolve this issue shortly.",
        }

    return {
        "category": "Other",
        "department": "Other",
        "priority": "Low",
        "response": "Your complaint has been logged and will be reviewed by the concerned team.",
    }


def resolve_location_point(location: str) -> tuple[str, float, float]:
    text = location.strip().lower()

    if text:
        for area, (lat, lng) in LOCATION_POINTS.items():
            if area.lower() in text:
                return area, lat, lng

    # Default anchor if location is missing or unmatched.
    default_area = "MG Road"
    default_lat, default_lng = LOCATION_POINTS[default_area]
    return default_area, default_lat, default_lng


# -----------------------------------------------------------------------------
# AI analysis function
# -----------------------------------------------------------------------------
def analyze_complaint(text: str, preferred_language: Optional[str] = None) -> Dict[str, str]:
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    language_instruction = preferred_language if preferred_language in {"en", "kn", "hi"} else "auto-detect"
    prompt = f"""
You are a complaint analysis assistant.
Analyze the complaint and return ONLY valid JSON with these keys:
language, category, department, priority, response.

Rules:
- category must be one of: Electrical, Water, Garbage, Road, Fire, Other
- department must be one of: Electricity, Water, Garbage, Road, Fire, Other
- priority must be one of: Low, Medium, High
- response must be short and helpful
- Detect the complaint language. The preferred language is {language_instruction}.
- Write the response in the complaint language when practical.
- Return only JSON, no markdown, no explanation

Complaint: {text}
""".strip()

    try:
        if gemini_key:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"gemini-1.5-flash:generateContent?key={gemini_key}"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2},
            }
            response = requests.post(url, json=payload, timeout=20)
            response.raise_for_status()
            data = response.json()
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            return normalize_ai_result(extract_json_from_text(raw_text), text)

        if openai_key:
            url = "https://api.openai.com/v1/responses"
            headers = {
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "gpt-4.1-mini",
                "input": prompt,
                "temperature": 0.2,
            }
            response = requests.post(url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            data = response.json()
            raw_text = data["output"][0]["content"][0]["text"]
            return normalize_ai_result(extract_json_from_text(raw_text), text)

    except Exception:
        # If the AI call fails or the response cannot be parsed, use the fallback.
        fallback = fallback_analysis(text)
        fallback["language"] = preferred_language or "en"
        return fallback

    # If no API key is configured, use the simple fallback.
    result = fallback_analysis(text)
    result["language"] = preferred_language or "en"
    return result


# -----------------------------------------------------------------------------
# Basic pages and health check
# -----------------------------------------------------------------------------
@app.get("/")
def home():
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Complaint Resolution API</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #f8fbff, #e8f1ff);
            color: #1f2937;
          }
          .card {
            background: white;
            padding: 32px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
            max-width: 560px;
            width: calc(100% - 32px);
          }
          h1 { margin: 0 0 12px; font-size: 28px; }
          p { margin: 0 0 12px; line-height: 1.6; }
          code {
            display: block;
            background: #f3f4f6;
            padding: 12px;
            border-radius: 10px;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Complaint Resolution API</h1>
          <p>The backend is running successfully.</p>
          <p>Available endpoints:</p>
          <code>POST /user/register</code>
          <code>POST /user/login</code>
          <code>POST /authority/register</code>
          <code>POST /authority/login</code>
          <code>POST /complaint</code>
          <code>GET /user/complaints/&lt;user_id&gt;</code>
          <code>GET /authority/complaints/&lt;department&gt;</code>
          <code>PUT /complaint/status</code>
        </div>
      </body>
    </html>
    """


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


# -----------------------------------------------------------------------------
# User authentication
# -----------------------------------------------------------------------------
@app.post("/user/register")
def user_register():
    data = request_json()
    missing = validate_required_fields(data, ["name", "phone", "password"])
    if missing:
        return json_error(f"Missing field: {missing}")

    invalid = validate_identity_fields(data)
    if invalid:
        return json_error(f"Invalid or missing field: {invalid}")
    name = data["name"].strip()
    phone = data["phone"].strip()
    password = data["password"].strip()

    connection = get_db_connection()
    cursor = connection.cursor()

    existing_user = cursor.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone()
    if existing_user:
        connection.close()
        return json_error("User already exists with this phone number", 409)

    cursor.execute(
        "INSERT INTO users (name, phone, password) VALUES (?, ?, ?)",
        (name, phone, generate_password_hash(password)),
    )
    user_id = cursor.lastrowid
    audit_event(connection, "user_registered", "user", user_id, "user", user_id)
    connection.commit()
    connection.close()

    return jsonify({"message": "User registered successfully", "user_id": user_id}), 201


@app.post("/user/login")
def user_login():
    data = request_json()
    missing = validate_required_fields(data, ["phone", "password"])
    if missing:
        return json_error(f"Missing field: {missing}")

    phone = data["phone"]
    password = data["password"]
    if not isinstance(phone, str) or not PHONE_PATTERN.fullmatch(phone) or not isinstance(password, str) or len(password.strip()) < 6:
        return json_error("Invalid phone number or password", 400)
    password = password.strip()

    connection = get_db_connection()
    user_record = connection.execute("SELECT id, name, phone, password FROM users WHERE phone = ?", (phone,)).fetchone()
    user = None
    if user_record:
        stored = user_record["password"]
        valid = stored.startswith(("pbkdf2:", "scrypt:")) and check_password_hash(stored, password)
        if not valid and stored == password:
            valid = True
            connection.execute("UPDATE users SET password = ? WHERE id = ?", (generate_password_hash(password), user_record["id"]))
        if valid:
            user = {"id": user_record["id"], "name": user_record["name"], "phone": user_record["phone"]}
            audit_event(connection, "user_login", "user", user_record["id"], "user", user_record["id"])
            connection.commit()

    if not user:
        return json_error("Invalid user credentials", 401)

    return jsonify({"message": "Login successful", "user": user, "token": issue_token("user", user["id"]), "role": "user"}), 200


# -----------------------------------------------------------------------------
# Authority authentication
# -----------------------------------------------------------------------------
@app.post("/authority/register")
def authority_register():
    data = request_json()
    missing = validate_required_fields(data, ["name", "phone", "department", "password"])
    if missing:
        return json_error(f"Missing field: {missing}")

    invalid = validate_identity_fields(data)
    if invalid:
        return json_error(f"Invalid or missing field: {invalid}")
    name = data["name"].strip()
    phone = data["phone"]
    department = data["department"].strip().lower()
    password = data["password"].strip()

    if department not in ALLOWED_AUTHORITY_DEPARTMENTS:
        return json_error("Invalid department", 400)

    connection = get_db_connection()
    cursor = connection.cursor()

    existing_authority = cursor.execute(
        "SELECT id FROM authorities WHERE phone = ?",
        (phone,),
    ).fetchone()
    if existing_authority:
        connection.close()
        return json_error("Authority already exists with this phone number", 409)

    cursor.execute(
        "INSERT INTO authorities (name, phone, department, password) VALUES (?, ?, ?, ?)",
        (name, phone, department, generate_password_hash(password)),
    )
    authority_id = cursor.lastrowid
    audit_event(connection, "authority_registered", "authority", authority_id, "authority", authority_id)
    connection.commit()
    connection.close()

    return jsonify({"message": "Authority registered successfully", "authority_id": authority_id}), 201


@app.post("/authority/login")
def authority_login():
    data = request_json()
    missing = validate_required_fields(data, ["phone", "password", "department"])
    if missing:
        return json_error(f"Missing field: {missing}")

    phone = data["phone"]
    password = data["password"]
    department = data["department"].strip().lower()
    if not isinstance(phone, str) or not PHONE_PATTERN.fullmatch(phone) or not isinstance(password, str) or len(password.strip()) < 6:
        return json_error("Invalid phone number or password", 400)
    password = password.strip()

    connection = get_db_connection()
    authority_record = connection.execute("SELECT id, name, phone, department, password FROM authorities WHERE phone = ? AND lower(department) = ?", (phone, department)).fetchone()
    authority = None
    if authority_record:
        stored = authority_record["password"]
        valid = stored.startswith(("pbkdf2:", "scrypt:")) and check_password_hash(stored, password)
        if not valid and stored == password:
            valid = True
            connection.execute("UPDATE authorities SET password = ? WHERE id = ?", (generate_password_hash(password), authority_record["id"]))
        if valid:
            authority = {key: authority_record[key] for key in ("id", "name", "phone", "department")}
            audit_event(connection, "authority_login", "authority", authority_record["id"], "authority", authority_record["id"])
            connection.commit()
    connection.close()

    if not authority:
        return json_error("Invalid authority credentials", 401)

    return jsonify({"message": "Login successful", "authority": authority, "token": issue_token("authority", authority["id"], department=authority["department"]), "role": "authority"}), 200


# -----------------------------------------------------------------------------
# Complaint submission and retrieval
# -----------------------------------------------------------------------------
@app.post("/complaint")
@require_roles("user")
def create_complaint():
    data = request_json()
    missing = validate_required_fields(data, ["user_id", "text"])
    if missing:
        return json_error(f"Missing field: {missing}")

    user_id = data["user_id"]
    if isinstance(user_id, bool) or not isinstance(user_id, (int, str)) or not str(user_id).isdigit():
        return json_error("user_id must be an integer")
    user_id = int(user_id)
    if int(g.auth.get("id", -1)) != user_id:
        return json_error("Insufficient permissions", 403)
    if not isinstance(data.get("text"), str):
        return json_error("text must be a string")
    text = data["text"].strip()
    location = str(data.get("location", "")).strip()
    image = data.get("image")

    if not text:
        return json_error("Complaint text cannot be empty")
    if len(text) < 5 or len(text) > 5000:
        return json_error("Complaint text must be between 5 and 5000 characters")
    if not location or len(location) > 500:
        return json_error("location is required and must be at most 500 characters")

    numeric_fields = ["latitude", "longitude", "altitude", "projected_x", "projected_y", "projected_z", "accuracy"]
    coordinates: Dict[str, Optional[float]] = {}
    for field in numeric_fields:
        value = data.get(field)
        if value is not None:
            try:
                coordinates[field] = float(value)
            except (TypeError, ValueError):
                return json_error(f"{field} must be numeric")
        else:
            coordinates[field] = None

    connection = get_db_connection()
    cursor = connection.cursor()

    user = cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        connection.close()
        return json_error("User not found", 404)

    preferred_language = data.get("language")
    if preferred_language is not None and preferred_language not in {"en", "kn", "hi", "auto"}:
        connection.close()
        return json_error("language must be auto, en, kn, or hi")
    ai_result = analyze_complaint(text, None if preferred_language in (None, "auto") else preferred_language)
    area, fallback_latitude, fallback_longitude = resolve_location_point(location)
    latitude = coordinates["latitude"] if coordinates["latitude"] is not None else fallback_latitude
    longitude = coordinates["longitude"] if coordinates["longitude"] is not None else fallback_longitude
    created_at = utc_now()
    detected_language = str(ai_result.get("language", "en"))
    image_geo_tag = data.get("image_geo_tag")
    if image_geo_tag is not None and not isinstance(image_geo_tag, (str, dict, list)):
        return json_error("image_geo_tag must be text or structured JSON")
    image_geo_tag = json.dumps(image_geo_tag) if isinstance(image_geo_tag, (dict, list)) else image_geo_tag
    if image_geo_tag is None:
        image_geo_tag = build_geo_tag_image(image, latitude, longitude, coordinates["altitude"], created_at)

    cursor.execute(
        """
        INSERT INTO complaints (
            user_id, text, location, image, category, department, priority, response, status, area, latitude, longitude,
            created_at, updated_at, detected_language, altitude, projected_x, projected_y, projected_z,
            coordinate_reference_system, accuracy, capture_timestamp, image_geo_tag, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            text,
            location,
            image,
            ai_result["category"],
            ai_result["department"],
            ai_result["priority"],
            ai_result["response"],
            "Pending",
            area,
            latitude,
            longitude,
            created_at,
            created_at,
            detected_language,
            coordinates["altitude"],
            coordinates["projected_x"],
            coordinates["projected_y"],
            coordinates["projected_z"],
            data.get("coordinate_reference_system"),
            coordinates["accuracy"],
            data.get("capture_timestamp"),
            image_geo_tag,
            data.get("remarks"),
        ),
    )
    connection.commit()
    complaint_id = cursor.lastrowid
    cursor.execute(
        "INSERT INTO status_history (complaint_id, old_status, new_status, changed_by_role, changed_by_id, remarks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (complaint_id, None, "Pending", "user", user_id, data.get("remarks"), created_at),
    )
    audit_event(connection, "complaint_created", "user", user_id, "complaint", complaint_id, {"language": detected_language})
    connection.commit()

    complaint = cursor.execute(
        "SELECT * FROM complaints WHERE id = ?",
        (complaint_id,),
    ).fetchone()
    connection.close()

    return jsonify({"message": "Complaint submitted successfully", "complaint": row_to_dict(complaint)}), 201


@app.get("/user/complaints/<int:user_id>")
@require_roles("user")
def get_user_complaints(user_id: int):
    if int(g.auth.get("id", -1)) != user_id:
        return json_error("Insufficient permissions", 403)
    connection = get_db_connection()
    user = connection.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        connection.close()
        return json_error("User not found", 404)

    complaints = connection.execute(
        "SELECT * FROM complaints WHERE user_id = ? ORDER BY id DESC",
        (user_id,),
    ).fetchall()
    connection.close()

    return jsonify({"complaints": [row_to_dict(row) for row in complaints]}), 200


@app.get("/authority/complaints/<department>")
@require_roles("authority", "admin")
def get_authority_complaints(department: str):
    normalized_department = department.strip().lower()
    if normalized_department not in ALLOWED_AUTHORITY_DEPARTMENTS:
        return json_error("Invalid department", 400)
    if g.auth.get("role") == "authority" and str(g.auth.get("department", "")).lower() != normalized_department:
        return json_error("Insufficient permissions", 403)

    connection = get_db_connection()
    complaints = connection.execute(
        "SELECT * FROM complaints WHERE lower(department) = ? ORDER BY id DESC",
        (normalized_department,),
    ).fetchall()
    connection.close()

    return jsonify({"complaints": [row_to_dict(row) for row in complaints]}), 200


# -----------------------------------------------------------------------------
# Complaint status update
# -----------------------------------------------------------------------------
@app.put("/complaint/status")
@require_roles("authority", "admin")
def update_complaint_status():
    data = request_json()
    missing = validate_required_fields(data, ["complaint_id", "status"])
    if missing:
        return json_error(f"Missing field: {missing}")

    complaint_id = data["complaint_id"]
    status = str(data["status"]).strip().title()

    if status not in ALLOWED_STATUSES:
        return json_error("Invalid status", 400)

    connection = get_db_connection()
    cursor = connection.cursor()

    complaint = cursor.execute(
        "SELECT id, status, user_id, department FROM complaints WHERE id = ?",
        (complaint_id,),
    ).fetchone()
    if not complaint:
        connection.close()
        return json_error("Complaint not found", 404)
    if g.auth.get("role") == "authority" and str(g.auth.get("department", "")).lower() != str(complaint["department"]).lower():
        connection.close()
        return json_error("Insufficient permissions", 403)

    cursor.execute(
        "UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?",
        (status, utc_now(), complaint_id),
    )
    actor = getattr(g, "auth", {})
    cursor.execute(
        "INSERT INTO status_history (complaint_id, old_status, new_status, changed_by_role, changed_by_id, remarks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (complaint_id, complaint["status"], status, actor.get("role"), actor.get("id"), data.get("remarks"), utc_now()),
    )
    audit_event(connection, "complaint_status_updated", actor.get("role"), actor.get("id"), "complaint", complaint_id, {"status": status})
    connection.commit()

    updated_complaint = cursor.execute(
        "SELECT * FROM complaints WHERE id = ?",
        (complaint_id,),
    ).fetchone()
    connection.close()

    return jsonify({"message": "Status updated successfully", "complaint": row_to_dict(updated_complaint)}), 200


# -----------------------------------------------------------------------------
# Heatmap and insights
# -----------------------------------------------------------------------------
@app.get("/insights/heatmap")
@require_roles("user", "authority", "admin")
def get_heatmap_data():
    department = str(request.args.get("department", "")).strip().lower()
    user_id = request.args.get("user_id")
    locality_names = list(LOCATION_POINTS.keys())
    locality_placeholders = ",".join("?" for _ in locality_names)

    query = f"""
        SELECT
            area,
            COALESCE(latitude, 0) AS latitude,
            COALESCE(longitude, 0) AS longitude,
            COUNT(*) AS count
        FROM complaints
        WHERE area IN ({locality_placeholders})
    """
    params: list[Any] = list(locality_names)

    if department:
        if department not in ALLOWED_AUTHORITY_DEPARTMENTS:
            return json_error("Invalid department", 400)
        query += " AND lower(department) = ?"
        params.append(department)

    if g.auth.get("role") == "authority" and department != str(g.auth.get("department", "")).lower():
        return json_error("Insufficient permissions", 403)
    if g.auth.get("role") == "user" and user_id and str(g.auth.get("id")) != str(user_id):
        return json_error("Insufficient permissions", 403)
    if g.auth.get("role") == "user" and not user_id:
        query += " AND user_id = ?"
        params.append(g.auth.get("id"))

    if user_id:
        query += " AND user_id = ?"
        params.append(user_id)

    query += " GROUP BY area, latitude, longitude ORDER BY count DESC"

    connection = get_db_connection()
    rows = connection.execute(query, params).fetchall()
    connection.close()

    points = [
        {
            "area": row["area"] or "Unknown",
            "lat": row["latitude"],
            "lng": row["longitude"],
            "weight": row["count"],
        }
        for row in rows
    ]

    return jsonify({"points": points, "total_areas": len(points)}), 200


@app.get("/insights/summary")
@require_roles("user", "authority", "admin")
def get_insights_summary():
    department = str(request.args.get("department", "")).strip().lower()
    user_id = request.args.get("user_id")
    locality_names = list(LOCATION_POINTS.keys())
    locality_placeholders = ",".join("?" for _ in locality_names)

    where_parts = [f"area IN ({locality_placeholders})"]
    params: list[Any] = list(locality_names)

    if department:
        if department not in ALLOWED_AUTHORITY_DEPARTMENTS:
            return json_error("Invalid department", 400)
        where_parts.append("lower(department) = ?")
        params.append(department)

    if g.auth.get("role") == "authority" and department != str(g.auth.get("department", "")).lower():
        return json_error("Insufficient permissions", 403)
    if g.auth.get("role") == "user" and user_id and str(g.auth.get("id")) != str(user_id):
        return json_error("Insufficient permissions", 403)
    if g.auth.get("role") == "user" and not user_id:
        where_parts.append("user_id = ?")
        params.append(g.auth.get("id"))

    if user_id:
        where_parts.append("user_id = ?")
        params.append(user_id)

    where_clause = " AND ".join(where_parts)

    connection = get_db_connection()
    total = connection.execute(
        f"SELECT COUNT(*) AS c FROM complaints WHERE {where_clause}",
        params,
    ).fetchone()["c"]

    top_areas = connection.execute(
        f"""
        SELECT area, COUNT(*) AS count
        FROM complaints
        WHERE {where_clause}
        GROUP BY area
        ORDER BY count DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    by_status = connection.execute(
        f"""
        SELECT status, COUNT(*) AS count
        FROM complaints
        WHERE {where_clause}
        GROUP BY status
        ORDER BY count DESC
        """,
        params,
    ).fetchall()
    connection.close()

    return jsonify(
        {
            "total_complaints": total,
            "top_areas": [{"area": row["area"] or "Unknown", "count": row["count"]} for row in top_areas],
            "status_breakdown": [{"status": row["status"], "count": row["count"]} for row in by_status],
        }
    ), 200


@app.post("/seed/demo-complaints")
def seed_demo_complaints():
    data = request_json()
    try:
        count = int(data.get("count", 30))
    except (TypeError, ValueError):
        return json_error("count must be an integer")
    count = max(1, min(count, 200))

    sample_texts = {
        "Electricity": [
            "Street lights are not working in Indiranagar.",
            "Power outage reported in Koramangala apartment block.",
            "Frequent short-circuit issue near Whitefield commercial street.",
        ],
        "Water": [
            "No water supply reported in Jayanagar apartment lane.",
            "Water leakage near Bellandur pipeline.",
            "Drinking water cooler is empty in Malleswaram market area.",
        ],
        "Road": [
            "Large pothole near MG Road service lane.",
            "Internal road surface damaged in Banashankari.",
            "Rainwater logging at Marathahalli junction.",
        ],
        "Fire": [
            "Smoke detected near Hebbal market warehouse.",
            "Fire extinguisher missing in Whitefield office building.",
            "Burning smell noticed near Koramangala kitchen area.",
        ],
        "Garbage": [
            "Garbage bins are overflowing in HSR Layout.",
            "Waste not collected from Rajajinagar street.",
            "Bad smell from dumped garbage behind Yeshwanthpur market.",
        ],
    }

    department_choices = ["Electricity", "Water", "Road", "Fire", "Garbage"]
    statuses = ["Pending", "In Process", "Completed", "Rejected"]
    area_choices = list(LOCATION_POINTS.keys())

    connection = get_db_connection()
    cursor = connection.cursor()

    # Create or reuse a dedicated demo user.
    demo_phone = "9990001111"
    demo_user = cursor.execute("SELECT id FROM users WHERE phone = ?", (demo_phone,)).fetchone()
    if demo_user:
        user_id = demo_user["id"]
    else:
        cursor.execute(
            "INSERT INTO users (name, phone, password) VALUES (?, ?, ?)",
            ("Demo User", demo_phone, "demo123"),
        )
        user_id = cursor.lastrowid

    for _ in range(count):
        dept = random.choice(department_choices)
        area = random.choice(area_choices)
        lat, lng = LOCATION_POINTS[area]
        text = random.choice(sample_texts[dept])
        priority = random.choice(["Low", "Medium", "High"])
        status = random.choice(statuses)

        cursor.execute(
            """
            INSERT INTO complaints (
                user_id, text, location, image, category, department, priority, response, status, area, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                text,
                area,
                None,
                dept,
                dept,
                priority,
                "Demo complaint generated for heatmap insights.",
                status,
                area,
                lat,
                lng,
            ),
        )

    connection.commit()
    connection.close()

    return jsonify({"message": "Demo complaints seeded", "count": count}), 201


# -----------------------------------------------------------------------------
# Protected administration, history, and reporting endpoints
# -----------------------------------------------------------------------------
@app.post("/admin/login")
def admin_login():
    data = request_json()
    missing = validate_required_fields(data, ["phone", "password"])
    if missing:
        return json_error(f"Missing field: {missing}")
    phone = data["phone"]
    password = data["password"]
    if not isinstance(phone, str) or not PHONE_PATTERN.fullmatch(phone):
        return json_error("Phone number must contain exactly 10 digits.", 400)
    if not isinstance(password, str) or len(password.strip()) < 6:
        return json_error("Invalid admin password", 400)
    password = password.strip()
    connection = get_db_connection()
    admin = connection.execute("SELECT id, name, phone, password, role FROM admin_users WHERE phone = ?", (phone,)).fetchone()
    valid = False
    if admin:
        stored = admin["password"]
        valid = (stored.startswith(("pbkdf2:", "scrypt:")) and check_password_hash(stored, password)) or stored == password
        if valid and stored == password:
            connection.execute("UPDATE admin_users SET password = ? WHERE id = ?", (generate_password_hash(password), admin["id"]))
    if not valid:
        connection.close()
        return json_error("Invalid admin credentials", 401)
    audit_event(connection, "admin_login", "admin", admin["id"], "admin", admin["id"])
    connection.commit()
    result = {"id": admin["id"], "name": admin["name"], "phone": admin["phone"], "role": admin["role"]}
    connection.close()
    return jsonify({"message": "Login successful", "admin": result, "token": issue_token("admin", result["id"]), "role": "admin"}), 200


@app.get("/admin/stats")
@require_roles("admin")
def admin_stats():
    connection = get_db_connection()
    citizens = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
    authorities = connection.execute("SELECT COUNT(*) AS count FROM authorities").fetchone()["count"]
    total = connection.execute("SELECT COUNT(*) AS count FROM complaints").fetchone()["count"]
    stale = connection.execute(
        "SELECT COUNT(*) AS count FROM complaints WHERE status NOT IN ('Completed', 'Rejected') AND updated_at < ?",
        (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 7 * 86400)),),
    ).fetchone()["count"]
    by_status = connection.execute("SELECT status, COUNT(*) AS count FROM complaints GROUP BY status ORDER BY count DESC").fetchall()
    by_department = connection.execute("SELECT department, COUNT(*) AS count FROM complaints GROUP BY department ORDER BY count DESC").fetchall()
    connection.close()
    return jsonify({
        "total_citizens": citizens,
        "total_authorities": authorities,
        "total_complaints": total,
        "stale_open_complaints": stale,
        "status_breakdown": [row_to_dict(row) for row in by_status],
        "department_breakdown": [row_to_dict(row) for row in by_department],
    }), 200


@app.get("/admin/activities")
@require_roles("admin")
def admin_activities():
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 200))
    except (TypeError, ValueError):
        return json_error("limit must be an integer")
    connection = get_db_connection()
    rows = connection.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    connection.close()
    return jsonify({"activities": [row_to_dict(row) for row in rows]}), 200


@app.get("/admin/complaints")
@require_roles("admin")
def admin_complaints():
    connection = get_db_connection()
    rows = connection.execute("SELECT * FROM complaints ORDER BY id DESC").fetchall()
    connection.close()
    return jsonify({"complaints": [row_to_dict(row) for row in rows]}), 200


def complaint_access_allowed(complaint: sqlite3.Row, auth: Dict[str, Any]) -> bool:
    role = auth.get("role")
    if role == "admin":
        return True
    if role == "user":
        return int(auth.get("id", -1)) == complaint["user_id"]
    if role == "authority":
        return str(auth.get("department", "")).lower() == str(complaint["department"]).lower()
    return False


@app.get("/complaint/<int:complaint_id>/history")
@require_roles("user", "authority", "admin")
def complaint_history(complaint_id: int):
    connection = get_db_connection()
    complaint = connection.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        connection.close()
        return json_error("Complaint not found", 404)
    if not complaint_access_allowed(complaint, g.auth):
        connection.close()
        return json_error("Insufficient permissions", 403)
    history = connection.execute("SELECT * FROM status_history WHERE complaint_id = ? ORDER BY id ASC", (complaint_id,)).fetchall()
    connection.close()
    return jsonify({"history": [row_to_dict(row) for row in history]}), 200


@app.get("/complaint/<int:complaint_id>/report")
@require_roles("user", "authority", "admin")
def complaint_report(complaint_id: int):
    connection = get_db_connection()
    complaint = connection.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not complaint:
        connection.close()
        return json_error("Complaint not found", 404)
    if not complaint_access_allowed(complaint, g.auth):
        connection.close()
        return json_error("Insufficient permissions", 403)
    citizen = connection.execute("SELECT name, phone FROM users WHERE id = ?", (complaint["user_id"],)).fetchone()
    history = connection.execute("SELECT * FROM status_history WHERE complaint_id = ? ORDER BY id ASC", (complaint_id,)).fetchall()
    connection.close()
    try:
        from io import BytesIO
        import importlib
        reportlab_pages = importlib.import_module("reportlab.lib.pagesizes")
        reportlab_canvas = importlib.import_module("reportlab.pdfgen.canvas")
    except ImportError:
        return json_error("PDF reporting dependency is not installed", 503)
    output = BytesIO()
    pdf = reportlab_canvas.Canvas(output, pagesize=reportlab_pages.A4)
    from reportlab.lib.utils import simpleSplit

    y = 800
    pdf.setTitle(f"Complaint {complaint_id} report")
    for label, value in ((
        ("System", "AI Complaint Resolution System"),
        ("Citizen", citizen["name"] if citizen else complaint["user_id"]),
        ("Complaint", complaint_id),
        ("Text", complaint["text"]),
        ("Location", complaint["location"]),
        ("Coordinates", f"{complaint['latitude']}, {complaint['longitude']}"),
        ("Language", complaint["detected_language"]),
        ("Category", complaint["category"]),
        ("Department", complaint["department"]),
        ("Priority", complaint["priority"]),
        ("Initial response", complaint["response"]),
        ("Remarks", complaint["remarks"]),
        ("Status", complaint["status"]),
        ("Created", complaint["created_at"]),
    )):
        lines = simpleSplit(f"{label}: {value or ''}", "Helvetica", 10, 515)
        for line in lines:
            if y < 55:
                pdf.showPage()
                y = 800
            pdf.drawString(40, y, line)
            y -= 15
    y -= 10
    pdf.drawString(40, y, "Status history:")
    y -= 18
    for event in history:
        lines = simpleSplit(
            f"{event['created_at']}: {event['old_status'] or '-'} -> {event['new_status']} ({event['remarks'] or ''})",
            "Helvetica", 10, 500,
        )
        for line in lines:
            if y < 55:
                pdf.showPage()
                y = 800
            pdf.drawString(55, y, line)
            y -= 15
        if y < 50:
            pdf.showPage()
            y = 800
    pdf.save()
    output.seek(0)
    return Response(output.getvalue(), mimetype="application/pdf", headers={"Content-Disposition": f"attachment; filename=complaint-{complaint_id}.pdf"})


@app.get("/admin/report")
@require_roles("admin")
def admin_report():
    report_kind = request.args.get("type", "overall").strip().lower()
    allowed_kinds = {"overall", "activity", "citizen_activity", "authority_activity", "department", "status"}
    if report_kind not in allowed_kinds:
        return json_error("type must be overall, activity, citizen_activity, authority_activity, department, or status")
    try:
        from io import BytesIO
        import importlib
        reportlab_pages = importlib.import_module("reportlab.lib.pagesizes")
        reportlab_canvas = importlib.import_module("reportlab.pdfgen.canvas")
        from reportlab.lib.utils import simpleSplit
    except ImportError:
        return json_error("PDF reporting dependency is not installed", 503)

    connection = get_db_connection()
    if report_kind in {"activity", "citizen_activity", "authority_activity"}:
        role_filter = ""
        params: tuple[Any, ...] = ()
        if report_kind == "citizen_activity":
            role_filter, params = " WHERE actor_role = ?", ("user",)
        elif report_kind == "authority_activity":
            role_filter, params = " WHERE actor_role = ?", ("authority",)
        rows = connection.execute(f"SELECT event, actor_role, entity_type, entity_id, created_at FROM audit_logs{role_filter} ORDER BY id DESC", params).fetchall()
        lines = [f"{row['created_at']} | {row['event']} | {row['actor_role'] or 'system'} | {row['entity_type'] or ''} {row['entity_id'] or ''}" for row in rows]
    elif report_kind == "department":
        rows = connection.execute("SELECT department, COUNT(*) AS count FROM complaints GROUP BY department ORDER BY count DESC").fetchall()
        lines = [f"{row['department']}: {row['count']} complaints" for row in rows]
    elif report_kind == "status":
        rows = connection.execute("SELECT status, COUNT(*) AS count FROM complaints GROUP BY status ORDER BY count DESC").fetchall()
        lines = [f"{row['status']}: {row['count']} complaints" for row in rows]
    else:
        total = connection.execute("SELECT COUNT(*) AS count FROM complaints").fetchone()["count"]
        citizens = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        authorities = connection.execute("SELECT COUNT(*) AS count FROM authorities").fetchone()["count"]
        lines = [f"Citizens: {citizens}", f"Authorities: {authorities}", f"Complaints: {total}"]
        rows = connection.execute("SELECT status, COUNT(*) AS count FROM complaints GROUP BY status ORDER BY count DESC").fetchall()
        lines.extend(f"{row['status']}: {row['count']} complaints" for row in rows)
    connection.close()

    output = BytesIO()
    pdf = reportlab_canvas.Canvas(output, pagesize=reportlab_pages.A4)
    pdf.setTitle(f"Master Agent {report_kind} report")
    y = 800
    for line in [f"AI Complaint Resolution System - {report_kind.title()} Report", f"Generated: {utc_now()}", ""] + lines:
        for wrapped in simpleSplit(line, "Helvetica", 10, 515):
            if y < 55:
                pdf.showPage()
                y = 800
            pdf.drawString(40, y, wrapped)
            y -= 15
    pdf.save()
    output.seek(0)
    return Response(output.getvalue(), mimetype="application/pdf", headers={"Content-Disposition": f"attachment; filename=admin-{report_kind}-report.pdf"})


# -----------------------------------------------------------------------------
# Start the app
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)