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
    Movie listing with filtering support for genre, year, tags, and ratings.
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

    # Get filter parameters
    genre_filter = request.args.get("genre")
    year_from = request.args.get("year_from")
    year_to = request.args.get("year_to")
    tag_filter = request.args.get("tags")
    min_rating = request.args.get("min_rating")
    
    # Parse filters
    genres = []
    if genre_filter:
        genres = [g.strip() for g in genre_filter.split(",") if g.strip()]
    
    tag_names = []
    if tag_filter:
        tag_names = [t.strip() for t in tag_filter.split(",") if t.strip()]
    
    min_rating_val = None
    if min_rating:
        try:
            min_rating_val = float(min_rating)
        except ValueError:
            pass
    
    year_from_val = None
    year_to_val = None
    if year_from:
        try:
            year_from_val = int(year_from)
        except ValueError:
            pass
    if year_to:
        try:
            year_to_val = int(year_to)
        except ValueError:
            pass

    # Start with base query - no complex JSON filtering in database
    query = Movie.query.order_by(Movie.added_at.desc())
    
    # Apply non-JSON filters first
    if year_from_val:
        query = query.filter(Movie.year >= year_from_val)
    if year_to_val:
        query = query.filter(Movie.year <= year_to_val)
    
    # Handle tag and rating filtering with subqueries to avoid DISTINCT issues with JSON columns
    if tag_names:
        from ..models.tag import Tag, MovieTag
        # Use subquery to get movie IDs that have the required tags
        tag_movie_ids = db.session.query(MovieTag.movie_id).join(Tag).filter(Tag.name.in_(tag_names)).subquery()
        query = query.filter(Movie.id.in_(db.session.query(tag_movie_ids.c.movie_id)))
    
    if min_rating_val is not None:
        # Use subquery to get movie IDs that have ratings >= min_rating
        rating_movie_ids = db.session.query(Review.movie_id).filter(Review.rating >= min_rating_val).subquery()
        query = query.filter(Movie.id.in_(db.session.query(rating_movie_ids.c.movie_id)))

    # Get all matching movies (we'll do genre filtering in Python)
    all_movies = query.all()
    
    # Apply genre filtering in Python (more reliable than JSON database queries)
    if genres:
        filtered_movies = []
        for movie in all_movies:
            movie_genres = movie.genres or []
            # Check if movie has any of the requested genres
            if any(genre in movie_genres for genre in genres):
                filtered_movies.append(movie)
        all_movies = filtered_movies
    
    # Manual pagination
    total = len(all_movies)
    total_pages = (total + per_page - 1) // per_page  # Ceiling division
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_movies = all_movies[start_idx:end_idx]
    
    # Build response items
    items = []
    for m in paginated_movies:
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
                "genres": m.genres or [],
                "ratings": user_ratings,
            }
        )

    return jsonify(
        {
            "items": items,
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, total_pages),
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
        genres=md.get("genres", []),
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
