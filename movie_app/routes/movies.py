from typing import List, Dict, Any
from flask import Blueprint, jsonify, request, render_template, redirect, url_for
from flask_login import login_required, current_user
from ..extensions import db, csrf
from ..models.movie import Movie
from ..models.review import Review
from ..models.tag import Tag, MovieTag, generate_unique_slug, PREDEFINED_TAGS
from ..services import tmdb
from flask import current_app

movies_bp = Blueprint("movies", __name__)


@movies_bp.get("/")
@login_required
def dashboard():
    return render_template("dashboard.html")


@movies_bp.get("/api/movies")
@login_required
def list_movies():
    """
    Minimal movie listing for Phase 1. Pagination only.
    """
    try:
        page = int(request.args.get("page", 1))
    except Exception:
        page = 1
    try:
        per_page = int(request.args.get("per_page", 20))
    except Exception:
        per_page = 20
    per_page = max(1, min(50, per_page))

    pagination = Movie.query.order_by(Movie.added_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for m in pagination.items:
        poster_url = f"{tmdb.IMAGE_BASE}/w185{m.poster_path}" if m.poster_path else None
        
        # Get all ratings for this movie
        ratings = db.session.query(Review.rating, Review.user_id).join(Review.user).filter(Review.movie_id == m.id).all()
        user_ratings = {}
        for rating, user_id in ratings:
            from ..models.user import User
            user = User.query.get(user_id)
            if user and rating:
                user_ratings[user.username] = float(rating)
        
        items.append(
            {
                "id": m.id,
                "tmdb_id": m.tmdb_id,
                "title": m.title,
                "year": m.year,
                "poster_url": poster_url,
                "ratings": user_ratings,
            }
        )

    return jsonify(
        {
            "items": items,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "total_pages": pagination.pages if pagination.per_page else 1,
        }
    )


@movies_bp.get("/api/movies/search")
@login_required
def search_tmdb():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"results": []})
    try:
        page = int(request.args.get("page", 1))
    except Exception:
        page = 1
    results = tmdb.search_movies(q, page=page)
    return jsonify({"results": results})


@movies_bp.post("/api/movies")
@login_required
@csrf.exempt  # JSON-only for simplicity
def add_movie():
    data = request.get_json(silent=True) or {}
    tmdb_id = data.get("tmdb_id")
    if not tmdb_id:
        return jsonify({"ok": False, "error": "tmdb_id required"}), 400

    # Prevent duplicates
    existing = Movie.query.filter_by(tmdb_id=tmdb_id).first()
    if existing:
        return jsonify({"ok": True, "id": existing.id, "message": "Already in library"})

    md = tmdb.movie_details(int(tmdb_id))
    if not md:
        return jsonify({"ok": False, "error": "Failed to fetch movie details"}), 502

    movie = Movie(
        tmdb_id=md.get("tmdb_id"),
        title=md.get("title") or "",
        original_title=md.get("original_title"),
        year=md.get("year"),
        poster_path=md.get("poster_path"),
        backdrop_path=md.get("backdrop_path"),
        overview=md.get("overview"),
        runtime=md.get("runtime"),
        tmdb_rating=md.get("tmdb_rating"),
        added_by=current_user.id if current_user.is_authenticated else None,
    )
    db.session.add(movie)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "error": "DB error adding movie"}), 500

    return jsonify({"ok": True, "id": movie.id})


@movies_bp.post("/api/movies/<int:movie_id>/review")
@login_required
@csrf.exempt
def add_review(movie_id):
    data = request.get_json(silent=True) or {}
    rating = data.get("rating")
    
    if rating is not None:
        try:
            rating = float(rating)
            if not (0.0 <= rating <= 5.0):
                return jsonify({"ok": False, "error": "Rating must be between 0.0 and 5.0"}), 400
        except (ValueError, TypeError):
            return jsonify({"ok": False, "error": "Invalid rating format"}), 400
    
    movie = Movie.query.get_or_404(movie_id)
    
    existing_review = Review.query.filter_by(movie_id=movie_id, user_id=current_user.id).first()
    
    if existing_review:
        existing_review.rating = rating
        existing_review.updated_at = db.func.now()
    else:
        review = Review(movie_id=movie_id, user_id=current_user.id, rating=rating)
        db.session.add(review)
    
    try:
        db.session.commit()
        return jsonify({"ok": True})
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "error": "Database error"}), 500


@movies_bp.get("/api/movies/<int:movie_id>/review")
@login_required
def get_review(movie_id):
    review = Review.query.filter_by(movie_id=movie_id, user_id=current_user.id).first()
    if review:
        return jsonify({"rating": float(review.rating) if review.rating else None})
    return jsonify({"rating": None})


@movies_bp.post("/api/movies/<int:movie_id>/tags")
@login_required
@csrf.exempt
def add_tag(movie_id):
    data = request.get_json(silent=True) or {}
    tag_name = (data.get("name") or "").strip()
    
    if not tag_name:
        return jsonify({"ok": False, "error": "Tag name required"}), 400
    
    movie = Movie.query.get_or_404(movie_id)
    
    tag = Tag.query.filter_by(name=tag_name).first()
    if not tag:
        slug = generate_unique_slug(tag_name)
        predefined = next((t for t in PREDEFINED_TAGS if t["name"] == tag_name), None)
        color = predefined["color"] if predefined else None
        tag = Tag(name=tag_name, slug=slug, color=color)
        db.session.add(tag)
        db.session.flush()
    
    existing_movie_tag = MovieTag.query.filter_by(movie_id=movie_id, tag_id=tag.id).first()
    if existing_movie_tag:
        return jsonify({"ok": True, "message": "Tag already exists for this movie"})
    
    movie_tag = MovieTag(movie_id=movie_id, tag_id=tag.id, added_by=current_user.id)
    db.session.add(movie_tag)
    
    try:
        db.session.commit()
        return jsonify({"ok": True, "tag_id": tag.id, "tag_name": tag.name})
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "error": "Database error"}), 500


@movies_bp.get("/api/movies/<int:movie_id>/tags")
@login_required
def get_tags(movie_id):
    tags = db.session.query(Tag).join(MovieTag).filter(MovieTag.movie_id == movie_id).all()
    return jsonify({"tags": [{"id": t.id, "name": t.name, "color": t.get_color()} for t in tags]})


@movies_bp.get("/api/tags/predefined")
@login_required
def get_predefined_tags():
    return jsonify({"tags": PREDEFINED_TAGS})


@movies_bp.delete("/api/movies/<int:movie_id>/tags/<int:tag_id>")
@login_required
@csrf.exempt
def remove_tag(movie_id, tag_id):
    movie_tag = MovieTag.query.filter_by(movie_id=movie_id, tag_id=tag_id).first()
    if not movie_tag:
        return jsonify({"ok": False, "error": "Tag not found"}), 404
    
    db.session.delete(movie_tag)
    try:
        db.session.commit()
        return jsonify({"ok": True})
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "error": "Database error"}), 500


@movies_bp.delete("/api/movies/<int:movie_id>")
@login_required
@csrf.exempt
def delete_movie(movie_id):
    """
    Delete a movie from the library. Any authenticated user may delete.
    Also cascades to reviews and movie_tags (configured in models).
    """
    movie = Movie.query.get(movie_id)
    if not movie:
        return jsonify({"ok": False, "error": "Not found"}), 404

    try:
        db.session.delete(movie)
        db.session.commit()
        return jsonify({"ok": True})
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "error": "Database error"}), 500
