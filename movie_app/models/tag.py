from datetime import datetime
from . import db
import re


PREDEFINED_TAGS = [
    {"name": "Classic", "color": "#fff2cc"},
    {"name": "I May Have Cried", "color": "#fce7f3"},
    {"name": "Unique!", "color": "#f0e7ff"},
    {"name": "Deep", "color": "#e3f2f2"},
    {"name": "Feel-Good", "color": "#f0f9f0"},
    {"name": "Laugh-Out-Loud", "color": "#ffe4e6"},
    {"name": "Slow Burn", "color": "#f3e8ff"},
    {"name": "Edge-of-Your-Seat", "color": "#ffe4e6"},
    {"name": "Visual Feast", "color": "#e0f2fe"},
    {"name": "Mind-Bender", "color": "#f0e7ff"},
    {"name": "Comfort Watch", "color": "#f0f9f0"},
    {"name": "Underrated Gem", "color": "#fff2cc"},
    {"name": "Action", "color": "#ffe4e6"},
    {"name": "Comedy", "color": "#e3f2f2"},
    {"name": "Drama", "color": "#f3e8ff"},
    {"name": "Horror", "color": "#ffe4e6"},
    {"name": "Romance", "color": "#fce7f3"},
    {"name": "Thriller", "color": "#f0f9f0"},
]


def generate_unique_slug(name):
    from . import db
    base_slug = re.sub(r'[^\w\s-]', '', name.lower())
    base_slug = re.sub(r'[-\s]+', '-', base_slug)
    base_slug = base_slug.strip('-')
    
    if not base_slug:
        base_slug = 'tag'
    
    # Check if slug already exists
    slug = base_slug
    counter = 1
    while db.session.query(Tag).filter_by(slug=slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    return slug


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    slug = db.Column(db.String(60), unique=True, nullable=False)
    color = db.Column(db.String(7), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    movies = db.relationship("MovieTag", back_populates="tag", cascade="all, delete-orphan")

    def get_color(self):
        if self.color:
            return self.color
        predefined = next((t for t in PREDEFINED_TAGS if t["name"] == self.name), None)
        return predefined["color"] if predefined else "#e9ecef"

    def __repr__(self):
        return f"<Tag {self.name}>"


class MovieTag(db.Model):
    __tablename__ = "movie_tags"

    movie_id = db.Column(db.Integer, db.ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True)
    tag_id = db.Column(db.Integer, db.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    added_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    movie = db.relationship("Movie", back_populates="tags")
    tag = db.relationship("Tag", back_populates="movies")

    def __repr__(self):
        return f"<MovieTag movie_id={self.movie_id} tag_id={self.tag_id}>"
