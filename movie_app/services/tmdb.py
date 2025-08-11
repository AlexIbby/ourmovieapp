import os
from typing import Dict, Any, List, Optional

import requests
from flask import current_app


TMDB_API_BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p"


def _auth_headers() -> Dict[str, str]:
    """
    Prefer Bearer token if available; otherwise return empty headers and rely on api_key query.
    """
    token = current_app.config.get("TMDB_BEARER_TOKEN") or os.getenv("TMDB_BEARER_TOKEN", "")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _api_key_param() -> Dict[str, str]:
    """
    Provide api_key param if no bearer token provided.
    """
    if "Authorization" in _auth_headers():
        return {}
    api_key = current_app.config.get("TMDB_API_KEY") or os.getenv("TMDB_API_KEY", "")
    return {"api_key": api_key} if api_key else {}


def _image_url(path: Optional[str], size: str = "w342") -> Optional[str]:
    if not path:
        return None
    return f"{IMAGE_BASE}/{size}{path}"


def search_movies(query: str, page: int = 1) -> List[Dict[str, Any]]:
    """
    Search TMDB for movies. Returns a list of simplified dicts.
    """
    if not query:
        return []

    url = f"{TMDB_API_BASE}/search/movie"
    params = {"query": query, "page": page, "include_adult": "false", **_api_key_param()}
    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in data.get("results", []):
            year = None
            rd = r.get("release_date") or ""
            if len(rd) >= 4:
                try:
                    year = int(rd[:4])
                except Exception:
                    year = None
            results.append(
                {
                    "tmdb_id": r.get("id"),
                    "title": r.get("title") or r.get("original_title"),
                    "year": year,
                    "poster_path": r.get("poster_path"),
                    "poster_url": _image_url(r.get("poster_path"), "w185"),
                    "overview": r.get("overview"),
                }
            )
        return results
    except Exception:
        return []


def movie_details(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Get details for a movie id. Returns a dict with fields we need, or None on error.
    """
    url = f"{TMDB_API_BASE}/movie/{tmdb_id}"
    params = {"append_to_response": "release_dates", **_api_key_param()}
    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        m = resp.json()
        year = None
        rd = m.get("release_date") or ""
        if len(rd) >= 4:
            try:
                year = int(rd[:4])
            except Exception:
                year = None

        return {
            "tmdb_id": m.get("id"),
            "title": m.get("title") or m.get("original_title"),
            "original_title": m.get("original_title"),
            "year": year,
            "poster_path": m.get("poster_path"),
            "backdrop_path": m.get("backdrop_path"),
            "overview": m.get("overview"),
            "runtime": m.get("runtime"),
            "tmdb_rating": m.get("vote_average"),
            "genres": [g.get("name") for g in m.get("genres", []) if g.get("name")],
        }
    except Exception:
        return None
