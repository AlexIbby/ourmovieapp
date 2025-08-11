from datetime import datetime
from . import db


class Movie(db.Model):
    __tablename__ = "movies"

    id = db.Column(db.Integer, primary_key=True)
    tmdb_id = db.Column(db.Integer, unique=True, nullable=False)
    title = db.Column(db.String(255), nullable=False)
    original_title = db.Column(db.String(255))
    year = db.Column(db.Integer)
    poster_path = db.Column(db.String(255))
    backdrop_path = db.Column(db.String(255))
    overview = db.Column(db.Text)
    runtime = db.Column(db.Integer)
    tmdb_rating = db.Column(db.Numeric(3, 1))
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    added_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    # Relationships
    reviews = db.relationship("Review", back_populates="movie", cascade="all, delete-orphan")
    tags = db.relationship("MovieTag", back_populates="movie", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Movie {self.title} ({self.year})>"
