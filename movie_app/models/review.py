from datetime import datetime
from . import db


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)
    movie_id = db.Column(db.Integer, db.ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    rating = db.Column(db.Numeric(2, 1), nullable=True)  # 0.0 - 5.0 in 0.5 increments
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    movie = db.relationship("Movie", back_populates="reviews")
    user = db.relationship("User", back_populates="reviews")

    __table_args__ = (db.UniqueConstraint("movie_id", "user_id", name="uq_review_movie_user"),)

    def __repr__(self):
        return f"<Review movie_id={self.movie_id} user_id={self.user_id} rating={self.rating}>"
