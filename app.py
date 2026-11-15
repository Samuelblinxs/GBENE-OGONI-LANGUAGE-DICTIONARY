from __future__ import annotations

import json
import os
import re
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, jsonify, redirect, request, send_from_directory, session
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)

BASE_DIR = Path(__file__).resolve().parent
USERS_FILE = BASE_DIR / "users.json"
CONTRIBUTIONS_FILE = BASE_DIR / "contributions.json"
DICTIONARY_VOICES_FILE = BASE_DIR / "dictionary_voices.json"
AUDIO_UPLOAD_DIR = BASE_DIR / "uploads"
ALLOWED_AUDIO_EXTENSIONS = {".aac", ".m4a", ".mp3", ".oga", ".ogg", ".wav", ".webm"}
MAX_AUDIO_FILE_BYTES = 10 * 1024 * 1024


def load_users():
    if not USERS_FILE.exists():
        return {}
    try:
        with USERS_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_users(users):
    with USERS_FILE.open("w", encoding="utf-8") as file:
        json.dump(users, file, indent=2)


def load_contributions():
    if not CONTRIBUTIONS_FILE.exists():
        return []
    try:
        with CONTRIBUTIONS_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_contributions(contributions):
    with CONTRIBUTIONS_FILE.open("w", encoding="utf-8") as file:
        json.dump(contributions, file, indent=2, ensure_ascii=False)


def load_dictionary_voices():
    if not DICTIONARY_VOICES_FILE.exists():
        return []
    try:
        with DICTIONARY_VOICES_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_dictionary_voices(voices):
    with DICTIONARY_VOICES_FILE.open("w", encoding="utf-8") as file:
        json.dump(voices, file, indent=2, ensure_ascii=False)


def save_audio_upload(upload):
    if not upload or not upload.filename:
        return ""

    extension = Path(secure_filename(upload.filename)).suffix.lower()
    if extension not in ALLOWED_AUDIO_EXTENSIONS or not upload.mimetype.startswith("audio/"):
        raise ValueError("Upload an audio file in WAV, MP3, M4A, OGG, AAC, or WEBM format.")

    content = upload.read(MAX_AUDIO_FILE_BYTES + 1)
    if not content:
        raise ValueError("Recording cannot be empty.")
    if len(content) > MAX_AUDIO_FILE_BYTES:
        raise ValueError("Each audio file must be 10 MB or smaller.")

    AUDIO_UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (AUDIO_UPLOAD_DIR / filename).write_bytes(content)
    return f"/uploads/{filename}"


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/index.html")
def index_html():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/Login.html")
def login_page():
    return send_from_directory(BASE_DIR, "Login.html")


@app.route("/authentication.html")
def auth_page():
    return send_from_directory(BASE_DIR, "authentication.html")


@app.route("/userdashboard 1.html")
@app.route("/userdashboard.html")
def dashboard_page():
    if not session.get("logged_in"):
        return redirect("/Login.html")
    return send_from_directory(BASE_DIR, "userdashboard 1.html")


@app.route("/admin-dashboard-choice")
def admin_dashboard_choice():
    if not session.get("logged_in"):
        return redirect("/Login.html")
    if session.get("role") != "admin":
        return "Admin access required.", 403
    return send_from_directory(BASE_DIR, "admin-dashboard-choice.html")


@app.route("/leadership.html")
def leadership_page():
    if not session.get("logged_in"):
        return redirect("/Login.html?next=/leadership.html")
    if session.get("role") != "admin":
        return "Admin access required.", 403
    return send_from_directory(BASE_DIR, "leadership.html")


@app.route("/api/admin/session")
def api_admin_session():
    if not session.get("logged_in") or session.get("role") != "admin":
        return jsonify({"error": "Admin access required."}), 403
    return jsonify({"name": session.get("name", "Admin")})


@app.route("/api/admin/users")
def api_admin_users():
    if not session.get("logged_in") or session.get("role") != "admin":
        return jsonify({"error": "Admin access required."}), 403

    contributions = load_contributions()
    users = []
    for email, user in load_users().items():
        name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
        users.append({
            "name": name or email,
            "email": email,
            "location": user.get("location") or "Not provided",
            "wordsAdded": sum(1 for item in contributions if item.get("authorEmail") == email),
            "role": user.get("role", "contributor").title(),
        })
    return jsonify(users)


@app.route("/api/dictionary/voices")
def api_dictionary_voices():
    return jsonify({"voices": load_dictionary_voices()})


@app.route("/api/admin/word-voices", methods=["POST"])
def api_admin_word_voice():
    if not session.get("logged_in") or session.get("role") != "admin":
        return jsonify({"error": "Admin access required."}), 403

    english = (request.form.get("english") or "").strip()
    ogoni = (request.form.get("ogoni") or "").strip()
    kind = (request.form.get("kind") or "").strip()
    audio = request.files.get("audio")
    if not english or not ogoni or kind not in {"wordAudio", "sentenceAudio"}:
        return jsonify({"error": "A dictionary word and valid voice type are required."}), 400
    if not audio or not audio.filename:
        return jsonify({"error": "Record an audio clip before saving."}), 400

    try:
        audio_url = save_audio_upload(audio)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    voices = load_dictionary_voices()
    voice = next(
        (
            item for item in voices
            if str(item.get("english", "")).strip().lower() == english.lower()
            and str(item.get("ogoni", "")).strip().lower() == ogoni.lower()
        ),
        None,
    )
    if voice is None:
        voice = {"english": english, "ogoni": ogoni}
        voices.append(voice)
    voice[kind] = audio_url
    save_dictionary_voices(voices)
    return jsonify({"message": "Dictionary voice saved.", "voice": voice}), 200


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/Login.html")


@app.route("/<path:filename>")
def serve_file(filename):
    file_path = BASE_DIR / filename
    if file_path.is_file():
        if file_path.samefile(BASE_DIR / "leadership.html"):
            return leadership_page()
        return send_from_directory(BASE_DIR, filename)
    return "Not found", 404


@app.route("/api/login", methods=["POST"])
def api_login():
    email = (request.form.get("email") or "").strip()
    password = (request.form.get("password") or "").strip()

    if not email or not password:
        return "Email and password are required.", 400

    users = load_users()
    user = users.get(email)

    if not user or user.get("password") != password:
        return "Invalid email/phone or password.", 401

    session["logged_in"] = True
    session["email"] = email
    session["name"] = user.get("firstName", email.split("@", 1)[0])
    session["role"] = user.get("role", "contributor")
    if session["role"] == "admin":
        return redirect("/admin-dashboard-choice")
    next_url = request.args.get("next", "")
    parsed_next_url = urlsplit(next_url)
    if next_url.startswith("/") and not next_url.startswith("//") and not parsed_next_url.netloc:
        return redirect(next_url)
    return redirect("/userdashboard%201.html")


@app.route("/api/signup", methods=["POST"])
def api_signup():
    first_name = (request.form.get("firstName") or "").strip()
    last_name = (request.form.get("lastName") or "").strip()
    email = (request.form.get("email") or "").strip()
    password = (request.form.get("password") or "").strip()

    if not first_name or not last_name or not email or not password:
        return "All required fields must be filled.", 400

    if not re.fullmatch(r"[A-Za-z0-9]{6}", password):
        return "Password must be exactly 6 letters and/or numbers, with no special characters.", 400

    users = load_users()
    if email in users:
        return "This account already exists.", 409

    users[email] = {
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
        "password": password,
        "role": "contributor",
    }
    save_users(users)

    session["logged_in"] = True
    session["email"] = email
    session["name"] = first_name
    return redirect("/userdashboard%201.html")


@app.route("/api/contributions", methods=["POST"])
def api_contribution():
    if not session.get("logged_in") or not session.get("email"):
        return jsonify({"error": "Please sign in before submitting a contribution."}), 401

    payload = request.form
    english = (payload.get("english") or "").strip()
    ogoni = (payload.get("ogoni") or payload.get("khana") or "").strip()
    example = (payload.get("example") or "").strip()
    example_ogoni = (payload.get("exampleOgoni") or payload.get("exampleKhana") or "").strip()
    category = (payload.get("category") or "").strip()

    word_audio = request.files.get("wordAudio")
    sentence_audio = request.files.get("sentenceAudio")
    if not english or not ogoni or not example or not example_ogoni or not category:
        return jsonify({"error": "English, Ogoni, both example sentences, and category are required."}), 400
    if not word_audio or not word_audio.filename or not sentence_audio or not sentence_audio.filename:
        return jsonify({"error": "Record both the word and example voices before submitting."}), 400

    try:
        word_audio_url = save_audio_upload(word_audio)
        sentence_audio_url = save_audio_upload(sentence_audio)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    contribution = {
        "english": english,
        "ogoni": ogoni,
        "example": example,
        "exampleOgoni": example_ogoni,
        "wordAudio": word_audio_url,
        "sentenceAudio": sentence_audio_url,
        "category": category,
        "authorEmail": session["email"],
        "authorName": session.get("name", "Contributor"),
    }
    contributions = load_contributions()
    contributions.append(contribution)
    save_contributions(contributions)
    return jsonify({"message": "Contribution submitted.", "contribution": contribution}), 201


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
