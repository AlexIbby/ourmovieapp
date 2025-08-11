from flask import Blueprint, render_template, request, redirect, url_for, jsonify, current_app
from flask_login import login_user, logout_user, current_user
from ..extensions import csrf
from ..models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("movies.dashboard"))
    return render_template("login.html")


@auth_bp.route("/login", methods=["POST"])
@csrf.exempt  # keep it simple for this app
def login_post():
    # Support form or JSON body
    data = request.get_json(silent=True) or request.form
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    remember = str(data.get("remember", "")).lower() in {"1", "true", "on", "yes"}

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        # Render template with error or return JSON
        if request.is_json:
            return jsonify({"ok": False, "error": "Invalid credentials"}), 401
        return render_template("login.html", error="Invalid username or password", username=username), 401

    login_user(user, remember=remember)
    # If this was a JSON request, return JSON
    if request.is_json:
        return jsonify({"ok": True, "username": user.username})
    # Otherwise redirect to dashboard
    return redirect(url_for("movies.dashboard"))


@auth_bp.route("/logout", methods=["POST"])
@csrf.exempt  # allow simple fetch logout
def logout():
    if current_user.is_authenticated:
        logout_user()
    # For fetch clients, return 204; for browser POST, redirect could also be fine
    if request.is_json:
        return ("", 204)
    return redirect(url_for("auth.login"))


@auth_bp.route("/status", methods=["GET"])
def status():
    if current_user.is_authenticated:
        admin_username = current_app.config.get("ADMIN_USERNAME", "Alex")
        return jsonify({
            "authenticated": True,
            "username": current_user.username,
            "is_admin": current_user.username == admin_username,
        })
    return jsonify({"authenticated": False})
