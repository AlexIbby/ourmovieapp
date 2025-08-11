from flask import Flask
from .config import get_config
from .extensions import db, login_manager, csrf, migrate
from .routes.auth import auth_bp
from .routes.movies import movies_bp
from .models.user import User
from .models.movie import Movie
from .models.review import Review
from .models.tag import Tag, MovieTag
from .services.cache import init_requests_cache


def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(get_config())
    init_requests_cache()

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    # Auth config
    login_manager.login_view = "auth.login"
    login_manager.session_protection = None  # keep it simple

    @login_manager.user_loader
    def load_user(user_id):
        try:
            return User.query.get(int(user_id))
        except Exception:
            return None

    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(movies_bp)

    # Create tables and seed users on first run (simplified, no migrations required initially)
    with app.app_context():
        db.create_all()
        _seed_users(app)

    return app


def _seed_users(app: Flask):
    """
    Ensure two users exist: Alex (admin) and Carrie.
    Default passwords are simple for dev: 'alex' and 'carrie'.
    """
    admin_username = app.config.get("ADMIN_USERNAME", "Alex")
    default_users = [
        {"username": admin_username, "password": "alex"},
        {"username": "Carrie", "password": "carrie"},
    ]
    for u in default_users:
        if not User.query.filter_by(username=u["username"]).first():
            user = User(username=u["username"])
            user.set_password(u["password"])
            db.session.add(user)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
