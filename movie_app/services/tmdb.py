import os
from typing import Dict, Any, List, Optional, Tuple

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


def _normalize_title(s: str) -> str:
    return "".join(ch.lower() for ch in (s or "") if ch.isalnum() or ch.isspace()).strip()


def _title_similarity(a: str, b: str) -> float:
    # Lightweight similarity without external deps
    try:
        from difflib import SequenceMatcher

        return SequenceMatcher(None, _normalize_title(a), _normalize_title(b)).ratio()
    except Exception:
        return 0.0


def _extract_year(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    if len(date_str) >= 4:
        try:
            return int(date_str[:4])
        except Exception:
            return None
    return None


def _directors_from_credits(credits: Dict[str, Any]) -> List[str]:
    crew = credits.get("crew", []) if isinstance(credits, dict) else []
    directors = []
    for c in crew:
        job = (c or {}).get("job") or ""
        dept = (c or {}).get("department") or ""
        name = (c or {}).get("name")
        if name and ("director" in job.lower() or dept.lower() == "directing"):
            directors.append(name)
    # Deduplicate while preserving order
    seen = set()
    out = []
    for d in directors:
        if d not in seen:
            out.append(d)
            seen.add(d)
    return out


def _movie_credits(tmdb_id: int) -> Dict[str, Any]:
    url = f"{TMDB_API_BASE}/movie/{tmdb_id}/credits"
    params = {**_api_key_param()}
    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        return resp.json() or {}
    except Exception:
        return {}


def _search_person(name: str) -> Optional[int]:
    if not name:
        return None
    url = f"{TMDB_API_BASE}/search/person"
    params = {"query": name, "include_adult": "false", **_api_key_param()}
    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        results = data.get("results", []) or []
        if not results:
            return None
        # Take the top result as best match
        return results[0].get("id")
    except Exception:
        return None


def _director_movie_ids(person_id: int) -> Optional[set]:
    if not person_id:
        return None
    url = f"{TMDB_API_BASE}/person/{person_id}/movie_credits"
    params = {**_api_key_param()}
    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        crew = data.get("crew", []) or []
        ids = set()
        for c in crew:
            job = (c or {}).get("job") or ""
            dept = (c or {}).get("department") or ""
            if "director" in job.lower() or dept.lower() == "directing":
                mid = (c or {}).get("id")
                if mid:
                    ids.add(mid)
        return ids
    except Exception:
        return None


def search_movies(query: str, page: int = 1, year: Optional[int] = None, director: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Enhanced TMDB search supporting optional year and director filtering with simple fuzzy ranking.
    Returns a list of simplified dicts: tmdb_id, title, year, poster_url, overview, directors.
    """
    if not query:
        return []

    url = f"{TMDB_API_BASE}/search/movie"
    params: Dict[str, Any] = {
        "query": query,
        "page": page,
        "include_adult": "false",
        **_api_key_param(),
    }
    if year:
        # TMDB supports both; include both to tighten results
        params["year"] = year
        params["primary_release_year"] = year

    try:
        resp = requests.get(url, headers=_auth_headers(), params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        raw_results = data.get("results", []) or []

        # If director provided, build a set of movie IDs they directed
        director_ids: Optional[set] = None
        director_name = (director or "").strip()
        if director_name:
            pid = _search_person(director_name)
            if pid:
                director_ids = _director_movie_ids(pid) or set()

        # Limit to top N for enrichment and ranking
        # Use fewer candidates when no director filtering (faster response)
        max_candidates = 15 if director_name else 8
        candidates = raw_results[:max_candidates]

        enriched: List[Tuple[Dict[str, Any], float]] = []
        for r in candidates:
            tmdb_id = r.get("id")
            title = r.get("title") or r.get("original_title") or ""
            cand_year = _extract_year(r.get("release_date"))
            poster_path = r.get("poster_path")
            overview = r.get("overview")

            # Only fetch credits if director filtering is being used
            # This is the key performance optimization: reduces API calls from 16 to 1 per search
            directors = []
            if director_name:
                # Only make expensive credits call when director search is active
                credits = _movie_credits(tmdb_id) if tmdb_id else {}
                if credits:
                    directors = _directors_from_credits(credits)

            # Scoring: title similarity + year proximity + director match
            score = 0.0
            score += _title_similarity(title, query) * 5.0
            if year and cand_year:
                if cand_year == year:
                    score += 3.0
                elif abs(cand_year - year) == 1:
                    score += 1.0
            if director_name:
                # boost if this movie is in the director's directed list or name matches display directors
                in_directed_list = (director_ids is not None and tmdb_id in director_ids)
                has_name_match = any(_normalize_title(director_name) in _normalize_title(d) or _normalize_title(d) in _normalize_title(director_name) for d in directors)
                if in_directed_list or has_name_match:
                    score += 3.0

            enriched.append(
                (
                    {
                        "tmdb_id": tmdb_id,
                        "title": title,
                        "year": cand_year,
                        "poster_path": poster_path,
                        "poster_url": _image_url(poster_path, "w185"),
                        "overview": overview,
                        "directors": directors,
                    },
                    score,
                )
            )

        # If director was provided, prefer results the director actually directed
        def sort_key(item: Tuple[Dict[str, Any], float]):
            d = item[0]
            s = item[1]
            preferred = 0
            if director_name and director_ids is not None and d.get("tmdb_id") in director_ids:
                preferred = 1
            return (preferred, s)

        enriched.sort(key=sort_key, reverse=True)
        final_results = [e[0] for e in enriched]
        return final_results
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
