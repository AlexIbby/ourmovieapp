from datetime import datetime
from flask_login import UserMixin
import hashlib
import secrets
from . import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    # Relationships
    reviews = db.relationship("Review", back_populates="user", cascade="all, delete-orphan")

    def set_password(self, password: str):
        salt = secrets.token_hex(16)
        password_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
        self.password_hash = f"{salt}:{password_hash}"

    def check_password(self, password: str) -> bool:
        if ':' not in self.password_hash:
            return False
        salt, stored_hash = self.password_hash.split(':', 1)
        password_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
        return password_hash == stored_hash

    def get_id(self):
        return str(self.id)

    def __repr__(self):
        return f"<User {self.username}>"
