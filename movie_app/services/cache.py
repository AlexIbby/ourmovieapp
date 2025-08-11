import requests_cache


def init_requests_cache():
    """
    Install a global requests-cache for outbound HTTP calls (TMDB).
    24h expiry as per requirements.
    """
    # SQLite backend file 'http_cache.sqlite' in cwd
    requests_cache.install_cache("http_cache", expire_after=86400)
